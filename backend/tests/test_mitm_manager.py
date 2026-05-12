"""
Tests for network/mitm_manager.py: MitmproxyManager singleton.
"""

import os
import sys
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, os.path.dirname(__file__))

from network.mitm_manager import MitmproxyManager


@pytest.fixture(autouse=True)
def reset_singleton():
    """Reset MitmproxyManager singleton before and after each test."""
    MitmproxyManager.reset_instance()
    yield
    MitmproxyManager.reset_instance()


class TestGetInstance:
    def test_returns_same_instance(self):
        mgr1 = MitmproxyManager.get_instance()
        mgr2 = MitmproxyManager.get_instance()
        assert mgr1 is mgr2


class TestStart:
    def test_mitmdump_not_found_returns_error(self):
        with patch("shutil.which", return_value=None):
            with patch("subprocess.run", side_effect=FileNotFoundError):
                MitmproxyManager.reset_instance()
                mgr = MitmproxyManager.get_instance()
                result = mgr.start(8080)
                assert result["success"] is False
                assert "mitmdump not found" in result["error"]

    def test_starts_successfully_and_returns_port_and_pid(self):
        mock_process = MagicMock()
        mock_process.poll.return_value = None
        mock_process.pid = 12345

        with patch("shutil.which", return_value="/usr/local/bin/mitmdump"):
            with patch("subprocess.Popen", return_value=mock_process):
                with patch("network.mitm_manager.socket.create_connection"):
                    MitmproxyManager.reset_instance()
                    mgr = MitmproxyManager.get_instance()
                    result = mgr.start(8080)

                    assert result["success"] is True
                    assert result["running"] is True
                    assert result["port"] == 8080
                    assert result["pid"] == 12345

    def test_already_running_returns_running_true(self):
        mock_process = MagicMock()
        mock_process.poll.return_value = None
        mock_process.pid = 99999

        with patch("shutil.which", return_value="/usr/bin/mitmdump"):
            with patch("subprocess.Popen", return_value=mock_process):
                with patch("network.mitm_manager.socket.create_connection"):
                    MitmproxyManager.reset_instance()
                    mgr = MitmproxyManager.get_instance()
                    mgr.start(8080)
                    # Start again
                    result = mgr.start(8080)

                    assert result["success"] is True
                    assert result["running"] is True
                    assert result["port"] == 8080

    def test_port_auto_fallback_on_port_in_use(self):
        """First port attempt fails (poll returns exit code), second succeeds."""
        mock_process = MagicMock()
        mock_process.poll.return_value = None  # Second attempt succeeds
        mock_process.pid = 54321

        with patch("shutil.which", return_value="/usr/bin/mitmdump"):
            # First Popen call: process dies immediately (port in use)
            # Second Popen call: process stays alive
            mock_popen = MagicMock(
                side_effect=[
                    MagicMock(pid=None, poll=lambda: 1),  # died
                    mock_process,
                ]
            )
            with patch("subprocess.Popen", mock_popen):
                with patch("network.mitm_manager.socket.create_connection"):
                    MitmproxyManager.reset_instance()
                    mgr = MitmproxyManager.get_instance()
                    result = mgr.start(8080)

                    assert result["success"] is True
                    assert result["port"] == 8081  # Second port tried


class TestStop:
    def test_stop_kills_process_and_returns_success(self):
        mock_process = MagicMock()
        mock_process.poll.return_value = None

        with patch("shutil.which", return_value="/usr/bin/mitmdump"):
            with patch("subprocess.Popen", return_value=mock_process):
                with patch("network.mitm_manager.socket.create_connection"):
                    MitmproxyManager.reset_instance()
                    mgr = MitmproxyManager.get_instance()
                    mgr.start(8080)

                    with patch("subprocess.run"):
                        result = mgr.stop()

                    assert result["success"] is True
                    assert result["running"] is False

    def test_stop_cleans_up_pid_file(self, tmp_path):
        pid_dir = tmp_path / "mitm"
        pid_dir.mkdir()
        pid_file = pid_dir / "mitmdump.pid"
        pid_file.write_text("99999")

        mock_process = MagicMock()
        mock_process.poll.return_value = None

        with patch.dict("os.environ", {"TMP_BASE_DIR": str(tmp_path)}):
            with patch("network.mitm_manager._CAPTURE_DIR", str(pid_dir)):
                with patch("shutil.which", return_value="/usr/bin/mitmdump"):
                    with patch("subprocess.Popen", return_value=mock_process):
                        with patch("network.mitm_manager.socket") as mock_socket:
                            mock_socket.create_connection.return_value.__enter__ = MagicMock()
                            mock_socket.create_connection.return_value.__exit__ = MagicMock()
                            MitmproxyManager.reset_instance()
                            mgr = MitmproxyManager.get_instance()
                            mgr.start(8080)
                            mgr.stop()

                            assert not pid_file.exists()


class TestIsRunning:
    def test_true_when_process_alive(self):
        mock_process = MagicMock()
        mock_process.poll.return_value = None  # Still running

        with patch("shutil.which", return_value="/usr/bin/mitmdump"):
            with patch("subprocess.Popen", return_value=mock_process):
                with patch("network.mitm_manager.socket.create_connection"):
                    MitmproxyManager.reset_instance()
                    mgr = MitmproxyManager.get_instance()
                    mgr.start(8080)

                    assert mgr.is_running() is True

    def test_false_when_process_dead(self):
        mock_process = MagicMock()
        mock_process.poll.return_value = 1  # Exited

        with patch("shutil.which", return_value="/usr/bin/mitmdump"):
            with patch("subprocess.Popen", return_value=mock_process):
                with patch("network.mitm_manager.socket.create_connection"):
                    MitmproxyManager.reset_instance()
                    mgr = MitmproxyManager.get_instance()
                    mgr.start(8080)

                    assert mgr.is_running() is False


class TestGetStatus:
    def test_returns_not_running_status(self):
        MitmproxyManager.reset_instance()
        mgr = MitmproxyManager.get_instance()
        status = mgr.get_status()

        assert status["running"] is False
        assert status["port"] == 8080
        assert status["flow_file"] is None
        assert status["flows_count"] == 0

    def test_returns_running_status(self):
        mock_process = MagicMock()
        mock_process.poll.return_value = None
        mock_process.pid = 12345

        with patch("shutil.which", return_value="/usr/bin/mitmdump"):
            with patch("subprocess.Popen", return_value=mock_process):
                with patch("network.mitm_manager.socket.create_connection"):
                    MitmproxyManager.reset_instance()
                    mgr = MitmproxyManager.get_instance()
                    mgr.start(9090)
                    status = mgr.get_status()

                    assert status["running"] is True
                    assert status["port"] == 9090
                    assert status["flow_file"] is not None


class TestGetFlows:
    def test_no_flow_file_returns_empty_list(self):
        MitmproxyManager.reset_instance()
        mgr = MitmproxyManager.get_instance()
        mgr._flow_file = "/nonexistent/file.mitm"
        mgr._running = True

        flows = mgr.get_flows()
        assert flows == []

    def test_delegates_to_parse_flow_file(self, tmp_path):
        flow_file = tmp_path / "test.mitm"
        flow_file.write_bytes(b"https://example.com")

        with patch("network.flow_parser.parse_flow_file", return_value=[{"id": "f1", "timestamp": 1}]):
            MitmproxyManager.reset_instance()
            mgr = MitmproxyManager.get_instance()
            mgr._flow_file = str(flow_file)
            mgr._running = True

            flows = mgr.get_flows(since=0)
            assert len(flows) == 1


class TestGetLatestFlowFile:
    def test_returns_empty_string_when_not_running(self):
        MitmproxyManager.reset_instance()
        mgr = MitmproxyManager.get_instance()
        assert mgr.get_latest_flow_file() == ""

    def test_returns_flow_file_path(self):
        mock_process = MagicMock()
        mock_process.poll.return_value = None
        mock_process.pid = 12345

        with patch("shutil.which", return_value="/usr/bin/mitmdump"):
            with patch("subprocess.Popen", return_value=mock_process):
                MitmproxyManager.reset_instance()
                mgr = MitmproxyManager.get_instance()
                mgr.start(8080)

                path = mgr.get_latest_flow_file()
                assert "flows_" in path
                assert path.endswith(".mitm")


class TestFindMitmdump:
    def test_finds_in_path(self):
        with patch("shutil.which", return_value="/usr/bin/mitmdump"):
            MitmproxyManager.reset_instance()
            mgr = MitmproxyManager.get_instance()
            result = mgr._find_mitmdump()
            assert result == "/usr/bin/mitmdump"

    def test_falls_back_to_which(self):
        with patch("shutil.which", return_value=None):
            with patch("subprocess.run"):
                MitmproxyManager.reset_instance()
                mgr = MitmproxyManager.get_instance()
                result = mgr._find_mitmdump()
                assert result == "mitmdump"

    def test_returns_none_when_not_available(self):
        with patch("shutil.which", return_value=None):
            with patch("subprocess.run", side_effect=FileNotFoundError):
                MitmproxyManager.reset_instance()
                mgr = MitmproxyManager.get_instance()
                result = mgr._find_mitmdump()
                assert result is None
