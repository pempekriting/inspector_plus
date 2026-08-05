from abc import ABC, abstractmethod


class DeviceBridgeBase(ABC):
    """Abstract base class for device bridges."""

    def __init__(self, udid: str | None = None):
        self.udid = udid  # Common identifier across platforms

    @abstractmethod
    def connect(self) -> bool:
        """Test connection to device."""

    @abstractmethod
    def get_devices(self) -> list[dict]:
        """List all connected devices."""

    @abstractmethod
    def get_hierarchy(self) -> dict:
        """Get UI hierarchy from device."""

    @abstractmethod
    def search_hierarchy(self, query: str, filter_type: str = "xpath") -> dict:
        """Search UI hierarchy using specified filter type."""

    @abstractmethod
    def tap(self, x: int, y: int) -> bool:
        """Tap at coordinates."""

    @abstractmethod
    def get_screenshot(self) -> bytes:
        """Get screenshot as PNG bytes."""

    @abstractmethod
    def setup_network_proxy(self, port: int = 8080) -> dict:
        """Establish proxy tunnel to host mitmproxy.
        Returns {"success": bool, "proxy_host": str, "proxy_port": int, "tunnel": str}
        """

    @abstractmethod
    def get_network_traffic(self, duration: int = 30, format: str = "json") -> dict:
        """Capture network traffic for given duration.
        Returns {"flows": list, "flow_file": str, "count": int}
        """

    @abstractmethod
    def install_certificate(self) -> dict:
        """Install MITM certificate on device.
        Returns {"success": bool, "cert_path": str, "installed": bool, "instructions": list}
        """

    @abstractmethod
    def get_network_info(self) -> dict:
        """Get network diagnostic info (IP, connections, DNS).
        Returns {"ip_addresses": list, "connections": list, "dns": list}
        """

    @abstractmethod
    def setup_vpn_proxy(self, port: int = 8080) -> dict:
        """Start VPN-based interception via InspectorVPN app.
        Returns {"success": bool, "vpn_mode": str, "note": str}
        """

    @abstractmethod
    def stop_vpn_proxy(self) -> dict:
        """Stop VPN interception.
        Returns {"success": bool}
        """

    @abstractmethod
    def is_vpn_running(self) -> bool:
        """Check if VPN interception is active."""


def create_bridge_for_device(udid: str) -> DeviceBridgeBase:
    """Create bridge for a specific device, auto-detecting platform."""
    from device.android_bridge import AndroidDeviceBridge
    from device.ios_bridge import IOSDeviceBridge

    # iOS udids are 24+ char hex with dashes
    if len(udid) >= 24 and all(c in "0123456789ABCDEFabcdef-" for c in udid):
        return IOSDeviceBridge(udid)
    return AndroidDeviceBridge(udid)
