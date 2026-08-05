"""Tests that Pydantic field validators on request models actually run.

These validators were previously plain classmethods without the
@field_validator decorator, so Pydantic silently never invoked them
and any string reached the handler unvalidated by the model layer.
"""

import pytest
from pydantic import ValidationError

from models import AdbCommandRequest, SwitchContextRequest


class TestAdbCommandRequestValidation:
    def test_allowed_command_accepted(self):
        req = AdbCommandRequest(command="input tap 100 100")
        assert req.command == "input tap 100 100"

    def test_disallowed_command_rejected(self):
        with pytest.raises(ValidationError):
            AdbCommandRequest(command="reboot")

    def test_command_with_dangerous_chars_rejected(self):
        with pytest.raises(ValidationError):
            AdbCommandRequest(command="input tap 0 0 && rm -rf /sdcard")

    def test_newline_injection_rejected(self):
        with pytest.raises(ValidationError):
            AdbCommandRequest(command="input tap 0 0\nrm -rf /sdcard/foo")


class TestSwitchContextRequestValidation:
    def test_valid_context_id_accepted(self):
        req = SwitchContextRequest(contextId="NATIVE_APP")
        assert req.contextId == "NATIVE_APP"

    def test_empty_context_id_rejected(self):
        with pytest.raises(ValidationError):
            SwitchContextRequest(contextId="")

    def test_context_id_too_long_rejected(self):
        with pytest.raises(ValidationError):
            SwitchContextRequest(contextId="a" * 256)

    def test_context_id_with_forbidden_char_rejected(self):
        with pytest.raises(ValidationError):
            SwitchContextRequest(contextId="WEBVIEW_1; rm -rf /")
