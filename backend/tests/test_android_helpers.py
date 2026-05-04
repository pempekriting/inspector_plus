"""
Tests for utility functions in android_bridge.py:
_detect_capabilities, _parse_color_attr, _parse_dimension, _extract_styles, _safe_str.
"""

import pytest

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from device.android_bridge import (
    _detect_capabilities,
    _parse_color_attr,
    _parse_dimension,
    _extract_styles,
    _safe_str,
)


class TestSafeStr:
    def test_returns_string_unchanged(self):
        assert _safe_str("hello") == "hello"
        assert _safe_str("") == ""

    def test_returns_empty_for_non_string(self):
        from unittest.mock import MagicMock
        assert _safe_str(MagicMock()) == ""
        assert _safe_str(123) == ""
        assert _safe_str(None) == ""


class TestDetectCapabilities:
    def test_tap_capability(self):
        attrib = {"clickable": "true"}
        caps = _detect_capabilities(attrib, "android.widget.Button")
        assert {"type": "tap", "badge": "TAP", "color": "#22d3ee"} in caps

    def test_scroll_capability(self):
        attrib = {"scrollable": "true"}
        caps = _detect_capabilities(attrib, "android.widget.ScrollView")
        assert {"type": "scroll", "badge": "SCROLL", "color": "#fbbf24"} in caps

    def test_input_capability_edittext_focusable(self):
        attrib = {"focusable": "true"}
        caps = _detect_capabilities(attrib, "android.widget.EditText")
        assert {"type": "input", "badge": "INPUT", "color": "#a78bfa"} in caps

    def test_long_capability(self):
        attrib = {"long-clickable": "true"}
        caps = _detect_capabilities(attrib, "android.widget.Button")
        assert {"type": "long", "badge": "LONG", "color": "#fb923c"} in caps

    def test_focus_capability_non_edittext(self):
        attrib = {"focusable": "true"}
        caps = _detect_capabilities(attrib, "android.widget.TextView")
        assert {"type": "focus", "badge": "FOCUS", "color": "#f472b6"} in caps

    def test_link_capability_webview_with_url(self):
        attrib = {"text": "https://example.com"}
        caps = _detect_capabilities(attrib, "android.webkit.WebView")
        link_caps = [c for c in caps if c["type"] == "link"]
        assert len(link_caps) == 1
        assert link_caps[0]["badge"] == "LINK"
        assert link_caps[0]["color"] == "#34d399"
        assert "reason" in link_caps[0]

    def test_link_capability_content_desc_with_url(self):
        attrib = {"content-desc": "https://example.com"}
        caps = _detect_capabilities(attrib, "android.webkit.WebView")
        link_caps = [c for c in caps if c["type"] == "link"]
        assert len(link_caps) == 1

    def test_no_capabilities(self):
        attrib = {}
        caps = _detect_capabilities(attrib, "android.widget.FrameLayout")
        assert caps == []

    def test_handles_non_string_class_name(self):
        # Non-string class is treated as empty string, short_class becomes ""
        # But clickable still triggers tap capability
        attrib = {"clickable": "true"}
        caps = _detect_capabilities(attrib, None)
        tap_caps = [c for c in caps if c["type"] == "tap"]
        assert len(tap_caps) == 1

    def test_short_class_name_extraction(self):
        attrib = {"clickable": "true"}
        caps = _detect_capabilities(attrib, "android.widget.Button")
        # Should not crash, should find tap capability
        tap_caps = [c for c in caps if c["type"] == "tap"]
        assert len(tap_caps) == 1


class TestParseColorAttr:
    def test_parses_8_char_argb_hex_strips_alpha_from_front(self):
        # #AARRGGBB format: strips first 2 chars (alpha) -> #RRGGBB
        assert _parse_color_attr("#ff5722cc") == "#5722cc"

    def test_parses_7_char_hex(self):
        assert _parse_color_attr("#ff5722") == "#ff5722"

    def test_ignores_resource_reference(self):
        assert _parse_color_attr("@color/primary") is None
        assert _parse_color_attr("?attr/colorControlActivated") is None

    def test_ignores_invalid_hex(self):
        assert _parse_color_attr("#12") is None
        assert _parse_color_attr("#123456789") is None

    def test_handles_empty_and_none(self):
        assert _parse_color_attr("") is None
        assert _parse_color_attr(None) is None

    def test_handles_non_string(self):
        assert _parse_color_attr(123) is None


class TestParseDimension:
    def test_parses_sp(self):
        assert _parse_dimension("16sp") == 16

    def test_parses_dp(self):
        assert _parse_dimension("8dp") == 8

    def test_parses_px(self):
        assert _parse_dimension("12px") == 12

    def test_parses_float(self):
        assert _parse_dimension("8.5dp") == 8

    def test_parses_negative(self):
        assert _parse_dimension("-8dp") == -8

    def test_returns_zero_for_invalid(self):
        assert _parse_dimension("") == 0
        assert _parse_dimension("invalid") == 0
        assert _parse_dimension(None) == 0


class TestExtractStyles:
    def test_extracts_background_color(self):
        attrib = {"background": "#ff5722"}
        styles = _extract_styles(attrib)
        assert styles.get("backgroundColor") == "#ff5722"

    def test_extracts_text_color(self):
        attrib = {"textColor": "#2196f3"}
        styles = _extract_styles(attrib)
        assert styles.get("textColor") == "#2196f3"

    def test_extracts_font_size(self):
        attrib = {"textSize": "16sp"}
        styles = _extract_styles(attrib)
        assert styles.get("fontSize") == "16sp"

    def test_extracts_font_family(self):
        attrib = {"fontFamily": "Roboto Medium"}
        styles = _extract_styles(attrib)
        assert styles.get("fontFamily") == "Roboto Medium"

    def test_extracts_padding_from_individual_attrs(self):
        attrib = {"paddingLeft": "8dp", "paddingTop": "4dp", "paddingRight": "8dp", "paddingBottom": "4dp"}
        styles = _extract_styles(attrib)
        assert styles.get("padding") == {"left": 8, "top": 4, "right": 8, "bottom": 4}

    def test_extracts_padding_from_composite(self):
        attrib = {"padding": "8dp"}
        styles = _extract_styles(attrib)
        assert styles.get("padding") == {"left": 8, "top": 8, "right": 8, "bottom": 8}

    def test_extracts_elevation(self):
        attrib = {"elevation": "4dp"}
        styles = _extract_styles(attrib)
        assert styles.get("elevation") == "4dp"

    def test_returns_empty_dict_when_no_styles(self):
        attrib = {}
        styles = _extract_styles(attrib)
        assert styles == {}

    def test_skips_invalid_color_values(self):
        attrib = {"background": "?attr/color/primary"}
        styles = _extract_styles(attrib)
        assert "backgroundColor" not in styles
