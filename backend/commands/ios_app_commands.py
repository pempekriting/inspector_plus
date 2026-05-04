"""App management commands for iOS devices using idb."""

import os
import plistlib
import re
import subprocess
import tempfile
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
    """Run an idb command via uv run with IDB_UDID env var.

    On this machine, the venv contains a Python idb shim (pip-installed) that requires:
    - IDB_UDID env var (not --udid before subcommand)
    - --udid after subcommand

    Always use uv run for consistent behavior regardless of what shutil.which finds.

    Args:
        args: Arguments to pass to idb (after 'idb' or 'uv run idb').
        udid: Optional device UDID.
        timeout: Command timeout in seconds.

    Returns:
        CompletedProcess result.
    """
    env = dict(os.environ)
    cmd = ["uv", "run", "idb"]
    if udid:
        env["IDB_UDID"] = udid
        cmd.extend(args)
        cmd.extend(["--udid", udid])
    else:
        cmd.extend(args)
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, env=env)


def _read_info_plist(udid: Optional[str], bundle_id: str) -> Optional[dict]:
    """Read and parse Info.plist from an installed iOS app via idb.

    Uses `idb file pull` to extract the plist, then parses with plistlib.
    Returns parsed dict or None if unavailable.
    """
    try:
        with tempfile.NamedTemporaryFile(suffix=".plist", delete=True) as tmp:
            env = dict(os.environ)
            cmd = ["uv", "run", "idb", "file", "pull", "--bundle-id", bundle_id, "Info.plist", tmp.name]
            if udid:
                env["IDB_UDID"] = udid
                cmd.extend(["--udid", udid])
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=15, env=env)
            if result.returncode != 0:
                return None
            with open(tmp.name, "rb") as f:
                return plistlib.load(f)
    except Exception:
        return None


def _get_simctl_app_info(udid: Optional[str], bundle_id: str) -> Optional[dict]:
    """Get app info via xcrun simctl appinfo (simulator only).

    Returns parsed dict or None if not a simulator or command fails.
    """
    if not udid:
        return None
    try:
        cmd = ["xcrun", "simctl", "appinfo", udid, bundle_id]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        if result.returncode != 0 or not result.stdout.strip():
            return None
        # simctl appinfo outputs plist-like format, parse with plistlib
        # It may output XML plist
        try:
            return plistlib.loads(result.stdout.encode("utf-8"))
        except Exception:
            # Try parsing as key-value lines
            info = {}
            for line in result.stdout.strip().split("\n"):
                if "=" in line:
                    key, _, value = line.partition("=")
                    key = key.strip().strip('"')
                    value = value.strip().rstrip(";").strip().strip('"')
                    info[key] = value
            return info if info else None
    except Exception:
        return None


def _extract_permissions_from_plist(plist_data: dict) -> list[dict]:
    """Extract permission descriptions from Info.plist NS*UsageDescription keys.

    Returns list of {name, description} dicts.
    """
    permissions = []
    for key, value in plist_data.items():
        if key.endswith("UsageDescription") and isinstance(value, str) and value.strip():
            # NSCameraUsageDescription -> Camera
            name = key.replace("NS", "").replace("UsageDescription", "")
            # Add spaces before capitals: NSPhotoLibraryUsageDescription -> Photo Library
            name = re.sub(r"([a-z])([A-Z])", r"\1 \2", name)
            permissions.append({"name": key, "description": value.strip(), "label": name})
    return permissions


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

        Uses `idb list-apps` and checks if bundle_id appears as a first column.

        Args:
            bundle_id: Full bundle ID (e.g., com.apple.mobilesafari)

        Returns:
            Tuple of (is_installed, output message)
        """
        if not _safe_bundle_id(bundle_id):
            return (False, "Invalid bundle ID format")
        try:
            result = _idb_cmd(["list-apps"], self.udid, timeout=10)
            if result.returncode != 0:
                return (False, f"Check failed: {result.stderr.strip()}")
            for line in result.stdout.strip().split("\n"):
                parts = line.strip().split()
                if parts and parts[0] == bundle_id:
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

        Uses `idb list-apps` (documented command).
        Output format: each line has "bundle_id name install_type architectures running debuggable"
        Extracts just the bundle_id (first column) from each line.

        Returns:
            Tuple of (success, newline-separated bundle IDs or error message)
        """
        try:
            result = _idb_cmd(["list-apps"], self.udid, timeout=30)
            if result.returncode == 0:
                lines = result.stdout.strip().split("\n")
                bundle_ids = []
                for line in lines:
                    line = line.strip()
                    if not line:
                        continue
                    # First column is bundle_id (contains dots)
                    parts = line.split()
                    if parts and "." in parts[0]:
                        bundle_ids.append(parts[0])
                return (True, "\n".join(bundle_ids))
            return (False, result.stderr.strip() or result.stdout.strip())
        except subprocess.TimeoutExpired:
            return (False, "List apps command timed out")
        except Exception as e:
            return (False, f"List apps failed: {str(e)}")

    def get_app_info(self, bundle_id: str) -> tuple[bool, dict]:
        """Get detailed info about a specific installed app.

        Enriches idb list-apps data with Info.plist parsing for version,
        minimum OS version, and permission descriptions.

        Args:
            bundle_id: Full bundle ID (e.g., com.apple.mobilesafari)

        Returns:
            Tuple of (success, dict with app info or error)
        """
        if not _safe_bundle_id(bundle_id):
            return (False, {"error": "Invalid bundle ID format"})

        base_info = None

        # Step 1: Get base info from idb list-apps
        try:
            result = _idb_cmd(["list-apps", "--json"], self.udid, timeout=15)
            if result.returncode == 0 and result.stdout.strip():
                import json
                apps = json.loads(result.stdout)
                for app in apps:
                    app_bundle = app.get("bundle_id", app.get("BundleIdentifier", ""))
                    if app_bundle == bundle_id:
                        base_info = app
                        break
        except Exception:
            pass

        # Fallback: plain text output
        if base_info is None:
            try:
                result = _idb_cmd(["list-apps"], self.udid, timeout=15)
                if result.returncode == 0 and result.stdout.strip():
                    for line in result.stdout.strip().split("\n"):
                        if bundle_id in line:
                            parts = line.split()
                            base_info = {
                                "bundle_id": bundle_id,
                                "name": parts[1] if len(parts) > 1 else "",
                                "install_type": parts[2] if len(parts) > 2 else "",
                                "architectures": parts[3] if len(parts) > 3 else "",
                            }
                            break
            except Exception:
                pass

        if base_info is None:
            return (False, {"error": f"App not found: {bundle_id}"})

        info = self._build_app_info(base_info)

        # Step 2: Enrich from Info.plist (works on simulators and physical devices)
        plist_data = _read_info_plist(self.udid, bundle_id)
        if plist_data:
            info["versionName"] = str(plist_data.get("CFBundleShortVersionString", ""))
            raw_build = plist_data.get("CFBundleVersion", "")
            try:
                info["versionCode"] = int(raw_build)
            except (ValueError, TypeError):
                info["versionCode"] = 0
            info["minimumOSVersion"] = str(plist_data.get("MinimumOSVersion", ""))
            info["permissions"] = _extract_permissions_from_plist(plist_data)
            info["permissionCount"] = len(info["permissions"])
        else:
            # Step 3: Fallback to simctl appinfo (simulator only)
            simctl_info = _get_simctl_app_info(self.udid, bundle_id)
            if simctl_info:
                raw_version = simctl_info.get("CFBundleVersion", "")
                try:
                    info["versionCode"] = int(raw_version)
                except (ValueError, TypeError):
                    info["versionCode"] = 0
                if not info["displayName"]:
                    info["displayName"] = str(simctl_info.get("CFBundleDisplayName", ""))

        return (True, info)

    def _build_app_info(self, app: dict) -> dict:
        """Build a normalized app info dict from an idb list-apps entry.

        idb list-apps returns: bundle_id, name, install_type, architectures,
        running, debuggable. Version/permissions filled in by get_app_info via plist parsing.
        """
        bundle_id = app.get("bundle_id", app.get("BundleIdentifier", ""))
        architectures = app.get("architectures", "")
        if isinstance(architectures, list):
            architectures = ", ".join(architectures)

        return {
            "packageName": bundle_id,
            "bundleIdentifier": bundle_id,
            "displayName": app.get("name", app.get("DisplayName", "")),
            "versionName": "",
            "versionCode": 0,
            "installType": app.get("install_type", ""),
            "architectures": architectures,
            "running": app.get("running", False),
            "debuggable": app.get("debuggable", False),
            "minSdk": 0,
            "targetSdk": 0,
            "minimumOSVersion": "",
            "firstInstallTime": "",
            "lastUpdateTime": "",
            "installerPackage": "",
            "permissions": [],
            "permissionCount": 0,
            "grantedCount": 0,
        }

