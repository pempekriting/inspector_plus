"""App management commands for iOS devices using idb."""

import re
import shutil
import subprocess
from typing import Optional


_BUNDLE_ID_RE = re.compile(r"^[a-zA-Z][a-zA-Z0-9]*(\.[a-zA-Z][a-zA-Z0-9]*)+$")
"""Regex for valid iOS bundle IDs (e.g. com.apple.mobilesafari)"""


def _safe_bundle_id(bundle_id: str) -> bool:
    """Validate an iOS bundle ID format.

    Format: com.company.appname — dot-separated alphanumerics, max 255 chars.
    """
    if not bundle_id or len(bundle_id) > 255:
        return False
    return bool(_BUNDLE_ID_RE.match(bundle_id))


def _idb_cmd(args: list[str], udid: Optional[str] = None, timeout: int = 30) -> subprocess.CompletedProcess:
    """Run an idb command, falling back to uv run idb if needed.

    Args:
        args: Arguments to pass to idb (after 'idb' or 'uv run idb').
        udid: Optional device UDID. If provided, --udid <udid> is prepended.
        timeout: Command timeout in seconds.

    Returns:
        CompletedProcess result.
    """
    cmd = ["idb"]
    if udid:
        cmd.extend(["--udid", udid])
    cmd.extend(args)

    # Check if idb is available in PATH
    if not shutil.which("idb"):
        # Fall back to uv run idb
        cmd = ["uv", "run", "idb"] + (["--udid", udid] if udid else []) + args

    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)


class IOSAppCommands:
    """Commands for managing iOS apps via idb."""

    def __init__(self, udid: Optional[str] = None):
        self.udid = udid

    def install_app(self, ipa_path: str) -> tuple[bool, str]:
        """Install an IPA file on the device.

        Args:
            ipa_path: Path to the IPA file on the host machine.

        Returns:
            Tuple of (success, output/error message)
        """
        if not ipa_path.lower().endswith(".ipa"):
            return (False, "Invalid IPA path: must end with .ipa")
        try:
            result = _idb_cmd(["install", ipa_path], self.udid, timeout=120)
            if result.returncode == 0:
                return (True, result.stdout.strip())
            return (False, result.stderr.strip() or result.stdout.strip())
        except subprocess.TimeoutExpired:
            return (False, "Install command timed out")
        except Exception as e:
            return (False, f"Install failed: {str(e)}")

    def is_app_installed(self, bundle_id: str) -> tuple[bool, str]:
        """Check if an app is installed on the device.

        Args:
            bundle_id: Full bundle ID (e.g., com.apple.mobilesafari)

        Returns:
            Tuple of (is_installed, output message)
        """
        if not _safe_bundle_id(bundle_id):
            return (False, "Invalid bundle ID format")
        try:
            result = _idb_cmd(["apps", "list"], self.udid, timeout=10)
            output = result.stdout.strip()
            if bundle_id in output:
                return (True, f"App is installed: {bundle_id}")
            return (False, f"App is NOT installed: {bundle_id}")
        except Exception as e:
            return (False, f"Check failed: {str(e)}")

    def uninstall_app(self, bundle_id: str) -> tuple[bool, str]:
        """Uninstall an app from the device.

        Args:
            bundle_id: Full bundle ID (e.g., com.apple.mobilesafari)

        Returns:
            Tuple of (success, output/error message)
        """
        if not _safe_bundle_id(bundle_id):
            return (False, "Invalid bundle ID format")
        try:
            result = _idb_cmd(["uninstall", bundle_id], self.udid, timeout=30)
            if result.returncode == 0:
                return (True, result.stdout.strip())
            return (False, result.stderr.strip() or result.stdout.strip())
        except subprocess.TimeoutExpired:
            return (False, "Uninstall command timed out")
        except Exception as e:
            return (False, f"Uninstall failed: {str(e)}")

    def launch_app(self, bundle_id: str) -> tuple[bool, str]:
        """Launch an app on the device.

        Args:
            bundle_id: Full bundle ID (e.g., com.apple.mobilesafari)

        Returns:
            Tuple of (success, output/error message)
        """
        if not _safe_bundle_id(bundle_id):
            return (False, "Invalid bundle ID format")
        try:
            result = _idb_cmd(["launch", bundle_id], self.udid, timeout=10)
            if result.returncode == 0:
                return (True, f"Launched app: {bundle_id}")
            return (False, result.stderr.strip() or result.stdout.strip())
        except subprocess.TimeoutExpired:
            return (False, "Launch command timed out")
        except Exception as e:
            return (False, f"Launch failed: {str(e)}")

    def list_installed_apps(self) -> tuple[bool, str]:
        """Get list of all installed bundle IDs on the device.

        Returns:
            Tuple of (success, newline-separated bundle IDs or error message)
        """
        try:
            result = _idb_cmd(["apps", "list"], self.udid, timeout=30)
            if result.returncode == 0:
                lines = result.stdout.strip().split("\n")
                bundle_ids = [line.strip() for line in lines if line.strip() and "." in line.strip()]
                return (True, "\n".join(bundle_ids))
            return (False, result.stderr.strip() or result.stdout.strip())
        except subprocess.TimeoutExpired:
            return (False, "List apps command timed out")
        except Exception as e:
            return (False, f"List apps failed: {str(e)}")

    def get_app_info(self, bundle_id: str) -> tuple[bool, dict]:
        """Get detailed info about a specific installed app.

        Args:
            bundle_id: Full bundle ID (e.g., com.apple.mobilesafari)

        Returns:
            Tuple of (success, dict with app info or error)
        """
        if not _safe_bundle_id(bundle_id):
            return (False, {"error": "Invalid bundle ID format"})

        # Try idb describe first
        try:
            result = _idb_cmd(["describe", bundle_id], self.udid, timeout=15)
            if result.returncode == 0 and result.stdout.strip():
                output = result.stdout.strip()
                # Parse describe output into dict
                info = self._parse_describe_output(output)
                info["packageName"] = bundle_id
                return (True, info)
        except Exception:
            pass

        # Fall back to parsing from idb list-targets --json
        try:
            result = _idb_cmd(["list-targets", "--json"], self.udid, timeout=15)
            if result.returncode == 0 and result.stdout.strip():
                import json
                targets = json.loads(result.stdout)
                for target in targets:
                    if target.get("bundle_id") == bundle_id:
                        return (True, {
                            "packageName": bundle_id,
                            "versionName": target.get("name", ""),
                            "versionCode": 0,
                            "minSdk": 0,
                            "targetSdk": 0,
                            "firstInstallTime": "",
                            "lastUpdateTime": "",
                            "installerPackage": "",
                            "permissions": [],
                            "permissionCount": 0,
                            "grantedCount": 0,
                        })
        except Exception:
            pass

        return (False, {"error": f"App not found: {bundle_id}"})

    def _parse_describe_output(self, raw: str) -> dict:
        """Parse idb describe output into a structured dict."""
        info = {
            "versionName": "",
            "versionCode": 0,
            "minSdk": 0,
            "targetSdk": 0,
            "firstInstallTime": "",
            "lastUpdateTime": "",
            "installerPackage": "",
            "permissions": [],
            "permissionCount": 0,
            "grantedCount": 0,
        }

        lines = raw.split("\n")
        for line in lines:
            stripped = line.strip()
            if not stripped or ":" not in stripped:
                continue

            key, _, value = stripped.partition(":")
            key = key.strip().lower()
            value = value.strip()

            if key == "name":
                info["versionName"] = value
            elif key == "bundle_id":
                info["packageName"] = value
            elif key == "version":
                try:
                    info["versionCode"] = int(value)
                except ValueError:
                    pass

        return info
