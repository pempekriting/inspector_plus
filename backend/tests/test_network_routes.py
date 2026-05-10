"""
Tests for network/routes.py API endpoints.
"""

import os
import sys
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(__file__))

from main import app


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture(autouse=True)
def reset_bridges():
    """Reset bridge singletons between tests to avoid state leakage."""
    import main

    main._android_bridge = None
    main._android_bridges = {}
    main._ios_bridges = {}
    yield
    main._android_bridge = None
    main._android_bridges = {}
    main._ios_bridges = {}


class TestProxyEndpoints:
    def test_start_proxy_success(self, client):
        mock_manager = MagicMock()
        mock_manager.start.return_value = {"success": True, "running": True, "port": 8080, "pid": 12345}
        with patch("network.mitm_manager.MitmproxyManager.get_instance", return_value=mock_manager):
            response = client.post("/network/proxy/start", json={"port": 8080})
            assert response.status_code == 200
            data = response.json()
            assert data["success"] is True
            assert data["port"] == 8080

    def test_start_proxy_mitmdump_not_found(self, client):
        mock_manager = MagicMock()
        mock_manager.start.return_value = {"success": False, "error": "mitmdump not found"}
        with patch("network.mitm_manager.MitmproxyManager.get_instance", return_value=mock_manager):
            response = client.post("/network/proxy/start", json={"port": 8080})
            assert response.status_code == 200
            assert response.json()["success"] is False

    def test_stop_proxy(self, client):
        mock_manager = MagicMock()
        mock_manager.stop.return_value = {"success": True, "running": False}
        with patch("network.mitm_manager.MitmproxyManager.get_instance", return_value=mock_manager):
            response = client.post("/network/proxy/stop")
            assert response.status_code == 200
            assert response.json()["success"] is True

    def test_proxy_status_running(self, client):
        mock_manager = MagicMock()
        mock_manager.get_status.return_value = {
            "running": True,
            "port": 8080,
            "flow_file": "/tmp/flows.mitm",
            "flows_count": 0,
        }
        with patch("network.mitm_manager.MitmproxyManager.get_instance", return_value=mock_manager):
            response = client.get("/network/proxy/status")
            assert response.status_code == 200
            assert response.json()["running"] is True

    def test_proxy_status_not_running(self, client):
        mock_manager = MagicMock()
        mock_manager.get_status.return_value = {"running": False, "port": 8080, "flow_file": None, "flows_count": 0}
        with patch("network.mitm_manager.MitmproxyManager.get_instance", return_value=mock_manager):
            response = client.get("/network/proxy/status")
            assert response.status_code == 200
            assert response.json()["running"] is False


class TestTrafficEndpoints:
    def test_get_traffic(self, client):
        mock_manager = MagicMock()
        mock_manager.get_flows.return_value = [
            {
                "id": "flow_1",
                "timestamp": 1000,
                "request": {"method": "GET", "url": "https://example.com", "host": "example.com", "path": "/"},
                "response": None,
                "duration_ms": 0,
                "websocket": False,
            }
        ]
        mock_manager.get_latest_flow_file.return_value = "/tmp/flows.mitm"
        with patch("network.mitm_manager.MitmproxyManager.get_instance", return_value=mock_manager):
            response = client.get("/network/traffic")
            assert response.status_code == 200
            data = response.json()
            assert data["count"] == 1
            assert len(data["flows"]) == 1

    def test_get_traffic_with_since_filter(self, client):
        mock_manager = MagicMock()
        mock_manager.get_flows.return_value = []
        mock_manager.get_latest_flow_file.return_value = "/tmp/flows.mitm"
        with patch("network.mitm_manager.MitmproxyManager.get_instance", return_value=mock_manager):
            response = client.get("/network/traffic?since=500")
            assert response.status_code == 200
            mock_manager.get_flows.assert_called_once_with(500.0)


class TestVpnProxyEndpoints:
    def test_start_vpn_proxy(self, client):
        mock_bridge = MagicMock()
        mock_bridge.setup_vpn_proxy.return_value = {"success": True}
        with patch("device.create_bridge_for_device", return_value=mock_bridge):
            response = client.post("/network/proxy/vpn/start", json={"port": 8080, "udid": "device123"})
            assert response.status_code == 200
            assert response.json()["success"] is True

    def test_start_vpn_proxy_no_device(self, client):
        response = client.post("/network/proxy/vpn/start", json={"port": 8080})
        assert response.status_code == 200
        assert response.json()["success"] is False

    def test_stop_vpn_proxy(self, client):
        mock_bridge = MagicMock()
        mock_bridge.stop_vpn_proxy.return_value = {"success": True}
        with patch("device.create_bridge_for_device", return_value=mock_bridge):
            response = client.post("/network/proxy/vpn/stop?udid=device123")
            assert response.status_code == 200
            assert response.json()["success"] is True

    def test_stop_vpn_proxy_no_device(self, client):
        response = client.post("/network/proxy/vpn/stop")
        assert response.status_code == 200
        assert response.json()["success"] is False

    def test_vpn_status_running(self, client):
        mock_bridge = MagicMock()
        mock_bridge.is_vpn_running.return_value = True
        with patch("device.create_bridge_for_device", return_value=mock_bridge):
            response = client.get("/network/proxy/vpn/status?udid=device123")
            assert response.status_code == 200
            assert response.json()["running"] is True

    def test_vpn_status_no_device(self, client):
        response = client.get("/network/proxy/vpn/status")
        assert response.status_code == 200
        assert response.json()["running"] is False


class TestCertEndpoints:
    def test_install_cert(self, client):
        mock_bridge = MagicMock()
        mock_bridge.install_certificate.return_value = {"success": True}
        with patch("device.create_bridge_for_device", return_value=mock_bridge):
            response = client.post("/network/cert/install", json={"udid": "device123"})
            assert response.status_code == 200
            assert response.json()["success"] is True

    def test_install_cert_no_device(self, client):
        response = client.post("/network/cert/install", json={})
        assert response.status_code == 200
        assert response.json()["success"] is False


class TestNetworkInfoEndpoint:
    def test_network_info(self, client):
        mock_bridge = MagicMock()
        mock_bridge.get_network_info.return_value = {"ip": "192.168.1.1", "type": "wifi"}
        with patch("device.create_bridge_for_device", return_value=mock_bridge):
            response = client.get("/network/info?udid=device123")
            assert response.status_code == 200
            assert "ip" in response.json()

    def test_network_info_no_device(self, client):
        response = client.get("/network/info")
        assert response.status_code == 200
        assert "error" in response.json()
