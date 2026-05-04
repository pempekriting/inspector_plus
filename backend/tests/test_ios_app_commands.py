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

from commands.ios_app_commands import (
    IOSAppCommands, _safe_bundle_id, _BUNDLE_ID_RE,
    _read_info_plist, _get_simctl_app_info, _extract_permissions_from_plist,
)


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


class TestReadInfoPlist:
    @patch("commands.ios_app_commands.subprocess.run")
    def test_reads_plist_successfully(self, mock_run):
        import plistlib
        plist_data = {
            "CFBundleShortVersionString": "1.2.3",
            "CFBundleVersion": "456",
            "MinimumOSVersion": "15.0",
            "NSCameraUsageDescription": "This app uses camera to scan QR codes",
            "NSPhotoLibraryUsageDescription": "Access photos for avatar upload",
        }
        plist_bytes = plistlib.dumps(plist_data)

        # Mock: first call is idb file pull (success), second is open/read
        mock_run.return_value = mock_proc(returncode=0)

        with patch("builtins.open", create=True) as mock_open:
            mock_open.return_value.__enter__ = lambda s: MagicMock(read=MagicMock(return_value=plist_bytes))
            mock_open.return_value.__exit__ = MagicMock(return_value=False)
            with patch("commands.ios_app_commands.plistlib.load", return_value=plist_data):
                result = _read_info_plist("00001234", "com.example.app")
                assert result is not None
                assert result["CFBundleShortVersionString"] == "1.2.3"

    @patch("commands.ios_app_commands.subprocess.run")
    def test_returns_none_on_failure(self, mock_run):
        mock_run.return_value = mock_proc(returncode=1, stderr="file not found")
        result = _read_info_plist("00001234", "com.example.app")
        assert result is None

    @patch("commands.ios_app_commands.subprocess.run")
    def test_returns_none_on_exception(self, mock_run):
        mock_run.side_effect = Exception("idb not found")
        result = _read_info_plist("00001234", "com.example.app")
        assert result is None


class TestGetSimctlAppInfo:
    @patch("commands.ios_app_commands.subprocess.run")
    def test_parses_xml_plist_output(self, mock_run):
        import plistlib
        plist_data = {"CFBundleVersion": "789", "CFBundleDisplayName": "TestApp"}
        xml_bytes = plistlib.dumps(plist_data)
        mock_run.return_value = mock_proc(stdout=xml_bytes.decode("utf-8"), returncode=0)
        result = _get_simctl_app_info("00001234", "com.example.app")
        assert result is not None
        assert result["CFBundleVersion"] == "789"

    @patch("commands.ios_app_commands.subprocess.run")
    def test_returns_none_without_udid(self, mock_run):
        result = _get_simctl_app_info(None, "com.example.app")
        assert result is None
        mock_run.assert_not_called()

    @patch("commands.ios_app_commands.subprocess.run")
    def test_returns_none_on_failure(self, mock_run):
        mock_run.return_value = mock_proc(returncode=1, stderr="not a simulator")
        result = _get_simctl_app_info("00001234", "com.example.app")
        assert result is None


class TestExtractPermissionsFromPlist:
    def test_extracts_usage_description_keys(self):
        plist = {
            "CFBundleName": "TestApp",
            "NSCameraUsageDescription": "Camera access for scanning",
            "NSPhotoLibraryUsageDescription": "Photo access for upload",
            "NSLocationWhenInUseUsageDescription": "Location for nearby stores",
        }
        perms = _extract_permissions_from_plist(plist)
        assert len(perms) == 3
        labels = {p["label"] for p in perms}
        assert "Camera" in labels
        assert "Photo Library" in labels
        assert "Location When In Use" in labels

    def test_ignores_non_usage_description_keys(self):
        plist = {"CFBundleName": "TestApp", "CFBundleVersion": "1"}
        perms = _extract_permissions_from_plist(plist)
        assert len(perms) == 0

    def test_ignores_empty_description_values(self):
        plist = {"NSCameraUsageDescription": "", "NSPhotoLibraryUsageDescription": "  "}
        perms = _extract_permissions_from_plist(plist)
        assert len(perms) == 0

    def test_returns_empty_for_empty_plist(self):
        assert _extract_permissions_from_plist({}) == []


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

    @patch("commands.ios_app_commands._read_info_plist")
    @patch("commands.ios_app_commands._idb_cmd")
    def test_get_app_info_success(self, mock_cmd, mock_plist):
        import json
        mock_cmd.return_value = mock_proc(
            stdout=json.dumps([
                {"bundle_id": "com.example.app", "name": "TestApp", "install_type": "user", "architectures": ["arm64"]},
                {"bundle_id": "com.other.app", "name": "Other", "install_type": "system", "architectures": ["arm64"]},
            ]),
            returncode=0,
        )
        mock_plist.return_value = None  # No plist available
        cmd = IOSAppCommands()
        success, info = cmd.get_app_info("com.example.app")
        assert success is True
        assert info["packageName"] == "com.example.app"
        assert info["displayName"] == "TestApp"
        assert info["installType"] == "user"
        assert info["minimumOSVersion"] == ""

    @patch("commands.ios_app_commands._read_info_plist")
    @patch("commands.ios_app_commands._idb_cmd")
    def test_get_app_info_enriched_from_plist(self, mock_cmd, mock_plist):
        import json
        mock_cmd.return_value = mock_proc(
            stdout=json.dumps([
                {"bundle_id": "com.example.app", "name": "TestApp", "install_type": "user", "architectures": ["arm64"]},
            ]),
            returncode=0,
        )
        mock_plist.return_value = {
            "CFBundleShortVersionString": "2.1.0",
            "CFBundleVersion": "123",
            "MinimumOSVersion": "16.0",
            "NSCameraUsageDescription": "Camera for scanning",
        }
        cmd = IOSAppCommands()
        success, info = cmd.get_app_info("com.example.app")
        assert success is True
        assert info["versionName"] == "2.1.0"
        assert info["versionCode"] == 123
        assert info["minimumOSVersion"] == "16.0"
        assert len(info["permissions"]) == 1
        assert info["permissions"][0]["label"] == "Camera"

    @patch("commands.ios_app_commands._read_info_plist")
    @patch("commands.ios_app_commands._idb_cmd")
    def test_get_app_info_not_found(self, mock_cmd, mock_plist):
        mock_cmd.return_value = mock_proc(stderr="App not found", returncode=1)
        mock_plist.return_value = None
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

    def test_build_app_info_from_list_apps_entry(self):
        cmd = IOSAppCommands()
        app = {
            "bundle_id": "com.example.app",
            "name": "MyApp",
            "install_type": "user",
            "architectures": ["arm64"],
            "running": False,
            "debuggable": True,
        }
        info = cmd._build_app_info(app)
        assert info["packageName"] == "com.example.app"
        assert info["bundleIdentifier"] == "com.example.app"
        assert info["displayName"] == "MyApp"
        assert info["installType"] == "user"
        assert info["architectures"] == "arm64"
        assert info["running"] is False
        assert info["debuggable"] is True
        assert info["versionName"] == ""  # idb doesn't expose version

    def test_build_app_info_string_architectures(self):
        cmd = IOSAppCommands()
        app = {
            "bundle_id": "com.example.app",
            "name": "TestApp",
            "architectures": "arm64, x86_64",
        }
        info = cmd._build_app_info(app)
        assert info["architectures"] == "arm64, x86_64"
