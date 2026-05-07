import itertools
import subprocess
import json
import shutil
import uuid
import time
import os
import logging
import threading
import tempfile
from typing import Optional, List, Dict
import httpx
from device.base import DeviceBridgeBase
from device.utils import retry_with_backoff as _retry_with_backoff
from device.recorder import IOSRecorderSession as RecorderSession
logger = logging.getLogger(__name__)
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


def _idb_cmd(args: list[str], udid: Optional[str] = None, timeout: int = 30) -> subprocess.CompletedProcess:
    """Run idb command via uv run with IDB_UDID env var.

    On this machine, the venv contains a Python idb shim (pip-installed) that requires:
    - IDB_UDID env var (not --udid before subcommand)
    - --udid after subcommand

    Always use uv run for consistent behavior regardless of what shutil.which finds.
    """
    env = dict(os.environ)
    cmd = ["uv", "run", "idb"]
    if udid:
        env["IDB_UDID"] = udid
        cmd.extend(args)
        cmd.extend(["--udid", udid])
    else:
        cmd.extend(args)
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, env=env)
class IOSDeviceBridge(DeviceBridgeBase):
    """iOS device bridge using idb."""
    def __init__(self, udid: Optional[str] = None):
        super().__init__(udid=udid)
        self.udid = udid
        self._recorder: Dict[str, RecorderSession] = {}
        self._current_context = "NATIVE_APP"
        self._cached_hierarchy: Optional[dict] = None
        self._cached_screenshot: Optional[bytes] = None
        self._screenshot_ttl = 3.0
        self._hierarchy_ttl = 5.0
        self._ios_scale: float = 1.0  # iOS uses points in WDA, screenshot is in pixels
    def _idb_cmd(self, args: list[str], timeout: int = 30) -> subprocess.CompletedProcess:
        """Run idb command via uv run with IDB_UDID env var.
        The pip-installed idb requires IDB_UDID as env var, not --udid flag.
        Also, --udid must come AFTER the subcommand.
        """
        env = dict(os.environ)
        cmd = ["uv", "run", "idb"]
        if self.udid:
            env["IDB_UDID"] = self.udid
            cmd.extend(args)
            cmd.extend(["--udid", self.udid])
        else:
            cmd.extend(args)
        return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, env=env)
    def connect(self) -> bool:
        try:
            result = _idb_cmd(["list-targets"], udid=self.udid, timeout=10)
            if self.udid:
                return self.udid in result.stdout
            return result.returncode == 0
        except Exception:
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
                    print(f"get_devices: skipped malformed JSON line: {line[:50]}...")
                    continue
                # Only include booted devices that can be inspected
                if target.get("state") != "Booted":
                    continue
                devices.append({
                    "udid": target.get("udid", ""),
                    "name": target.get("name", "Unknown"),
                    "platform": "ios",
                    "state": "connected" if target.get("available", True) else "offline",
                    "os_version": target.get("os_version", ""),
                    "architecture": target.get("architecture", ""),
                    "device_type": target.get("device_type", ""),
                    "model": target.get("name", "Unknown"),
                    "manufacturer": "Apple",
                })
            return devices
        except Exception as e:
            print(f"get_devices failed: {e}")
            return []
    def get_hierarchy(self) -> dict:
        """Get UI hierarchy using idb ui describe-all or WDA source."""
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
            return tree
        except Exception as e:
            print(f"idb ui describe-all failed after retries: {e}")
        # Fallback: try direct WDA source
        return self._get_wda_source()
    def _get_wda_source(self) -> dict:
        """Fallback to direct WebDriverAgent source."""
        # This would require the WDA server running
        # idb handles this automatically, so uiperf should work
        return {"error": "Could not retrieve iOS hierarchy. Is idb-companion installed?"}
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
                m = re.findall(r'[\d.]+', ax_frame)
                if len(m) == 4:
                    bounds = {"x": float(m[0]), "y": float(m[1]), "width": float(m[2]), "height": float(m[3])}
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
            "Button", "Link", "Tab", "Cell",
            "StaticText", "NavigationBar", "Toolbar", "TabBar",
        )
        text_input_types = (
            "TextField", "SecureTextField", "TextView", "SearchField",
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
        # Apply iOS scale to all matched nodes' bounds (pixel coords for overlay math)
        scale = self._get_ios_scale()
        if scale != 1.0:
            for match in matches:
                if match.get("bounds"):
                    b = match["bounds"]
                    match["bounds"] = {
                        "x": round(b["x"] * scale),
                        "y": round(b["y"] * scale),
                        "width": round(b["width"] * scale),
                        "height": round(b["height"] * scale),
                    }
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
        elif filter_type == "resource-id":
            # Match against resourceId (AXUniqueId)
            rid = node.get("resourceId", "") or node.get("elementId", "")
            return query in rid.lower()
        elif filter_type == "text":
            # Match against contentDesc (AXLabel) or value
            label = node.get("contentDesc", "") or node.get("value", "")
            return query in label.lower()
        elif filter_type == "content-desc":
            # Match against contentDesc (AXLabel)
            desc = node.get("contentDesc", "")
            return query in desc.lower()
        elif filter_type == "class":
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
            attr_part = pattern[pattern.index("[@") + 2:pattern.index("]")]
            if " contains " in attr_part:
                attr_name, search_val = attr_part.split(" contains ", 1)
                search_val = search_val.strip("'\"")
                node_val = self._get_xpath_attr(node, attr_name, "")
                return search_val.lower() in node_val.lower()
            else:
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
        if pattern.lower() in label.lower():
            return True
        return False
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
            print(f"tap failed after retries: {e}")
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
            logger.error(f"input_text failed after retries: {e}")
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
                ["ui", "swipe", str(point_start_x), str(point_start_y), str(point_end_x), str(point_end_y)],
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
            print(f"swipe failed after retries: {e}")
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
            print(f"press_button failed after retries: {e}")
            return False
    def drag(self, start_x: int, start_y: int, end_x: int, end_y: int, duration: int = 500) -> bool:
        raise NotImplementedError("Drag gesture is not supported on iOS devices")
    def pinch(self, x: int, y: int, scale: float) -> bool:
        raise NotImplementedError("Pinch gesture is not supported on iOS devices")
    def get_screenshot(self) -> bytes:
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
            # Verify file exists and has content
            if not os.path.exists(screenshot_path):
                raise Exception("screenshot file not created")
            file_size = os.path.getsize(screenshot_path)
            if file_size == 0:
                raise Exception("screenshot file is empty")
            logger.info(f"idb screenshot captured: {file_size} bytes")
            return result
        try:
            _retry_with_backoff(do_screenshot, retries=3, base_delay=1.0)
        except Exception as e:
            logger.error(f"Failed to capture screenshot after retries: {str(e)}")
            raise Exception(f"Failed to capture screenshot: {str(e)}")
        try:
            with open(screenshot_path, "rb") as f:
                return f.read()
        except FileNotFoundError:
            raise Exception("screenshot file not found after capture")
    def fetch_hierarchy_and_screenshot(self) -> tuple[dict, bytes]:
        """Fetch hierarchy + screenshot sequentially (no combined command for iOS).
        Runs: idb ui describe-all --json --nested then idb screenshot.
        WDA frame bounds are in points; screenshot is in pixels. Computes scale
        factor from root frame vs screenshot dimensions and applies it to all nodes.
        Returns tuple of (hierarchy_dict, screenshot_bytes) and caches both.
        """
        # Fetch hierarchy first
        hierarchy = self.get_hierarchy()
        self._cached_hierarchy = hierarchy
        # Fetch screenshot
        screenshot_bytes = self.get_screenshot()
        self._cached_screenshot = screenshot_bytes
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
            # Re-apply scale to hierarchy bounds
            hierarchy = self._apply_scale_to_tree(hierarchy, self._ios_scale)
        logger.info("[fetch_hierarchy_and_screenshot] Done")
        return hierarchy, screenshot_bytes
    def _find_node_by_id(self, tree: dict, node_id: str) -> Optional[dict]:
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
            locators.append({
                "strategy": "accessibility-id",
                "value": label,
                "expression": f'By.accessibilityId("{label}")',
                "stability": 5,
            })
        elif name:
            locators.append({
                "strategy": "accessibility-id",
                "value": name,
                "expression": f'By.accessibilityId("{name}")',
                "stability": 5,
            })
        # Strategy 2: class chain (stability 4)
        if label and class_name:
            locators.append({
                "strategy": "class chain",
                "value": f"**/{class_name}[$label='{label}']",
                "expression": f'By.xpath("//{class_name}[@label=\'{label}\']")',
                "stability": 4,
            })
        elif name and class_name:
            locators.append({
                "strategy": "class chain",
                "value": f"**/{class_name}[$name='{name}']",
                "expression": f'By.xpath("//{class_name}[@name=\'{name}\']")',
                "stability": 4,
            })
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
            locators.append({
                "strategy": "predicate string",
                "value": pred_str,
                "expression": f'By.iOSNsPredicateString("{pred_str}")',
                "stability": 3,
            })
        # Strategy 4: xpath (stability 2) — translate simplified xpath to WDA xpath
        if label and class_name:
            escaped_label = label.replace("'", "\\'")
            locators.append({
                "strategy": "xpath",
                "value": f"//{class_name}[@label='{escaped_label}']",
                "expression": f'By.xpath("//{class_name}[@label=\'{escaped_label}\']")',
                "stability": 2,
            })
        elif name and class_name:
            escaped_name = name.replace("'", "\\'")
            locators.append({
                "strategy": "xpath",
                "value": f"//{class_name}[@name='{escaped_name}']",
                "expression": f'By.xpath("//{class_name}[@name=\'{escaped_name}\']")',
                "stability": 2,
            })
        # Strategy 5: class name + index (stability 1) — fallback
        locators.append({
            "strategy": "class name + index",
            "value": short_class,
            "expression": f'By.xpath("//{class_name}")',
            "stability": 1,
        })
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
        Checks:
        - touch_target: bounds width × height < 48dp
        - missing_label: clickable element with no label/value
        - duplicate_text: siblings with identical label
        - text_overflow: text bounds exceed parent bounds
        - contrast: skipped (iOS doesn't easily provide colors)
        Returns:
            {
              "timestamp": "ISO string",
              "totalNodes": N,
              "issues": [...],
              "summary": {"high": N, "medium": N, "low": N}
            }
        """
        from datetime import datetime, timezone
        issues = []
        total_nodes = 0
        def walk_node(node: dict, siblings: list[dict] = None, parent_bounds: dict = None):
            nonlocal issues, total_nodes
            total_nodes += 1
            class_name = node.get("className", "")
            node_id = node.get("id", "")
            label = node.get("label", "")
            value = node.get("value", "")
            bounds = node.get("bounds", {})
            enabled = node.get("enabled", True)
            short_class = class_name.split(".")[-1] if class_name else "XCUIElementTypeOther"
            # Determine if clickable based on class name heuristics
            clickable = short_class in (
                "XCUIElementTypeButton", "XCUIElementTypeLink",
                "XCUIElementTypeTab", "XCUIElementTypeCell",
                "XCUIElementTypeStaticText",  # some tappable labels
            )
            # Check: touch target size
            if clickable and bounds:
                width = bounds.get("width", 0)
                height = bounds.get("height", 0)
                if width > 0 and height > 0 and (width < 48 or height < 48):
                    issues.append({
                        "nodeId": node_id,
                        "check": "touch_target",
                        "severity": "medium",
                        "description": f"Touch target {width}dp × {height}dp is below WCAG minimum of 48dp × 48dp",
                        "element": {"label": label, "value": value, "className": class_name},
                    })
            # Check: missing label (clickable but no label or value)
            if clickable and not label and not value:
                issues.append({
                    "nodeId": node_id,
                    "check": "missing_label",
                    "severity": "high",
                    "description": f"Interactive element ({short_class}) has no label or value for screen readers",
                    "element": {"className": class_name, "nodeId": node_id},
                })
            # Check: duplicate text among siblings
            if label and siblings:
                dup_count = sum(1 for s in siblings if s.get("label") == label and s.get("id") != node_id)
                if dup_count > 0:
                    issues.append({
                        "nodeId": node_id,
                        "check": "duplicate_text",
                        "severity": "low",
                        "description": f"Label '{label}' appears {dup_count + 1} times among siblings — screen readers may confuse users",
                        "element": {"label": label, "className": class_name},
                    })
            # Check: text overflow (text bounds exceed parent)
            if label and bounds and parent_bounds:
                p_bounds = parent_bounds
                if (bounds.get("x", 0) < p_bounds.get("x", 0) or
                    bounds.get("y", 0) < p_bounds.get("y", 0) or
                    bounds.get("x", 0) + bounds.get("width", 0) > p_bounds.get("x", 0) + p_bounds.get("width", 0) or
                    bounds.get("y", 0) + bounds.get("height", 0) > p_bounds.get("y", 0) + p_bounds.get("height", 0)):
                    issues.append({
                        "nodeId": node_id,
                        "check": "text_overflow",
                        "severity": "medium",
                        "description": "Text element bounds exceed parent bounds",
                        "element": {"label": label[:30], "className": class_name},
                    })
            # Recurse with siblings context
            children = node.get("children", [])
            for child in children:
                walk_node(child, siblings=children, parent_bounds=bounds)
        walk_node(tree)
        summary = {
            "high": sum(1 for i in issues if i["severity"] == "high"),
            "medium": sum(1 for i in issues if i["severity"] == "medium"),
            "low": sum(1 for i in issues if i["severity"] == "low"),
        }
        return {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "totalNodes": total_nodes,
            "issues": issues,
            "summary": summary,
        }
    def get_contexts(self) -> List[dict]:
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
    def record_step(self, session_id: str, action: str, node_id: str, locator: dict, value: str = None):
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
    def shutdown(self) -> None:
        """Clean up resources on application shutdown."""
        self._cached_hierarchy = None
        self._cached_screenshot = None
        self._ios_scale = 1.0
        logger.info("[IOSDeviceBridge] shutdown complete")
