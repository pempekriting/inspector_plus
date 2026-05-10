import pytest
from fastapi.testclient import TestClient

from test_ws_server import test_app

client = TestClient(test_app)


def test_ws_connect():
    with client.websocket_connect("/ws/test") as ws:
        data = ws.receive_text()
        assert data == "Hello from backend"
        binary = ws.receive_bytes()
        assert binary == bytes([0x00, 0x40, 0x00, 0x00, 0x08, 0xB1, 0xED, 0x02])
