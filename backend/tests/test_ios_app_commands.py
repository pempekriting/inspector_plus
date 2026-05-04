"""
Tests for iOS app commands — IOSAppCommands class.
Mocks subprocess to test IPA install/uninstall/launch/list in isolation.
"""

import pytest
from unittest.mock import patch, MagicMock
import subprocess

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from commands.ios_app_commands import IOSAppCommands, _safe_bundle_id, _BUNDLE_ID_RE


def mock_proc(stdout="", stderr="", returncode=0):
    m = MagicMock()
    m.stdout = stdout
    m.stderr = stderr
    m.returncode = returncode
    return m


class TestSafeBundleId:
    def test_valid_bundle_ids(self):
        assert _safe_bundle_id("com.apple.mobilesafari") is True
        assert _safe_bundle_id("com.example.app") is True
        assert _safe_bundle_id("io.test.app.name") is True
        assert _safe_bundle_id("a.b") is True

    def test_invalid_starts_with_number(self):
        assert _safe_bundle_id("1com.example.app") is False

    def test_invalid_no_dots(self):
        assert _safe_bundle_id("exampleapp") is False

    def test_invalid_single_letter_no_dot(self):
        assert _safe_bundle_id("a") is False

    def test_empty_string(self):
        assert _safe_bundle_id("") is False

    def test_none(self):
        assert _safe_bundle_id(None) is False

    def test_too_long(self):
        assert _safe_bundle_id("a." + "b" * 300) is False


class TestIOSAppCommands:
    @patch("commands.ios_app_commands._idb_cmd")
    def test_install_app_success(self, mock_cmd):
        mock_cmd.return_value = mock_proc(stdout="Installing... Done", returncode=0)
        cmd = IOSAppCommands("00001234-0001234567890123")
        success, output = cmd.install_app("/tmp/app.ipa")
        assert success is True
        mock_cmd.assert_called_once()

    @patch("commands.ios_app_commands._idb_cmd")
    def test_install_app_rejects_non_ipa(self, mock_cmd):
        cmd = IOSAppCommands()
        success, output = cmd.install_app("/tmp/app.apk")
        assert success is False
        assert "must end with .ipa" in output
        mock_cmd.assert_not_called()

    @patch("commands.ios_app_commands._idb_cmd")
    def test_install_app_failure(self, mock_cmd):
        mock_cmd.return_value = mock_proc(stderr="Install failed", returncode=1)
        cmd = IOSAppCommands()
        success, output = cmd.install_app("/tmp/app.ipa")
        assert success is False
        assert "Install failed" in output

    @patch("commands.ios_app_commands._idb_cmd")
    def test_install_app_timeout(self, mock_cmd):
        mock_cmd.side_effect = subprocess.TimeoutExpired("cmd", 120)
        cmd = IOSAppCommands()
        success, output = cmd.install_app("/tmp/app.ipa")
        assert success is False
        assert "timed out" in output

    @patch("commands.ios_app_commands._idb_cmd")
    def test_is_app_installed_true(self, mock_cmd):
        mock_cmd.return_value = mock_proc(stdout="com.apple.mobilesafari\ncom.example.app\n", returncode=0)
        cmd = IOSAppCommands()
        success, output = cmd.is_app_installed("com.apple.mobilesafari")
        assert success is True
        assert "installed" in output

    @patch("commands.ios_app_commands._idb_cmd")
    def test_is_app_installed_false(self, mock_cmd):
        mock_cmd.return_value = mock_proc(stdout="com.apple.mobilesafari\n", returncode=0)
        cmd = IOSAppCommands()
        success, output = cmd.is_app_installed("com.notinstalled")
        assert success is False
        assert "NOT installed" in output

    @patch("commands.ios_app_commands._idb_cmd")
    def test_is_app_installed_invalid_bundle_id(self, mock_cmd):
        cmd = IOSAppCommands()
        success, output = cmd.is_app_installed("not-valid")
        assert success is False
        assert "Invalid bundle ID" in output
        mock_cmd.assert_not_called()

    @patch("commands.ios_app_commands._idb_cmd")
    def test_uninstall_app_success(self, mock_cmd):
        mock_cmd.return_value = mock_proc(stdout="Uninstalling... Done", returncode=0)
        cmd = IOSAppCommands()
        success, output = cmd.uninstall_app("com.example.app")
        assert success is True

    @patch("commands.ios_app_commands._idb_cmd")
    def test_uninstall_app_failure(self, mock_cmd):
        mock_cmd.return_value = mock_proc(stderr="Uninstall failed", returncode=1)
        cmd = IOSAppCommands()
        success, output = cmd.uninstall_app("com.example.app")
        assert success is False
        assert "Uninstall failed" in output

    @patch("commands.ios_app_commands._idb_cmd")
    def test_uninstall_app_timeout(self, mock_cmd):
        mock_cmd.side_effect = subprocess.TimeoutExpired("cmd", 30)
        cmd = IOSAppCommands()
        success, output = cmd.uninstall_app("com.example.app")
        assert success is False
        assert "timed out" in output

    @patch("commands.ios_app_commands._idb_cmd")
    def test_uninstall_app_invalid_bundle_id(self, mock_cmd):
        cmd = IOSAppCommands()
        success, output = cmd.uninstall_app("invalid")
        assert success is False
        assert "Invalid bundle ID" in output
        mock_cmd.assert_not_called()

    @patch("commands.ios_app_commands._idb_cmd")
    def test_launch_app_success(self, mock_cmd):
        mock_cmd.return_value = mock_proc(stdout="Launched", returncode=0)
        cmd = IOSAppCommands()
        success, output = cmd.launch_app("com.apple.mobilesafari")
        assert success is True
        assert "Launched app" in output

    @patch("commands.ios_app_commands._idb_cmd")
    def test_launch_app_failure(self, mock_cmd):
        mock_cmd.return_value = mock_proc(stderr="Launch failed", returncode=1)
        cmd = IOSAppCommands()
        success, output = cmd.launch_app("com.apple.mobilesafari")
        assert success is False
        assert "Launch failed" in output

    @patch("commands.ios_app_commands._idb_cmd")
    def test_launch_app_timeout(self, mock_cmd):
        mock_cmd.side_effect = subprocess.TimeoutExpired("cmd", 10)
        cmd = IOSAppCommands()
        success, output = cmd.launch_app("com.apple.mobilesafari")
        assert success is False
        assert "timed out" in output

    @patch("commands.ios_app_commands._idb_cmd")
    def test_list_installed_apps_returns_bundle_ids(self, mock_cmd):
        mock_cmd.return_value = mock_proc(stdout="com.apple.mobilesafari\ncom.example.app\n", returncode=0)
        cmd = IOSAppCommands()
        success, output = cmd.list_installed_apps()
        assert success is True
        assert "com.apple.mobilesafari" in output
        assert "com.example.app" in output

    @patch("commands.ios_app_commands._idb_cmd")
    def test_list_installed_apps_filters_non_bundle_lines(self, mock_cmd):
        mock_cmd.return_value = mock_proc(stdout="Header\ncom.example.app\n\n", returncode=0)
        cmd = IOSAppCommands()
        success, output = cmd.list_installed_apps()
        lines = output.strip().split("\n")
        assert all("." in line for line in lines)

    @patch("commands.ios_app_commands._idb_cmd")
    def test_list_installed_apps_failure(self, mock_cmd):
        mock_cmd.return_value = mock_proc(stderr="error", returncode=1)
        cmd = IOSAppCommands()
        success, output = cmd.list_installed_apps()
        assert success is False

    @patch("commands.ios_app_commands._idb_cmd")
    def test_list_installed_apps_timeout(self, mock_cmd):
        mock_cmd.side_effect = subprocess.TimeoutExpired("cmd", 30)
        cmd = IOSAppCommands()
        success, output = cmd.list_installed_apps()
        assert success is False
        assert "timed out" in output

    @patch("commands.ios_app_commands._idb_cmd")
    def test_get_app_info_success(self, mock_cmd):
        mock_cmd.return_value = mock_proc(
            stdout="name: TestApp\nbundle_id: com.example.app\nversion: 1.0.0",
            returncode=0,
        )
        cmd = IOSAppCommands()
        success, info = cmd.get_app_info("com.example.app")
        assert success is True
        assert info["packageName"] == "com.example.app"

    @patch("commands.ios_app_commands._idb_cmd")
    def test_get_app_info_not_found(self, mock_cmd):
        mock_cmd.return_value = mock_proc(stderr="App not found", returncode=1)
        cmd = IOSAppCommands()
        success, info = cmd.get_app_info("com.notfound")
        assert success is False
        assert "error" in info

    @patch("commands.ios_app_commands._idb_cmd")
    def test_get_app_info_invalid_bundle_id(self, mock_cmd):
        cmd = IOSAppCommands()
        success, info = cmd.get_app_info("invalid")
        assert success is False
        assert "Invalid bundle ID" in info["error"]
        mock_cmd.assert_not_called()

    def test_parse_describe_output_parses_name(self):
        cmd = IOSAppCommands()
        raw = "name: MyApp\nbundle_id: com.example\nversion: 42"
        info = cmd._parse_describe_output(raw)
        assert info["versionName"] == "MyApp"
        assert info["versionCode"] == 42

    def test_parse_describe_output_handles_invalid_version(self):
        cmd = IOSAppCommands()
        raw = "name: MyApp\nversion: not_a_number"
        info = cmd._parse_describe_output(raw)
        assert info["versionCode"] == 0
