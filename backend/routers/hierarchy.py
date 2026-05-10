import asyncio
import logging
import re
import subprocess

from fastapi import APIRouter, HTTPException, Request

import dependencies
from config import shared_limiter as limiter
from errors import HierarchyNotFoundError

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/hierarchy")
@limiter.limit("5/second")
async def get_hierarchy(request: Request, udid: str | None = None):
    bridge = dependencies.get_bridge_or_raise(udid)
    try:
        hierarchy = await asyncio.to_thread(bridge.get_hierarchy)
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="Device command timed out. Is the device responsive?")
    if not hierarchy or hierarchy.get("error"):
        raise HierarchyNotFoundError(hierarchy.get("error") if hierarchy else None)
    return hierarchy


@router.get("/hierarchy-and-screenshot")
@limiter.limit("5/second")
async def get_hierarchy_and_screenshot(request: Request, udid: str | None = None):
    """Combined endpoint: fetch hierarchy + screenshot in single ADB call."""
    import base64

    bridge = dependencies.get_bridge_or_raise(udid)
    try:
        tree, screenshot_bytes = await asyncio.to_thread(bridge.fetch_hierarchy_and_screenshot)
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="Device command timed out. Is the device responsive?")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch hierarchy+screenshot: {e!s}")
    return {
        "hierarchy": tree,
        "screenshot": base64.b64encode(screenshot_bytes).decode(),
    }


@router.get("/hierarchy/search")
async def search_hierarchy(
    query: str,
    filter: str = "xpath",
    udid: str | None = None,
):
    """Search hierarchy using specified filter type."""
    bridge = dependencies.get_bridge_or_raise(udid)
    if len(query) > 500:
        raise HTTPException(status_code=400, detail="Query exceeds 500 character limit")
    try:
        result = await asyncio.to_thread(bridge.search_hierarchy, query, filter)
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="Device command timed out. Is the device responsive?")
    if result.get("error"):
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@router.get("/hierarchy/find")
async def find_hierarchy(
    q: str,
    udid: str | None = None,
    regex: bool = False,
):
    """Search hierarchy tree for nodes matching query."""
    bridge = dependencies.get_bridge_or_raise(udid)
    try:
        hierarchy = await asyncio.to_thread(bridge.get_hierarchy)
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="Device command timed out. Is the device responsive?")
    if not hierarchy or hierarchy.get("error"):
        raise HierarchyNotFoundError(hierarchy.get("error") if hierarchy else None)

    tree = hierarchy.get("tree") or hierarchy
    results = []

    def matches_node(node: dict, search_term: str, use_regex: bool) -> tuple[bool, str, str]:
        fields = [
            ("text", node.get("text", "")),
            ("content_desc", node.get("contentDesc", "") or node.get("content-desc", "")),
            ("resource_id", node.get("resourceId", "") or node.get("resource-id", "")),
            ("class_name", node.get("className", "") or node.get("class", "")),
        ]
        for field_name, field_value in fields:
            if not field_value:
                continue
            if use_regex:
                try:
                    if re.search(search_term, field_value, re.IGNORECASE):
                        return True, field_name, field_value
                except re.error:
                    pass
            else:
                if search_term.lower() in field_value.lower():
                    return True, field_name, field_value
        return False, "", ""

    def walk(node: dict):
        matched, match_field, matched_text = matches_node(node, q, regex)
        if matched:
            results.append(
                {
                    "nodeId": node.get("id", ""),
                    "matchField": match_field,
                    "matchedText": matched_text[:100] if matched_text else "",
                    "node": node,
                }
            )
        for child in node.get("children") or []:
            walk(child)

    walk(tree)
    return {"results": results, "count": len(results)}


@router.get("/hierarchy/locators")
async def get_locators(nodeId: str, udid: str | None = None):
    """Generate Appium locator strategies for a UI node by its ID."""
    bridge = dependencies.get_bridge_or_raise(udid)
    try:
        hierarchy = await asyncio.to_thread(bridge.get_hierarchy)
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="Device command timed out. Is the device responsive?")
    if not hierarchy or hierarchy.get("error"):
        raise HierarchyNotFoundError(hierarchy.get("error") if hierarchy else None)
    node = bridge._find_node_by_id(hierarchy, nodeId)
    if node is None:
        raise HTTPException(status_code=404, detail=f"Node with id '{nodeId}' not found in hierarchy")
    return bridge.generate_locators(node)


@router.post("/hierarchy/audit")
async def audit_accessibility(udid: str | None = None):
    """Run WCAG accessibility audit against current hierarchy."""
    bridge = dependencies.get_bridge_or_raise(udid)
    try:
        tree = await asyncio.to_thread(bridge.get_hierarchy)
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="Device command timed out. Is the device responsive?")
    if not tree or tree.get("error"):
        raise HierarchyNotFoundError(tree.get("error") if tree else None)
    return bridge.audit_accessibility(tree)
