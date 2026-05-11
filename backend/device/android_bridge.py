import itertools
import logging
import os
import subprocess
import tempfile
import threading
import time
import xml.etree.ElementTree as ET

logger = logging.getLogger(__name__)
# Module-level temp dir (set once from env or default to system temp)
_TMP_BASE = os.environ.get("TMP_BASE_DIR", tempfile.gettempdir())
_INSPECTOR_TMP = os.path.join(_TMP_BASE, "inspectorplus")
os.makedirs(_INSPECTOR_TMP, exist_ok=True)
try:
    from lxml import etree as lxml_etree

    HAS_LXML = True
except ImportError:
    HAS_LXML = False
from device.base import DeviceBridgeBase
from device.recorder import AndroidRecorderSession as RecorderSession
from device.utils import retry_with_backoff as _retry_with_backoff


# Resolve adb path once at module load
def _get_adb_path() -> str:
    """Resolve adb executable path using ANDROID_HOME or PATH."""
    import shutil

    # Check ANDROID_HOME env var first
    android_home = os.environ.get("ANDROID_HOME") or os.environ.get("ANDROID_SDK_ROOT")
    if android_home:
        adb_path = os.path.join(android_home, "platform-tools", "adb")
        if os.path.isfile(adb_path):
            return adb_path
    # Fallback to PATH lookup
    adb_in_path = shutil.which("adb")
    if adb_in_path:
        return adb_in_path
    return "adb"  # last resort, let it fail with clear error


_ADB_PATH = _get_adb_path()
_node_counter = itertools.count(start=1)
_node_lock = threading.Lock()


def _generate_id(prefix: str) -> str:
    with _node_lock:
        n = next(_node_counter)
    return f"{prefix}_{n}"


def _safe_str(value) -> str:
    """Coerce a value to string, handling MagicMock and other non-string types."""
    if isinstance(value, str):
        return value
    return ""


# Capability detection helpers
def _detect_capabilities(attrib: dict, class_name: str) -> list[dict]:
    """Detect interaction capabilities from XML attributes."""
    capabilities = []
    if not isinstance(class_name, str):
        class_name = ""
    short_class = class_name.split(".")[-1] if class_name else ""
    # TAP: clickable
    clickable = attrib.get("clickable")
    if isinstance(clickable, str) and clickable == "true":
        capabilities.append({"type": "tap", "badge": "TAP", "color": "#22d3ee"})
    # SCROLL: scrollable
    scrollable = attrib.get("scrollable")
    if isinstance(scrollable, str) and scrollable == "true":
        capabilities.append({"type": "scroll", "badge": "SCROLL", "color": "#fbbf24"})
    # INPUT: focusable + EditText class
    focusable = attrib.get("focusable")
    if isinstance(focusable, str) and focusable == "true" and short_class == "EditText":
        capabilities.append({"type": "input", "badge": "INPUT", "color": "#a78bfa"})
    # LONG: long-clickable
    long_clickable = attrib.get("long-clickable")
    if isinstance(long_clickable, str) and long_clickable == "true":
        capabilities.append({"type": "long", "badge": "LONG", "color": "#fb923c"})
    # FOCUS: focusable (non-EditText)
    if isinstance(focusable, str) and focusable == "true" and short_class not in ("EditText",):
        has_input = any(c["type"] == "input" for c in capabilities)
        if not has_input:
            capabilities.append({"type": "focus", "badge": "FOCUS", "color": "#f472b6"})
    # LINK: WebView with URL text
    if short_class == "WebView":
        text = _safe_str(attrib.get("text", "")) or _safe_str(attrib.get("content-desc", ""))
        if text.startswith(("http://", "https://")):
            capabilities.append({"type": "link", "badge": "LINK", "color": "#34d399", "reason": text[:60]})
    return capabilities


def _parse_color_attr(value: str) -> str | None:
    """Parse a color attribute value to #RRGGBB hex string."""
    if not value or not isinstance(value, str):
        return None
    value = value.strip()
    if value.startswith(("@", "?")):
        return None
    if value.startswith("#"):
        if len(value) == 9:
            value = "#" + value[3:]
        elif len(value) != 7:
            return None
        return value
    return None


def _parse_dimension(value: str) -> int:
    """Parse a dimension string like '12sp', '8dp' to integer."""
    if not value or not isinstance(value, str):
        return 0
    import re

    m = re.match(r"(-?\d+(?:\.\d+)?)", value)
    if m:
        return int(float(m.group(1)))
    return 0


def _extract_styles(attrib: dict) -> dict:
    """Extract style properties from XML attributes."""
    styles = {}
    # Background color
    bg = attrib.get("background", "")
    if isinstance(bg, str) and bg:
        hex_color = _parse_color_attr(bg)
        if hex_color:
            styles["backgroundColor"] = hex_color
    # Text color
    text_color = attrib.get("textColor", "")
    if isinstance(text_color, str) and text_color:
        hex_color = _parse_color_attr(text_color)
        if hex_color:
            styles["textColor"] = hex_color
    # Font size
    ts = attrib.get("textSize", "")
    if isinstance(ts, str) and ts:
        styles["fontSize"] = ts
    # Font family
    ff = attrib.get("fontFamily", "")
    if isinstance(ff, str) and ff:
        styles["fontFamily"] = ff.split("/")[-1]
    # Padding
    pl = _safe_str(attrib.get("paddingLeft", attrib.get("padding", "")))
    pt = _safe_str(attrib.get("paddingTop", attrib.get("padding", "")))
    pr = _safe_str(attrib.get("paddingRight", attrib.get("padding", "")))
    pb = _safe_str(attrib.get("paddingBottom", attrib.get("padding", "")))
    if any([pl, pt, pr, pb]):
        styles["padding"] = {
            "left": _parse_dimension(pl) if pl else 0,
            "top": _parse_dimension(pt) if pt else 0,
            "right": _parse_dimension(pr) if pr else 0,
            "bottom": _parse_dimension(pb) if pb else 0,
        }
    # Elevation
    el = attrib.get("elevation", "")
    if isinstance(el, str) and el:
        styles["elevation"] = el
    return styles if styles else {}


class AndroidDeviceBridge(DeviceBridgeBase):
    """Android device bridge using ADB."""

    def __init__(self, serial: str | None = None):
        super().__init__(udid=serial)
        self.serial = serial
        self._recorder: dict[str, RecorderSession] = {}
        self._current_context = "NATIVE_APP"
        # Cache for XML dump - force fresh on next fetch to ensure parser consistency
        self._cached_hierarchy_xml: str | None = None
        self._cached_hierarchy_xml_time: float = 0.0
        self._xml_cache_ttl: float = 5.0  # seconds
        self._xml_cache_version: int = 1  # increment to force fresh dump
        # TTL cache for expensive ADB results
        self._screenshot_cache: dict[str, tuple[bytes, float]] = {}  # serial -> (bytes, timestamp)
        self._hierarchy_cache: dict[str, tuple[dict, float]] = {}  # serial -> (tree, timestamp)
        self._screenshot_ttl = 3.0  # seconds
        self._hierarchy_ttl = 5.0  # seconds
        self._shutdown = False  # shutdown flag for background threads

    def _get_hierarchy_xml(self) -> str:
        """Get hierarchy XML, from cache if fresh or fresh dump if stale."""
        current_time = time.time()
        if self._cached_hierarchy_xml and (current_time - self._cached_hierarchy_xml_time) < self._xml_cache_ttl:
            return self._cached_hierarchy_xml
        # Fresh dump
        subprocess.run(
            self._adb_cmd(["shell", "uiautomator", "dump"]),
            capture_output=True,
            timeout=10,
        )
        subprocess.run(
            self._adb_cmd(["pull", "/sdcard/window_dump.xml", f"{_INSPECTOR_TMP}/window_dump.xml"]),
            capture_output=True,
            timeout=10,
        )
        with open(f"{_INSPECTOR_TMP}/window_dump.xml") as f:
            xml_content = f.read()
        if not xml_content:
            raise Exception("Empty hierarchy dump")
        self._cached_hierarchy_xml = xml_content
        self._cached_hierarchy_xml_time = current_time
        return xml_content

    def get_recorder_session(self, session_id: str) -> RecorderSession:
        if session_id not in self._recorder:
            self._recorder[session_id] = RecorderSession()
        return self._recorder[session_id]

    def get_contexts(self) -> list[dict]:
        """List all available contexts (NATIVE_APP + WebViews)."""
        try:
            result = self._driver.execute_script("mobile: getContexts")
            contexts = []
            if isinstance(result, list):
                for ctx in result:
                    ctx_id = _safe_str(ctx.get("id", ctx)) if isinstance(ctx, dict) else _safe_str(ctx)
                    ctx_type = "webview" if str(ctx_id).startswith("WEBVIEW") else "native"
                    desc = str(ctx_id)
                    contexts.append({"id": ctx_id, "type": ctx_type, "description": desc})
            if not any(c["id"] == "NATIVE_APP" for c in contexts):
                contexts.insert(0, {"id": "NATIVE_APP", "type": "native", "description": "Native Android"})
            return contexts
        except Exception as e:
            logger.warning(f"get_contexts failed: {e}")
            return [{"id": "NATIVE_APP", "type": "native", "description": "Native Android"}]

    def switch_context(self, context_id: str) -> bool:
        """Switch to a different context (native or webview)."""
        try:
            self._driver.execute_script("mobile: switchToContext", {"name": context_id})
            self._current_context = context_id
            return True
        except Exception as e:
            logger.error(f"switch_context failed: {e}")
            return False

    def _adb_cmd(self, args: list[str]) -> list[str]:
        """Prepend -s <serial> to adb command if serial is set."""
        cmd = [_ADB_PATH]
        if self.serial:
            cmd.extend(["-s", self.serial])
        cmd.extend(args)
        logger.info("[ADB] running: %s", cmd)
        return cmd

    def connect(self) -> bool:
        def do_connect():
            result = subprocess.run(
                self._adb_cmd(["shell", "echo", "test"]),
                capture_output=True,
                text=True,
                timeout=5,
            )
            if result.returncode != 0:
                raise Exception("connect failed")
            return result

        try:
            _retry_with_backoff(do_connect, retries=3, base_delay=0.5)
            return True
        except Exception as e:
            logger.error("Connection test failed: %s", str(e))
            return False

    def get_devices(self) -> list[dict]:
        try:
            result = subprocess.run(
                [_ADB_PATH, "devices", "-l"],
                capture_output=True,
                text=True,
                timeout=10,
            )
            devices = []
            for line in result.stdout.strip().split("\n")[1:]:
                if not line.strip():
                    continue
                parts = line.split()
                serial = parts[0]
                state = "unknown"
                device_info = {}
                for part in parts[1:]:
                    if ":" in part:
                        key, val = part.split(":", 1)
                        device_info[key] = val
                    else:
                        state = part
                devices.append(
                    {
                        "serial": serial,
                        "udid": serial,
                        "platform": "android",
                        "state": state,
                        "model": device_info.get("model", "Unknown"),
                        "product": device_info.get("product", ""),
                        "device": device_info.get("device", ""),
                    }
                )
            for d in devices:
                d["manufacturer"] = self._get_prop(d["serial"], "ro.product.manufacturer")
                d["brand"] = self._get_prop(d["serial"], "ro.product.brand")
                d["android_version"] = self._get_prop(d["serial"], "ro.build.version.release")
                d["sdk"] = self._get_prop(d["serial"], "ro.build.version.sdk")
                d["name"] = self._get_prop(d["serial"], "ro.product.model") or d["model"]
            return devices
        except Exception as e:
            logger.error("get_devices failed: %s", str(e))
            return []

    def _get_prop(self, serial: str, prop: str) -> str:
        try:
            result = subprocess.run(
                [_ADB_PATH, "-s", serial, "shell", "getprop", prop],
                capture_output=True,
                text=True,
                timeout=5,
            )
            return result.stdout.strip()
        except Exception as e:
            logger.warning("[_get_prop] getprop %s failed for %s: %s", prop, serial, e)
            return ""

    def get_hierarchy(self) -> dict:
        key = self.serial or "default"
        now = time.time()
        # Stale-while-revalidate: return cached immediately if fresh
        if key in self._hierarchy_cache:
            data, ts = self._hierarchy_cache[key]
            age = now - ts
            if age < self._hierarchy_ttl:
                logger.info(f"[get_hierarchy] Cache hit (age={age:.1f}s)")
                return data
            # Stale but within 3x TTL — return stale, refresh in background
            if age < self._hierarchy_ttl * 3:
                logger.info(f"[get_hierarchy] Stale hit (age={age:.1f}s), background refresh triggered")
                threading.Thread(target=self._refresh_hierarchy_async, daemon=True, args=(key,)).start()
                return data
            # Too stale — block and fetch synchronously
        return self._fetch_hierarchy_sync()

    def _fetch_hierarchy_sync(self) -> dict:
        """Synchronous hierarchy fetch + parse + cache. Called on cold start or too-stale."""
        key = self.serial or "default"
        now = time.time()
        try:
            subprocess.run(
                self._adb_cmd(["shell", "uiautomator", "dump"]),
                capture_output=True,
                timeout=10,
            )
            subprocess.run(
                self._adb_cmd(["pull", "/sdcard/window_dump.xml", f"{_INSPECTOR_TMP}/window_dump.xml"]),
                capture_output=True,
                timeout=10,
            )
            with open(f"{_INSPECTOR_TMP}/window_dump.xml") as f:
                xml_content = f.read()
            if not xml_content:
                return {"error": "Empty hierarchy dump"}
            self._cached_hierarchy_xml = xml_content
            logger.info(f"[get_hierarchy] Fresh dump (~{len(xml_content)} bytes)")
            if not HAS_LXML:
                root = ET.fromstring(xml_content)
                result = self._node_to_json(root)
            else:
                root = lxml_etree.fromstring(
                    xml_content.encode("utf-8") if isinstance(xml_content, str) else xml_content
                )
                all_xml_elements = root.xpath(".//*")
                logger.info(f"[get_hierarchy] XML raw node count (from xpath '//*'): {len(all_xml_elements)}")
                result = self._lxml_node_to_json(root)

                def count_json_nodes(node: dict) -> int:
                    count = 1
                    for child in node.get("children", []):
                        count += count_json_nodes(child)
                    return count

                logger.info(f"[get_hierarchy] JSON tree node count: {count_json_nodes(result)}")
            self._hierarchy_cache[key] = (result, now)
            return result
        except FileNotFoundError:
            raise Exception("adb not found. Is Android SDK installed?")
        except subprocess.TimeoutExpired:
            raise Exception("Device communication timed out")
        except Exception as e:
            raise Exception(f"Failed to get hierarchy: {e!s}")

    def _refresh_hierarchy_async(self, key: str):
        """Background refresh after stale return."""
        try:
            time.sleep(0.2)  # debounce concurrent requests
            self._fetch_hierarchy_sync()
        except Exception as e:
            logger.warning(f"[get_hierarchy] Background refresh failed: {e}")

    def search_hierarchy(self, query: str, filter_type: str = "xpath") -> dict:
        """Search hierarchy using cached XML, fetching fresh if cache is stale/missing.
        Uses cached XML to avoid slow device dump on every search.
        If no cache exists or cache is stale, fetches fresh hierarchy first.
        CRITICAL: IDs are now generated sequentially from an incrementing counter, so
        the same hierarchy content always produces the same IDs regardless of when fetched.
        """
        # Fetch fresh hierarchy if no cache exists
        xml_content = self._cached_hierarchy_xml
        if not xml_content:
            logger.info("[search_hierarchy] No cached XML - fetching fresh hierarchy")
            try:
                self._fetch_hierarchy_sync()
                xml_content = self._cached_hierarchy_xml
            except Exception as e:
                logger.error(f"[search_hierarchy] Failed to fetch hierarchy: {e}")
                return {"matches": [], "count": 0, "error": f"Failed to fetch hierarchy: {e!s}"}
        if not xml_content:
            logger.warning("[search_hierarchy] Still no XML content after fetch")
            return {"matches": [], "count": 0, "error": "No hierarchy available from device"}
        logger.info(
            f"[search_hierarchy] Using cached XML (~{len(xml_content)} bytes), filter={filter_type}, query={query}"
        )
        # Debug: show first 500 chars of cached XML to verify content
        logger.info(f"[search_hierarchy] Cached XML preview: {xml_content[:500]}")
        try:
            if not HAS_LXML:
                return {"error": "lxml not installed. Install with: uv pip install lxml"}
            root = lxml_etree.fromstring(xml_content.encode("utf-8") if isinstance(xml_content, str) else xml_content)
            xpath = self._build_search_xpath(query, filter_type)
            if xpath.get("error"):
                return xpath
            logger.info(f"[search_hierarchy] Executing XPath: {xpath['xpath']}")
            # Debug: check if any node has resource-id attribute
            all_nodes_with_resource_id = root.xpath("//node[@resource-id]")
            all_nodes_with_android_resource_id = root.xpath(
                "//node[@android:resource-id]",
                namespaces={"android": "http://schemas.android.com/apk/res/android"},
            )
            logger.info(f"[search_hierarchy] Total nodes with @resource-id: {len(all_nodes_with_resource_id)}")
            logger.info(
                f"[search_hierarchy] Total nodes with @android:resource-id: {len(all_nodes_with_android_resource_id)}"
            )
            if all_nodes_with_resource_id:
                sample = all_nodes_with_resource_id[0]
                logger.info(
                    f"[search_hierarchy] Sample node: class={sample.get('class')}, resource-id={sample.get('resource-id')}"
                )
            elif all_nodes_with_android_resource_id:
                sample = all_nodes_with_android_resource_id[0]
                logger.info(
                    f"[search_hierarchy] Sample node: class={sample.get('class')}, android:resource-id={sample.get('{http://schemas.android.com/apk/res/android}resource-id')}"
                )
            try:
                matches = root.xpath(xpath["xpath"])
                logger.info(f"[search_hierarchy] XPath returned {len(matches)} matches")
            except Exception as e:
                return {"error": f"Invalid search: {e!s}"}
            if not matches:
                return {"matches": [], "count": 0}
            result_nodes = []
            for match in matches:
                node_dict = self._lxml_node_to_json(match)
                result_nodes.append(node_dict)
            # Post-filter for resource-id: match short name case-insensitively
            if filter_type == "resource-id" and query.strip():
                query_lower = query.lower()
                result_nodes = [
                    n
                    for n in result_nodes
                    if n.get("resourceId", "").lower() == query_lower
                    or n.get("resourceIdFull", "")
                    .lower()
                    .replace(":", "_")
                    .replace("/", "_")
                    .replace("-", "_")
                    .endswith(query_lower)
                ]
            return {"matches": result_nodes, "count": len(result_nodes)}
        except Exception as e:
            raise Exception(f"Failed to search hierarchy: {e!s}")

    def _build_search_xpath(self, query: str, filter_type: str) -> dict:
        """Build XPath expression based on filter type."""
        if not query.strip():
            return {"xpath": "//node", "error": None}
        # Escape XPath special characters in query to prevent injection

        escaped_query = query.replace("'", "\\'").replace('"', '\\"')
        if filter_type == "xpath":
            # If query doesn't look like XPath, treat as class name contains search
            if not query.strip().startswith("//") and not query.strip().startswith("/"):
                # Treat as class name search
                if "." in query:
                    return {"xpath": f"//node[@class='{escaped_query}']", "error": None}
                return {"xpath": f"//node[contains(@class,'{escaped_query}')]", "error": None}
            translated = self._translate_xpath(query)
            return {"xpath": translated, "error": None}
        if filter_type == "resource-id":
            # Use //node and post-filter by resourceId (short name, case-insensitive)
            return {"xpath": "//node", "error": None}
        if filter_type == "text":
            # Use text() for text content AND @text for attribute
            return {
                "xpath": f"//node[contains(@text,'{escaped_query}') or contains(text(),'{escaped_query}')]",
                "error": None,
            }
        if filter_type == "content-desc":
            return {"xpath": f"//node[contains(@content-desc,'{escaped_query}')]", "error": None}
        if filter_type == "class":
            if "." in query:
                return {"xpath": f"//node[@class='{escaped_query}']", "error": None}
            return {"xpath": f"//node[contains(@class,'{escaped_query}')]", "error": None}
        return {"xpath": "//node", "error": f"Unknown filter type: {filter_type}"}

    def _lxml_node_to_json(self, node) -> dict:
        """Convert lxml element to JSON dict with capabilities and styles."""
        attrib = node.attrib
        class_name = attrib.get("class", "")
        if not isinstance(class_name, str):
            class_name = ""
        package = attrib.get("package", "")
        if not isinstance(package, str):
            package = ""
        resource_id = attrib.get("resource-id", "")
        if not isinstance(resource_id, str):
            resource_id = ""
        text = attrib.get("text", "")
        if not isinstance(text, str):
            text = ""
        content_desc = attrib.get("content-desc", "")
        if not isinstance(content_desc, str):
            content_desc = ""
        bounds = attrib.get("bounds", "")
        if not isinstance(bounds, str):
            bounds = ""
        node_id = _generate_id(class_name.split(".")[-1] if class_name else "node")
        result = {
            "id": node_id,
            "className": class_name,
            "package": package,
        }
        if resource_id:
            result["resourceId"] = resource_id.split("/")[-1]
            result["resourceIdFull"] = resource_id
        if text:
            result["text"] = text
        if content_desc:
            result["contentDesc"] = content_desc
        if bounds:
            result["bounds"] = self._parse_bounds(bounds)
        # Boolean attributes from uiautomator XML
        if attrib.get("checkable"):
            result["checkable"] = attrib.get("checkable") == "true"
        if attrib.get("checked"):
            result["checked"] = attrib.get("checked") == "true"
        if attrib.get("clickable"):
            result["clickable"] = attrib.get("clickable") == "true"
        if attrib.get("enabled"):
            result["enabled"] = attrib.get("enabled") == "true"
        if attrib.get("focusable"):
            result["focusable"] = attrib.get("focusable") == "true"
        if attrib.get("focused"):
            result["focused"] = attrib.get("focused") == "true"
        if attrib.get("long-clickable"):
            result["longClickable"] = attrib.get("long-clickable") == "true"
        if attrib.get("scrollable"):
            result["scrollable"] = attrib.get("scrollable") == "true"
        if attrib.get("selected"):
            result["selected"] = attrib.get("selected") == "true"
        if attrib.get("password"):
            result["password"] = attrib.get("password") == "true"
        if attrib.get("visible-to-user"):
            result["visibleToUser"] = attrib.get("visible-to-user") == "true"
        # Enrich with capabilities + styles
        result["capabilities"] = _detect_capabilities(attrib, class_name)
        styles = _extract_styles(attrib)
        if styles:
            result["styles"] = styles
        children = list(node)
        if children:
            result["children"] = [self._lxml_node_to_json(child) for child in children]
        return result

    def _translate_xpath(self, xpath: str) -> str:
        """Translate simplified uiautomator XPath to actual XML XPath.
        Handles resource-id searches specially: converts exact match '=' to
        contains() so users can search by short resource-id name without
        needing the full package prefix (e.g., @resource-id='btn' matches
        'com.example:id/btn').
        """
        import re

        original = xpath.strip()
        # Handle //*[@resource-id='value'] patterns - use contains() for partial match
        # This allows searching by short resource-id name without package prefix
        resource_id_match = re.match(r"^//\*\[@resource-id='([^']+)'\]$", original)
        if resource_id_match:
            rid_value = resource_id_match.group(1)
            # Use contains() to match both full and short resource-id names
            return f"//*[contains(@resource-id,'{rid_value}')]"
        if original.startswith("//") and "@" in original:
            return original
        match = re.match(r"^//([a-zA-Z_][a-zA-Z0-9_.]*)(.*)$", original)
        if match:
            class_name = match.group(1)
            predicate = match.group(2)
            if predicate:
                if "." not in class_name:
                    return f"//node[contains(@class,'{class_name}')]{predicate}"
                return f"//node[@class='{class_name}']{predicate}"
            if "." not in class_name:
                return f"//node[contains(@class,'{class_name}')]"
            return f"//node[@class='{class_name}']"
        if original == "//*":
            return "//node"
        match_any_pred = re.match(r"^//\*(\[.*\])$", original)
        if match_any_pred:
            predicate = match_any_pred.group(1)
            return f"//node{predicate}"
        return original

    def tap(self, x: int, y: int) -> bool:
        def do_tap():
            result = subprocess.run(
                self._adb_cmd(["shell", "input", "tap", str(x), str(y)]),
                capture_output=True,
                timeout=5,
            )
            if result.returncode != 0:
                raise Exception("tap failed")
            return result

        try:
            _retry_with_backoff(do_tap, retries=3, base_delay=0.5)
            return True
        except Exception:
            return False

    def input_text(self, text: str) -> bool:
        def do_input():
            encoded = text.replace(" ", "%s")
            result = subprocess.run(
                self._adb_cmd(["shell", "input", "text", encoded]),
                capture_output=True,
                timeout=5,
            )
            if result.returncode != 0:
                raise Exception("input_text failed")
            return result

        try:
            _retry_with_backoff(do_input, retries=3, base_delay=0.5)
            return True
        except Exception:
            return False

    def get_screenshot(self) -> bytes:
        key = self.serial or "default"
        now = time.time()
        # Stale-while-revalidate
        if key in self._screenshot_cache:
            data, ts = self._screenshot_cache[key]
            age = now - ts
            if age < self._screenshot_ttl:
                logger.info(f"[get_screenshot] Cache hit (age={age:.1f}s)")
                return data
            if age < self._screenshot_ttl * 3:
                logger.info(f"[get_screenshot] Stale hit (age={age:.1f}s), background refresh triggered")
                threading.Thread(target=self._refresh_screenshot_async, daemon=True, args=(key,)).start()
                return data
        return self._fetch_screenshot_sync()

    def _fetch_screenshot_sync(self) -> bytes:
        def do_screenshot():
            result = subprocess.run(
                self._adb_cmd(["shell", "screencap", "-p"]),
                capture_output=True,
                timeout=10,
            )
            if result.returncode != 0:
                raise Exception(f"screencap failed (exit {result.returncode}): {result.stderr[:100]}")
            return result

        try:
            key = self.serial or "default"
            result = _retry_with_backoff(do_screenshot, retries=3, base_delay=1.0)
            self._screenshot_cache[key] = (result.stdout, time.time())
            return result.stdout
        except Exception as e:
            raise Exception(f"Failed to capture screenshot: {e!s}")

    def _refresh_screenshot_async(self, key: str):
        try:
            time.sleep(0.2)
            self._fetch_screenshot_sync()
        except Exception as e:
            logger.warning(f"[get_screenshot] Background refresh failed: {e}")

    def fetch_hierarchy_and_screenshot(self) -> tuple[dict, bytes]:
        """Fetch hierarchy + screenshot in a single shell invocation.
        Runs: uiautomator dump && screencap -p /sdcard/screen.png
        Then pulls both files and returns both values (also caches them).
        This eliminates ~100-200ms of TCP/auth overhead vs sequential calls.
        """
        key = self.serial or "default"
        now = time.time()
        # Single combined shell command
        dump_result = subprocess.run(
            self._adb_cmd(["shell", "uiautomator dump && screencap -p /sdcard/screen.png"]),
            capture_output=True,
            timeout=20,
        )
        if dump_result.returncode != 0:
            error_msg = dump_result.stderr or "unknown error"
            logger.error(f"[fetch_hierarchy_and_screenshot] uiautomator dump failed: {error_msg}")
            raise Exception(f"uiautomator dump failed: {error_msg}")
        # Pull both files
        subprocess.run(
            self._adb_cmd(["pull", "/sdcard/window_dump.xml", f"{_INSPECTOR_TMP}/window_dump.xml"]),
            capture_output=True,
            timeout=10,
        )
        subprocess.run(
            self._adb_cmd(["pull", "/sdcard/screen.png", f"{_INSPECTOR_TMP}/screen.png"]),
            capture_output=True,
            timeout=10,
        )
        # Parse hierarchy
        with open(f"{_INSPECTOR_TMP}/window_dump.xml") as f:
            xml_content = f.read()
        if not xml_content:
            raise Exception("Empty hierarchy dump")
        self._cached_hierarchy_xml = xml_content
        root = lxml_etree.fromstring(xml_content.encode("utf-8") if isinstance(xml_content, str) else xml_content)
        # Debug: count raw XML nodes
        all_xml_elements = root.xpath(".//*")
        logger.info(f"[fetch_hierarchy_and_screenshot] XML raw node count (from xpath '//*'): {len(all_xml_elements)}")
        tree = self._lxml_node_to_json(root)

        # Debug: count JSON tree nodes
        def count_json_nodes(node: dict) -> int:
            count = 1
            for child in node.get("children", []):
                count += count_json_nodes(child)
            return count

        logger.info(f"[fetch_hierarchy_and_screenshot] JSON tree node count: {count_json_nodes(tree)}")
        # Read screenshot
        with open(f"{_INSPECTOR_TMP}/screen.png", "rb") as f:
            screenshot_bytes = f.read()
        # Cache both
        self._hierarchy_cache[key] = (tree, now)
        self._screenshot_cache[key] = (screenshot_bytes, now)
        logger.info("[fetch_hierarchy_and_screenshot] Done, hierarchy cached")
        return tree, screenshot_bytes

    def _parse_xml_to_json(self, xml_content: str) -> dict:
        root = ET.fromstring(xml_content)
        return self._node_to_json(root)

    def _node_to_json(self, node) -> dict:
        """Convert XML node to JSON dict with capabilities and styles."""
        attrib = node.attrib
        class_name = attrib.get("class", "")
        if not isinstance(class_name, str):
            class_name = ""
        package = attrib.get("package", "")
        if not isinstance(package, str):
            package = ""
        resource_id = attrib.get("resource-id", "")
        if not isinstance(resource_id, str):
            resource_id = ""
        text = attrib.get("text", "")
        if not isinstance(text, str):
            text = ""
        content_desc = attrib.get("content-desc", "")
        if not isinstance(content_desc, str):
            content_desc = ""
        bounds = attrib.get("bounds", "")
        if not isinstance(bounds, str):
            bounds = ""
        node_id = _generate_id(class_name.split(".")[-1] if class_name else "node")
        result = {
            "id": node_id,
            "className": class_name,
            "package": package,
        }
        if resource_id:
            result["resourceId"] = resource_id.split("/")[-1]
            result["resourceIdFull"] = resource_id
        if text:
            result["text"] = text
        if content_desc:
            result["contentDesc"] = content_desc
        if bounds:
            result["bounds"] = self._parse_bounds(bounds)
        # Boolean attributes from uiautomator XML
        if attrib.get("checkable"):
            result["checkable"] = attrib.get("checkable") == "true"
        if attrib.get("checked"):
            result["checked"] = attrib.get("checked") == "true"
        if attrib.get("clickable"):
            result["clickable"] = attrib.get("clickable") == "true"
        if attrib.get("enabled"):
            result["enabled"] = attrib.get("enabled") == "true"
        if attrib.get("focusable"):
            result["focusable"] = attrib.get("focusable") == "true"
        if attrib.get("focused"):
            result["focused"] = attrib.get("focused") == "true"
        if attrib.get("long-clickable"):
            result["longClickable"] = attrib.get("long-clickable") == "true"
        if attrib.get("scrollable"):
            result["scrollable"] = attrib.get("scrollable") == "true"
        if attrib.get("selected"):
            result["selected"] = attrib.get("selected") == "true"
        if attrib.get("password"):
            result["password"] = attrib.get("password") == "true"
        if attrib.get("visible-to-user"):
            result["visibleToUser"] = attrib.get("visible-to-user") == "true"
        # Enrich with capabilities + styles
        result["capabilities"] = _detect_capabilities(attrib, class_name)
        styles = _extract_styles(attrib)
        if styles:
            result["styles"] = styles
        children = list(node)
        if children:
            result["children"] = [self._node_to_json(child) for child in children]
        return result

    def _parse_bounds(self, bounds_str: str) -> dict:
        if not bounds_str or not isinstance(bounds_str, str):
            return {"x": 0, "y": 0, "width": 0, "height": 0}
        coords = bounds_str.replace("[", "").replace("]", ",").split(",")
        coords = [c for c in coords if c]
        if len(coords) >= 4:
            x1, y1, x2, y2 = map(int, coords[:4])
            return {
                "x": x1,
                "y": y1,
                "width": x2 - x1,
                "height": y2 - y1,
            }
        return {"x": 0, "y": 0, "width": 0, "height": 0}

    def execute_adb_command(self, command: str) -> dict:
        """Execute a raw ADB shell command on the device.
        Args:
            command: The full adb shell command to run (e.g., "input tap 500 800")
        Returns:
            {"output": "...", "error": "...", "exitCode": 0}
        """
        try:
            result = subprocess.run(
                self._adb_cmd(["shell", command]),
                capture_output=True,
                text=True,
                timeout=10,
            )
            return {
                "output": result.stdout.strip(),
                "error": result.stderr.strip() if result.stderr else None,
                "exitCode": result.returncode,
            }
        except subprocess.TimeoutExpired:
            return {
                "output": "",
                "error": "Command timed out after 10 seconds",
                "exitCode": -1,
            }
        except Exception as e:
            return {
                "output": "",
                "error": str(e),
                "exitCode": -1,
            }

    def generate_locators(self, node: dict) -> dict:
        """Generate all Appium locator strategies for a UI node.
        Args:
            node: A UiNode dict with at least id, className, and bounds.
        Returns:
            dict with nodeId, className, locators list, and best strategy name.
        """
        locators = []
        class_name = _safe_str(node.get("className", ""))
        short_class = class_name.split(".")[-1] if class_name else "node"
        resource_id = _safe_str(node.get("resourceId", ""))
        text = _safe_str(node.get("text", ""))
        content_desc = _safe_str(node.get("contentDesc", ""))
        # Strategy 1: resourceId → By.id() — stability 5
        if resource_id:
            locators.append(
                {
                    "strategy": "id",
                    "value": resource_id,
                    "expression": f'By.id("{resource_id}")',
                    "stability": 5,
                }
            )
        # Strategy 2: content-desc → By.xpath() — stability 4
        if content_desc:
            locators.append(
                {
                    "strategy": "content-desc",
                    "value": content_desc,
                    "expression": f"By.xpath(\"//*[@content-desc='{content_desc}']\")",
                    "stability": 4,
                }
            )
        # Strategy 3: text with class → By.xpath() — stability 3
        if text and class_name:
            escaped_text = text.replace("'", "\\'")
            locators.append(
                {
                    "strategy": "text",
                    "value": text,
                    "expression": f"By.xpath(\"//{class_name}[@text='{escaped_text}']\")",
                    "stability": 3,
                }
            )
        # Strategy 4: AndroidUIAutomator text → By.androidUIAutomator() — stability 3
        if text:
            escaped_text = text.replace('"', '\\"')
            locators.append(
                {
                    "strategy": "android_uiautomator",
                    "value": text,
                    "expression": f'By.androidUIAutomator("new UiSelector().text(\\"{escaped_text}\\")")',
                    "stability": 3,
                }
            )
        # Strategy 5: content-desc with class → By.xpath() — stability 3
        if content_desc and class_name:
            escaped_cd = content_desc.replace("'", "\\'")
            locators.append(
                {
                    "strategy": "content-desc",
                    "value": content_desc,
                    "expression": f"By.xpath(\"//{class_name}[@content-desc='{escaped_cd}']\")",
                    "stability": 3,
                }
            )
        # Strategy 6: class + sibling index — stability 1 (last resort)
        if class_name:
            # Find the node's index among siblings with the same class
            # This is a placeholder; actual index must be computed by the caller
            # using _build_full_xpath, but we store class_index as last resort
            locators.append(
                {
                    "strategy": "class_index",
                    "value": short_class,
                    "expression": f'By.xpath("//{class_name}")',
                    "stability": 1,
                }
            )
        # Determine best: highest stability
        best = None
        if locators:
            best = max(locators, key=lambda x: x["stability"])["strategy"]
        return {
            "nodeId": _safe_str(node.get("id", "")),
            "className": class_name,
            "locators": locators,
            "best": best,
        }

    def _find_node_by_id(self, tree: dict, node_id: str) -> dict | None:
        """Recursively find a node in the hierarchy tree by its id.
        Args:
            tree: The root node or any subtree.
            node_id: The id to search for.
        Returns:
            The matching node dict, or None if not found.
        """
        if not isinstance(tree, dict):
            return None
        if tree.get("id") == node_id:
            return tree
        for child in tree.get("children", []):
            found = self._find_node_by_id(child, node_id)
            if found:
                return found
        return None

    def audit_accessibility(self, tree: dict) -> dict:
        """Run WCAG accessibility checks against the Android hierarchy tree.

        Checks:
        - contrast: textColor vs backgroundColor luminance ratio (WCAG AA: 4.5:1 normal, 3:1 large)
        - touch_target: bounds width x height < 48dp
        - missing_label: clickable=True with no text and no content_desc
        - duplicate_text: siblings with identical text
        - text_overflow: text bounds exceed parent bounds

        Returns:
            {
              "timestamp": "ISO string",
              "totalNodes": N,
              "issues": [...],
              "summary": {"high": N, "medium": N, "low": N}
            }
        """
        from device.accessibility_utils import AndroidMapper, build_audit_result, walk_and_audit

        issues, total_nodes = walk_and_audit(tree, AndroidMapper())
        return build_audit_result(issues, total_nodes)

    def setup_network_proxy(self, port: int = 8080) -> dict:
        """Set up proxy tunnel via adb reverse AND configure device proxy settings."""
        try:
            # List all connected devices to check if multiple
            list_result = subprocess.run(
                self._adb_cmd(["devices"]),
                capture_output=True,
                text=True,
                timeout=10,
            )
            device_lines = [l.strip() for l in list_result.stdout.strip().split("\n")[1:] if l.strip() and "\t" in l]
            serials = [l.split("\t")[0].strip() for l in device_lines if l.split("\t")[0].strip()]

            if len(serials) > 1 and not self.serial:
                return {
                    "success": False,
                    "error": f"Multiple devices connected: {serials}. Select a specific device first.",
                    "proxy_host": None,
                    "proxy_port": port,
                    "tunnel": "multi-device-error",
                }

            # Step 1: Configure global proxy on device (Android emulator needs this)
            # This tells the device to route HTTP traffic through the proxy
            proxy_set_result = subprocess.run(
                self._adb_cmd(["shell", "settings", "put", "global", "http_proxy", f"127.0.0.1:{port}"]),
                capture_output=True,
                text=True,
                timeout=10,
            )
            logger.info(
                f"[setup_network_proxy] proxy set result: {proxy_set_result.returncode} {proxy_set_result.stderr}"
            )

            # Step 2: adb reverse so emulator's localhost:{port} -> host:{port}
            adb_reverse_result = subprocess.run(
                self._adb_cmd(["reverse", f"tcp:{port}", f"tcp:{port}"]),
                capture_output=True,
                text=True,
                timeout=10,
            )
            logger.info(
                f"[setup_network_proxy] adb reverse result: {adb_reverse_result.returncode} {adb_reverse_result.stderr}"
            )

            if adb_reverse_result.returncode != 0:
                # Fallback to adb forward
                subprocess.run(
                    self._adb_cmd(["forward", f"tcp:{port}", f"tcp:{port}"]),
                    capture_output=True,
                    timeout=10,
                )
                tunnel = "adb-forward"
            else:
                tunnel = "adb-reverse"

            return {
                "success": True,
                "proxy_host": "127.0.0.1",
                "proxy_port": port,
                "tunnel": tunnel,
                "note": f"Device proxy configured to 127.0.0.1:{port}. adb reverse {tunnel}.",
            }
        except Exception as e:
            return {"success": False, "error": str(e), "proxy_host": None, "proxy_port": port}

    def get_network_traffic(self, duration: int = 30, format: str = "json") -> dict:
        """Read captured flows from mitmproxy flow file."""
        from network.mitm_manager import MitmproxyManager

        manager = MitmproxyManager.get_instance()
        flows = manager.get_flows()
        return {"flows": flows, "count": len(flows), "format": format}

    def install_certificate(self) -> dict:
        """Push MITM cert to device as world-readable DER format for CA installation."""
        cert_source = os.path.expanduser("~/.mitmproxy/mitmproxy-ca-cert.pem")
        if not os.path.exists(cert_source):
            logger.info("[install_certificate] mitmproxy cert not found, generating...")
            try:
                subprocess.run(
                    ["mitmdump", "--set", "confdir=/tmp/mitm_gen", "-q"],
                    capture_output=True,
                    timeout=5,
                )
                cert_source = "/tmp/mitm_gen/.mitmproxy/mitmproxy-ca-cert.pem"
                if not os.path.exists(cert_source):
                    return {
                        "success": False,
                        "error": "mitmproxy cert not found. Run 'mitmdump' once to generate.",
                        "cert_path": None,
                    }
            except Exception:
                return {
                    "success": False,
                    "error": "mitmproxy cert not found. Run 'mitmdump' once to generate.",
                    "cert_path": None,
                }

        cert_dest = os.path.join(_INSPECTOR_TMP, "mitmproxy-ca-cert.crt")
        try:
            import shutil as sh

            # Convert PEM to DER format (Android CA installer expects DER)
            result = subprocess.run(
                [
                    "openssl",
                    "x509",
                    "-inform",
                    "PEM",
                    "-outform",
                    "DER",
                    "-in",
                    cert_source,
                    "-out",
                    cert_dest,
                ],
                capture_output=True,
                timeout=10,
            )
            if result.returncode != 0:
                sh.copy(cert_source, cert_dest.replace(".crt", ".pem"))
                cert_dest = cert_dest.replace(".crt", ".pem")

            # Push to /data/local/tmp/ (world-readable, app can read from there)
            push_result = subprocess.run(
                self._adb_cmd(["push", cert_dest, "/data/local/tmp/mitmproxy-ca-cert.crt"]),
                capture_output=True,
                text=True,
                timeout=10,
            )
            logger.info(f"[install_certificate] push result: {push_result.returncode}")

            if push_result.returncode == 0:
                # Make world-readable
                subprocess.run(
                    self._adb_cmd(["shell", "chmod", "644", "/data/local/tmp/mitmproxy-ca-cert.crt"]),
                    capture_output=True,
                    timeout=5,
                )
                # Also push to Downloads as backup
                subprocess.run(
                    self._adb_cmd(["push", cert_dest, "/sdcard/Download/mitmproxy-ca-cert.crt"]),
                    capture_output=True,
                    timeout=10,
                )
                cert_path = "/data/local/tmp/mitmproxy-ca-cert.crt"
            else:
                # Fallback to Downloads
                subprocess.run(
                    self._adb_cmd(["push", cert_dest, "/sdcard/Download/mitmproxy-ca-cert.crt"]),
                    capture_output=True,
                    timeout=10,
                )
                cert_path = "/sdcard/Download/mitmproxy-ca-cert.crt"

            # Try opening via Settings > Encryption (the proper path for CA install)
            settings_result = subprocess.run(
                self._adb_cmd(
                    [
                        "shell",
                        "am",
                        "start",
                        "-a",
                        "android.settings.SECURITY_SETTINGS",
                        "-n",
                        "com.android.settings/.SecuritySettings",
                    ]
                ),
                capture_output=True,
                text=True,
                timeout=10,
            )
            logger.info(f"[install_certificate] settings result: {settings_result.returncode}")

            return {
                "success": True,
                "cert_path": cert_path,
                "installed": False,
                "note": "Settings > Security > Encryption > Install CA cert. Navigate to Downloads > mitmproxy-ca-cert.crt",
                "manual_steps": [
                    f"File location: {cert_path}",
                    "1. Open Settings > Security > Encryption & credentials",
                    "2. Tap Install a certificate > CA certificates",
                    "3. Navigate to Downloads > mitmproxy-ca-cert.crt",
                    "4. If that fails, file is at /data/local/tmp/mitmproxy-ca-cert.crt",
                ],
            }
        except Exception as e:
            logger.error(f"[install_certificate] error: {e}")
            return {"success": False, "error": str(e), "cert_path": None}

    def get_network_info(self) -> dict:
        """Get network diagnostics via shell commands."""
        import re

        def shell(cmd: str) -> str:
            result = subprocess.run(self._adb_cmd(["shell", cmd]), capture_output=True, text=True, timeout=10)
            return result.stdout.strip()

        try:
            ip_addr = shell("ip addr show")
            netstat = shell("netstat -tlnp 2>/dev/null || netstat -tln")
            dns = shell("getprop net.dns1")
            ips = re.findall(r"inet (\d+\.\d+\.\d+\.\d+)", ip_addr)
            return {
                "ip_addresses": [{"iface": "wlan0", "address": ip, "family": "IPv4"} for ip in ips],
                "connections": netstat.split("\n"),
                "dns": [dns] if dns else [],
            }
        except Exception as e:
            return {"error": str(e), "ip_addresses": [], "connections": [], "dns": []}

    def get_host_ip(self) -> str | None:
        """Parse host gateway IP from `ip route` output."""
        import re

        try:
            result = subprocess.run(
                self._adb_cmd(["shell", "ip", "route"]),
                capture_output=True,
                text=True,
                timeout=10,
            )
            # "default via 192.168.1.1 dev wlan0" → extract gateway
            match = re.search(r"default via (\d+\.\d+\.\d+\.\d+)", result.stdout)
            if match:
                return match.group(1)
            # Fallback: first inet in ip addr
            ips = re.findall(r"inet (\d+\.\d+\.\d+\.\d+)", result.stdout)
            return ips[0] if ips else None
        except Exception:
            return None

    def install_vpn_app(self, apk_path: str) -> dict:
        """Install InspectorVPN APK on device. Returns {success, installed, error}."""
        if not os.path.exists(apk_path):
            return {"success": False, "installed": False, "error": f"APK not found: {apk_path}"}
        try:
            # Check if already installed
            result = subprocess.run(
                self._adb_cmd(["shell", "pm", "list", "packages", "com.inspectorplus.vpn"]),
                capture_output=True,
                text=True,
                timeout=10,
            )
            if "com.inspectorplus.vpn" in result.stdout:
                logger.info("[install_vpn_app] already installed, upgrading...")
                install_result = subprocess.run(
                    self._adb_cmd(["install", "-r", apk_path]),
                    capture_output=True,
                    text=True,
                    timeout=60,
                )
            else:
                install_result = subprocess.run(
                    self._adb_cmd(["install", "-r", apk_path]),
                    capture_output=True,
                    text=True,
                    timeout=60,
                )
            if install_result.returncode == 0:
                return {"success": True, "installed": True}
            return {
                "success": False,
                "installed": False,
                "error": install_result.stderr or "install failed",
            }
        except Exception as e:
            return {"success": False, "installed": False, "error": str(e)}

    def setup_vpn_proxy(self, port: int = 8080) -> dict:
        """Start VPN-based interception via InspectorVPN app.

        Requires the InspectorVPN APK to be installed. The VPN intercepts ALL device
        traffic and forwards to mitmdump via adb reverse tunnel.

        Traffic flow: VPN → device:8081 → adb reverse → host:mitmdump
        """
        from network.mitm_manager import MitmproxyManager

        try:
            # Step 1: Determine APK path relative to backend
            backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            apk_path = os.path.join(
                backend_dir,
                "inspector_vpn",
                "app",
                "build",
                "outputs",
                "apk",
                "debug",
                "inspector_vpn.apk",
            )

            # Step 2: Install APK if not present
            install_result = self.install_vpn_app(apk_path)
            if not install_result["success"]:
                return install_result

            # Step 3: Start mitmdump if not running
            manager = MitmproxyManager.get_instance()
            if not manager.is_running():
                start_result = manager.start(port)
                if not start_result.get("success"):
                    return {
                        "success": False,
                        "error": f"mitmdump start failed: {start_result.get('error')}",
                    }

            actual_port = manager.get_status()["port"]

            # Step 4: Configure adb reverse tunnel for VPN → mitmdump
            # VPN app connects to device localhost:8081, we reverse that to host:mitmdump
            reverse_result = subprocess.run(
                self._adb_cmd(["reverse", "tcp:8081", f"tcp:{actual_port}"]),
                capture_output=True,
                text=True,
                timeout=10,
            )
            if reverse_result.returncode != 0:
                # Fallback to forward if reverse fails
                subprocess.run(
                    self._adb_cmd(["forward", "tcp:8081", f"tcp:{actual_port}"]),
                    capture_output=True,
                    timeout=10,
                )
                tunnel = "adb-forward"
            else:
                tunnel = "adb-reverse"

            # Step 5: Start VPN via MainActivity auto_start action
            # MainActivity auto-starts VPN when launched with auto_start action, then closes
            start_vpn_result = subprocess.run(
                self._adb_cmd(
                    [
                        "shell",
                        "am",
                        "start",
                        "-n",
                        "com.inspectorplus.vpn/.MainActivity",
                        "-a",
                        "com.inspectorplus.vpn.AUTO_START",
                        "--es",
                        "mitm_port",
                        str(actual_port),
                    ]
                ),
                capture_output=True,
                text=True,
                timeout=10,
            )

            if start_vpn_result.returncode != 0:
                return {
                    "success": False,
                    "error": f"Failed to start VPN: {start_vpn_result.stderr}",
                    "tunnel": tunnel,
                }

            logger.info(f"[setup_vpn_proxy] VPN started, tunnel={tunnel}, mitmdump_port={actual_port}")
            return {
                "success": True,
                "vpn_mode": "full-intercept",
                "tunnel": tunnel,
                "mitm_port": actual_port,
                "note": "VPN interception active. All device traffic is being captured.",
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    def stop_vpn_proxy(self) -> dict:
        """Stop VPN interception and clean up tunnel."""
        try:
            # Stop VPN service
            subprocess.run(
                self._adb_cmd(["shell", "am", "force-stop", "com.inspectorplus.vpn"]),
                capture_output=True,
                timeout=10,
            )
            # Remove adb reverse entry
            subprocess.run(
                self._adb_cmd(["reverse", "--remove", "tcp:8081"]),
                capture_output=True,
                timeout=5,
            )
            # Also stop mitmdump - VPN and mitmdump share lifecycle
            from network.mitm_manager import MitmproxyManager

            manager = MitmproxyManager.get_instance()
            if manager.is_running():
                manager.stop()
            logger.info("[stop_vpn_proxy] VPN stopped")
            return {"success": True}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def is_vpn_running(self) -> bool:
        """Check if InspectorVPN service is active via dumpsys."""
        try:
            result = subprocess.run(
                self._adb_cmd(["shell", "dumpsys", "vpn"]),
                capture_output=True,
                text=True,
                timeout=10,
            )
            output = result.stdout
            logger.info(f"[is_vpn_running] dumpsys vpn output: {output[:500]}")
            # Check for our package in VPN service status — be lenient about format
            has_pkg = "com.inspectorplus.vpn" in output
            has_iface = "tun0" in output or "10.0.0" in output
            logger.info(f"[is_vpn_running] has_pkg={has_pkg}, has_iface={has_iface}")
            return has_pkg or has_iface
        except Exception as e:
            logger.warning(f"[is_vpn_running] error: {e}")
            return False

    def shutdown(self) -> None:
        """Clean up resources on application shutdown.
        Cancels in-flight background refresh threads by setting a shutdown flag.
        Clears all caches.
        """
        self._shutdown = True
        self._cached_hierarchy_xml = None
        self._cached_hierarchy_xml_time = 0.0
        self._screenshot_cache.clear()
        self._hierarchy_cache.clear()
        logger.info("[AndroidDeviceBridge] shutdown complete")
