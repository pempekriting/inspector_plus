"""Shared WCAG accessibility audit utilities for both Android and iOS bridges."""

from datetime import datetime, timezone
from typing import Optional

MIN_TOUCH_TARGET = 48
CONTRAST_NORMAL = 4.5
CONTRAST_LARGE = 3.0
LARGE_TEXT_SIZES = {"18", "20", "24", "14"}


class PlatformMapper:
    """Abstract property mapper for accessibility checks."""

    def text(self, node: dict) -> str:
        raise NotImplementedError

    def content_desc(self, node: dict) -> str:
        raise NotImplementedError

    def is_clickable(self, node: dict) -> bool:
        raise NotImplementedError

    def has_colors(self) -> bool:
        return False

    def text_color(self, node: dict) -> str:
        return ""

    def bg_color(self, node: dict) -> str:
        return ""

    def short_class(self, node: dict) -> str:
        class_name = node.get("className", "")
        return class_name.split(".")[-1] if class_name else "View"


class AndroidMapper(PlatformMapper):
    """Property mapper for Android (uiautomator hierarchy)."""

    def text(self, node: dict) -> str:
        return node.get("text", "") + " " + node.get("contentDesc", "")

    def content_desc(self, node: dict) -> str:
        return node.get("contentDesc", "")

    def is_clickable(self, node: dict) -> bool:
        return node.get("clickable", False)

    def has_colors(self) -> bool:
        return True

    def text_color(self, node: dict) -> str:
        return node.get("styles", {}).get("textColor", "")

    def bg_color(self, node: dict) -> str:
        return node.get("styles", {}).get("backgroundColor", "")


class IOSMapper(PlatformMapper):
    """Property mapper for iOS (WDA accessibility hierarchy via idb)."""

    CLICKABLE_TYPES = frozenset((
        "XCUIElementTypeButton", "XCUIElementTypeLink",
        "XCUIElementTypeTab", "XCUIElementTypeCell",
        "XCUIElementTypeStaticText",
    ))

    def text(self, node: dict) -> str:
        return node.get("label", "") or node.get("value", "")

    def content_desc(self, node: dict) -> str:
        return node.get("contentDesc", "") or node.get("help", "")

    def is_clickable(self, node: dict) -> bool:
        if node.get("clickable", False):
            return True
        return self.short_class(node) in self.CLICKABLE_TYPES


def luminance(r: int, g: int, b: int) -> float:
    """Convert RGB to relative luminance per WCAG."""
    def channel(c: float) -> float:
        c = c / 255.0
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)


def contrast_ratio(l1: float, l2: float) -> float:
    lighter = max(l1, l2)
    darker = min(l1, l2)
    return (lighter + 0.05) / (darker + 0.05)


def hex_to_rgb(hex_color: str) -> Optional[tuple]:
    """Parse #RRGGBB to (r, g, b)."""
    if not hex_color or not isinstance(hex_color, str):
        return None
    hex_color = hex_color.lstrip("#")
    if len(hex_color) != 6:
        return None
    try:
        return int(hex_color[0:2], 16), int(hex_color[2:4], 16), int(hex_color[4:6], 16)
    except ValueError:
        return None


def _check_contrast(node: dict, node_id: str, mapper: PlatformMapper, issues: list) -> None:
    """Check text/background color contrast (WCAG AA)."""
    if not mapper.has_colors():
        return
    text_color = mapper.text_color(node)
    bg_color = mapper.bg_color(node)
    if not text_color or not bg_color:
        return
    fg_rgb = hex_to_rgb(text_color)
    bg_rgb = hex_to_rgb(bg_color)
    if not fg_rgb or not bg_rgb:
        return
    l1 = luminance(*fg_rgb)
    l2 = luminance(*bg_rgb)
    ratio = contrast_ratio(l1, l2)
    styles = node.get("styles", {})
    is_large = styles.get("fontSize", "") and any(
        sz in str(styles["fontSize"]) for sz in LARGE_TEXT_SIZES
    )
    min_ratio = CONTRAST_LARGE if is_large else CONTRAST_NORMAL
    if ratio < min_ratio:
        issues.append({
            "nodeId": node_id,
            "check": "contrast",
            "severity": "high",
            "description": f"Text color {text_color} on background {bg_color} has ratio {ratio:.1f}:1, below WCAG AA minimum of {min_ratio}:1",
            "element": {"text": mapper.text(node), "className": node.get("className", "")},
        })


def _check_touch_target(node: dict, node_id: str, mapper: PlatformMapper, issues: list) -> None:
    """Check touch target size (WCAG 2.5.5, min 48dp)."""
    if not mapper.is_clickable(node):
        return
    bounds = node.get("bounds", {})
    if not bounds:
        return
    width = bounds.get("width", 0)
    height = bounds.get("height", 0)
    if width > 0 and height > 0 and (width < MIN_TOUCH_TARGET or height < MIN_TOUCH_TARGET):
        issues.append({
            "nodeId": node_id,
            "check": "touch_target",
            "severity": "medium",
            "description": f"Touch target {width}dp x {height}dp is below WCAG minimum of {MIN_TOUCH_TARGET}dp x {MIN_TOUCH_TARGET}dp",
            "element": {
                "contentDesc": mapper.content_desc(node),
                "text": mapper.text(node),
                "className": node.get("className", ""),
            },
        })


def _check_missing_label(node: dict, node_id: str, mapper: PlatformMapper, issues: list) -> None:
    """Check clickable elements without accessible labels."""
    if not mapper.is_clickable(node):
        return
    text = mapper.text(node).strip()
    content_desc = mapper.content_desc(node).strip()
    if not text and not content_desc:
        short_class = mapper.short_class(node)
        issues.append({
            "nodeId": node_id,
            "check": "missing_label",
            "severity": "high",
            "description": f"Interactive element ({short_class}) has no text or content-desc for screen readers",
            "element": {
                "className": node.get("className", ""),
                "resourceId": node.get("resourceId", ""),
            },
        })


def _check_duplicate_text(text: str, node_id: str, siblings: list, mapper: PlatformMapper, issues: list) -> None:
    """Check for duplicate text among sibling elements."""
    if not text:
        return
    dup_count = sum(
        1 for s in siblings
        if mapper.text(s).strip() == text.strip() and s.get("id") != node_id
    )
    if dup_count > 0:
        issues.append({
            "nodeId": node_id,
            "check": "duplicate_text",
            "severity": "low",
            "description": f"Text '{text}' appears {dup_count + 1} times among siblings -- screen readers may confuse users",
            "element": {"text": text, "className": node.get("className", "")},
        })


def _check_text_overflow(node_id: str, bounds: dict, parent_bounds: dict, text: str, node: dict, issues: list) -> None:
    """Check if element bounds exceed parent bounds."""
    if not text or not bounds or not parent_bounds:
        return
    if (bounds.get("x", 0) < parent_bounds.get("x", 0) or
        bounds.get("y", 0) < parent_bounds.get("y", 0) or
        bounds.get("x", 0) + bounds.get("width", 0) > parent_bounds.get("x", 0) + parent_bounds.get("width", 0) or
        bounds.get("y", 0) + bounds.get("height", 0) > parent_bounds.get("y", 0) + parent_bounds.get("height", 0)):
        issues.append({
            "nodeId": node_id,
            "check": "text_overflow",
            "severity": "medium",
            "description": "Text element bounds exceed parent bounds",
            "element": {"text": text[:30], "className": node.get("className", "")},
        })


def walk_and_audit(tree: dict, mapper: PlatformMapper) -> tuple[list, int]:
    """Walk the hierarchy tree and run all applicable WCAG checks.

    Args:
        tree: The root node of the UI hierarchy.
        mapper: Platform-specific property mapper.

    Returns:
        Tuple of (issues list, total node count).
    """
    issues: list = []
    total_nodes = 0

    def walk_node(node: dict, siblings: list = None, parent_bounds: dict = None):
        nonlocal issues, total_nodes
        total_nodes += 1

        node_id = node.get("id", "")
        text = mapper.text(node).strip()
        bounds = node.get("bounds", {})

        _check_contrast(node, node_id, mapper, issues)
        _check_touch_target(node, node_id, mapper, issues)
        _check_missing_label(node, node_id, mapper, issues)
        if siblings:
            _check_duplicate_text(text, node_id, siblings, mapper, issues)
        _check_text_overflow(node_id, bounds, parent_bounds, text, node, issues)

        children = node.get("children", [])
        for child in children:
            walk_node(child, siblings=children, parent_bounds=bounds)

    walk_node(tree)
    return issues, total_nodes


def build_audit_result(issues: list, total_nodes: int) -> dict:
    """Build the final audit result with timestamp and summary."""
    severity_order = {"high": 0, "medium": 1, "low": 2}
    sorted_issues = sorted(issues, key=lambda i: severity_order.get(i["severity"], 3))
    summary = {
        "high": sum(1 for i in issues if i["severity"] == "high"),
        "medium": sum(1 for i in issues if i["severity"] == "medium"),
        "low": sum(1 for i in issues if i["severity"] == "low"),
    }
    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "totalNodes": total_nodes,
        "issues": sorted_issues,
        "summary": summary,
    }