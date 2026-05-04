"""Tests for iOS-specific recorder session."""
import pytest


class TestIOSRecorderSession:
    """Tests for IOSRecorderSession platform-specific behavior."""

    def test_automation_name_is_xcuittest(self):
        from device.recorder import IOSRecorderSession
        session = IOSRecorderSession()
        assert session.AUTOMATION_NAME == "XCUITest"

    def test_export_python_uses_xcuittest(self):
        from device.recorder import IOSRecorderSession
        session = IOSRecorderSession()
        session.add_step("click", "btn1", {"strategy": "id", "value": "login"}, None)
        result = session.export("python", "iOS")
        assert 'XCUITest' in result
        assert '"platformName": "iOS"' in result or 'platformName: "iOS"' in result

    def test_export_java_uses_xcuittest(self):
        from device.recorder import IOSRecorderSession
        session = IOSRecorderSession()
        session.add_step("click", "btn1", {"strategy": "id", "value": "login"}, None)
        result = session.export("java", "iOS")
        assert 'caps.setCapability("automationName", "XCUITest")' in result
        assert "platformName" in result

    def test_export_javascript_uses_xcuittest(self):
        from device.recorder import IOSRecorderSession
        session = IOSRecorderSession()
        session.add_step("click", "btn1", {"strategy": "id", "value": "login"}, None)
        result = session.export("javascript", "iOS")
        assert "XCUITest" in result


class TestAndroidRecorderSession:
    """Tests for AndroidRecorderSession platform-specific behavior."""

    def test_automation_name_is_uiautomator2(self):
        from device.recorder import AndroidRecorderSession
        session = AndroidRecorderSession()
        assert session.AUTOMATION_NAME == "UiAutomator2"

    def test_export_python_uses_uiautomator2(self):
        from device.recorder import AndroidRecorderSession
        session = AndroidRecorderSession()
        session.add_step("click", "btn1", {"strategy": "id", "value": "login"}, None)
        result = session.export("python", "Android")
        assert 'UiAutomator2' in result
        assert '"platformName": "Android"' in result or 'platformName: "Android"' in result


class TestRecorderSessionSwipeTypeSafety:
    """Tests for type safety in swipe step handling."""

    def test_swipe_with_dict_value(self):
        from device.recorder import RecorderSession
        session = RecorderSession()
        session.add_step("swipe", "gesture1", {"strategy": "id", "value": "list"}, {
            "startX": 100,
            "startY": 200,
            "endX": 300,
            "endY": 400
        })
        result = session.export("python", "Android")
        assert "startX" in result
        assert "startY" in result

    def test_swipe_with_none_value(self):
        from device.recorder import RecorderSession
        session = RecorderSession()
        session.add_step("swipe", "gesture1", {"strategy": "id", "value": "list"}, None)
        result = session.export("python", "Android")
        # Should not crash, should produce safe fallback
        assert "// swipe" in result

    def test_swipe_with_string_value_does_not_crash(self):
        from device.recorder import RecorderSession
        session = RecorderSession()
        session.add_step("swipe", "gesture1", {"strategy": "id", "value": "list"}, "not a dict")
        # This should not raise AttributeError
        result = session.export("python", "Android")
        assert isinstance(result, str)
