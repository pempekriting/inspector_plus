"""
Backend tests for InspectorPlus FastAPI app.
Tests cover: health endpoints, device endpoints, hierarchy, tap, screenshot, error handling.
"""

import pytest
from unittest.mock import patch, MagicMock, AsyncMock
from fastapi.testclient import TestClient
from httpx import AsyncClient, ASGITransport

# Import app and error classes
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from main import (
    app,
    AppError,
    DeviceNotFoundError,
    HierarchyNotFoundError,
    CommandExecutionError,
    ScreenshotError,
    get_bridge,
)


# --- Fixtures ---

@pytest.fixture
def client():
    """Sync test client for sync endpoint tests."""
    return TestClient(app)


@pytest.fixture(autouse=True)
def reset_bridges():
    """Reset bridge singletons between tests to avoid state leakage."""
    import main
    main._android_bridge = None
    main._ios_bridges = {}
    yield
    main._android_bridge = None
    main._ios_bridges = {}


@pytest.fixture
def mock_android_bridge():
    """Mock AndroidDeviceBridge with realistic returns."""
    bridge = MagicMock()
    bridge.udid = "emulator-5554"
    bridge.serial = "emulator-5554"
    bridge.get_devices.return_value = [
        {
            "serial": "emulator-5554",
            "state": "device",
            "model": "sdk_gphone64_arm64",
            "product": "sdk_gphone64_arm64",
            "device": "emu64xa",
            "platform": "android",
        }
    ]
    bridge.get_hierarchy.return_value = {
        "id": "root",
        "className": "android.widget.FrameLayout",
        "bounds": {"x": 0, "y": 0, "width": 1080, "height": 2400},
        "children": [
            {
                "id": "LinearLayout_0",
                "className": "android.widget.LinearLayout",
                "bounds": {"x": 0, "y": 100, "width": 1080, "height": 2300},
                "children": [
                    {
                        "id": "Button_0",
                        "className": "android.widget.Button",
                        "text": "Submit",
                        "bounds": {"x": 100, "y": 200, "width": 200, "height": 80},
                    }
                ],
            }
        ],
    }
    bridge.tap.return_value = True
    bridge.input_text.return_value = True
    bridge.get_screenshot.return_value = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100
    bridge.search_hierarchy.return_value = {
        "results": [{"id": "Button_0", "className": "android.widget.Button"}]
    }
    return bridge


@pytest.fixture
def mock_ios_bridge():
    """Mock IOSDeviceBridge."""
    bridge = MagicMock()
    bridge.udid = "00001234-0001234567890123"
    bridge.serial = "00001234-0001234567890123"
    bridge.get_devices.return_value = [
        {
            "udid": "00001234-0001234567890123",
            "state": "Booted",
            "name": "iPhone 15 Pro",
            "platform": "ios",
        }
    ]
    bridge.get_hierarchy.return_value = {
        "id": "root",
        "className": "UIWindow",
        "bounds": {"x": 0, "y": 0, "width": 393, "height": 852},
        "children": [],
    }
    bridge.tap.return_value = True
    bridge.get_screenshot.return_value = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100
    bridge.search_hierarchy.return_value = {"results": []}
    return bridge


# --- Health Endpoints ---

class TestHealthEndpoints:
    def test_health_returns_ok(self, client):
        """GET /health returns status ok."""
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert "version" in data

    @patch("main._get_android_bridge")
    @patch("main._get_ios_devices")
    def test_ready_with_device_connected(self, mock_ios, mock_android, client, mock_android_bridge):
        """GET /ready returns ready=True when device is connected."""
        mock_android.return_value = mock_android_bridge
        mock_ios.return_value = []
        response = client.get("/ready")
        assert response.status_code == 200
        data = response.json()
        assert data["ready"] is True
        assert data["connected"] is True

    @patch("main._get_android_bridge")
    @patch("main._get_ios_devices")
    def test_ready_no_device(self, mock_ios, mock_android, client):
        """GET /ready returns ready=True when bridge initializes successfully but no devices."""
        mock_b = MagicMock()
        mock_b.get_devices.return_value = []
        mock_android.return_value = mock_b
        mock_ios.return_value = []
        response = client.get("/ready")
        assert response.status_code == 200
        data = response.json()
        # Bridge created and queried successfully → ready=True even with zero devices
        assert data["ready"] is True
        assert data["connected"] is False
        assert data["device_count"] == 0


# --- Device Endpoints ---

class TestDeviceEndpoints:
    @patch("main._get_android_bridge")
    @patch("main._get_ios_devices")
    def test_devices_returns_device_list(self, mock_ios, mock_android, client, mock_android_bridge):
        """GET /devices returns Android + iOS devices."""
        mock_android.return_value = mock_android_bridge
        mock_ios.return_value = []
        response = client.get("/devices")
        assert response.status_code == 200
        data = response.json()
        assert "devices" in data
        assert len(data["devices"]) >= 1

    @patch("main._get_android_bridge")
    @patch("main._get_ios_devices")
    def test_device_status_connected(self, mock_ios, mock_android, client, mock_android_bridge):
        """GET /device/status returns connected=True for active device."""
        mock_android.return_value = mock_android_bridge
        mock_ios.return_value = []
        response = client.get("/device/status")
        assert response.status_code == 200
        data = response.json()
        assert data["connected"] is True
        assert len(data["devices"]) >= 1

    def test_select_device_returns_udid(self, client):
        """POST /device/select returns platform info."""
        response = client.post("/device/select", json={"udid": None})
        assert response.status_code == 200
        data = response.json()
        assert data["platform"] == "android"

    def test_select_device_ios(self, client):
        """POST /device/select detects iOS platform from UDID format."""
        response = client.post(
            "/device/select",
            json={"udid": "00001234-0001234567890123"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["platform"] == "ios"


# --- Hierarchy Endpoints ---

class TestHierarchyEndpoints:
    @patch("main.get_bridge")
    def test_hierarchy_returns_tree(self, mock_get_bridge, client, mock_android_bridge):
        """GET /hierarchy returns parsed UI tree."""
        mock_get_bridge.return_value = mock_android_bridge
        response = client.get("/hierarchy")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == "root"
        assert "children" in data

    @patch("main.get_bridge")
    def test_hierarchy_with_udid(self, mock_get_bridge, client, mock_android_bridge):
        """GET /hierarchy?udid=X passes UDID to bridge."""
        mock_get_bridge.return_value = mock_android_bridge
        response = client.get("/hierarchy?udid=emulator-5554")
        assert response.status_code == 200
        mock_get_bridge.assert_called_once_with("emulator-5554")

    @patch("main.get_bridge")
    def test_hierarchy_bridge_returns_none(self, mock_get_bridge, client):
        """GET /hierarchy returns 404 when bridge is None."""
        mock_get_bridge.return_value = None
        response = client.get("/hierarchy")
        assert response.status_code == 404
        data = response.json()
        assert data["error"] == "DEVICE_NOT_FOUND"

    @patch("main.get_bridge")
    def test_hierarchy_error_from_bridge(self, mock_get_bridge, client):
        """GET /hierarchy returns 404 when bridge reports hierarchy error."""
        bridge = MagicMock()
        bridge.get_hierarchy.return_value = {"error": "No window found"}
        mock_get_bridge.return_value = bridge
        response = client.get("/hierarchy")
        assert response.status_code == 404
        data = response.json()
        assert data["error"] == "HIERARCHY_NOT_FOUND"

    @patch("main._get_first_android_device")
    @patch("main.AndroidDeviceBridge")
    @patch("main._get_android_bridge")
    def test_hierarchy_empty_udid_resolves_to_first_device(self, mock_get_android, mock_android_class, mock_first_device, client):
        """GET /hierarchy?udid= (empty) resolves to first Android device via _get_first_android_device."""
        mock_bridge = MagicMock()
        mock_bridge.get_hierarchy.return_value = {"id": "root", "bounds": {}, "children": []}
        mock_android_class.return_value = mock_bridge
        mock_get_android.return_value = mock_bridge
        mock_first_device.return_value = "emulator-5554"
        response = client.get("/hierarchy?udid=")
        assert response.status_code == 200
        mock_first_device.assert_called_once()


# --- Hierarchy Search ---

class TestHierarchySearch:
    @patch("main.get_bridge")
    def test_search_returns_results(self, mock_get_bridge, client, mock_android_bridge):
        """GET /hierarchy/search returns filtered results."""
        mock_get_bridge.return_value = mock_android_bridge
        response = client.get("/hierarchy/search?query=Button&filter=text")
        assert response.status_code == 200
        data = response.json()
        assert "results" in data

    @patch("main.get_bridge")
    def test_search_query_too_long(self, mock_get_bridge, client):
        """GET /hierarchy/search returns 400 when query exceeds 500 chars."""
        mock_get_bridge.return_value = MagicMock()
        long_query = "x" * 501
        response = client.get(f"/hierarchy/search?query={long_query}&filter=text")
        assert response.status_code == 400
        assert "500 character limit" in response.json()["detail"]

    @patch("main.get_bridge")
    def test_search_xpath(self, mock_get_bridge, client, mock_android_bridge):
        """GET /hierarchy/search?filter=xpath works."""
        mock_get_bridge.return_value = mock_android_bridge
        response = client.get("/hierarchy/search?query=//android.widget.Button&filter=xpath")
        assert response.status_code == 200

    @patch("main.get_bridge")
    def test_search_bridge_returns_error(self, mock_get_bridge, client):
        """GET /hierarchy/search returns 400 on invalid XPath."""
        bridge = MagicMock()
        bridge.search_hierarchy.return_value = {"error": "Invalid XPath expression"}
        mock_get_bridge.return_value = bridge
        response = client.get("/hierarchy/search?query=//*[&invalid]&filter=xpath")
        assert response.status_code == 400


# --- Locator Generator ---

class TestLocatorGenerator:
    @patch("main.get_bridge")
    def test_get_locators_success(self, mock_get_bridge, client, mock_android_bridge):
        """GET /hierarchy/locators returns locators for found node."""
        mock_get_bridge.return_value = mock_android_bridge
        # Configure _find_node_by_id to return a node
        found_node = {
            "id": "Button_0",
            "className": "android.widget.Button",
            "resourceId": "btn_submit",
            "text": "Submit",
            "contentDesc": "",
            "bounds": {"x": 100, "y": 200, "width": 200, "height": 80},
        }
        mock_android_bridge._find_node_by_id.return_value = found_node
        mock_android_bridge.generate_locators.return_value = {
            "nodeId": "Button_0",
            "className": "android.widget.Button",
            "locators": [
                {"strategy": "id", "value": "btn_submit", "expression": 'By.id("btn_submit")', "stability": 5}
            ],
            "best": "id",
        }
        response = client.get("/hierarchy/locators?nodeId=Button_0")
        assert response.status_code == 200
        data = response.json()
        assert "nodeId" in data
        assert data["nodeId"] == "Button_0"
        assert "locators" in data
        assert "best" in data

    @patch("main.get_bridge")
    def test_get_locators_not_found(self, mock_get_bridge, client, mock_android_bridge):
        """GET /hierarchy/locators returns 404 when node not found."""
        mock_get_bridge.return_value = mock_android_bridge
        mock_android_bridge._find_node_by_id.return_value = None
        response = client.get("/hierarchy/locators?nodeId=NonExistent_99")
        assert response.status_code == 404

    @patch("main.get_bridge")
    def test_get_locators_bridge_returns_none(self, mock_get_bridge, client):
        """GET /hierarchy/locators returns 404 when no device."""
        mock_get_bridge.return_value = None
        response = client.get("/hierarchy/locators?nodeId=Button_0")
        assert response.status_code == 404


# --- ADB Command Panel ---

class TestAdbCommand:
    @patch("main.get_bridge")
    def test_post_adb_command_success(self, mock_get_bridge, client, mock_android_bridge):
        """POST /device/adb returns output + exitCode 0 on success."""
        mock_get_bridge.return_value = mock_android_bridge
        mock_android_bridge.execute_adb_command.return_value = {
            "output": "OK",
            "error": None,
            "exitCode": 0,
        }
        response = client.post("/device/adb", json={"command": "input tap 500 800"})
        assert response.status_code == 200
        data = response.json()
        assert data["output"] == "OK"
        assert data["exitCode"] == 0

    @patch("main.get_bridge")
    def test_post_adb_command_failure(self, mock_get_bridge, client, mock_android_bridge):
        """POST /device/adb returns error in response on failure."""
        mock_get_bridge.return_value = mock_android_bridge
        mock_android_bridge.execute_adb_command.return_value = {
            "output": "",
            "error": "error: device not found",
            "exitCode": 1,
        }
        # "foobar" is not in the ADB allowlist — triggers 400 before hitting bridge
        response = client.post("/device/adb", json={"command": "foobar"})
        assert response.status_code == 400

    @patch("main.get_bridge")
    def test_post_adb_command_bridge_returns_none(self, mock_get_bridge, client):
        """POST /device/adb returns 404 when no device."""
        mock_get_bridge.return_value = None
        response = client.post("/device/adb", json={"command": "input tap 100 200"})
        assert response.status_code == 404

    def test_post_adb_command_too_long(self, client):
        """POST /device/adb returns 422 for command exceeding 500 chars."""
        response = client.post("/device/adb", json={"command": "x" * 501})
        assert response.status_code == 400


# --- Tap Endpoint ---

class TestTapEndpoint:
    @patch("main.get_bridge")
    def test_tap_returns_success(self, mock_get_bridge, client, mock_android_bridge):
        """POST /tap returns success when bridge tap succeeds."""
        mock_get_bridge.return_value = mock_android_bridge
        response = client.post("/tap", json={"x": 100, "y": 200})
        assert response.status_code == 200
        assert response.json()["success"] is True
        mock_android_bridge.tap.assert_called_once_with(100, 200)

    @patch("main.get_bridge")
    def test_tap_bridge_returns_none(self, mock_get_bridge, client):
        """POST /tap returns 404 when no device."""
        mock_get_bridge.return_value = None
        response = client.post("/tap", json={"x": 100, "y": 200})
        assert response.status_code == 404

    @patch("main.get_bridge")
    def test_tap_returns_500_on_failure(self, mock_get_bridge, client):
        """POST /tap returns 500 when bridge tap fails."""
        bridge = MagicMock()
        bridge.tap.return_value = False
        mock_get_bridge.return_value = bridge
        response = client.post("/tap", json={"x": 100, "y": 200})
        assert response.status_code == 500

    def test_tap_invalid_coords_negative(self, client):
        """POST /tap returns 422 for negative coordinates."""
        response = client.post("/tap", json={"x": -1, "y": 100})
        assert response.status_code == 400

    def test_tap_invalid_coords_too_large(self, client):
        """POST /tap returns 422 for coordinates > 10000."""
        response = client.post("/tap", json={"x": 100, "y": 10001})
        assert response.status_code == 400


# --- Screenshot Endpoint ---

class TestScreenshotEndpoint:
    @patch("main.get_bridge")
    def test_screenshot_returns_png(self, mock_get_bridge, client, mock_android_bridge):
        """GET /screenshot returns PNG binary stream."""
        mock_get_bridge.return_value = mock_android_bridge
        response = client.get("/screenshot")
        assert response.status_code == 200
        assert response.headers["content-type"] == "image/png"
        assert len(response.content) > 0

    @patch("main.get_bridge")
    def test_screenshot_bridge_returns_none(self, mock_get_bridge, client):
        """GET /screenshot returns 404 when no device."""
        mock_get_bridge.return_value = None
        response = client.get("/screenshot")
        assert response.status_code == 404

    @patch("main.get_bridge")
    def test_screenshot_returns_404_on_empty(self, mock_get_bridge, client):
        """GET /screenshot returns 404 when bridge returns empty."""
        bridge = MagicMock()
        bridge.get_screenshot.return_value = b""
        mock_get_bridge.return_value = bridge
        response = client.get("/screenshot")
        assert response.status_code == 404

    @patch("main._get_first_android_device")
    @patch("main.AndroidDeviceBridge")
    @patch("main._get_android_bridge")
    def test_screenshot_empty_udid_resolves_to_first_device(self, mock_get_android, mock_android_class, mock_first_device, client):
        """GET /screenshot?udid= (empty) resolves to first Android device via _get_first_android_device."""
        mock_bridge = MagicMock()
        mock_bridge.get_screenshot.return_value = b"\x89PNG\r\n\x1a\n" + b"x" * 100
        mock_android_class.return_value = mock_bridge
        mock_get_android.return_value = mock_bridge
        mock_first_device.return_value = "emulator-5554"
        response = client.get("/screenshot?udid=")
        assert response.status_code == 200
        mock_first_device.assert_called_once()


# --- Input Text Endpoint ---

class TestInputTextEndpoint:
    @patch("main.get_bridge")
    def test_input_text_success(self, mock_get_bridge, client, mock_android_bridge):
        """POST /input/text returns success."""
        mock_get_bridge.return_value = mock_android_bridge
        response = client.post("/input/text", json={"text": "hello"})
        assert response.status_code == 200
        assert response.json()["success"] is True
        mock_android_bridge.input_text.assert_called_once_with("hello")

    @patch("main.get_bridge")
    def test_input_text_bridge_returns_none(self, mock_get_bridge, client):
        """POST /input/text returns 404 when no device."""
        mock_get_bridge.return_value = None
        response = client.post("/input/text", json={"text": "hello"})
        assert response.status_code == 404

    def test_input_text_too_long(self, client):
        """POST /input/text returns 422 for text > 1000 chars."""
        response = client.post("/input/text", json={"text": "x" * 1001})
        assert response.status_code == 400


# --- App Error Handler ---

class TestAppErrorHandler:
    @patch("main.get_bridge")
    def test_device_not_found_error(self, mock_get_bridge, client):
        """AppError with DeviceNotFoundError returns 404 with code."""
        mock_get_bridge.side_effect = DeviceNotFoundError("My device is offline")
        response = client.get("/hierarchy")
        assert response.status_code == 404
        data = response.json()
        assert data["error"] == "DEVICE_NOT_FOUND"
        assert data["detail"] == "My device is offline"
        assert "X-Request-ID" in response.headers

    @patch("main.get_bridge")
    def test_hierarchy_not_found_error(self, mock_get_bridge, client):
        """AppError with HierarchyNotFoundError returns 404."""
        bridge = MagicMock()
        bridge.get_hierarchy.return_value = {"error": "No window"}
        mock_get_bridge.return_value = bridge
        response = client.get("/hierarchy")
        assert response.status_code == 404
        assert response.json()["error"] == "HIERARCHY_NOT_FOUND"

    @patch("main.get_bridge")
    def test_command_execution_error(self, mock_get_bridge, client, mock_android_bridge):
        """AppError with CommandExecutionError returns 500."""
        mock_get_bridge.return_value = mock_android_bridge
        mock_android_bridge.tap.side_effect = CommandExecutionError("ADB connection lost")
        response = client.post("/tap", json={"x": 100, "y": 200})
        assert response.status_code == 500
        data = response.json()
        assert data["error"] == "COMMAND_EXECUTION_FAILED"


# --- Test Recorder ---

class TestRecorderEndpoints:
    @patch("main.get_bridge")
    def test_record_step(self, mock_get_bridge, client, mock_android_bridge):
        """POST /recorder/record adds a step and returns step count."""
        mock_get_bridge.return_value = mock_android_bridge
        # get_recorder_session is called on the bridge
        import main
        # Ensure bridge has the method
        mock_android_bridge.get_recorder_session.return_value = MagicMock()
        mock_step = MagicMock()
        mock_android_bridge.get_recorder_session.return_value.add_step = MagicMock()
        response = client.post(
            "/recorder/record",
            json={
                "sessionId": "sess123",
                "action": "click",
                "nodeId": "Button_0",
                "locator": {"strategy": "id", "value": "btn_submit"},
                "value": None,
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert "stepCount" in data

    @patch("main.get_bridge")
    def test_export_recording(self, mock_get_bridge, client, mock_android_bridge):
        """GET /recorder/export returns Python test script."""
        mock_get_bridge.return_value = mock_android_bridge
        mock_session = MagicMock()
        mock_session.steps = []
        mock_session.export.return_value = "# Generated test\nclass TestRecording:\n    pass"
        mock_android_bridge.get_recorder_session.return_value = mock_session
        response = client.get(
            "/recorder/export?sessionId=sess123&lang=python&platform=android"
        )
        assert response.status_code == 200
        data = response.json()
        assert "script" in data
        assert "filename" in data
        assert "stepCount" in data
        assert data["filename"].endswith(".py")

    @patch("main.get_bridge")
    def test_clear_recording(self, mock_get_bridge, client, mock_android_bridge):
        """POST /recorder/clear clears the session steps."""
        mock_get_bridge.return_value = mock_android_bridge
        mock_session = MagicMock()
        mock_android_bridge.get_recorder_session.return_value = mock_session
        response = client.post("/recorder/clear?sessionId=sess123")
        assert response.status_code == 200
        data = response.json()
        assert data["cleared"] is True
        mock_session.clear.assert_called_once()


# --- Command Execution ---

class TestCommandExecution:
    @patch("main.get_bridge")
    def test_execute_install_app_success(self, mock_get_bridge, client, mock_android_bridge):
        """POST /commands/execute install_app returns success."""
        mock_get_bridge.return_value = mock_android_bridge
        with patch("main.AppCommands") as MockAppCommands:
            instance = MagicMock()
            instance.install_app.return_value = (True, "Success")
            MockAppCommands.return_value = instance
            response = client.post(
                "/commands/execute",
                json={"type": "install_app", "params": {"apk_path": "/tmp/app.apk"}},
            )
            assert response.status_code == 200
            data = response.json()
            assert data["success"] is True

    @patch("main.get_bridge")
    def test_execute_unknown_command(self, mock_get_bridge, client, mock_android_bridge):
        """POST /commands/execute with unknown type returns error."""
        mock_get_bridge.return_value = mock_android_bridge
        response = client.post(
            "/commands/execute",
            json={"type": "unknown_command", "params": {}},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is False
        assert "Unknown command type" in data["error"]

    def test_execute_missing_params(self, client):
        """POST /commands/execute without required params returns error."""
        response = client.post(
            "/commands/execute",
            json={"type": "install_app", "params": {}},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is False


# --- CORS Middleware ---

class TestCORS:
    def test_cors_allows_localhost(self, client):
        """CORS headers are set for localhost:5173."""
        response = client.get(
            "/health",
            headers={"Origin": "http://localhost:5173"},
        )
        assert "access-control-allow-origin" in response.headers


# --- Request ID Middleware ---

class TestRequestID:
    def test_request_id_header_present(self, client):
        """Every response includes X-Request-ID header."""
        response = client.get("/health")
        assert "X-Request-ID" in response.headers

    def test_request_id_is_uuid(self, client):
        """X-Request-ID is a valid UUID."""
        import uuid
        response = client.get("/health")
        req_id = response.headers["X-Request-ID"]
        # Should not raise ValueError
        uuid.UUID(req_id)
