"""
Tests for device/base.py — DeviceBridgeBase, create_bridge, create_bridge_for_device.
"""

import pytest
from unittest.mock import patch, MagicMock
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from device.base import DeviceBridgeBase, create_bridge, create_bridge_for_device
from device.android_bridge import AndroidDeviceBridge
from device.ios_bridge import IOSDeviceBridge


class TestDeviceBridgeBase:
    """DeviceBridgeBase is abstract — verify subclasses implement required methods."""

    def test_android_bridge_inherits_base(self):
        bridge = AndroidDeviceBridge("emulator-5554")
        assert isinstance(bridge, DeviceBridgeBase)
        assert bridge.udid == "emulator-5554"

    def test_ios_bridge_inherits_base(self):
        bridge = IOSDeviceBridge("00001234-0001234567890123")
        assert isinstance(bridge, DeviceBridgeBase)
        assert bridge.udid == "00001234-0001234567890123"

    def test_android_bridge_has_required_methods(self):
        bridge = AndroidDeviceBridge("emulator-5554")
        required = ["connect", "get_devices", "get_hierarchy", "search_hierarchy", "tap", "get_screenshot"]
        for method in required:
            assert hasattr(bridge, method), f"Missing method: {method}"

    def test_ios_bridge_has_required_methods(self):
        bridge = IOSDeviceBridge("00001234-0001234567890123")
        required = ["connect", "get_devices", "get_hierarchy", "search_hierarchy", "tap", "get_screenshot"]
        for method in required:
            assert hasattr(bridge, method), f"Missing method: {method}"


class TestCreateBridge:
    """Factory function create_bridge auto-detects platform from udid format."""

    def test_android_udid_returns_android_bridge(self):
        bridge = create_bridge("emulator-5554")
        assert isinstance(bridge, AndroidDeviceBridge)

    def test_android_explicit_prefix(self):
        bridge = create_bridge("android://emulator-5554")
        assert isinstance(bridge, AndroidDeviceBridge)

    def test_ios_udid_format_returns_ios_bridge(self):
        bridge = create_bridge("00001234-0001234567890123")
        assert isinstance(bridge, IOSDeviceBridge)

    def test_ios_udid_uppercase_returns_ios_bridge(self):
        bridge = create_bridge("00001234-000123456789ABCD")
        assert isinstance(bridge, IOSDeviceBridge)

    def test_none_udid_defaults_to_android(self):
        bridge = create_bridge(None)
        assert isinstance(bridge, AndroidDeviceBridge)

    def test_android_long_hex_still_android(self):
        """Long hex without dashes should default to Android."""
        bridge = create_bridge("abcdef123456")
        assert isinstance(bridge, AndroidDeviceBridge)


class TestCreateBridgeForDevice:
    """create_bridge_for_device explicitly creates bridge for given udid."""

    def test_android_device(self):
        bridge = create_bridge_for_device("emulator-5554")
        assert isinstance(bridge, AndroidDeviceBridge)

    def test_ios_device(self):
        bridge = create_bridge_for_device("00001234-0001234567890123")
        assert isinstance(bridge, IOSDeviceBridge)

    def test_android_short_udid(self):
        bridge = create_bridge_for_device("localhost:5555")
        assert isinstance(bridge, AndroidDeviceBridge)
