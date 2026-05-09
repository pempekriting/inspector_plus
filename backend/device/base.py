from abc import ABC, abstractmethod
from typing import Optional


class DeviceBridgeBase(ABC):
    """Abstract base class for device bridges."""

    def __init__(self, udid: Optional[str] = None):
        self.udid = udid  # Common identifier across platforms

    @abstractmethod
    def connect(self) -> bool:
        """Test connection to device."""
        pass

    @abstractmethod
    def get_devices(self) -> list[dict]:
        """List all connected devices."""
        pass

    @abstractmethod
    def get_hierarchy(self) -> dict:
        """Get UI hierarchy from device."""
        pass

    @abstractmethod
    def search_hierarchy(self, query: str, filter_type: str = "xpath") -> dict:
        """Search UI hierarchy using specified filter type."""
        pass

    @abstractmethod
    def tap(self, x: int, y: int) -> bool:
        """Tap at coordinates."""
        pass

    @abstractmethod
    def get_screenshot(self) -> bytes:
        """Get screenshot as PNG bytes."""
        pass

    @abstractmethod
    def setup_network_proxy(self, port: int = 8080) -> dict:
        """Establish proxy tunnel to host mitmproxy.
        Returns {"success": bool, "proxy_host": str, "proxy_port": int, "tunnel": str}
        """
        pass

    @abstractmethod
    def get_network_traffic(self, duration: int = 30, format: str = "json") -> dict:
        """Capture network traffic for given duration.
        Returns {"flows": list, "flow_file": str, "count": int}
        """
        pass

    @abstractmethod
    def install_certificate(self) -> dict:
        """Install MITM certificate on device.
        Returns {"success": bool, "cert_path": str, "installed": bool, "instructions": list}
        """
        pass

    @abstractmethod
    def get_network_info(self) -> dict:
        """Get network diagnostic info (IP, connections, DNS).
        Returns {"ip_addresses": list, "connections": list, "dns": list}
        """
        pass

    @abstractmethod
    def setup_vpn_proxy(self, port: int = 8080) -> dict:
        """Start VPN-based interception via InspectorVPN app.
        Returns {"success": bool, "vpn_mode": str, "note": str}
        """
        pass

    @abstractmethod
    def stop_vpn_proxy(self) -> dict:
        """Stop VPN interception.
        Returns {"success": bool}
        """
        pass

    @abstractmethod
    def is_vpn_running(self) -> bool:
        """Check if VPN interception is active."""
        pass


def create_bridge(udid: Optional[str] = None) -> DeviceBridgeBase:
    """Factory to create appropriate bridge based on device type."""
    # Import here to avoid circular imports
    from device.android_bridge import AndroidDeviceBridge
    from device.ios_bridge import IOSDeviceBridge

    # Try to detect device type from udid format
    # Android serials are typically alphanumeric strings
    # iOS udids are 24+ char hex strings like "00001234-0001234567890123"
    if udid and len(udid) >= 24 and all(c in "0123456789ABCDEF-" for c in udid.upper()):
        # Likely iOS udid
        return IOSDeviceBridge(udid)
    elif udid and udid.startswith("android://"):
        # Explicit Android marker
        serial = udid.replace("android://", "")
        return AndroidDeviceBridge(serial)
    else:
        # Default: try Android first
        return AndroidDeviceBridge(udid)


def create_bridge_for_device(udid: str) -> DeviceBridgeBase:
    """Create bridge for a specific device, auto-detecting platform."""
    from device.android_bridge import AndroidDeviceBridge
    from device.ios_bridge import IOSDeviceBridge

    # iOS udids are 24+ char hex with dashes
    if len(udid) >= 24 and all(c in "0123456789ABCDEFabcdef-" for c in udid):
        return IOSDeviceBridge(udid)
    return AndroidDeviceBridge(udid)