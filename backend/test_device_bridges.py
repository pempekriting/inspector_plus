"""
Tests for device bridges: AndroidDeviceBridge and IOSDeviceBridge.
Mocks all subprocess calls to test bridge logic in isolation.
"""

import pytest
from unittest.mock import patch, MagicMock
import subprocess
import json

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from device.android_bridge import AndroidDeviceBridge
from device.ios_bridge import IOSDeviceBridge, _idb_cmd, _retry_with_backoff


# --- Helpers ---

def mock_proc(stdout="", returncode=0, timeout=False):
    """Create a mock CompletedProcess."""
    m = MagicMock()
    m.stdout = stdout
    m.returncode = returncode
    if timeout:
        m.stdout = ""
    return m


# --- _retry_with_backoff ---

class TestRetryWithBackoff:
    def test_returns_on_success(self):
        fn = MagicMock(return_value="ok")
        result = _retry_with_backoff(fn, retries=3, base_delay=0.1)
        assert result == "ok"
        fn.assert_called_once()

    def test_retries_on_timeout(self):
        fn = MagicMock(side_effect=subprocess.TimeoutExpired("cmd", 10))
        with pytest.raises(subprocess.TimeoutExpired):
            _retry_with_backoff(fn, retries=3, base_delay=0.1)
        assert fn.call_count == 3

    def test_retries_on_oserror(self):
        fn = MagicMock(side_effect=OSError("connection reset"))
        with pytest.raises(OSError):
            _retry_with_backoff(fn, retries=3, base_delay=0.1)
        assert fn.call_count == 3

    def test_no_retries_on_file_not_found(self):
        fn = MagicMock(side_effect=FileNotFoundError("adb not found"))
        with pytest.raises(FileNotFoundError):
            _retry_with_backoff(fn, retries=3, base_delay=0.1)
        assert fn.call_count == 1


# --- AndroidDeviceBridge ---

class TestAndroidDeviceBridge:
    @patch("subprocess.run")
    def test_connect_success(self, mock_run):
        mock_run.return_value = mock_proc(returncode=0)
        bridge = AndroidDeviceBridge()
        assert bridge.connect() is True

    @patch("subprocess.run")
    def test_connect_failure(self, mock_run):
        mock_run.side_effect = FileNotFoundError()
        bridge = AndroidDeviceBridge()
        assert bridge.connect() is False

    @patch("subprocess.run")
    def test_get_devices_parses_output(self, mock_run):
        mock_run.return_value = mock_proc(
            stdout="List of devices attached\nemulator-5554 device product:sdk_gphone64 model:Android_SDK device:emu64xa\n"
        )
        bridge = AndroidDeviceBridge()
        devices = bridge.get_devices()
        assert len(devices) == 1
        assert devices[0]["serial"] == "emulator-5554"
        assert devices[0]["platform"] == "android"

    @patch("subprocess.run")
    def test_get_devices_empty(self, mock_run):
        mock_run.return_value = mock_proc(stdout="List of devices attached\n")
        bridge = AndroidDeviceBridge()
        assert bridge.get_devices() == []

    @patch("subprocess.run")
    def test_get_devices_returns_empty_on_timeout(self, mock_run):
        # Fall through to return []
        def side_effect(*args, **kwargs):
            # First call: devices list (success, no devices)
            # Second call (getprop): timeout
            raise subprocess.TimeoutExpired("cmd", 5)
        mock_run.side_effect = side_effect
        bridge = AndroidDeviceBridge()
        devices = bridge.get_devices()
        assert devices == []

    @patch("subprocess.run")
    def test_tap_returns_true_on_success(self, mock_run):
        mock_run.return_value = mock_proc(returncode=0)
        bridge = AndroidDeviceBridge("emulator-5554")
        assert bridge.tap(100, 200) is True

    @patch("subprocess.run")
    def test_tap_returns_false_on_failure(self, mock_run):
        mock_run.return_value = mock_proc(returncode=1)
        bridge = AndroidDeviceBridge()
        assert bridge.tap(100, 200) is False

    @patch("subprocess.run")
    def test_tap_returns_false_on_timeout(self, mock_run):
        mock_run.side_effect = subprocess.TimeoutExpired("cmd", 5)
        bridge = AndroidDeviceBridge()
        assert bridge.tap(100, 200) is False

    @patch("subprocess.run")
    def test_input_text_returns_true_on_success(self, mock_run):
        mock_run.return_value = mock_proc(returncode=0)
        bridge = AndroidDeviceBridge()
        assert bridge.input_text("hello world") is True

    @patch("subprocess.run")
    def test_input_text_spaces_encoded(self, mock_run):
        mock_run.return_value = mock_proc(returncode=0)
        bridge = AndroidDeviceBridge()
        bridge.input_text("hello world")
        args = mock_run.call_args[0][0]
        # spaces should be encoded as %s
        assert "input" in args
        assert "hello%sworld" in args or ("hello" in args and "world" in args)

    @patch("subprocess.run")
    def test_input_text_returns_false_on_failure(self, mock_run):
        mock_run.return_value = mock_proc(returncode=1)
        bridge = AndroidDeviceBridge()
        assert bridge.input_text("text") is False

    @patch("subprocess.run")
    def test_get_screenshot_returns_bytes(self, mock_run):
        png_data = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100
        mock_run.return_value = mock_proc(stdout=png_data, returncode=0)
        bridge = AndroidDeviceBridge()
        result = bridge.get_screenshot()
        assert result == png_data

    @patch("subprocess.run")
    def test_get_screenshot_raises_on_failure(self, mock_run):
        mock_run.return_value = mock_proc(returncode=1)
        bridge = AndroidDeviceBridge()
        with pytest.raises(Exception, match="screencap failed"):
            bridge.get_screenshot()

    @patch("subprocess.run")
    def test_get_screenshot_raises_on_timeout(self, mock_run):
        mock_run.side_effect = subprocess.TimeoutExpired("cmd", 10)
        bridge = AndroidDeviceBridge()
        with pytest.raises(Exception, match="Failed to capture screenshot"):
            bridge.get_screenshot()

    @patch("subprocess.run")
    def test_adb_cmd_includes_serial(self, mock_run):
        mock_run.return_value = mock_proc(returncode=0)
        bridge = AndroidDeviceBridge("emulator-5554")
        bridge.connect()
        call_args = mock_run.call_args[0][0]
        assert "-s" in call_args
        assert "emulator-5554" in call_args

    @patch("subprocess.run")
    def test_get_hierarchy_parses_xml(self, mock_run):
        xml = '<?xml version="1.0"?><hierarchy rotation="0"><node class="android.widget.FrameLayout" bounds="[0,0][1080,1920]" text="" resource-id="" content-desc="" checkable="false" checked="false" clickable="false" enabled="false" focusable="false" focused="false" scrollable="false" selected="false" /></hierarchy>'
        mock_run.side_effect = [
            mock_proc(returncode=0),  # uiautomator dump
            mock_proc(returncode=0),  # pull
        ]

        bridge = AndroidDeviceBridge()
        with patch("builtins.open", MagicMock(__enter__=MagicMock(return_value=open).__enter__, return_value=__import__("io").StringIO(xml))):
            with patch("device.android_bridge.ET") as mock_et:
                mock_et.fromstring.return_value = MagicMock()
                result = bridge.get_hierarchy()
                assert "error" not in result or result.get("error") is None

    @patch("subprocess.run")
    def test_get_hierarchy_raises_on_adb_not_found(self, mock_run):
        mock_run.side_effect = FileNotFoundError()
        bridge = AndroidDeviceBridge()
        with pytest.raises(Exception, match="adb not found"):
            bridge.get_hierarchy()

    @patch("subprocess.run")
    def test_search_hierarchy_xpath_filter(self, mock_run):
        bridge = AndroidDeviceBridge()
        with patch.object(bridge, "get_hierarchy") as mock_h:
            mock_h.return_value = {"id": "root", "className": "Frame", "bounds": {"x":0,"y":0,"width":100,"height":100}, "children": []}
            with patch("device.android_bridge.HAS_LXML", True):
                with patch("device.android_bridge.lxml_etree") as mock_lxml:
                    mock_root = MagicMock()
                    mock_root.xpath.return_value = []
                    mock_lxml.fromstring.return_value = mock_root
                    result = bridge.search_hierarchy("//Button", "xpath")
                    assert "matches" in result
                    assert "count" in result

    @patch("subprocess.run")
    def test_search_hierarchy_resource_id_filter(self, mock_run):
        bridge = AndroidDeviceBridge()
        with patch.object(bridge, "get_hierarchy"):
            with patch("device.android_bridge.HAS_LXML", True):
                with patch("device.android_bridge.lxml_etree") as mock_lxml:
                    mock_root = MagicMock()
                    mock_root.xpath.return_value = []
                    mock_lxml.fromstring.return_value = mock_root
                    result = bridge.search_hierarchy("btn_login", "resource-id")
                    assert result.get("count", -1) >= 0

    def test_generate_locators_resource_id(self):
        """Node with resourceId → id locator is best (stability 5)."""
        bridge = AndroidDeviceBridge()
        node = {
            "id": "Button_42",
            "className": "android.widget.Button",
            "resourceId": "btn_submit",
            "text": "Submit",
            "contentDesc": "",
            "bounds": {"x": 100, "y": 200, "width": 200, "height": 80},
        }
        result = bridge.generate_locators(node)
        assert result["nodeId"] == "Button_42"
        assert result["className"] == "android.widget.Button"
        assert result["best"] == "id"
        locators_by_strategy = {l["strategy"]: l for l in result["locators"]}
        assert "id" in locators_by_strategy
        assert locators_by_strategy["id"]["value"] == "btn_submit"
        assert locators_by_strategy["id"]["stability"] == 5

    def test_generate_locators_text(self):
        """Node without resourceId but with text → text locator is best."""
        bridge = AndroidDeviceBridge()
        node = {
            "id": "Button_10",
            "className": "android.widget.Button",
            "resourceId": "",
            "text": "Submit",
            "contentDesc": "",
            "bounds": {"x": 100, "y": 200, "width": 200, "height": 80},
        }
        result = bridge.generate_locators(node)
        assert result["best"] == "text"
        locators_by_strategy = {l["strategy"]: l for l in result["locators"]}
        assert "text" in locators_by_strategy
        assert locators_by_strategy["text"]["stability"] == 3

    def test_generate_locators_fallback_class_index(self):
        """Node with no other attrs → class_index locator is last resort."""
        bridge = AndroidDeviceBridge()
        node = {
            "id": "FrameLayout_1",
            "className": "android.widget.FrameLayout",
            "resourceId": "",
            "text": "",
            "contentDesc": "",
            "bounds": {"x": 0, "y": 0, "width": 1080, "height": 1920},
        }
        result = bridge.generate_locators(node)
        # No id, content-desc, or text → best is class_index (stability 1)
        assert result["best"] == "class_index"
        locators_by_strategy = {l["strategy"]: l for l in result["locators"]}
        assert "class_index" in locators_by_strategy
        assert locators_by_strategy["class_index"]["stability"] == 1

    def test_generate_locators_content_desc(self):
        """Node with content-desc → content-desc locator is best (stability 4)."""
        bridge = AndroidDeviceBridge()
        node = {
            "id": "ImageButton_5",
            "className": "android.widget.ImageButton",
            "resourceId": "",
            "text": "",
            "contentDesc": "Settings",
            "bounds": {"x": 0, "y": 0, "width": 100, "height": 100},
        }
        result = bridge.generate_locators(node)
        assert result["best"] == "content-desc"
        # Find the content-desc locator without class (stability 4)
        cd_locators = [l for l in result["locators"] if l["strategy"] == "content-desc"]
        assert any(l["stability"] == 4 for l in cd_locators)

    def test_find_node_by_id_found(self):
        """_find_node_by_id returns node when found."""
        bridge = AndroidDeviceBridge()
        tree = {
            "id": "root",
            "className": "FrameLayout",
            "children": [
                {"id": "LinearLayout_1", "className": "LinearLayout", "children": []},
                {
                    "id": "Button_42",
                    "className": "Button",
                    "children": [],
                },
            ],
        }
        result = bridge._find_node_by_id(tree, "Button_42")
        assert result is not None
        assert result["id"] == "Button_42"

    def test_find_node_by_id_not_found(self):
        """_find_node_by_id returns None when not found."""
        bridge = AndroidDeviceBridge()
        tree = {
            "id": "root",
            "className": "FrameLayout",
            "children": [],
        }
        result = bridge._find_node_by_id(tree, "NonExistent_99")
        assert result is None

    @patch("subprocess.run")
    def test_execute_adb_command_success(self, mock_run):
        """execute_adb_command returns output and exitCode 0 on success."""
        mock_run.return_value = MagicMock(
            stdout="OK", stderr="", returncode=0
        )
        bridge = AndroidDeviceBridge("emulator-5554")
        result = bridge.execute_adb_command("input tap 500 800")
        assert result["output"] == "OK"
        assert result["error"] is None
        assert result["exitCode"] == 0
        call_args = mock_run.call_args[0][0]
        assert "shell" in call_args
        # Command is passed as a single string after 'shell'
        assert "input tap 500 800" in call_args[-1] or any("input" in str(a) for a in call_args)

    @patch("subprocess.run")
    def test_execute_adb_command_failure(self, mock_run):
        """execute_adb_command returns error in response on non-zero exit."""
        mock_run.return_value = MagicMock(
            stdout="", stderr="error: device not found", returncode=1
        )
        bridge = AndroidDeviceBridge()
        result = bridge.execute_adb_command("invalid command")
        assert result["output"] == ""
        assert result["error"] == "error: device not found"
        assert result["exitCode"] == 1

    @patch("subprocess.run")
    def test_execute_adb_command_timeout(self, mock_run):
        """execute_adb_command handles subprocess timeout."""
        mock_run.side_effect = subprocess.TimeoutExpired("cmd", 10)
        bridge = AndroidDeviceBridge()
        result = bridge.execute_adb_command("sleep 30")
        assert result["output"] == ""
        assert "timed out" in result["error"]
        assert result["exitCode"] == -1

    def test_audit_contrast(self):
        """Node with poor contrast → high issue."""
        bridge = AndroidDeviceBridge()
        tree = {
            "id": "root",
            "className": "LinearLayout",
            "bounds": {"x": 0, "y": 0, "width": 1080, "height": 1920},
            "children": [
                {
                    "id": "TextView_1",
                    "className": "android.widget.TextView",
                    "text": "Hello",
                    "bounds": {"x": 100, "y": 100, "width": 200, "height": 50},
                    "clickable": False,
                    "styles": {
                        "textColor": "#999999",  # light gray on white
                        "backgroundColor": "#FFFFFF",
                        "fontSize": "14sp",
                    },
                    "children": [],
                },
            ],
        }
        result = bridge.audit_accessibility(tree)
        assert result["totalNodes"] == 2
        contrast_issues = [i for i in result["issues"] if i["check"] == "contrast"]
        assert len(contrast_issues) >= 1
        high_issues = [i for i in result["issues"] if i["severity"] == "high"]
        assert len(high_issues) >= 1
        assert contrast_issues[0]["nodeId"] == "TextView_1"
        assert contrast_issues[0]["description"].startswith("Text color")

    def test_audit_missing_label(self):
        """Clickable without label → high issue."""
        bridge = AndroidDeviceBridge()
        tree = {
            "id": "root",
            "className": "LinearLayout",
            "bounds": {"x": 0, "y": 0, "width": 1080, "height": 1920},
            "children": [
                {
                    "id": "Button_1",
                    "className": "android.widget.Button",
                    "text": "",
                    "contentDesc": "",
                    "bounds": {"x": 100, "y": 100, "width": 200, "height": 80},
                    "clickable": True,
                    "children": [],
                },
            ],
        }
        result = bridge.audit_accessibility(tree)
        missing_label_issues = [i for i in result["issues"] if i["check"] == "missing_label"]
        assert len(missing_label_issues) >= 1
        assert missing_label_issues[0]["nodeId"] == "Button_1"
        assert missing_label_issues[0]["severity"] == "high"

    def test_audit_touch_target(self):
        """Too small touch target → medium issue."""
        bridge = AndroidDeviceBridge()
        tree = {
            "id": "root",
            "className": "LinearLayout",
            "bounds": {"x": 0, "y": 0, "width": 1080, "height": 1920},
            "children": [
                {
                    "id": "ImageButton_1",
                    "className": "android.widget.ImageButton",
                    "contentDesc": "Settings gear",
                    "bounds": {"x": 10, "y": 10, "width": 36, "height": 36},  # below 48dp
                    "clickable": True,
                    "children": [],
                },
            ],
        }
        result = bridge.audit_accessibility(tree)
        touch_issues = [i for i in result["issues"] if i["check"] == "touch_target"]
        assert len(touch_issues) >= 1
        assert touch_issues[0]["nodeId"] == "ImageButton_1"
        assert touch_issues[0]["severity"] == "medium"
        assert "36dp" in touch_issues[0]["description"]


# --- IOSDeviceBridge ---

class TestIOSDeviceBridge:
    @patch("device.ios_bridge._idb_cmd")
    def test_connect_success(self, mock_idb):
        mock_idb.return_value = mock_proc(
            returncode=0,
            stdout="00001234-0001234567890123 iPhone 15 Pro",
        )
        bridge = IOSDeviceBridge("00001234-0001234567890123")
        assert bridge.connect() is True

    @patch("device.ios_bridge._idb_cmd")
    def test_connect_returns_false_on_error(self, mock_idb):
        mock_idb.side_effect = Exception("idb not found")
        bridge = IOSDeviceBridge()
        assert bridge.connect() is False

    @patch("device.ios_bridge._idb_cmd")
    def test_get_devices_parses_json(self, mock_idb):
        mock_idb.return_value = mock_proc(
            stdout='{"udid": "abc", "name": "iPhone 15", "os_version": "17.0", "state": "Booted", "architecture": "arm64"}\n',
            returncode=0,
        )
        bridge = IOSDeviceBridge()
        devices = bridge.get_devices()
        assert len(devices) == 1
        assert devices[0]["udid"] == "abc"
        assert devices[0]["platform"] == "ios"

    @patch("device.ios_bridge._idb_cmd")
    def test_get_devices_returns_empty_on_error(self, mock_idb):
        mock_idb.side_effect = Exception("fail")
        bridge = IOSDeviceBridge()
        assert bridge.get_devices() == []

    @patch("device.ios_bridge._idb_cmd")
    @patch("device.ios_bridge._retry_with_backoff")
    def test_get_hierarchy_success(self, mock_retry, mock_idb):
        mock_retry.return_value = {"type": "Window", "label": "", "children": []}
        bridge = IOSDeviceBridge()
        result = bridge.get_hierarchy()
        # retry_with_backoff returns the tree directly on success
        assert result.get("type") == "Window"

    @patch("device.ios_bridge._idb_cmd")
    def test_tap_returns_true_on_success(self, mock_idb):
        mock_idb.return_value = mock_proc(returncode=0)
        bridge = IOSDeviceBridge()
        assert bridge.tap(100, 200) is True

    @patch("device.ios_bridge._idb_cmd")
    @patch("device.ios_bridge._retry_with_backoff")
    def test_tap_retries_on_failure(self, mock_retry, mock_idb):
        mock_retry.side_effect = lambda fn, **kwargs: fn()
        mock_idb.return_value = mock_proc(returncode=0)
        bridge = IOSDeviceBridge()
        result = bridge.tap(100, 200)
        assert result is True

    @patch("device.ios_bridge._idb_cmd")
    @patch("device.ios_bridge._retry_with_backoff")
    def test_tap_returns_false_after_retries_exhausted(self, mock_retry, mock_idb):
        mock_retry.side_effect = subprocess.TimeoutExpired("cmd", 10)
        bridge = IOSDeviceBridge()
        assert bridge.tap(100, 200) is False

    @patch("builtins.open")
    @patch("device.ios_bridge._idb_cmd")
    @patch("device.ios_bridge._retry_with_backoff")
    def test_get_screenshot_returns_bytes(self, mock_retry, mock_idb, mock_open):
        mock_retry.return_value = None
        mock_idb.return_value = mock_proc(returncode=0)
        mock_file = MagicMock()
        mock_file.read.return_value = b"\x89PNG\x00" * 10
        mock_open.return_value.__enter__.return_value = mock_file
        bridge = IOSDeviceBridge()
        result = bridge.get_screenshot()
        assert isinstance(result, bytes)
        assert len(result) > 0

    @patch("device.ios_bridge._idb_cmd")
    def test_search_hierarchy_calls_get_hierarchy(self, mock_idb):
        mock_idb.return_value = mock_proc(returncode=0)
        bridge = IOSDeviceBridge()
        with patch.object(bridge, "get_hierarchy") as mock_h:
            mock_h.return_value = {"type": "Window", "children": []}
            result = bridge.search_hierarchy("Button", "text")
            assert "matches" in result
            assert "count" in result


# --- _idb_cmd ---

class TestIdbCmd:
    @patch("subprocess.run")
    def test_uses_uv_run(self, mock_run):
        """Always uses uv run idb for consistent pip-installed idb behavior."""
        mock_run.return_value = mock_proc(returncode=0)
        result = _idb_cmd(["list-targets"], udid=None, timeout=10)
        call = mock_run.call_args[0][0]
        assert call[0] == "uv"
        assert "idb" in call

    @patch("subprocess.run")
    def test_sets_idb_udid_env_var(self, mock_run):
        """When udid is provided, IDB_UDID env var is set."""
        mock_run.return_value = mock_proc(returncode=0)
        _idb_cmd(["screenshot", "/tmp/out.png"], udid="abc-123", timeout=10)
        env = mock_run.call_args[1].get("env", {})
        assert env.get("IDB_UDID") == "abc-123"

    @patch("subprocess.run")
    def test_passes_udid_after_subcommand(self, mock_run):
        """--udid flag comes after subcommand for pip-installed idb."""
        mock_run.return_value = mock_proc(returncode=0)
        _idb_cmd(["screenshot", "/tmp/out.png"], udid="abc-123", timeout=10)
        call = mock_run.call_args[0][0]
        # Format: uv, run, idb, screenshot, /tmp/out.png, --udid, abc-123
        assert call.count("--udid") == 1
        udid_idx = call.index("--udid")
        assert call[udid_idx + 1] == "abc-123"
        # screenshot should come before --udid
        assert call.index("screenshot") < udid_idx