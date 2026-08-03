import copy
import json
import logging
import os
import subprocess
import tempfile
import threading
import time

from device.base import DeviceBridgeBase
from device.recorder import IOSRecorderSession as RecorderSession
from device.utils import find_node_by_id as _find_node_by_id_util
from device.utils import generate_id as _generate_id
from device.utils import retry_with_backoff as _retry_with_backoff
from device.utils import safe_str as _safe_str

logger = logging.getLogger(__name__)


def _idb_cmd(args: list[str], udid: str | None = None, timeout: int = 30) -> subprocess.CompletedProcess:
    """Run idb command via uv run idb (Python fb-idb package).

    The fb-idb Python package provides the `idb` CLI which auto-manages
    companion lifecycle — no manual socket path plumbing needed.
    Commands that target a specific device should pass udid; it will be
    appended as --udid <udid> to the subcommand.
    """
    cmd = ["uv", "run", "idb"]
    cmd.extend(args)
    if udid:
        cmd.extend(["--udid", udid])
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)


class IOSDeviceBridge(DeviceBridgeBase):
    """iOS device bridge using idb."""

    def __init__(self, udid: str | None = None):
        super().__init__(udid=udid)
        self.udid = udid
        self._recorder: dict[str, RecorderSession] = {}
        self._current_context = "NATIVE_APP"
        # TTL cache (stale-while-revalidate), matching AndroidDeviceBridge's
        # get_hierarchy()/get_screenshot() — idb calls are slow subprocess
        # round-trips, so re-shelling on every request is wasteful when the
        # UI polls repeatedly without an explicit refresh.
        self._cached_hierarchy: dict | None = None
        self._cached_hierarchy_time: float = 0.0
        self._cached_screenshot: bytes | None = None
        self._cached_screenshot_time: float = 0.0
        self._screenshot_ttl = 3.0
        self._hierarchy_ttl = 5.0
        self._ios_scale: float = 1.0  # iOS uses points in WDA, screenshot is in pixels

    def _idb_cmd(self, args: list[str], timeout: int = 30) -> subprocess.CompletedProcess:
        """Run idb command targeting this bridge's device via uv run idb."""
        return _idb_cmd(args, udid=self.udid, timeout=timeout)

    def connect(self) -> bool:
        try:
            result = _idb_cmd(["list-targets"], timeout=10)
            if self.udid:
                return self.udid in result.stdout
            return result.returncode == 0
        except Exception as e:
            logger.warning("[connect] idb check failed for UDID=%s: %s", self.udid, e)
            return False

    def get_devices(self) -> list[dict]:
        try:
            result = _idb_cmd(["list-targets", "--json"], timeout=10)
            # idb outputs newline-delimited JSON (JSON Lines), not a single JSON array
            devices = []
            for line in result.stdout.strip().split("\n"):
                if not line.strip():
                    continue
                try:
                    target = json.loads(line)
                except json.JSONDecodeError:
                    # Skip malformed lines (e.g., injected XSS in DeviceName field)
                    logger.warning("get_devices: skipped malformed JSON line: %s...", line[:50])
                    continue
                # Only include booted devices that can be inspected
                if target.get("state") != "Booted":
                    continue
                devices.append(
                    {
                        "udid": target.get("udid", ""),
                        "name": target.get("name", "Unknown"),
                        "platform": "ios",
                        "state": "connected" if target.get("available", True) else "offline",
                        "os_version": target.get("os_version", ""),
                        "architecture": target.get("architecture", ""),
                        "device_type": target.get("device_type", ""),
                        "model": target.get("name", "Unknown"),
                        "manufacturer": "Apple",
                    }
                )
            return devices
        except Exception as e:
            logger.warning("get_devices failed: %s", e)
            return []

    def get_hierarchy(self) -> dict:
        """Get UI hierarchy using idb ui describe-all or WDA source.

        Uses a TTL cache with stale-while-revalidate, matching
        AndroidDeviceBridge.get_hierarchy(): fresh cache returns immediately,
        moderately stale cache returns immediately while refreshing in the
        background, and only a cold/very-stale cache blocks on a fetch.
        Failures are never cached, so the next call always retries cleanly.
        """
        now = time.time()
        if self._cached_hierarchy is not None:
            age = now - self._cached_hierarchy_time
            if age < self._hierarchy_ttl:
                return self._cached_hierarchy
            if age < self._hierarchy_ttl * 3:
                threading.Thread(target=self._refresh_hierarchy_async, daemon=True).start()
                return self._cached_hierarchy
        return self._fetch_hierarchy_sync()

    def _fetch_hierarchy_sync(self) -> dict:
        """Synchronous idb hierarchy fetch. Caches the raw (unscaled) tree on success."""

        def do_ui():
            result = _idb_cmd(["ui", "describe-all", "--json", "--nested"], udid=self.udid, timeout=15)
            if result.returncode == 0:
                data = json.loads(result.stdout)
                # --nested format returns a list of top-level accessibility nodes
                if isinstance(data, list) and len(data) > 0:
                    # Wrap in a dict with a "children" key for consistent tree conversion
                    return self._convert_wda_to_tree({"children": data})
            raise Exception("ui describe-all failed or returned no hierarchy")

        try:
            tree = _retry_with_backoff(do_ui, retries=3, base_delay=1.0)
        except Exception as e:
            logger.warning("idb ui describe-all failed after retries: %s", e)
            # Fallback: try direct WDA source — not cached, so the next call retries.
            return self._get_wda_source(str(e))
        self._cached_hierarchy = tree
        self._cached_hierarchy_time = time.time()
        return tree

    def _refresh_hierarchy_async(self):
        """Background refresh after a stale cache hit."""
        try:
            time.sleep(0.2)  # debounce concurrent requests
            self._fetch_hierarchy_sync()
        except Exception as e:
            logger.warning("[get_hierarchy] Background refresh failed: %s", e)

    def _get_wda_source(self, error: str | None = None) -> dict:
        """Fallback to direct WebDriverAgent source - not available without idb."""
        logger.warning("[_get_wda_source] idb hierarchy fetch failed, returning empty tree")
        message = (
            f"Hierarchy unavailable - idb ui describe-all failed: {error}"
            if error
            else ("Hierarchy unavailable - idb ui describe-all failed")
        )
        return {
            "id": "ios_root",
            "className": "iOSApp",
            "contentDesc": message,
            "error": message,
            "children": [],
        }

    def _convert_wda_to_tree(self, source: dict) -> dict:
        """Convert WDA source JSON to tree format matching Android.
        The source may be:
        - A dict with "children" key containing the node list (from --nested format)
        - A list of nodes directly (from flat format)
        """
        # Handle wrapper dict with "children" key
        if isinstance(source, dict) and "children" in source:
            children = source["children"]
            if isinstance(children, list) and len(children) > 0:
                # Convert the first child as root
                return self._wda_node_to_tree(children[0])
            return {"id": "root", "className": "root", "children": []}
        # Handle list of nodes directly
        if isinstance(source, list):
            if len(source) == 0:
                return {"id": "root", "className": "root", "children": []}
            return self._wda_node_to_tree(source[0])
        return self._wda_node_to_tree(source)

    def _wda_node_to_tree(self, node: dict) -> dict:
        class_name = node.get("type", "")
        short_class = class_name.split(".")[-1] if class_name else "Other"
        result = {
            "id": _generate_id(class_name.split(".")[-1] if class_name else "node"),
            "className": class_name,
        }
        # Map WDA accessibility fields to normalized keys
        # AXLabel -> contentDesc (Android equivalent for screen reader label)
        if node.get("AXLabel"):
            result["contentDesc"] = node["AXLabel"]
        # AXValue -> value (interactive element's current value)
        if node.get("AXValue"):
            result["value"] = node["AXValue"]
        # AXUniqueId -> element identifier (resource-id equivalent)
        if node.get("AXUniqueId"):
            result["resourceId"] = node["AXUniqueId"]
            result["elementId"] = node["AXUniqueId"]
        # role -> accessibility role
        if node.get("role"):
            result["role"] = node["role"]
        if node.get("subrole"):
            result["subrole"] = node["subrole"]
        # role_description -> human-readable role description
        if node.get("role_description"):
            result["roleDescription"] = node["role_description"]
        # title -> window/app title
        if node.get("title"):
            result["title"] = node["title"]
        # help -> accessibility help text
        if node.get("help"):
            result["help"] = node["help"]
        # custom_actions -> list of available custom actions
        if node.get("custom_actions"):
            result["customActions"] = node["custom_actions"]
        # content_required -> accessibility content required flag
        if node.get("content_required") is not None:
            result["contentRequired"] = node["content_required"]
        # Bounds from AXFrame (accessibility frame in point coordinates)
        ax_frame = node.get("AXFrame", {})
        if ax_frame:
            # AXFrame format: "{{x, y}, {width, height}}"
            if isinstance(ax_frame, str):
                import re

                m = re.findall(r"[\d.]+", ax_frame)
                if len(m) == 4:
                    bounds = {
                        "x": float(m[0]),
                        "y": float(m[1]),
                        "width": float(m[2]),
                        "height": float(m[3]),
                    }
                else:
                    bounds = {"x": 0, "y": 0, "width": 0, "height": 0}
            else:
                frame = node.get("frame", ax_frame)
                bounds = {
                    "x": frame.get("x", 0),
                    "y": frame.get("y", 0),
                    "width": frame.get("width", 0),
                    "height": frame.get("height", 0),
                }
            result["bounds"] = bounds
        elif node.get("frame"):
            frame = node["frame"]
            result["bounds"] = {
                "x": frame.get("x", 0),
                "y": frame.get("y", 0),
                "width": frame.get("width", 0),
                "height": frame.get("height", 0),
            }
        # enabled from WDA
        if node.get("enabled") is not None:
            result["enabled"] = node["enabled"]
        # Infer boolean attributes from XCUI element type (short name, no XCUIElementType prefix)
        clickable_types = (
            "Button",
            "Link",
            "Tab",
            "Cell",
            "StaticText",
            "NavigationBar",
            "Toolbar",
            "TabBar",
        )
        text_input_types = (
            "TextField",
            "SecureTextField",
            "TextView",
            "SearchField",
        )
        switch_types = ("Switch",)
        slider_types = ("Slider",)
        if short_class in clickable_types:
            result["clickable"] = True
        if short_class in text_input_types:
            result["focusable"] = True
        if short_class in switch_types:
            result["enabled"] = True
            if node.get("AXValue"):
                result["checked"] = node["AXValue"].lower() in ("1", "true", "on")
        if short_class in slider_types:
            result["enabled"] = True
            result["focusable"] = True
        children = node.get("children", [])
        if children:
            result["children"] = [self._wda_node_to_tree(child) for child in children]
        return result

    def _apply_scale_to_tree(self, node: dict, scale: float) -> dict:
        """Recursively multiply all bounds in the tree by the given scale factor.
        WDA frame bounds are in points but screenshots are in pixels (2x/3x).
        This applies the computed scale to all node bounds in-place.
        """
        if node.get("bounds"):
            b = node["bounds"]
            node["bounds"] = {
                "x": round(b["x"] * scale),
                "y": round(b["y"] * scale),
                "width": round(b["width"] * scale),
                "height": round(b["height"] * scale),
            }
        for child in node.get("children", []):
            self._apply_scale_to_tree(child, scale)
        return node

    def _get_ios_scale(self) -> float:
        """Return iOS scale factor: screenshot pixels / WDA point coords.
        Computes from cached screenshot + hierarchy if not already set.
        """
        if self._ios_scale != 1.0:
            return self._ios_scale  # Already computed in fetch_hierarchy_and_screenshot
        # Compute from cached screenshot if available
        if self._cached_screenshot and self._cached_hierarchy:
            import struct

            png_w = struct.unpack(">I", self._cached_screenshot[16:20])[0]
            png_h = struct.unpack(">I", self._cached_screenshot[20:24])[0]
            root = self._cached_hierarchy.get("bounds", {})
            if root.get("width", 0) > 0:
                self._ios_scale = max(png_w / root["width"], png_h / root["height"])
                return self._ios_scale
        return 1.0

    def search_hierarchy(self, query: str, filter_type: str = "xpath") -> dict:
        """Search iOS hierarchy using basic pattern matching.
        Since iOS uses WDA JSON (not XML), full XPath isn't available.
        Supports search by:
        - 'xpath': simple patterns like //Button
        - 'resource-id': matches by name/value
        - 'text': matches by label
        - 'content-desc': matches by label
        - 'class': matches by type
        """
        hierarchy = self.get_hierarchy()
        if hierarchy.get("error"):
            return hierarchy
        # Pattern-based search
        matches = self._search_nodes(hierarchy, query, filter_type)
        # Apply iOS scale to all matched nodes' bounds (pixel coords for overlay math).
        # `matches` holds references into the (now cached) hierarchy tree, so we build
        # new dicts here rather than mutating match["bounds"] in place — otherwise a
        # second search would re-scale already-scaled bounds in the shared cache.
        scale = self._get_ios_scale()
        if scale != 1.0:
            scaled_matches = []
            for match in matches:
                if match.get("bounds"):
                    b = match["bounds"]
                    match = {
                        **match,
                        "bounds": {
                            "x": round(b["x"] * scale),
                            "y": round(b["y"] * scale),
                            "width": round(b["width"] * scale),
                            "height": round(b["height"] * scale),
                        },
                    }
                scaled_matches.append(match)
            matches = scaled_matches
        return {"matches": matches, "count": len(matches)}

    def _search_nodes(self, node: dict, query: str, filter_type: str) -> list[dict]:
        """Recursively search nodes with pattern matching."""
        results = []
        # Check if this node matches
        if self._node_matches(node, query, filter_type):
            results.append(node)
        # Recurse into children
        children = node.get("children", [])
        for child in children:
            results.extend(self._search_nodes(child, query, filter_type))
        return results

    def _node_matches(self, node: dict, query: str, filter_type: str) -> bool:
        """Check if a node matches based on filter type."""
        query = query.strip().lower()
        if not query:
            return True
        # Normalized fields in iOS WDA node:
        # - className / type (from type field)
        # - contentDesc (from AXLabel)
        # - value (from AXValue)
        # - resourceId (from AXUniqueId)
        # - name (from name field)
        # - text (may exist on some nodes)
        if filter_type == "xpath":
            return self._xpath_matches(node, query)
        if filter_type == "resource-id":
            # Match against resourceId (AXUniqueId)
            rid = node.get("resourceId", "") or node.get("elementId", "")
            return query in rid.lower()
        if filter_type == "text":
            # Match against contentDesc (AXLabel) or value
            label = node.get("contentDesc", "") or node.get("value", "")
            return query in label.lower()
        if filter_type == "content-desc":
            # Match against contentDesc (AXLabel)
            desc = node.get("contentDesc", "")
            return query in desc.lower()
        if filter_type == "class":
            # Match against type/className
            node_type = node.get("className", "") or node.get("type", "")
            return query in node_type.lower()
        return False

    def _xpath_matches(self, node: dict, pattern: str) -> bool:
        """Check if node matches XPath-like pattern."""
        # Remove // prefix
        if pattern.startswith("//"):
            pattern = pattern[2:]
        # Handle [@attr='value'] style
        if "[@" in pattern and "]" in pattern:
            attr_part = pattern[pattern.index("[@") + 2 : pattern.index("]")]
            if " contains " in attr_part:
                attr_name, search_val = attr_part.split(" contains ", 1)
                search_val = search_val.strip("'\"")
                node_val = self._get_xpath_attr(node, attr_name, "")
                return search_val.lower() in node_val.lower()
            attr_name, search_val = attr_part.split("=", 1)
            search_val = search_val.strip("'\"")
            node_val = self._get_xpath_attr(node, attr_name, "")
            return search_val.lower() == node_val.lower()
        # Simple type match
        node_type = node.get("className", "") or node.get("type", "")
        if pattern.lower() in node_type.lower():
            return True
        # Label/contentDesc match
        label = node.get("contentDesc", "") or node.get("AXLabel", "")
        return pattern.lower() in label.lower()

    def _get_xpath_attr(self, node: dict, attr: str, default: str) -> str:
        """Get normalized attribute value for XPath matching."""
        attr_map = {
            "type": "className",
            "class": "className",
            "label": "contentDesc",
            "content-desc": "contentDesc",
            "name": "name",
            "value": "value",
            "resource-id": "resourceId",
            "id": "resourceId",
        }
        key = attr_map.get(attr.lower(), attr)
        return node.get(key, default)

    def tap(self, x: int, y: int) -> bool:
        # Convert from pixel coordinates to points for idb (iOS uses points, UI sends pixels)
        scale = self._get_ios_scale()
        point_x = round(x / scale) if scale != 1.0 else x
        point_y = round(y / scale) if scale != 1.0 else y

        def do_tap():
            result = _idb_cmd(["ui", "tap", str(point_x), str(point_y)], udid=self.udid, timeout=10)
            if result.returncode != 0:
                raise Exception(f"tap failed: {result.stderr}")
            return result

        try:
            _retry_with_backoff(do_tap, retries=3, base_delay=0.5)
            return True
        except Exception as e:
            logger.warning("tap failed after retries: %s", e)
            return False

    def input_text(self, text: str) -> bool:
        """Input text using idb ui text command."""

        def do_input():
            result = _idb_cmd(["ui", "text", text], udid=self.udid, timeout=10)
            if result.returncode != 0:
                raise Exception(f"ui text failed: {result.stderr}")
            return result

        try:
            _retry_with_backoff(do_input, retries=3, base_delay=0.5)
            return True
        except Exception as e:
            logger.error("input_text failed after retries: %s", e)
            return False

    def swipe(self, start_x: int, start_y: int, end_x: int, end_y: int, duration: int = 300) -> bool:
        # Convert from pixel coordinates to points for idb (iOS uses points, UI sends pixels)
        scale = self._get_ios_scale()
        point_start_x = round(start_x / scale) if scale != 1.0 else start_x
        point_start_y = round(start_y / scale) if scale != 1.0 else start_y
        point_end_x = round(end_x / scale) if scale != 1.0 else end_x
        point_end_y = round(end_y / scale) if scale != 1.0 else end_y

        def do_swipe():
            result = _idb_cmd(
                [
                    "ui",
                    "swipe",
                    str(point_start_x),
                    str(point_start_y),
                    str(point_end_x),
                    str(point_end_y),
                ],
                udid=self.udid,
                timeout=10,
            )
            if result.returncode != 0:
                raise Exception(f"swipe failed: {result.stderr}")
            return result

        try:
            _retry_with_backoff(do_swipe, retries=3, base_delay=0.5)
            return True
        except Exception as e:
            logger.warning("swipe failed after retries: %s", e)
            return False

    def press_button(self, button: str) -> bool:
        valid_buttons = {"HOME", "LOCK", "SIDE_BUTTON"}
        if button not in valid_buttons:
            raise ValueError(f"Invalid button '{button}'. Must be one of: {valid_buttons}")

        def do_press():
            result = _idb_cmd(["ui", "button", button], udid=self.udid, timeout=10)
            if result.returncode != 0:
                raise Exception(f"press_button failed: {result.stderr}")
            return result

        try:
            _retry_with_backoff(do_press, retries=3, base_delay=0.5)
            return True
        except Exception as e:
            logger.warning("press_button failed after retries: %s", e)
            return False

    def drag(self, start_x: int, start_y: int, end_x: int, end_y: int, duration: int = 500) -> bool:
        raise NotImplementedError("Drag gesture is not supported on iOS devices")

    def pinch(self, x: int, y: int, scale: float) -> bool:
        raise NotImplementedError("Pinch gesture is not supported on iOS devices")

    def get_screenshot(self) -> bytes:
        """Get a screenshot, using a TTL cache with stale-while-revalidate
        (same pattern as get_hierarchy() / AndroidDeviceBridge.get_screenshot()).
        """
        now = time.time()
        if self._cached_screenshot is not None:
            age = now - self._cached_screenshot_time
            if age < self._screenshot_ttl:
                return self._cached_screenshot
            if age < self._screenshot_ttl * 3:
                threading.Thread(target=self._refresh_screenshot_async, daemon=True).start()
                return self._cached_screenshot
        return self._fetch_screenshot_sync()

    def _refresh_screenshot_async(self):
        """Background refresh after a stale cache hit."""
        try:
            time.sleep(0.2)
            self._fetch_screenshot_sync()
        except Exception as e:
            logger.warning("[get_screenshot] Background refresh failed: %s", e)

    def _fetch_screenshot_sync(self) -> bytes:
        """Synchronous screenshot fetch (idb, falling back to xcrun simctl).
        Caches the result on success; raises on failure without caching.
        """
        tmp_dir = tempfile.gettempdir()
        screenshot_path = os.path.join(tmp_dir, "ios_screenshot.png")

        def do_screenshot():
            result = _idb_cmd(
                ["screenshot", screenshot_path],
                udid=self.udid,
                timeout=15,
            )
            if result.returncode != 0:
                raise Exception(f"screenshot failed (exit {result.returncode}): {result.stderr or 'unknown error'}")
            if not os.path.exists(screenshot_path):
                raise Exception("screenshot file not created")
            file_size = os.path.getsize(screenshot_path)
            if file_size == 0:
                raise Exception("screenshot file is empty")
            logger.info(f"idb screenshot captured: {file_size} bytes")
            return result

        try:
            _retry_with_backoff(do_screenshot, retries=2, base_delay=0.5)
        except Exception as idb_err:
            logger.warning("idb screenshot failed: %s, trying xcrun simctl fallback", idb_err)
        else:
            try:
                with open(screenshot_path, "rb") as f:
                    data = f.read()
                self._cached_screenshot = data
                self._cached_screenshot_time = time.time()
                return data
            except FileNotFoundError:
                raise Exception("screenshot file not found after capture")

        # Fallback: xcrun simctl for simulators (writes to a different path than idb)
        xcrun_path = os.path.join(tempfile.gettempdir(), "ios_screenshot_xcrun.png")
        try:
            result = subprocess.run(
                ["xcrun", "simctl", "io", "booted", "screenshot", xcrun_path],
                capture_output=True,
                text=True,
                timeout=15,
            )
            if result.returncode == 0 and os.path.exists(xcrun_path):
                file_size = os.path.getsize(xcrun_path)
                logger.info(f"xcrun simctl screenshot captured: {file_size} bytes")
                with open(xcrun_path, "rb") as f:
                    data = f.read()
                self._cached_screenshot = data
                self._cached_screenshot_time = time.time()
                return data
            raise Exception(f"xcrun simctl failed (exit {result.returncode}): {result.stderr or 'unknown error'}")
        except FileNotFoundError:
            raise Exception("screenshot file not found after xcrun fallback")

    def fetch_hierarchy_and_screenshot(self) -> tuple[dict, bytes]:
        """Fetch hierarchy + screenshot sequentially (no combined command for iOS).
        Runs: idb ui describe-all --json --nested then idb screenshot.
        WDA frame bounds are in points; screenshot is in pixels. Computes scale
        factor from root frame vs screenshot dimensions and applies it to all nodes.
        Returns tuple of (hierarchy_dict, screenshot_bytes) and caches both.
        """
        # Fetch hierarchy first (may be a cached, RAW/unscaled tree — see get_hierarchy())
        hierarchy = self.get_hierarchy()
        # Fetch screenshot (may also be served from cache)
        screenshot_bytes = self.get_screenshot()
        # Compute iOS scale factor: screenshot pixels / WDA points
        # Root frame is in points; screenshot is in pixels (typically 2x or 3x)
        root_bounds = hierarchy.get("bounds", {})
        if root_bounds.get("width", 0) > 0 and root_bounds.get("height", 0) > 0:
            # PNG: width at bytes 16-20, height at bytes 20-24 (big-endian)
            import struct

            png_w = struct.unpack(">I", screenshot_bytes[16:20])[0]
            png_h = struct.unpack(">I", screenshot_bytes[20:24])[0]
            scale_x = png_w / root_bounds["width"]
            scale_y = png_h / root_bounds["height"]
            self._ios_scale = max(scale_x, scale_y)  # use larger if non-square (should be ~3.0)
            # Apply scale to a COPY, not the cached tree in place — get_hierarchy()
            # caches the raw/unscaled tree, and mutating it here would double-scale
            # bounds on the next cache hit.
            hierarchy = self._apply_scale_to_tree(copy.deepcopy(hierarchy), self._ios_scale)
        logger.info("[fetch_hierarchy_and_screenshot] Done")
        return hierarchy, screenshot_bytes

    def _find_node_by_id(self, tree: dict, node_id: str) -> dict | None:
        """Recursively find a node in the hierarchy tree by its id.
        Args:
            tree: The root node or any subtree.
            node_id: The id to search for.
        Returns:
            The matching node dict, or None if not found.
        """
        return _find_node_by_id_util(tree, node_id)

    def generate_locators(self, node: dict) -> dict:
        """Generate all Appium locator strategies for a UI node (WDA/iOS).
        Args:
            node: A WDA node dict with at least id, className (type), and bounds.
        Returns:
            dict with nodeId, className, locators list, and best strategy name.
        """
        locators = []
        class_name = _safe_str(node.get("className", ""))
        short_class = class_name.split(".")[-1] if class_name else "XCUIElementTypeOther"
        label = _safe_str(node.get("label", ""))
        name = _safe_str(node.get("name", ""))
        value = _safe_str(node.get("value", ""))
        node_id = _safe_str(node.get("id", ""))
        # Strategy 1: accessibility-id (stability 5) — preferred iOS strategy
        # Use label or name as accessibility-id
        if label:
            locators.append(
                {
                    "strategy": "accessibility-id",
                    "value": label,
                    "expression": f'By.accessibilityId("{label}")',
                    "stability": 5,
                }
            )
        elif name:
            locators.append(
                {
                    "strategy": "accessibility-id",
                    "value": name,
                    "expression": f'By.accessibilityId("{name}")',
                    "stability": 5,
                }
            )
        # Strategy 2: class chain (stability 4)
        if label and class_name:
            locators.append(
                {
                    "strategy": "class chain",
                    "value": f"**/{class_name}[$label='{label}']",
                    "expression": f"By.xpath(\"//{class_name}[@label='{label}']\")",
                    "stability": 4,
                }
            )
        elif name and class_name:
            locators.append(
                {
                    "strategy": "class chain",
                    "value": f"**/{class_name}[$name='{name}']",
                    "expression": f"By.xpath(\"//{class_name}[@name='{name}']\")",
                    "stability": 4,
                }
            )
        # Strategy 3: predicate string (stability 3)
        predicates = []
        if label:
            predicates.append(f"label == '{label}'")
        if name and name != label:
            predicates.append(f"name == '{name}'")
        if class_name:
            predicates.append(f"type == '{class_name}'")
        if value:
            predicates.append(f"value == '{value}'")
        if predicates:
            pred_str = " AND ".join(predicates)
            locators.append(
                {
                    "strategy": "predicate string",
                    "value": pred_str,
                    "expression": f'By.iOSNsPredicateString("{pred_str}")',
                    "stability": 3,
                }
            )
        # Strategy 4: xpath (stability 2) — translate simplified xpath to WDA xpath
        if label and class_name:
            escaped_label = label.replace("'", "\\'")
            locators.append(
                {
                    "strategy": "xpath",
                    "value": f"//{class_name}[@label='{escaped_label}']",
                    "expression": f"By.xpath(\"//{class_name}[@label='{escaped_label}']\")",
                    "stability": 2,
                }
            )
        elif name and class_name:
            escaped_name = name.replace("'", "\\'")
            locators.append(
                {
                    "strategy": "xpath",
                    "value": f"//{class_name}[@name='{escaped_name}']",
                    "expression": f"By.xpath(\"//{class_name}[@name='{escaped_name}']\")",
                    "stability": 2,
                }
            )
        # Strategy 5: class name + index (stability 1) — fallback
        locators.append(
            {
                "strategy": "class name + index",
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
            "nodeId": node_id,
            "className": class_name,
            "locators": locators,
            "best": best,
        }

    def audit_accessibility(self, tree: dict) -> dict:
        """Run WCAG accessibility checks against the iOS hierarchy tree.

        Delegates to the shared `accessibility_utils.walk_and_audit()` used by
        the Android bridge, via `IOSMapper`, so both platforms run the same
        checks (contrast, touch_target, missing_label, duplicate_text,
        text_overflow) and can't silently diverge. Contrast is a no-op for iOS
        since `IOSMapper.has_colors()` returns False (iOS doesn't easily
        provide colors).

        Returns:
            {
              "timestamp": "ISO string",
              "totalNodes": N,
              "issues": [...],
              "summary": {"high": N, "medium": N, "low": N}
            }
        """
        from device.accessibility_utils import IOSMapper, build_audit_result, walk_and_audit

        issues, total_nodes = walk_and_audit(tree, IOSMapper())
        return build_audit_result(issues, total_nodes)

    def get_contexts(self) -> list[dict]:
        """List all available contexts (NATIVE_APP + WebViews).
        For iOS, WDA supports contexts via mobile: getContexts.
        Falls back to just NATIVE_APP if unavailable.
        """
        # iOS WebView switching is complex and typically requires additional setup
        # For now, return just the native context
        return [{"id": "NATIVE_APP", "type": "native", "description": "Native iOS"}]

    def switch_context(self, context_id: str) -> bool:
        """Switch to a different context (native or webview).
        iOS WebView switching is complex and typically not supported
        via simple idb commands. Raises NotImplementedError.
        """
        raise NotImplementedError("iOS WebView context switching requires additional WDA setup")

    def get_recorder_session(self, session_id: str) -> RecorderSession:
        """Get or create a recorder session for this session_id."""
        if session_id not in self._recorder:
            self._recorder[session_id] = RecorderSession()
        return self._recorder[session_id]

    def record_step(self, session_id: str, action: str, node_id: str, locator: dict, value: str | None = None):
        """Record a step in the active recording session."""
        session = self.get_recorder_session(session_id)
        session.add_step(action, node_id, locator, value)

    def export_recording(self, session_id: str, lang: str = "python") -> str:
        """Export the recording in the specified language."""
        session = self.get_recorder_session(session_id)
        return session.export(lang, "iOS")

    def clear_recording(self, session_id: str):
        """Clear the recording for this session_id."""
        session = self.get_recorder_session(session_id)
        session.clear()

    def setup_network_proxy(self, port: int = 8080) -> dict:
        """iOS proxy setup. Simulator uses host networking automatically."""
        if self._is_physical_device():
            return {
                "success": True,
                "proxy_host": "localhost",
                "proxy_port": port,
                "tunnel": "rvictl-required",
                "instructions": ["sudo rvictl -s " + self.udid + " to capture packets"],
            }
        return {
            "success": True,
            "proxy_host": "localhost",
            "proxy_port": port,
            "tunnel": "simulator-auto",
            "note": "iOS Simulator traffic goes through macOS host network",
        }

    def get_network_traffic(self, duration: int = 30, format: str = "json") -> dict:
        """Read mitmproxy flows captured on host."""
        from network.mitm_manager import MitmproxyManager

        manager = MitmproxyManager.get_instance()
        flows = manager.get_flows()
        return {"flows": flows, "count": len(flows), "format": format}

    def install_certificate(self) -> dict:
        """iOS cert install - add to macOS keychain for simulator."""
        cert_path = os.path.expanduser("~/.mitmproxy/mitmproxy-ca-cert.pem")
        if self._is_physical_device():
            return {
                "success": False,
                "instructions": [
                    "1. Open Safari on iOS device",
                    "2. Navigate to http://mitm.it",
                    "3. Select iOS profile",
                    "4. Download and install profile",
                    "5. Go to Settings > General > VPN & Device Management",
                    "6. Enable the mitmproxy CA certificate",
                ],
            }
        return {
            "success": True,
            "cert_path": cert_path,
            "instructions": ["Import mitmproxy cert to macOS keychain: security add-certificate -T -d -i " + cert_path],
        }

    def get_network_info(self) -> dict:
        """Get iOS network info via idb."""
        return {
            "ip_addresses": [],
            "connections": [],
            "dns": [],
        }

    def setup_vpn_proxy(self, port: int = 8080) -> dict:
        """VPN interception is not supported on iOS."""
        return {
            "success": False,
            "error": "VPN interception is not supported on iOS",
            "vpn_mode": "unsupported",
        }

    def stop_vpn_proxy(self) -> dict:
        """Stop VPN interception — not applicable on iOS."""
        return {"success": True}

    def is_vpn_running(self) -> bool:
        """Check if VPN is running — always False on iOS."""
        return False

    def _is_physical_device(self) -> bool:
        """Check if this is a physical iOS device (not simulator)."""
        if not self.udid:
            return False
        return len(self.udid) > 24

    def shutdown(self) -> None:
        """Clean up resources on application shutdown."""
        self._cached_hierarchy = None
        self._cached_hierarchy_time = 0.0
        self._cached_screenshot = None
        self._cached_screenshot_time = 0.0
        self._ios_scale = 1.0
        logger.info("[IOSDeviceBridge] shutdown complete")
