import re

# --- ADB Command Allowlist ---
_ALLOWED_ADB_PREFIXES = [
    # Input events
    "input text",
    "input keyevent",
    "input tap",
    "input swipe",
    "input press",
    "input roll",
    "input drag",
    "input mouse",
    # Package manager
    "pm list",
    "pm path",
    "pm dump",
    "pm install",
    "pm uninstall",
    "pm clear",
    "pm hide",
    "pm unhide",
    "pm disable",
    "pm enable",
    # App launch
    "am start",
    "am force-stop",
    "am kill",
    "am broadcast",
    "am monitor",
    "am stack",
    # Screenshot / screenrecord
    "screencap",
    "screenrecord",
    # dumpsys
    "dumpsys",
    "dump",
    # Settings / system (read-only)
    "settings get",
    "getprop",
    "wm",
    # Misc read-only / safe
    "ls",
    "mkdir",
    "touch",
    "netstat",
    "ip addr",
    "ps",
    "top",
    "free",
    "df",
    "du",
    "getevent",
    "uiautomator",
    # Shell utilities
    "monkey",
    "id",
    "uname",
    "whoami",
    "getconf",
    "date",
    "pwd",
    "echo",
]

_SAFE_SHORT_COMMANDS = {
    "ls",
    "ps",
    "pwd",
    "date",
    "echo",
    "id",
    "uname",
    "whoami",
    "getconf",
    "uptime",
}

_DANGEROUS_EXECS = {
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
}

_DANGEROUS_CHARS = ["&&", "||", "|", ";", "`", "$(", ">", ">>", "<"]


def validate_command(command: str) -> tuple[bool, str]:
    """Check if a shell command is safe for execution on a device.

    Shared validation for both Android ADB and iOS idb commands.
    Returns (ok, reason).
    """
    if not command or len(command) > 500:
        return False, "Command must be 1-500 characters"
    cmd_lower = command.strip().lower()
    # Block dangerous characters
    for ch in _DANGEROUS_CHARS:
        if ch in command:
            return False, f"Forbidden character sequence '{ch}'"
    # Block dangerous executables (including su-prefixed)
    for exe in _DANGEROUS_EXECS:
        if re.match(rf"^\s*{re.escape(exe)}(\s|$)", cmd_lower):
            return False, f"Command '{exe}' is not allowed"
        if re.search(rf"su\s+.{{0,50}}\s+{re.escape(exe)}(\s|$)", cmd_lower):
            return False, f"Command '{exe}' is not allowed"
    # Allow known safe prefixes
    for prefix in sorted(_ALLOWED_ADB_PREFIXES, key=len, reverse=True):
        if cmd_lower.startswith(prefix):
            return True, "allowed"
    # Allow short safe commands
    if re.match(r"^[a-z][a-z0-9_-]*$", cmd_lower) and cmd_lower in _SAFE_SHORT_COMMANDS:
        return True, "allowed"
    return False, f"Command '{cmd_lower[:50]}' is not in the allowlist"
