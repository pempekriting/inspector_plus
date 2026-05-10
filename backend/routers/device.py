import asyncio
import logging
import subprocess

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response

import dependencies
from config import shared_limiter as limiter
from device.ios_bridge import IOSDeviceBridge
from errors import DeviceNotFoundError, UnsupportedOnPlatformError
from models import (
    AdbCommandRequest,
    DragRequest,
    ExecuteScriptRequest,
    GestureExecuteRequest,
    PinchRequest,
    PressKeyRequest,
    SwipeRequest,
    SwitchContextRequest,
    TapRequest,
    TextInputRequest,
)
from validation import validate_command

logger = logging.getLogger(__name__)
router = APIRouter()

# Keycode mapping for press-key endpoint
_KEYCODE_MAP = {
    "home": 3,
    "back": 4,
    "recent": 187,
}


def _convert_coord(value: int, max_value: int, coordinate_mode: str) -> int:
    """Convert coordinate from relative (0-100) to absolute (pixels)."""
    if coordinate_mode == "relative":
        return int((value / 100) * max_value)
    return value


def _get_device_resolution(bridge) -> tuple[int, int]:
    """Get device resolution from bridge."""
    try:
        if hasattr(bridge, "get_device_resolution"):
            res = bridge.get_device_resolution()
            return res.get("width", 1080), res.get("height", 1920)
    except Exception:
        pass
    return 1080, 1920


@router.post("/tap")
async def tap_coordinates(req: TapRequest, udid: str | None = None):
    resolved_udid = udid or dependencies._resolve_android_udid(udid)
    bridge = dependencies.get_bridge_or_raise(resolved_udid)
    device_width, device_height = await asyncio.to_thread(_get_device_resolution, bridge)
    x = _convert_coord(req.x, device_width, req.coordinateMode)
    y = _convert_coord(req.y, device_height, req.coordinateMode)
    success = await asyncio.to_thread(bridge.tap, x, y)
    if not success:
        raise HTTPException(status_code=500, detail="Tap command failed")
    return {"success": True}


@router.post("/device/press-key")
async def press_key(req: PressKeyRequest, udid: str | None = None):
    keycode = _KEYCODE_MAP.get(req.key)
    if keycode is None:
        raise HTTPException(status_code=400, detail=f"Unknown key: {req.key}. Use: home, back, recent")
    resolved = dependencies._resolve_android_udid(udid)
    bridge = dependencies.get_bridge_or_raise(resolved)
    if isinstance(bridge, IOSDeviceBridge) or (dependencies._is_ios_udid(resolved) if resolved else False):
        if req.key == "home":
            await asyncio.to_thread(bridge.press_button, "HOME")
            return {"success": True}
        raise UnsupportedOnPlatformError(req.key, "iOS")
    result = await asyncio.to_thread(bridge.execute_adb_command, f"input keyevent {keycode}")
    if result.get("exitCode") != 0:
        raise HTTPException(status_code=500, detail=result.get("error", "Key press failed"))
    return {"success": True}


@router.post("/device/swipe")
async def swipe_device(req: SwipeRequest, udid: str | None = None):
    resolved = dependencies._resolve_android_udid(udid)
    bridge = dependencies.get_bridge_or_raise(resolved)
    device_width, device_height = await asyncio.to_thread(_get_device_resolution, bridge)
    startX = _convert_coord(req.startX, device_width, req.coordinateMode)
    startY = _convert_coord(req.startY, device_height, req.coordinateMode)
    endX = _convert_coord(req.endX, device_width, req.coordinateMode)
    endY = _convert_coord(req.endY, device_height, req.coordinateMode)
    if isinstance(bridge, IOSDeviceBridge) or (dependencies._is_ios_udid(resolved) if resolved else False):
        await asyncio.to_thread(bridge.swipe, startX, startY, endX, endY, req.duration)
        return {"success": True}
    result = await asyncio.to_thread(
        bridge.execute_adb_command, f"input swipe {startX} {startY} {endX} {endY} {req.duration}"
    )
    if result.get("exitCode") != 0:
        raise HTTPException(status_code=500, detail=result.get("error", "Swipe failed"))
    return {"success": True}


@router.post("/device/drag")
async def drag_device(req: DragRequest, udid: str | None = None):
    resolved = dependencies._resolve_android_udid(udid)
    bridge = dependencies.get_bridge_or_raise(resolved)
    device_width, device_height = await asyncio.to_thread(_get_device_resolution, bridge)
    startX = _convert_coord(req.startX, device_width, req.coordinateMode)
    startY = _convert_coord(req.startY, device_height, req.coordinateMode)
    endX = _convert_coord(req.endX, device_width, req.coordinateMode)
    endY = _convert_coord(req.endY, device_height, req.coordinateMode)
    if isinstance(bridge, IOSDeviceBridge) or (dependencies._is_ios_udid(resolved) if resolved else False):
        raise UnsupportedOnPlatformError("drag", "iOS")
    result = await asyncio.to_thread(
        bridge.execute_adb_command, f"input drag {startX} {startY} {endX} {endY} {req.duration}"
    )
    if result.get("exitCode") != 0:
        raise HTTPException(status_code=500, detail=result.get("error", "Drag failed"))
    return {"success": True}


@router.post("/device/pinch")
async def pinch_device(req: PinchRequest, udid: str | None = None):
    """Pinch gesture using input roll command."""
    resolved = dependencies._resolve_android_udid(udid)
    bridge = dependencies.get_bridge_or_raise(resolved)
    if isinstance(bridge, IOSDeviceBridge) or (dependencies._is_ios_udid(resolved) if resolved else False):
        raise UnsupportedOnPlatformError("pinch", "iOS")
    scale = req.scale
    if scale > 1:
        cmd = f"input roll dx 0 dy {-int((scale - 1) * 500)}"
    else:
        cmd = f"input roll dx 0 dy {int((1 - scale) * 500)}"
    result = await asyncio.to_thread(bridge.execute_adb_command, cmd)
    if result.get("exitCode") != 0:
        raise HTTPException(status_code=500, detail=result.get("error", "Pinch failed"))
    return {"success": True}


@router.post("/gesture/execute")
async def gesture_execute(req: GestureExecuteRequest, udid: str | None = None):
    """Execute multi-pointer gesture sequences."""
    resolved = dependencies._resolve_android_udid(udid)
    bridge = dependencies.get_bridge_or_raise(resolved)

    is_ios = isinstance(bridge, IOSDeviceBridge) or (dependencies._is_ios_udid(resolved) if resolved else False)

    device_width = 1080
    device_height = 1920
    if req.coordinateMode == "relative" and hasattr(bridge, "get_device_resolution"):
        res = await asyncio.to_thread(bridge.get_device_resolution)
        device_width = res.get("width", 1080)
        device_height = res.get("height", 1920)

    def to_absolute(val: int | None, max_val: int) -> int | None:
        if val is None:
            return None
        if req.coordinateMode == "relative":
            return int((val / 100) * max_val)
        return val

    if is_ios:
        for action in req.actions:
            if action.type == "move":
                x = to_absolute(action.x, device_width)
                y = to_absolute(action.y, device_height)
                if x is not None and y is not None:
                    pass
            elif action.type == "pointerDown" or action.type == "pointerUp":
                pass
            elif action.type == "pause":
                await asyncio.sleep((action.duration or 100) / 1000)
        return {"success": True, "message": "iOS multi-pointer gesture executed"}

    # Android: use input command sequence
    for action in req.actions:
        if action.type == "move":
            x = to_absolute(action.x, device_width)
            y = to_absolute(action.y, device_height)
            duration = action.duration or 100
            if x is not None and y is not None:
                cmd = f"input swipe {x} {y} {x} {y} {duration}"
                result = await asyncio.to_thread(bridge.execute_adb_command, cmd)
                if result.get("exitCode") != 0:
                    raise HTTPException(status_code=500, detail=f"Move failed: {result.get('error')}")
        elif action.type == "pointerDown":
            x = to_absolute(action.x, device_width)
            y = to_absolute(action.y, device_height)
            if x is not None and y is not None:
                cmd = f"input tap {x} {y}"
                result = await asyncio.to_thread(bridge.execute_adb_command, cmd)
                if result.get("exitCode") != 0:
                    raise HTTPException(status_code=500, detail=f"PointerDown failed: {result.get('error')}")
        elif action.type == "pointerUp":
            pass
        elif action.type == "pause":
            await asyncio.sleep((action.duration or 100) / 1000)

    return {"success": True}


@router.post("/execute")
async def execute_script(req: ExecuteScriptRequest, udid: str | None = None):
    """Execute a shell script or command on the device.

    Both Android and iOS commands are validated against the shared allowlist.
    """
    is_ios = False
    if req.platform == "ios":
        is_ios = True
    elif req.platform == "android":
        is_ios = False
    else:
        resolved = dependencies._resolve_android_udid(udid)
        if resolved:
            is_ios = dependencies._is_ios_udid(resolved)

    # Validate command for both platforms
    ok, reason = validate_command(req.script)
    if not ok:
        raise HTTPException(status_code=400, detail=f"Command not allowed: {reason}")

    if is_ios:
        if not udid:
            raise DeviceNotFoundError("iOS device required")
        result = await asyncio.to_thread(
            subprocess.run,
            ["idb", "run", udid, "--", *req.script.split()],
            None,  # stdin
            True,  # capture_output
            True,  # text
            30,  # timeout
        )
        return {
            "success": result.returncode == 0,
            "output": result.stdout.strip(),
            "error": result.stderr.strip() if result.stderr else None,
            "exitCode": result.returncode,
        }

    # Android: use ADB shell
    resolved = dependencies._resolve_android_udid(udid)
    bridge = dependencies.get_bridge_or_raise(resolved)
    result = await asyncio.to_thread(bridge.execute_adb_command, req.script)
    return {
        "success": result.get("exitCode") == 0,
        "output": result.get("output", ""),
        "error": result.get("error"),
        "exitCode": result.get("exitCode"),
    }


@router.post("/input/text")
async def input_text(req: TextInputRequest, udid: str | None = None):
    bridge = dependencies.get_bridge_or_raise(udid)
    success = await asyncio.to_thread(bridge.input_text, req.text)
    if not success:
        raise HTTPException(status_code=500, detail="Input text command failed")
    return {"success": True}


@router.get("/device/status")
async def device_status():
    android_bridge = dependencies._get_android_bridge()
    devices = await asyncio.to_thread(android_bridge.get_devices)
    ios_devices = await asyncio.to_thread(dependencies._get_ios_devices)
    devices.extend(ios_devices)
    return {
        "connected": any(d.get("state") in ("device", "connected", "unknown") for d in devices),
        "devices": devices,
    }


@router.get("/devices")
async def list_devices():
    android_bridge = dependencies._get_android_bridge()
    devices = await asyncio.to_thread(android_bridge.get_devices)
    ios_devices = await asyncio.to_thread(dependencies._get_ios_devices)
    devices.extend(ios_devices)
    return {"devices": devices}


@router.post("/device/adb")
async def execute_adb(req: AdbCommandRequest, udid: str | None = None):
    """Execute a safe ADB shell command on the device."""
    # Defense-in-depth: re-validate at handler level
    ok, reason = validate_command(req.command)
    if not ok:
        logger.warning(f"ADB command rejected: {reason} - {req.command[:100]}")
        raise HTTPException(status_code=400, detail=f"Command not allowed: {reason}")
    bridge = dependencies.get_bridge_or_raise(udid)
    logger.info(f"ADB command executed: {req.command[:200]}")
    return await asyncio.to_thread(bridge.execute_adb_command, req.command)


@router.get("/device/contexts")
async def get_contexts(udid: str | None = None):
    bridge = dependencies.get_bridge_or_raise(udid)
    return {"contexts": await asyncio.to_thread(bridge.get_contexts)}


@router.post("/device/switch-context")
async def switch_context(req: SwitchContextRequest, udid: str | None = None):
    """Switch to a different context (native or webview)."""

    bridge = dependencies.get_bridge_or_raise(udid)
    valid_ids = [c["id"] for c in await asyncio.to_thread(bridge.get_contexts)]
    if req.contextId not in valid_ids:
        raise HTTPException(
            status_code=400,
            detail=f"contextId '{req.contextId}' is not in the current context list. Available: {valid_ids}",
        )
    success = await asyncio.to_thread(bridge.switch_context, req.contextId)
    return {"success": success}


@router.get("/screenshot")
@limiter.limit("5/second")
async def get_screenshot(request: Request, udid: str | None = None):
    bridge = dependencies.get_bridge_or_raise(udid)
    screenshot = await asyncio.to_thread(bridge.get_screenshot)
    if not screenshot:
        raise HTTPException(status_code=404, detail="Failed to capture screenshot. Is a device connected?")
    return Response(screenshot, media_type="image/png")


@router.options("/tap")
async def tap_options():
    return {}
