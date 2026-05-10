"""
Tests for network/flow_parser.py: parse_flow_file, _flow_to_dict, _parse_binary_flows_basic.
"""

import os
import sys
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.dirname(__file__))

from network.flow_parser import _flow_to_dict, _parse_binary_flows_basic, parse_flow_file


class TestParseFlowFile:
    def test_file_not_found_returns_empty(self, tmp_path):
        result = parse_flow_file(str(tmp_path / "nonexistent.mitm"))
        assert result == []

    def test_mitmproxy_available_parses_flows(self, tmp_path):
        flow_file = tmp_path / "flows.mitm"
        flow_file.write_bytes(b"\x00\x00\x00\x00")

        class MockFlow:
            request = MagicMock(
                timestamp_start=1000.0,
                method="GET",
                url="https://example.com/api",
                pretty_host="example.com",
                path="/api",
                headers={},
            )
            response = MagicMock(
                timestamp_start=1001.0, status_code=200, reason="OK", headers={}, content=b'{"data":"ok"}'
            )
            type = ""

        mock_reader = MagicMock()
        mock_reader.stream.return_value = iter([MockFlow()])

        with patch("mitmproxy.io.FlowReader", return_value=mock_reader):
            result = parse_flow_file(str(flow_file))
            assert len(result) == 1
            assert result[0]["request"]["method"] == "GET"
            assert result[0]["request"]["url"] == "https://example.com/api"

    def test_mitmproxy_import_error_falls_back_to_basic(self, tmp_path):
        flow_file = tmp_path / "flows.mitm"
        flow_file.write_bytes(b"https://example.com/test?foo=bar")

        with patch("mitmproxy.io.FlowReader", side_effect=ImportError("no mitmproxy")):
            result = parse_flow_file(str(flow_file))
            assert len(result) >= 1
            assert result[0]["request"]["url"] == "https://example.com/test?foo=bar"

    def test_mitmproxy_exception_falls_back_to_basic(self, tmp_path):
        flow_file = tmp_path / "flows.mitm"
        flow_file.write_bytes(b"https://fallback.example.com/path")

        with patch("mitmproxy.io.FlowReader", side_effect=RuntimeError("parse error")):
            result = parse_flow_file(str(flow_file))
            assert len(result) >= 1


class TestFlowToDict:
    def test_extracts_request_fields(self):
        flow = MagicMock()
        flow.request.timestamp_start = 1000.0
        flow.request.method = "POST"
        flow.request.url = "https://api.example.com/v1/users"
        flow.request.pretty_host = "api.example.com"
        flow.request.path = "/v1/users"
        flow.request.headers = {"Content-Type": "application/json", "Authorization": "Bearer token"}
        flow.response = None
        flow.type = ""
        flow.id = 12345

        result = _flow_to_dict(flow)
        assert result["timestamp"] == 1000.0
        assert result["request"]["method"] == "POST"
        assert result["request"]["url"] == "https://api.example.com/v1/users"
        assert result["request"]["host"] == "api.example.com"
        assert result["request"]["path"] == "/v1/users"
        assert result["request"]["headers"]["Content-Type"] == "application/json"
        assert result["response"] is None
        assert result["duration_ms"] == 0
        assert result["websocket"] is False

    def test_response_with_utf8_content(self):
        flow = MagicMock()
        flow.request.timestamp_start = 1000.0
        flow.request.method = "GET"
        flow.request.url = "https://example.com"
        flow.request.pretty_host = "example.com"
        flow.request.path = "/"
        flow.request.headers = {}
        flow.response.timestamp_start = 1000.2
        flow.response.status_code = 200
        flow.response.reason = "OK"
        flow.response.headers = {"Content-Type": "application/json"}
        flow.response.content = b'{"message":"hello"}'
        flow.type = ""

        result = _flow_to_dict(flow)
        assert result["response"]["status_code"] == 200
        assert result["response"]["body"] == '{"message":"hello"}'
        assert result["duration_ms"] == 200

    def test_response_with_binary_content_uses_replacement_chars(self):
        """Invalid UTF-8 bytes are replaced with Unicode replacement char, not '<binary data>'."""
        flow = MagicMock()
        flow.request.timestamp_start = 1000.0
        flow.request.method = "GET"
        flow.request.url = "https://example.com"
        flow.request.pretty_host = "example.com"
        flow.request.path = "/"
        flow.request.headers = {}
        flow.response.timestamp_start = 1001.0
        flow.response.status_code = 200
        flow.response.reason = "OK"
        flow.response.headers = {}
        flow.response.content = b"\x80\x81\x82 binary"
        flow.type = ""

        result = _flow_to_dict(flow)
        # errors="replace" replaces invalid bytes with U+FFFD, not '<binary data>'
        assert "�" in result["response"]["body"]

    def test_websocket_flag(self):
        flow = MagicMock()
        flow.request.timestamp_start = 1000.0
        flow.request.method = "GET"
        flow.request.url = "https://example.com"
        flow.request.pretty_host = "example.com"
        flow.request.path = "/"
        flow.request.headers = {}
        flow.response = None
        flow.type = "websocket"

        result = _flow_to_dict(flow)
        assert result["websocket"] is True


class TestParseBinaryFlowsBasic:
    def test_extracts_urls_from_binary_data(self, tmp_path):
        flow_file = tmp_path / "binary.mitm"
        flow_file.write_bytes(b"https://api.example.com/endpoint?a=1&b=2 http://http.example.com/path")

        result = _parse_binary_flows_basic(str(flow_file))

        assert len(result) == 2
        assert result[0]["request"]["url"] == "https://api.example.com/endpoint?a=1&b=2"
        assert result[0]["request"]["method"] == "UNKNOWN"
        assert result[1]["request"]["url"] == "http://http.example.com/path"

    def test_returns_empty_on_read_error(self):
        result = _parse_binary_flows_basic("/nonexistent/path/to/file.mitm")
        assert result == []


class TestIntegration:
    def test_parse_flow_file_with_real_binary_content(self, tmp_path):
        """Verify basic parse works with HTTP URLs in binary form."""
        flow_file = tmp_path / "test.mitm"
        flow_file.write_bytes(b"GET https://example.com/api HTTP/1.1\r\nHost: example.com\r\n\r\n")

        result = parse_flow_file(str(flow_file))
        assert len(result) >= 1
        # Basic parser extracts URLs
        urls = [f["request"]["url"] for f in result]
        assert any("example.com" in u for u in urls)
