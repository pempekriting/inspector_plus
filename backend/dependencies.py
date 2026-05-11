import json
import logging
import os
import subprocess
import threading

from device import AndroidDeviceBridge, DeviceBridgeBase
from device.ios_bridge import IOSDeviceBridge
from errors import DeviceNotFoundError

logger = logging.getLogger(__name__)

# Thread-safe bridge singletons
_bridge_lock = threading.Lock()
_android_bridge: AndroidDeviceBridge | None = None
_android_bridges: dict[str, AndroidDeviceBridge] = {}
_ios_bridges: dict[str, IOSDeviceBridge] = {}

# Known iOS device UDIDs (populated by _get_ios_devices)
_known_ios_udids: set[str] = set()


def _get_android_bridge() -> AndroidDeviceBridge:
    global _android_bridge
    if _android_bridge is None:
        with _bridge_lock:
            if _android_bridge is None:
                _android_bridge = AndroidDeviceBridge()
    return _android_bridge


def _is_ios_udid(udid: str) -> bool:
    """Check if udid is a known iOS device UDID.

    First checks against known iOS UDIDs from device listing,
    then falls back to format heuristic (24+ hex chars with dashes).
    """
    if udid in _known_ios_udids:
        return True
    return len(udid) >= 24 and all(c in "0123456789ABCDEFabcdef-" for c in udid)


def _get_first_android_device() -> str | None:
    """Return serial of first connected Android device."""
    from config import settings

    try:
        result = subprocess.run([settings.get_adb_path(), "devices"], capture_output=True, text=True, timeout=5)
        lines = result.stdout.strip().split(chr(10))
        for line in lines[1:]:  # skip "List of devices attached" header
            parts = line.strip().split()
            if parts:
                return parts[0]
        return None
    except Exception as e:
        logger.warning("[_get_first_android_device] Failed to get Android devices: %s", e)
        return None


def _resolve_android_udid(udid: str | None) -> str | None:
    """Resolve udid to Android device serial, checking env and first device."""
    if udid:
        return udid
    return os.environ.get("ANDROID_SERIAL") or _get_first_android_device()


def get_bridge(udid: str | None = None) -> DeviceBridgeBase:
    """Get appropriate bridge for device. Returns None if device can't be resolved."""
    global _android_bridge

    # Resolve empty or None udid to a real device serial
    if not udid:
        udid = os.environ.get("ANDROID_SERIAL") or _get_first_android_device()
    if udid is None:
        bridge = _get_android_bridge()
        logger.info("[get_bridge] udid=None, using global bridge serial=%s", bridge.serial)
        return bridge
    # iOS UDID
    if _is_ios_udid(udid):
        with _bridge_lock:
            if udid not in _ios_bridges:
                _ios_bridges[udid] = IOSDeviceBridge(udid)
            return _ios_bridges[udid]
    # Android device serial - reuse cached bridge for consistent node IDs
    with _bridge_lock:
        if udid not in _android_bridges:
            _android_bridges[udid] = AndroidDeviceBridge(serial=udid)
        return _android_bridges[udid]


def get_bridge_or_raise(udid: str | None = None) -> DeviceBridgeBase:
    """Get bridge for device, raising DeviceNotFoundError if not found.

    FastAPI dependency that replaces manual get_bridge() + None check.
    """
    bridge = get_bridge(udid)
    if bridge is None:
        raise DeviceNotFoundError()
    return bridge


def _get_ios_devices() -> list[dict]:
    """Extract iOS devices from idb or xcrun simctl fallback."""
    global _known_ios_udids
    devices = []
    import shutil

    def run_idb(args: list[str], timeout: int = 30):
        # Try system idb_companion first (installed via brew)
        if shutil.which("idb_companion"):
            return subprocess.run(["idb_companion", *args], capture_output=True, text=True, timeout=timeout)
        # Try plain idb (pip-installed shim)
        if shutil.which("idb"):
            return subprocess.run(["idb", *args], capture_output=True, text=True, timeout=timeout)
        # Fallback: try uv run idb
        return subprocess.run(["uv", "run", "idb", *args], capture_output=True, text=True, timeout=timeout)

    # Try idb first
    try:
        result = run_idb(["list-targets", "--json"], timeout=5)
        if result.returncode == 0:
            for line in result.stdout.strip().split("\n"):
                if not line.strip():
                    continue
                try:
                    target = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if target.get("state") == "Booted":
                    udid = target.get("udid", "")
                    _known_ios_udids.add(udid)
                    devices.append(
                        {
                            "udid": udid,
                            "name": target.get("name", "Unknown"),
                            "platform": "ios",
                            "state": target.get("state", "Shutdown"),
                            "os_version": target.get("os_version", ""),
                            "architecture": target.get("architecture", ""),
                            "device_type": target.get("type", ""),
                            "model": target.get("name", "Unknown"),
                            "manufacturer": "Apple",
                        }
                    )
            return devices
    except Exception:
        pass

    # Fallback: xcrun simctl
    try:
        result = subprocess.run(
            ["xcrun", "simctl", "list", "devices", "--json"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode == 0:
            data = json.loads(result.stdout)
            for runtime, sims in data.get("devices", {}).items():
                os_version = runtime.replace("com.apple.CoreSimulator.SimRuntime.iOS-", "").replace("-", ".")
                for sim in sims:
                    if sim.get("isAvailable", False) and sim.get("state") == "Booted":
                        udid = sim.get("udid", "")
                        _known_ios_udids.add(udid)
                        devices.append(
                            {
                                "udid": udid,
                                "name": sim.get("name", "Unknown"),
                                "platform": "ios",
                                "state": "Booted",
                                "os_version": os_version,
                                "architecture": "arm64",
                                "device_type": sim.get("deviceTypeIdentifier", ""),
                                "model": sim.get("name", "Unknown"),
                                "manufacturer": "Apple",
                            }
                        )
    except Exception:
        pass
    return devices


def shutdown_all_bridges():
    """Shut down all cached bridges. Called during app shutdown."""
    if _android_bridge is not None:
        _android_bridge.shutdown()
    for bridge in _android_bridges.values():
        bridge.shutdown()
    for bridge in _ios_bridges.values():
        bridge.shutdown()
