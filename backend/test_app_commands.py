"""
Tests for commands/app_commands.py — AppCommands class.
Mocks subprocess to test APK install/uninstall/launch/list in isolation.
"""

import pytest
from unittest.mock import patch, MagicMock

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from commands.app_commands import AppCommands


def mock_proc(stdout="", stderr="", returncode=0):
    m = MagicMock()
    m.stdout = stdout
    m.stderr = stderr
    m.returncode = returncode
    return m


class TestAppCommands:
    @patch("commands.app_commands._safe_path", return_value=True)
    @patch("subprocess.run")
    def test_install_app_success(self, mock_run, mock_safe_path):
        mock_run.return_value = mock_proc(stdout="Success", returncode=0)
        cmd = AppCommands("emulator-5554")
        success, output = cmd.install_app("/tmp/app.apk")
        assert success is True
        assert "Success" in output

    @patch("commands.app_commands._safe_path", return_value=True)
    @patch("subprocess.run")
    def test_install_app_failure(self, mock_run, mock_safe_path):
        mock_run.return_value = mock_proc(stderr="Failure [INSTALL_FAILED_INSUFFICIENT_STORAGE]", returncode=1)
        cmd = AppCommands()
        success, output = cmd.install_app("/tmp/app.apk")
        assert success is False
        assert "Failure" in output

    @patch("commands.app_commands._safe_path", return_value=True)
    @patch("subprocess.run")
    def test_install_app_timeout(self, mock_run, mock_safe_path):
        import subprocess
        mock_run.side_effect = subprocess.TimeoutExpired("cmd", 120)
        cmd = AppCommands()
        success, output = cmd.install_app("/tmp/app.apk")
        assert success is False
        assert "timed out" in output

    @patch("commands.app_commands._safe_path", return_value=True)
    @patch("subprocess.run")
    def test_install_app_uses_install_r_flag(self, mock_run, mock_safe_path):
        mock_run.return_value = mock_proc(stdout="Success")
        cmd = AppCommands("device-123")
        cmd.install_app("/tmp/app.apk")
        call_args = mock_run.call_args[0][0]
        assert "-r" in call_args  # reinstall flag

    @patch("commands.app_commands._safe_path")
    @patch("subprocess.run")
    def test_install_app_rejects_missing_file(self, mock_run, mock_safe_path):
        mock_safe_path.return_value = False  # file does not exist / not safe
        mock_run.return_value = MagicMock(stdout="", stderr="", returncode=1)
        cmd = AppCommands()
        success, output = cmd.install_app("/nonexistent/app.apk")
        assert success is False
        assert "must exist" in output
        mock_run.assert_not_called()  # subprocess never called

    def test_install_app_rejects_path_traversal(self):
        cmd = AppCommands()
        success, output = cmd.install_app("../etc/passwd.apk")
        assert success is False
        assert "Invalid APK path" in output

    @patch("subprocess.run")
    def test_is_app_installed_returns_true(self, mock_run):
        mock_run.return_value = mock_proc(stdout="package:com.example.app")
        cmd = AppCommands()
        success, output = cmd.is_app_installed("com.example.app")
        assert success is True

    @patch("subprocess.run")
    def test_is_app_installed_returns_false(self, mock_run):
        mock_run.return_value = mock_proc(stdout="")
        cmd = AppCommands()
        success, output = cmd.is_app_installed("com.notfound")
        assert success is False

    @patch("subprocess.run")
    def test_uninstall_app_success(self, mock_run):
        mock_run.return_value = mock_proc(stdout="Success", returncode=0)
        cmd = AppCommands()
        success, output = cmd.uninstall_app("com.example.app")
        assert success is True

    @patch("subprocess.run")
    def test_uninstall_app_failure(self, mock_run):
        mock_run.return_value = mock_proc(stderr="Failure", returncode=1)
        cmd = AppCommands()
        success, output = cmd.uninstall_app("com.example.app")
        assert success is False

    @patch("subprocess.run")
    def test_uninstall_app_timeout(self, mock_run):
        import subprocess
        mock_run.side_effect = subprocess.TimeoutExpired("cmd", 30)
        cmd = AppCommands()
        success, output = cmd.uninstall_app("com.example.app")
        assert success is False
        assert "timed out" in output

    @patch("subprocess.run")
    def test_uninstall_app_rejects_invalid_package(self, mock_run):
        cmd = AppCommands()
        success, output = cmd.uninstall_app("not-a-valid-package")
        assert success is False
        assert "Invalid package name" in output

    @patch("subprocess.run")
    def test_launch_app_success(self, mock_run):
        mock_run.return_value = mock_proc(stdout="Events injected: 1", returncode=0)
        cmd = AppCommands()
        success, output = cmd.launch_app("com.example.app")
        assert success is True
        assert "Launched" in output

    @patch("subprocess.run")
    def test_launch_app_failure(self, mock_run):
        mock_run.return_value = mock_proc(stderr="bad", returncode=1)
        cmd = AppCommands()
        success, output = cmd.launch_app("com.example.app")
        assert success is False

    @patch("subprocess.run")
    def test_launch_app_timeout(self, mock_run):
        import subprocess
        mock_run.side_effect = subprocess.TimeoutExpired("cmd", 10)
        cmd = AppCommands()
        success, output = cmd.launch_app("com.example.app")
        assert success is False
        assert "timed out" in output

    @patch("subprocess.run")
    def test_launch_app_rejects_invalid_package(self, mock_run):
        cmd = AppCommands()
        success, output = cmd.launch_app("invalid")
        assert success is False
        assert "Invalid package name" in output

    @patch("subprocess.run")
    def test_list_installed_apps_returns_packages(self, mock_run):
        mock_run.return_value = mock_proc(
            stdout="package:com.example.app1\npackage:com.example.app2\n",
            returncode=0,
        )
        cmd = AppCommands()
        success, output = cmd.list_installed_apps()
        assert success is True
        assert "com.example.app1" in output
        assert "com.example.app2" in output

    @patch("subprocess.run")
    def test_list_installed_apps_strips_package_prefix(self, mock_run):
        mock_run.return_value = mock_proc(
            stdout="package:com.example.app\npackage:io.other.app\n",
            returncode=0,
        )
        cmd = AppCommands()
        success, output = cmd.list_installed_apps()
        lines = output.split("\n")
        assert all(not line.startswith("package:") for line in lines)

    @patch("subprocess.run")
    def test_list_installed_apps_failure(self, mock_run):
        mock_run.return_value = mock_proc(stderr="error", returncode=1)
        cmd = AppCommands()
        success, output = cmd.list_installed_apps()
        assert success is False

    @patch("subprocess.run")
    def test_adb_cmd_includes_serial(self, mock_run):
        mock_run.return_value = mock_proc(stdout="", returncode=0)
        cmd = AppCommands("emulator-5554")
        cmd.list_installed_apps()
        call_args = mock_run.call_args[0][0]
        assert "-s" in call_args
        assert "emulator-5554" in call_args

    @patch("subprocess.run")
    def test_adb_cmd_no_serial_when_none(self, mock_run):
        mock_run.return_value = mock_proc(stdout="", returncode=0)
        cmd = AppCommands(None)
        cmd.list_installed_apps()
        call_args = mock_run.call_args[0][0]
        # Should only have "adb", "shell", "pm", "list", "packages" — no -s
        assert "-s" not in call_args