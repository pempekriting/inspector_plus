"""App management commands for Android devices."""

import os
import re
import subprocess
from typing import Optional


def _safe_path(path: str, must_exist: bool = True) -> bool:
    """Validate a file path is safe (no path traversal, allowed extension)."""
    if not path or len(path) > 1000:
        return False
    if ".." in path:
        return False
    # Must end with .apk
    if not path.lower().endswith(".apk"):
        return False
    if must_exist and not os.path.isfile(path):
        return False
    return True


_PACKAGE_RE = re.compile(r"^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$")


def _safe_package(package: str) -> bool:
    """Validate an Android package name."""
    if not package or len(package) > 255:
        return False
    return bool(_PACKAGE_RE.match(package))


class AppCommands:
    """Commands for managing Android apps via ADB."""

    def __init__(self, serial: Optional[str] = None):
        self.serial = serial

    def _adb_cmd(self, args: list[str]) -> list[str]:
        """Prepend -s <serial> to adb command if serial is set."""
        cmd = ["adb"]
        if self.serial:
            cmd.extend(["-s", self.serial])
        cmd.extend(args)
        return cmd

    def install_app(self, apk_path: str) -> tuple[bool, str]:
        """Install an APK file on the device.

        Args:
            apk_path: Path to the APK file on the host machine.

        Returns:
            Tuple of (success, output/error message)
        """
        if not _safe_path(apk_path):
            return (False, "Invalid APK path: must be a .apk file, no path traversal, and must exist")
        try:
            result = subprocess.run(
                self._adb_cmd(["install", "-r", apk_path]),
                capture_output=True,
                text=True,
                timeout=120,
            )
            if result.returncode == 0:
                return (True, result.stdout.strip())
            return (False, result.stderr.strip() or result.stdout.strip())
        except subprocess.TimeoutExpired:
            return (False, "Install command timed out")
        except Exception as e:
            return (False, f"Install failed: {str(e)}")

    def is_app_installed(self, package: str) -> tuple[bool, str]:
        """Check if an app is installed on the device.

        Args:
            package: Full package name (e.g., com.example.app)

        Returns:
            Tuple of (is_installed, output message)
        """
        try:
            result = subprocess.run(
                self._adb_cmd(["shell", "pm", "list", "packages", package]),
                capture_output=True,
                text=True,
                timeout=10,
            )
            output = result.stdout.strip()
            if package in output:
                return (True, f"App is installed: {package}")
            return (False, f"App is NOT installed: {package}")
        except Exception as e:
            return (False, f"Check failed: {str(e)}")

    def uninstall_app(self, package: str) -> tuple[bool, str]:
        """Uninstall an app from the device.

        Args:
            package: Full package name (e.g., com.example.app)

        Returns:
            Tuple of (success, output/error message)
        """
        if not _safe_package(package):
            return (False, "Invalid package name")
        try:
            result = subprocess.run(
                self._adb_cmd(["uninstall", package]),
                capture_output=True,
                text=True,
                timeout=30,
            )
            if result.returncode == 0:
                return (True, result.stdout.strip())
            return (False, result.stderr.strip() or result.stdout.strip())
        except subprocess.TimeoutExpired:
            return (False, "Uninstall command timed out")
        except Exception as e:
            return (False, f"Uninstall failed: {str(e)}")

    def launch_app(self, package: str) -> tuple[bool, str]:
        """Launch an app on the device.

        Args:
            package: Full package name (e.g., com.example.app)

        Returns:
            Tuple of (success, output/error message)
        """
        if not _safe_package(package):
            return (False, "Invalid package name")
        try:
            result = subprocess.run(
                self._adb_cmd(["shell", "monkey", "-p", package, "-c", "android.intent.category.LAUNCHER", "1"]),
                capture_output=True,
                text=True,
                timeout=10,
            )
            if result.returncode == 0:
                return (True, f"Launched app: {package}")
            return (False, result.stderr.strip() or result.stdout.strip())
        except subprocess.TimeoutExpired:
            return (False, "Launch command timed out")
        except Exception as e:
            return (False, f"Launch failed: {str(e)}")

    def list_installed_apps(self) -> tuple[bool, str]:
        """Get list of all installed packages on the device.

        Returns:
            Tuple of (success, list of packages or error message)
        """
        try:
            result = subprocess.run(
                self._adb_cmd(["shell", "pm", "list", "packages"]),
                capture_output=True,
                text=True,
                timeout=30,
            )
            if result.returncode == 0:
                lines = result.stdout.strip().split("\n")
                packages = [line.replace("package:", "").strip() for line in lines if line.startswith("package:")]
                return (True, "\n".join(packages))
            return (False, result.stderr.strip() or result.stdout.strip())
        except subprocess.TimeoutExpired:
            return (False, "List packages command timed out")
        except Exception as e:
            return (False, f"List packages failed: {str(e)}")

    def get_app_info(self, package: str) -> tuple[bool, dict]:
        """Get detailed info about a specific installed package.

        Uses `dumpsys package <package>` to fetch version, SDK, permissions, etc.

        Args:
            package: Full package name (e.g., com.example.app)

        Returns:
            Tuple of (success, dict with app info or error)
        """
        if not _safe_package(package):
            return (False, {"error": "Invalid package name"})
        try:
            # Get full package dump
            result = subprocess.run(
                self._adb_cmd(["shell", "dumpsys", "package", package]),
                capture_output=True,
                text=True,
                timeout=15,
            )
            if result.returncode != 0:
                return (False, {"error": result.stderr.strip() or "Failed to dump package"})

            output = result.stdout
            if "Unable to find package" in output or "Package " not in output:
                return (False, {"error": f"Package not found: {package}"})

            info = self._parse_package_dump(output)
            info["packageName"] = package
            return (True, info)
        except subprocess.TimeoutExpired:
            return (False, {"error": "Get app info command timed out"})
        except Exception as e:
            return (False, {"error": f"Get app info failed: {str(e)}"})

    def _parse_package_dump(self, raw: str) -> dict:
        """Parse dumpsys package output into a structured dict."""
        import datetime

        def get(key: str, default=""):
            # Find a key: value line within the first block (before Activities etc.)
            lines = raw.split("\n")
            for i, line in enumerate(lines):
                stripped = line.strip()
                if stripped.startswith(f"{key}="):
                    return stripped.split("=", 1)[1].strip()
                # Handle multi-line values (indented continuation)
                if stripped.startswith(key + ":"):
                    val = stripped.split(":", 1)[1].strip()
                    j = i + 1
                    while j < len(lines) and lines[j].startswith("      "):
                        val += "\n" + lines[j].strip()
                        j += 1
                    return val.strip()
            return default

        def get_int(key: str, default: int = 0) -> int:
            val = get(key)
            try:
                return int(val)
            except (ValueError, TypeError):
                return default

        # Version info
        version_name = get("versionName", "Unknown")
        version_code = get_int("versionCode")

        # SDK info — parse from "sdkVersion:" and "targetSdkVersion:"
        min_sdk = get_int("sdkVersion")
        target_sdk = get_int("targetSdkVersion")

        # If sdkVersion not found, try parsing from versionCode line
        # e.g. "versionCode=220500000 minSdk=30 targetSdk=34"
        vc_line = get("versionCode")
        if vc_line:
            import re
            sdk_match = re.search(r"minSdk=(\d+)", vc_line)
            tgt_match = re.search(r"targetSdk=(\d+)", vc_line)
            if sdk_match:
                min_sdk = int(sdk_match.group(1))
            if tgt_match:
                target_sdk = int(tgt_match.group(1))

        # Timestamps
        first_install = get("firstInstallTime")
        last_update = get("lastUpdateTime")

        def parse_ts(ts: str) -> str:
            try:
                # Android timestamps are in ms since epoch
                ms = int(ts)
                return datetime.datetime.fromtimestamp(ms / 1000).strftime("%Y-%m-%d %H:%M")
            except (ValueError, OSError):
                return ts

        first_install_str = parse_ts(first_install) if first_install.isdigit() else first_install
        last_update_str = parse_ts(last_update) if last_update.isdigit() else last_update

        # Installer
        installer = get("installerPackageName", "Unknown")

        # Permissions — collect all granted and requested permissions
        granted_perms = set()
        requested_perms = set()

        lines = raw.split("\n")
        for line in lines:
            stripped = line.strip()
            # Granted permissions
            if "granted=true" in stripped or ".GRANTED" in stripped:
                # e.g. "android.permission.READ_CONTACTS: granted=true"
                m = stripped.split(":")[0].strip()
                if m and "." in m:
                    granted_perms.add(m)
            # All requested permissions block
            if "requested=" in stripped:
                parts = stripped.split()
                for p in parts:
                    if p.startswith("android.permission.") or p.startswith("com.android"):
                        requested_perms.add(p.rstrip(","))

        # Build permission list
        all_perms = set(granted_perms) | set(requested_perms)
        permissions = []

        # Permission groups (Android convention)
        perm_groups = {
            "android.permission-group.CALENDAR": "📅 Calendar",
            "android.permission-group.CAMERA": "📷 Camera",
            "android.permission-group.CONTACTS": "📇 Contacts",
            "android.permission-group.LOCATION": "📍 Location",
            "android.permission-group.MICROPHONE": "🎤 Microphone",
            "android.permission-group.PHONE": "📞 Phone",
            "android.permission-group.SENSORS": "🔋 Sensors",
            "android.permission-group.SMS": "💬 SMS",
            "android.permission-group.STORAGE": "💾 Storage",
            "android.permission-group.NEARBY_DEVICES": "📡 Nearby Devices",
        }

        def get_perm_label(perm: str) -> str:
            return perm.split(".")[-1].replace("_", " ").title()

        for perm in sorted(all_perms):
            is_granted = perm in granted_perms
            # Determine group
            group = "Other"
            for group_key, group_label in perm_groups.items():
                if perm.startswith(group_key.rstrip(".ABCDEFGHIJKLMNOPQRSTUVWXYZ")):
                    group = group_label
                    break
            permissions.append({
                "name": perm,
                "label": get_perm_label(perm),
                "granted": is_granted,
                "group": group,
            })

        return {
            "packageName": "",
            "versionName": version_name,
            "versionCode": version_code,
            "minSdk": min_sdk,
            "targetSdk": target_sdk,
            "firstInstallTime": first_install_str,
            "lastUpdateTime": last_update_str,
            "installerPackage": installer,
            "permissions": permissions,
            "permissionCount": len(permissions),
            "grantedCount": len(granted_perms),
        }
