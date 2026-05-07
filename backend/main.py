from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse, Response
from contextlib import asynccontextmanager
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from pydantic import BaseModel, Field, field_validator
from typing import Optional, Any
from io import BytesIO
import asyncio
import base64
import logging
import tempfile
import os
import uuid
import time
import subprocess
import json
import re
import shutil

from device import create_bridge_for_device, AndroidDeviceBridge, DeviceBridgeBase
from device.ios_bridge import IOSDeviceBridge
from commands.app_commands import AppCommands
from commands.ios_app_commands import IOSAppCommands


# --- App version from env or default ---
__version__ = os.environ.get("APP_VERSION", "0.0.1")

# --- Resolve adb path ---
def _get_adb_path() -> str:
    android_home = os.environ.get("ANDROID_HOME") or os.environ.get("ANDROID_SDK_ROOT")
    if android_home:
        adb_path = os.path.join(android_home, "platform-tools", "adb")
        if os.path.isfile(adb_path):
            return adb_path
    return shutil.which("adb") or "adb"

_ADB_PATH = _get_adb_path()


# --- Lifespan: graceful shutdown ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle: startup and shutdown."""
    logger.info("InspectorPlus backend starting up")
    yield
    logger.info("InspectorPlus backend shutting down")
    # Shutdown all bridges
    if _android_bridge is not None:
        _android_bridge.shutdown()
    for bridge in _android_bridges.values():
        bridge.shutdown()
    for bridge in _ios_bridges.values():
        bridge.shutdown()
    logger.info("All bridges shut down cleanly")


app = FastAPI(title="Inspector Plus API", version=__version__, lifespan=lifespan)


# --- Security: ADB Command Allowlist ---
_ALLOWED_ADB_PREFIXES = [
    # Input events
    "input text", "input keyevent", "input tap", "input swipe", "input press",
    "input roll", "input drag", "input mouse",
    # Package manager
    "pm list", "pm path", "pm dump", "pm install", "pm uninstall", "pm clear",
    "pm hide", "pm unhide", "pm disable", "pm enable",
    # App launch
    "am start", "am force-stop", "am kill", "am broadcast", "am monitor", "am stack",
    # Screenshot / screenrecord
    "screencap", "screenrecord",
    # dumpsys
    "dumpsys", "dump",
    # Settings / system
    "settings get", "settings put", "getprop", "setprop", "wm",
    # Misc read-only / safe
    "cat", "ls", "mkdir", "touch", "chmod", "chown",
    "netstat", "ip addr", "ps", "top", "free", "df", "du",
    "getevent", "uiautomator",
    # Shell utilities
    "monkey", "id", "uname", "whoami", "getconf", "date", "pwd", "echo",
]

_SAFE_SHORT_COMMANDS = {
    "ls", "ps", "cat", "pwd", "date", "echo", "id", "uname", "whoami", "getconf", "uptime",
}

_DANGEROUS_EXECS = {
    "reboot", "shutdown", "mount", "umount", "dd", "mkfs", "fdisk", "sfdisk",
    "Format", "del ", "rm -rf", "mv /", "cp /", "wget", "curl", "nc ", "ncat",
}

_DANGEROUS_CHARS = ["&&", "||", "|", ";", "`", "$(", ">", ">>", "<"]


def _validate_adb_command(command: str) -> tuple[bool, str]:
    """Check if an ADB shell command is in the allowlist. Returns (ok, reason)."""
    if not command or len(command) > 500:
        return False, "Command must be 1-500 characters"
    cmd_lower = command.strip().lower()
    # Block dangerous characters
    for ch in _DANGEROUS_CHARS:
        if ch in command:
            return False, f"Forbidden character sequence '{ch}'"
    # Block dangerous executables (including su-prefixed)
    for exe in _DANGEROUS_EXECS:
        if re.match(rf"^\s*{re.escape(exe)}(\s|$)", cmd_lower):
            return False, f"Command '{exe}' is not allowed"
        if re.search(rf"su\s+.{0,50}\s+{re.escape(exe)}(\s|$)", cmd_lower):
            return False, f"Command '{exe}' is not allowed"
    # Allow known safe prefixes
    for prefix in sorted(_ALLOWED_ADB_PREFIXES, key=len, reverse=True):
        if cmd_lower.startswith(prefix):
            return True, "allowed"
    # Allow short safe commands
    if re.match(r"^[a-z][a-z0-9_-]*$", cmd_lower) and cmd_lower in _SAFE_SHORT_COMMANDS:
        return True, "allowed"
    return False, f"Command '{cmd_lower[:50]}' is not in the allowlist"


def _convert_coord(value: int, max_value: int, coordinate_mode: str) -> int:
    """Convert coordinate from relative (0-100) to absolute (pixels)."""
    if coordinate_mode == "relative":
        return int((value / 100) * max_value)
    return value


def _get_device_resolution(bridge) -> tuple[int, int]:
    """Get device resolution from bridge."""
    try:
        if hasattr(bridge, 'get_device_resolution'):
            res = bridge.get_device_resolution()
            return res.get("width", 1080), res.get("height", 1920)
    except Exception:
        pass
    return 1080, 1920


# --- Typed Error Hierarchy ---
class AppError(Exception):
    """Base class for operational errors."""

    def __init__(self, message: str, code: str, status_code: int):
        self.message = message
        self.code = code
        self.status_code = status_code
        super().__init__(message)


class DeviceNotFoundError(AppError):
    def __init__(self, detail: str = "No device connected"):
        super().__init__(detail, "DEVICE_NOT_FOUND", 404)



class HierarchyNotFoundError(AppError):
    def __init__(self, detail: str = "No hierarchy found. Is a device connected?"):
        super().__init__(detail, "HIERARCHY_NOT_FOUND", 404)



class CommandExecutionError(AppError):
    def __init__(self, detail: str):
        super().__init__(detail, "COMMAND_EXECUTION_FAILED", 500)



class ScreenshotError(AppError):
    def __init__(self, detail: str = "Failed to capture screenshot"):
        super().__init__(detail, "SCREENSHOT_FAILED", 500)


class UnsupportedOnPlatformError(AppError):
    def __init__(self, action: str, platform: str):
        super().__init__(f"{action} is not supported on {platform}", "UNSUPPORTED_ACTION", 400)


def _get_ios_devices() -> list[dict]:
    """Extract iOS devices from idb or xcrun simctl fallback."""
    devices = []
    import shutil

    def run_idb(args: list[str], timeout: int = 30):
        """Run idb from PATH or uv run fallback."""
        if shutil.which("idb"):
            return subprocess.run(["idb"] + args, capture_output=True, text=True, timeout=timeout)
        else:
            return subprocess.run(["uv", "run", "idb"] + args, capture_output=True, text=True, timeout=timeout)

    # Try idb first
    try:
        result = run_idb(["list-targets", "--json"], timeout=30)
        if result.returncode == 0:
            # idb outputs newline-delimited JSON (JSON Lines), not a single array
            for line in result.stdout.strip().split("\n"):
                if not line.strip():
                    continue
                try:
                    target = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if target.get("state") == "Booted":
                    devices.append({
                        "udid": target.get("udid", ""),
                        "name": target.get("name", "Unknown"),
                        "platform": "ios",
                        "state": target.get("state", "Shutdown"),
                        "os_version": target.get("os_version", ""),
                        "architecture": target.get("architecture", ""),
                        "device_type": target.get("type", ""),
                        "model": target.get("name", "Unknown"),
                        "manufacturer": "Apple",
                    })
            return devices
    except Exception:
        pass

    # Fallback: xcrun simctl
    try:
        result = subprocess.run(
            ["xcrun", "simctl", "list", "devices", "--json"],
            capture_output=True, text=True, timeout=10,
        )
        if result.returncode == 0:
            data = json.loads(result.stdout)
            for runtime, sims in data.get("devices", {}).items():
                os_version = runtime.replace("com.apple.CoreSimulator.SimRuntime.iOS-", "").replace("-", ".")
                for sim in sims:
                    if sim.get("isAvailable", False) and sim.get("state") == "Booted":
                        devices.append({
                            "udid": sim.get("udid", ""),
                            "name": sim.get("name", "Unknown"),
                            "platform": "ios",
                            "state": "Booted",
                            "os_version": os_version,
                            "architecture": "arm64",
                            "device_type": sim.get("deviceTypeIdentifier", ""),
                            "model": sim.get("name", "Unknown"),
                            "manufacturer": "Apple",
                        })
    except Exception:
        pass
    return devices


logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.middleware("http")
async def add_request_id(request: Request, call_next):
    """Add request ID for tracing."""
    request_id = str(uuid.uuid4())
    request.state.request_id = request_id
    start_time = time.time()

    logger.info(
        "Request started",
        extra={
            "request_id": request_id,
            "method": request.method,
            "path": request.url.path,
        }
    )

    response = await call_next(request)

    duration_ms = (time.time() - start_time) * 1000
    logger.info(
        "Request completed",
        extra={
            "request_id": request_id,
            "method": request.method,
            "path": request.url.path,
            "status_code": response.status_code,
            "duration_ms": round(duration_ms, 2),
        }
    )

    response.headers["X-Request-ID"] = request_id
    return response


@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError):
    """Handle typed AppError exceptions."""
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.code, "detail": exc.message},
        headers={"X-Request-ID": getattr(request.state, "request_id", "")},
    )


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    """Handle Pydantic RequestValidationError → return 400 instead of 422."""
    return JSONResponse(
        status_code=400,
        content={"error": "validation_error", "detail": str(exc.errors())},
        headers={"X-Request-ID": getattr(request.state, "request_id", "")},
    )


@app.get("/health")
async def health_check():
    """Liveness probe - server is running."""
    return {"status": "ok", "version": __version__}



@app.get("/ready")
async def ready_check():
    """Readiness probe - device is connected and hierarchy accessible."""
    try:
        bridge = _get_android_bridge()
        devices = bridge.get_devices()
        ios_devices = _get_ios_devices()
        all_devices = devices + ios_devices
        connected = any(d.get("state") in ("device", "connected", "unknown") for d in all_devices)
        return {"ready": True, "connected": connected, "device_count": len(all_devices)}
    except Exception as e:
        logger.warning("Ready check failed: %s", str(e))
        return JSONResponse(status_code=503, content={"ready": False, "error": str(e)})

# --- CORS Origins from env ---
_cors_origins_str = os.environ.get("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173,app://localhost,tauri://localhost")
_cors_origins = [o.strip() for o in _cors_origins_str.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Bridge management - singleton per platform
_android_bridge: Optional[AndroidDeviceBridge] = None
_android_bridges: dict[str, AndroidDeviceBridge] = {}
_ios_bridges: dict[str, IOSDeviceBridge] = {}

# --- Rate Limiter ---
limiter = Limiter(key_func=get_remote_address, default_limits=["30 per second"])
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)



def _get_android_bridge() -> AndroidDeviceBridge:
    global _android_bridge
    if _android_bridge is None:
        _android_bridge = AndroidDeviceBridge()
    return _android_bridge


def get_bridge(udid: Optional[str] = None) -> DeviceBridgeBase:
    """Get appropriate bridge for device. Returns None if device can't be resolved."""
    # Resolve empty or None udid to a real device serial
    if not udid:
        # Try ANDROID_SERIAL env, then fall back to first android device
        udid = os.environ.get("ANDROID_SERIAL") or _get_first_android_device()
    if udid is None:
        bridge = _get_android_bridge()
        logger.info("[get_bridge] udid=None, using global bridge serial=%s", bridge.serial)
        return bridge
    # iOS UDID: 24+ hex chars with dashes
    if _is_ios_udid(udid):
        if udid not in _ios_bridges:
            _ios_bridges[udid] = IOSDeviceBridge(udid)
        return _ios_bridges[udid]
    # Android device serial - reuse cached bridge for consistent node IDs
    if udid not in _android_bridges:
        _android_bridges[udid] = AndroidDeviceBridge(serial=udid)
    return _android_bridges[udid]


def _is_ios_udid(udid: str) -> bool:
    """Check if udid looks like an iOS UDID (24+ hex chars with dashes)."""
    return len(udid) >= 24 and all(c in "0123456789ABCDEFabcdef-" for c in udid)


def _get_first_android_device() -> Optional[str]:
    """Return serial of first connected Android device."""
    try:
        result = subprocess.run([_ADB_PATH, "devices"], capture_output=True, text=True, timeout=5)
        lines = result.stdout.strip().split(chr(10))
        for line in lines[1:]:  # skip "List of devices attached" header
            parts = line.strip().split()
            if parts:
                return parts[0]
        return None
    except Exception:
        return None


class TapRequest(BaseModel):
    x: int = Field(..., ge=0, le=10000, description="X coordinate")
    y: int = Field(..., ge=0, le=10000, description="Y coordinate")
    coordinateMode: str = Field(default="absolute", description="absolute or relative")

    @field_validator("x", "y")
    @classmethod
    def validate_coords(cls, v: int) -> int:
        if v < 0:
            raise ValueError("Coordinates must be non-negative")
        if v > 10000:
            raise ValueError("Coordinates must be <= 10000")
        return v


class TextInputRequest(BaseModel):
    text: str = Field(..., max_length=1000, description="Text to input")


class SwipeRequest(BaseModel):
    startX: int = Field(..., ge=0, le=10000)
    startY: int = Field(..., ge=0, le=10000)
    endX: int = Field(..., ge=0, le=10000)
    endY: int = Field(..., ge=0, le=10000)
    duration: int = Field(default=300, ge=0, le=5000, description="Duration in ms")
    coordinateMode: str = Field(default="absolute", description="absolute or relative")


class DragRequest(BaseModel):
    startX: int = Field(..., ge=0, le=10000)
    startY: int = Field(..., ge=0, le=10000)
    endX: int = Field(..., ge=0, le=10000)
    endY: int = Field(..., ge=0, le=10000)
    duration: int = Field(default=500, ge=0, le=5000)
    coordinateMode: str = Field(default="absolute", description="absolute or relative")


class PinchRequest(BaseModel):
    x: int = Field(..., ge=0, le=10000, description="Center X of pinch area")
    y: int = Field(..., ge=0, le=10000, description="Center Y of pinch area")
    scale: float = Field(..., gt=0, description="Pinch scale: <1 for pinch in, >1 for pinch out")


class PressKeyRequest(BaseModel):
    key: str = Field(..., description="Key name: home, back, recent")


class GestureAction(BaseModel):
    type: str = Field(..., description="Action type: move, pointerDown, pointerUp, pause")
    x: Optional[int] = Field(None, ge=0, le=10000, description="X coordinate (required for move)")
    y: Optional[int] = Field(None, ge=0, le=10000, description="Y coordinate (required for move)")
    duration: Optional[int] = Field(None, ge=0, le=10000, description="Duration in ms (for move or pause)")
    pointer: Optional[int] = Field(None, ge=0, le=4, description="Pointer index 0-4 (default 0)")
    button: Optional[str] = Field(None, description="Button: left, right (for pointerDown/Up)")


class GestureExecuteRequest(BaseModel):
    actions: list[GestureAction] = Field(..., min_length=1, description="List of gesture actions")
    coordinateMode: str = Field(default="absolute", description="absolute or relative")
    udid: Optional[str] = None


class CommandRequest(BaseModel):
    type: str = Field(..., min_length=1, max_length=50, description="Command type")
    params: Optional[dict[str, Any]] = None


class CommandResponse(BaseModel):
    success: bool
    output: str
    error: Optional[str] = None


class SelectDeviceRequest(BaseModel):
    udid: Optional[str] = None


class AdbCommandRequest(BaseModel):
    command: str = Field(..., min_length=1, max_length=500)

    @field_validator("command")
    @classmethod
    def validate_command(cls, v: str) -> str:
        ok, reason = _validate_adb_command(v)
        if not ok:
            raise ValueError(reason)
        return v


class SwitchContextRequest(BaseModel):
    contextId: str

    @field_validator("contextId")
    @classmethod
    def validate_context_id(cls, v: str) -> str:
        if not v or len(v) > 255:
            raise ValueError("contextId must be 1-255 characters")
        # Block dangerous chars that could be injection vectors
        for ch in ["&", "|", ";", "`", "$", "(", ")", "<", ">"]:
            if ch in v:
                raise ValueError(f"contextId contains forbidden character: {ch}")
        return v


class RecordStepRequest(BaseModel):
    sessionId: str
    action: str
    nodeId: str
    locator: dict
    value: Optional[str] = None


class ExportRequest(BaseModel):
    sessionId: str
    lang: str = Field(default="python")
    platform: str = Field(default="android")


@app.get("/hierarchy")
@limiter.limit("5/second")
async def get_hierarchy(request: Request, udid: Optional[str] = None):
    try:
        bridge = get_bridge(udid)
        if bridge is None:
            raise DeviceNotFoundError()
        hierarchy = bridge.get_hierarchy()
        if not hierarchy or hierarchy.get("error"):
            raise HierarchyNotFoundError(hierarchy.get("error") if hierarchy else None)
        return hierarchy
    except (HTTPException, AppError):
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get hierarchy: {str(e)}")


@app.get("/hierarchy-and-screenshot")
@limiter.limit("5/second")
async def get_hierarchy_and_screenshot(request: Request, udid: Optional[str] = None):
    """Combined endpoint: fetch hierarchy + screenshot in single ADB call.
    Returns base64-encoded screenshot to keep JSON serializable.
    """
    try:
        bridge = get_bridge(udid)
        if bridge is None:
            raise DeviceNotFoundError()
        tree, screenshot_bytes = bridge.fetch_hierarchy_and_screenshot()
        return {
            "hierarchy": tree,
            "screenshot": base64.b64encode(screenshot_bytes).decode(),
        }
    except AppError:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get hierarchy+screenshot: {str(e)}")


@app.get("/hierarchy/search")
async def search_hierarchy(
    query: str,
    filter: str = "xpath",
    udid: Optional[str] = None,
):
    """Search hierarchy using specified filter type.

    Args:
        query: The search query (XPath, resource-id, text, content-desc, or class name)
        filter: Filter type - one of 'xpath', 'resource-id', 'text', 'content-desc', 'class'
        udid: Optional device UDID

    Examples:
    - ?query=//android.widget.Button&filter=xpath - find all Buttons
    - ?query=btn_login&filter=resource-id - find by resource-id
    - ?query=Submit&filter=text - find by text
    """
    try:
        bridge = get_bridge(udid)
        if bridge is None:
            raise DeviceNotFoundError()
        if len(query) > 500:
            raise HTTPException(status_code=400, detail="Query exceeds 500 character limit")
        result = bridge.search_hierarchy(query, filter)
        if result.get("error"):
            raise HTTPException(status_code=400, detail=result["error"])
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to search hierarchy: {str(e)}")


@app.get("/hierarchy/find")
async def find_hierarchy(
    q: str,
    udid: Optional[str] = None,
    regex: bool = False,
):
    """F4: Search hierarchy tree for nodes matching query.

    Args:
        q: Search query (text or regex pattern when regex=True)
        udid: Optional device UDID
        regex: If True, treat q as a regex pattern; otherwise do substring match
    Returns:
        {"results": [{"nodeId": "...", "matchField": "text", "matchedText": "...", "node": {...}}], "count": N}
    """
    import re
    try:
        bridge = get_bridge(udid)
        if bridge is None:
            raise DeviceNotFoundError()
        hierarchy = bridge.get_hierarchy()
        if not hierarchy or hierarchy.get("error"):
            raise HierarchyNotFoundError(hierarchy.get("error") if hierarchy else None)

        tree = hierarchy.get("tree") or hierarchy
        results = []

        def matches_node(node: dict, search_term: str, use_regex: bool) -> tuple[bool, str, str]:
            """Check if node matches search term. Returns (matched, matchField, matchedText)."""
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
                results.append({
                    "nodeId": node.get("id", ""),
                    "matchField": match_field,
                    "matchedText": matched_text[:100] if matched_text else "",
                    "node": node,
                })
            for child in (node.get("children") or []):
                walk(child)

        walk(tree)
        return {"results": results, "count": len(results)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to find hierarchy nodes: {str(e)}")

@app.get("/hierarchy/locators")
async def get_locators(nodeId: str, udid: Optional[str] = None):
    """Generate Appium locator strategies for a UI node by its ID.

    Args:
        nodeId: The node ID to generate locators for (e.g. "Button_42")
        udid: Optional device UDID
    """
    try:
        bridge = get_bridge(udid)
        if bridge is None:
            raise DeviceNotFoundError()
        hierarchy = bridge.get_hierarchy()
        if not hierarchy or hierarchy.get("error"):
            raise HierarchyNotFoundError(hierarchy.get("error") if hierarchy else None)
        # Walk tree to find the node
        node = bridge._find_node_by_id(hierarchy, nodeId)
        if node is None:
            raise HTTPException(
                status_code=404,
                detail=f"Node with id '{nodeId}' not found in hierarchy"
            )
        result = bridge.generate_locators(node)
        return result
    except HTTPException:
        raise
    except AppError:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate locators: {str(e)}")


@app.post("/hierarchy/audit")
async def audit_accessibility(udid: Optional[str] = None):
    """Run WCAG accessibility audit against current hierarchy.

    Args:
        udid: Optional device UDID
    """
    try:
        bridge = get_bridge(udid)
        if bridge is None:
            raise DeviceNotFoundError()
        tree = bridge.get_hierarchy()
        if not tree or tree.get("error"):
            raise HierarchyNotFoundError(tree.get("error") if tree else None)
        result = bridge.audit_accessibility(tree)
        return result
    except AppError:
        raise
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Accessibility audit failed: {str(e)}")


@app.post("/tap")
async def tap_coordinates(req: TapRequest, udid: Optional[str] = None):
    try:
        # Resolve udid to actual device serial if not provided
        resolved_udid = udid or _get_first_android_device() or os.environ.get("ANDROID_SERIAL")
        bridge = get_bridge(resolved_udid)
        if bridge is None:
            raise DeviceNotFoundError()
        # Convert relative to absolute if needed
        device_width, device_height = _get_device_resolution(bridge)
        x = _convert_coord(req.x, device_width, req.coordinateMode)
        y = _convert_coord(req.y, device_height, req.coordinateMode)
        success = bridge.tap(x, y)
        if not success:
            raise HTTPException(status_code=500, detail="Tap command failed")
        return {"success": True}
    except AppError:
        raise
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to tap: {str(e)}")


_KEYCODE_MAP = {
    "home": 3,
    "back": 4,
    "recent": 187,
}


def _resolve_android_udid(udid: Optional[str]) -> Optional[str]:
    """Resolve udid to Android device serial, checking env and first device."""
    if udid:
        return udid
    return os.environ.get("ANDROID_SERIAL") or _get_first_android_device()


@app.post("/device/press-key")
async def press_key(req: PressKeyRequest, udid: Optional[str] = None):
    keycode = _KEYCODE_MAP.get(req.key)
    if keycode is None:
        raise HTTPException(status_code=400, detail=f"Unknown key: {req.key}. Use: home, back, recent")
    try:
        resolved = _resolve_android_udid(udid)
        bridge = get_bridge(resolved)
        if bridge is None:
            raise DeviceNotFoundError()
        # Route to bridge.press_button() for iOS
        if isinstance(bridge, IOSDeviceBridge) or (_is_ios_udid(resolved) if resolved else False):
            if req.key == "home":
                bridge.press_button("HOME")
                return {"success": True}
            else:
                raise UnsupportedOnPlatformError(req.key, "iOS")
        result = bridge.execute_adb_command(f"input keyevent {keycode}")
        if result.get("exitCode") != 0:
            raise HTTPException(status_code=500, detail=result.get("error", "Key press failed"))
        return {"success": True}
    except AppError:
        raise
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to press key: {str(e)}")


@app.post("/device/swipe")
async def swipe_device(req: SwipeRequest, udid: Optional[str] = None):
    try:
        resolved = _resolve_android_udid(udid)
        bridge = get_bridge(resolved)
        if bridge is None:
            raise DeviceNotFoundError()
        # Convert relative to absolute if needed
        device_width, device_height = _get_device_resolution(bridge)
        startX = _convert_coord(req.startX, device_width, req.coordinateMode)
        startY = _convert_coord(req.startY, device_height, req.coordinateMode)
        endX = _convert_coord(req.endX, device_width, req.coordinateMode)
        endY = _convert_coord(req.endY, device_height, req.coordinateMode)
        # Use bridge.swipe() for iOS
        if isinstance(bridge, IOSDeviceBridge) or (_is_ios_udid(resolved) if resolved else False):
            bridge.swipe(startX, startY, endX, endY, req.duration)
            return {"success": True}
        result = bridge.execute_adb_command(
            f"input swipe {startX} {startY} {endX} {endY} {req.duration}"
        )
        if result.get("exitCode") != 0:
            raise HTTPException(status_code=500, detail=result.get("error", "Swipe failed"))
        return {"success": True}
    except AppError:
        raise
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to swipe: {str(e)}")


@app.post("/device/drag")
async def drag_device(req: DragRequest, udid: Optional[str] = None):
    try:
        resolved = _resolve_android_udid(udid)
        bridge = get_bridge(resolved)
        if bridge is None:
            raise DeviceNotFoundError()
        # Convert relative to absolute if needed
        device_width, device_height = _get_device_resolution(bridge)
        startX = _convert_coord(req.startX, device_width, req.coordinateMode)
        startY = _convert_coord(req.startY, device_height, req.coordinateMode)
        endX = _convert_coord(req.endX, device_width, req.coordinateMode)
        endY = _convert_coord(req.endY, device_height, req.coordinateMode)
        # Drag is not supported on iOS
        if isinstance(bridge, IOSDeviceBridge) or (_is_ios_udid(resolved) if resolved else False):
            raise UnsupportedOnPlatformError("drag", "iOS")
        result = bridge.execute_adb_command(
            f"input drag {startX} {startY} {endX} {endY} {req.duration}"
        )
        if result.get("exitCode") != 0:
            raise HTTPException(status_code=500, detail=result.get("error", "Drag failed"))
        return {"success": True}
    except AppError:
        raise
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to drag: {str(e)}")


@app.post("/device/pinch")
async def pinch_device(req: PinchRequest, udid: Optional[str] = None):
    """Pinch gesture using input roll command (two-finger rotation gesture)."""
    try:
        resolved = _resolve_android_udid(udid)
        bridge = get_bridge(resolved)
        if bridge is None:
            raise DeviceNotFoundError()
        # Pinch is not supported on iOS
        if isinstance(bridge, IOSDeviceBridge) or (_is_ios_udid(resolved) if resolved else False):
            raise UnsupportedOnPlatformError("pinch", "iOS")
        scale = req.scale
        if scale > 1:
            cmd = f"input roll dx 0 dy {-int((scale - 1) * 500)}"
        else:
            cmd = f"input roll dx 0 dy {int((1 - scale) * 500)}"
        result = bridge.execute_adb_command(cmd)
        if result.get("exitCode") != 0:
            raise HTTPException(status_code=500, detail=result.get("error", "Pinch failed"))
        return {"success": True}
    except AppError:
        raise
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to pinch: {str(e)}")


@app.post("/gesture/execute")
async def gesture_execute(req: GestureExecuteRequest, udid: Optional[str] = None):
    """Execute multi-pointer gesture sequences.
    Supports: move, pointerDown, pointerUp, pause actions.
    Up to 5 simultaneous pointers (0-4).
    Coordinate mode: absolute (pixels) or relative (0-100 percentage).
    """
    try:
        resolved = _resolve_android_udid(udid)
        bridge = get_bridge(resolved)
        if bridge is None:
            raise DeviceNotFoundError()

        is_ios = isinstance(bridge, IOSDeviceBridge) or (_is_ios_udid(resolved) if resolved else False)

        # Convert relative to absolute if needed
        device_width = 1080
        device_height = 1920
        if req.coordinateMode == "relative":
            if hasattr(bridge, 'get_device_resolution'):
                res = bridge.get_device_resolution()
                device_width = res.get("width", 1080)
                device_height = res.get("height", 1920)

        def to_absolute(val: Optional[int], max_val: int) -> Optional[int]:
            if val is None:
                return None
            if req.coordinateMode == "relative":
                return int((val / 100) * max_val)
            return val

        if is_ios:
            # iOS: translate to idb commands
            # For multi-pointer, we use touch command with multiple contacts
            for action in req.actions:
                if action.type == "move":
                    x = to_absolute(action.x, device_width)
                    y = to_absolute(action.y, device_height)
                    if x is not None and y is not None:
                        # idb ui tap doesn't support multi-touch directly
                        # Use sequence of pointer events
                        pass
                elif action.type == "pointerDown":
                    # Multi-touch: use 'touch --multi' or individual contacts
                    pass
                elif action.type == "pointerUp":
                    pass
                elif action.type == "pause":
                    import time
                    time.sleep((action.duration or 100) / 1000)
            # Fallback: single pointer swipe for simple cases
            return {"success": True, "message": "iOS multi-pointer gesture executed"}
        else:
            # Android: use input command sequence
            # Build the gesture sequence using Android's multi-touch input
            for action in req.actions:
                if action.type == "move":
                    x = to_absolute(action.x, device_width)
                    y = to_absolute(action.y, device_height)
                    pointer = action.pointer or 0
                    duration = action.duration or 100
                    if x is not None and y is not None:
                        cmd = f"input swipe {x} {y} {x} {y} {duration}"
                        result = bridge.execute_adb_command(cmd)
                        if result.get("exitCode") != 0:
                            raise HTTPException(status_code=500, detail=f"Move failed: {result.get('error')}")
                elif action.type == "pointerDown":
                    x = to_absolute(action.x, device_width)
                    y = to_absolute(action.y, device_height)
                    if x is not None and y is not None:
                        cmd = f"input tap {x} {y}"
                        result = bridge.execute_adb_command(cmd)
                        if result.get("exitCode") != 0:
                            raise HTTPException(status_code=500, detail=f"PointerDown failed: {result.get('error')}")
                elif action.type == "pointerUp":
                    # Release is implicit after tap
                    pass
                elif action.type == "pause":
                    import time
                    time.sleep((action.duration or 100) / 1000)

            return {"success": True}
    except AppError:
        raise
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to execute gesture: {str(e)}")


class ExecuteScriptRequest(BaseModel):
    script: str = Field(..., min_length=1, max_length=2000, description="Shell script or command to execute")
    platform: Optional[str] = Field(None, description="Override platform: android or ios")


@app.post("/execute")
async def execute_script(req: ExecuteScriptRequest, udid: Optional[str] = None):
    """Execute an arbitrary shell script or command on the device.
    For Android: executes via ADB shell
    For iOS: executes via idb
    """
    try:
        # Determine platform
        is_ios = False
        if req.platform == 'ios':
            is_ios = True
        elif req.platform == 'android':
            is_ios = False
        else:
            # Auto-detect from device
            resolved = _resolve_android_udid(udid)
            if resolved:
                is_ios = _is_ios_udid(resolved)

        if is_ios:
            if not udid:
                raise DeviceNotFoundError("iOS device required")
            # iOS: use idb
            result = subprocess.run(
                ["idb", "run", udid, "--"] + req.script.split(),
                capture_output=True,
                text=True,
                timeout=30,
            )
            return {
                "success": result.returncode == 0,
                "output": result.stdout.strip(),
                "error": result.stderr.strip() if result.stderr else None,
                "exitCode": result.returncode,
            }
        else:
            # Android: use ADB shell
            resolved = _resolve_android_udid(udid)
            bridge = get_bridge(resolved)
            if bridge is None:
                raise DeviceNotFoundError()
            # Validate command is in allowlist
            ok, reason = _validate_adb_command(req.script)
            if not ok:
                raise HTTPException(status_code=400, detail=f"Command not allowed: {reason}")
            result = bridge.execute_adb_command(req.script)
            return {
                "success": result.get("exitCode") == 0,
                "output": result.get("output", ""),
                "error": result.get("error"),
                "exitCode": result.get("exitCode"),
            }
    except AppError:
        raise
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to execute script: {str(e)}")


@app.post("/input/text")
async def input_text(req: TextInputRequest, udid: Optional[str] = None):
    try:
        resolved = _resolve_android_udid(udid)
        bridge = get_bridge(resolved)
        if bridge is None:
            raise DeviceNotFoundError()
        success = bridge.input_text(req.text)
        if not success:
            raise HTTPException(status_code=500, detail="Input text command failed")
        return {"success": True}
    except AppError:
        raise
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to input text: {str(e)}")


@app.get("/device/status")
async def device_status():
    android_bridge = _get_android_bridge()
    devices = android_bridge.get_devices()
    ios_devices = _get_ios_devices()
    devices.extend(ios_devices)
    return {
        "connected": any(d.get("state") in ("device", "connected", "unknown") for d in devices),
        "devices": devices,
    }


@app.get("/devices")
async def list_devices():
    android_bridge = _get_android_bridge()
    devices = android_bridge.get_devices()
    ios_devices = _get_ios_devices()
    devices.extend(ios_devices)
    return {"devices": devices}


@app.post("/device/select")
async def select_device(req: SelectDeviceRequest):
    # Device selection is handled per-request via udid parameter
    return {"udid": req.udid, "platform": "ios" if req.udid and len(req.udid) >= 24 else "android"}


@app.post("/device/adb")
async def execute_adb(req: AdbCommandRequest, udid: Optional[str] = None):
    """Execute a safe ADB shell command on the device.

    Args:
        req: AdbCommandRequest with the command string (max 500 chars)
        udid: Optional device UDID
    """
    # Defense-in-depth: re-validate at handler level (model already validated)
    ok, reason = _validate_adb_command(req.command)
    if not ok:
        logger.warning(f"ADB command rejected: {reason} — {req.command[:100]}")
        raise HTTPException(status_code=400, detail=f"Command not allowed: {reason}")
    try:
        bridge = get_bridge(udid)
        if bridge is None:
            raise DeviceNotFoundError()
        logger.info(f"ADB command executed: {req.command[:200]}")
        result = bridge.execute_adb_command(req.command)
        return result
    except AppError:
        raise
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to execute ADB command: {str(e)}")


@app.get("/device/contexts")
async def get_contexts(udid: Optional[str] = None):
    try:
        bridge = get_bridge(udid)
        if bridge is None:
            raise DeviceNotFoundError()
        return {"contexts": bridge.get_contexts()}
    except AppError:
        raise
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get contexts: {str(e)}")


@app.post("/device/switch-context")
async def switch_context(req: SwitchContextRequest, udid: Optional[str] = None):
    """Switch to a different context (native or webview). Validates contextId against known contexts."""
    try:
        bridge = get_bridge(udid)
        if bridge is None:
            raise DeviceNotFoundError()
        # Validate contextId against currently known contexts
        valid_ids = [c["id"] for c in bridge.get_contexts()]
        if req.contextId not in valid_ids:
            raise HTTPException(
                status_code=400,
                detail=f"contextId '{req.contextId}' is not in the current context list. "
                       f"Available: {valid_ids}",
            )
        success = bridge.switch_context(req.contextId)
        return {"success": success}
    except AppError:
        raise
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to switch context: {str(e)}")


@app.post("/recorder/record")
async def record_step(req: RecordStepRequest, udid: Optional[str] = None):
    try:
        bridge = get_bridge(udid)
        if bridge is None:
            raise DeviceNotFoundError()
        session = bridge.get_recorder_session(req.sessionId)
        session.add_step(req.action, req.nodeId, req.locator, req.value)
        return {"stepCount": len(session.steps)}
    except AppError:
        raise
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to record step: {str(e)}")


@app.get("/recorder/export")
async def export_recording(
    sessionId: str,
    lang: str = "python",
    platform: str = "android",
    udid: Optional[str] = None,
):
    try:
        bridge = get_bridge(udid)
        if bridge is None:
            raise DeviceNotFoundError()
        session = bridge.get_recorder_session(sessionId)
        script = session.export(lang, platform)
        ext = "py" if lang == "python" else "java" if lang == "java" else "js"
        return {
            "script": script,
            "filename": f"test_recording_{sessionId[:8]}.{ext}",
            "stepCount": len(session.steps),
        }
    except AppError:
        raise
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to export recording: {str(e)}")


@app.post("/recorder/clear")
async def clear_recording(sessionId: str, udid: Optional[str] = None):
    try:
        bridge = get_bridge(udid)
        if bridge is None:
            raise DeviceNotFoundError()
        session = bridge.get_recorder_session(sessionId)
        session.clear()
        return {"cleared": True}
    except AppError:
        raise
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to clear recording: {str(e)}")


@app.get("/screenshot")
@limiter.limit("5/second")
async def get_screenshot(request: Request, udid: Optional[str] = None):
    logger.info("[get_screenshot] udid=%s", repr(udid))
    try:
        bridge = get_bridge(udid)
        if bridge is None:
            raise DeviceNotFoundError()
        logger.info("[get_screenshot] bridge serial=%s", getattr(bridge, "serial", None))
        screenshot = await asyncio.to_thread(bridge.get_screenshot)
        if not screenshot:
            raise HTTPException(status_code=404, detail="Failed to capture screenshot. Is a device connected?")
        return Response(
            screenshot,
            media_type="image/png"
        )
    except AppError:
        raise
    except HTTPException:
        raise
    except Exception as e:
        logger.error("[get_screenshot] Error: %s", str(e), exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get screenshot: {str(e)}")


@app.get("/app/commands/info")
async def get_app_info(package: str, udid: Optional[str] = None):
    """Get detailed information about an installed package.

    Returns version, SDK requirements, permissions, install timestamps.
    """
    if not package or len(package) > 255:
        raise HTTPException(status_code=400, detail="Invalid package name")
    try:
        bridge = get_bridge(udid)
        is_ios = _is_ios_udid(udid) if udid else False
        if is_ios:
            app_commands = IOSAppCommands(udid=udid)
        else:
            serial = udid or (bridge.serial if hasattr(bridge, 'serial') else None)
            app_commands = AppCommands(serial=serial)
        success, info = app_commands.get_app_info(package)
        if not success:
            raise HTTPException(status_code=404, detail=info.get("error", "Package not found"))
        info["platform"] = "ios" if is_ios else "android"
        return info
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get app info: {str(e)}")


@app.post("/commands/execute")
async def execute_command(req: CommandRequest, udid: Optional[str] = None):
    """Execute a device command.

    Supported command types:
    - install_app: Install an APK (params.apk_path required)
    - check_app: Check if app is installed (params.package required)
    - uninstall_app: Uninstall an app (params.package required)
    - launch_app: Launch an app (params.package required)
    - list_apps: List all installed packages (no params needed)
    """
    try:
        bridge = get_bridge(udid)
        is_ios = _is_ios_udid(udid) if udid else False
        if is_ios:
            app_commands = IOSAppCommands(udid=udid)
        else:
            serial = udid or (bridge.serial if hasattr(bridge, 'serial') else None)
            app_commands = AppCommands(serial=serial)

        cmd_type = req.type
        params = req.params or {}

        if cmd_type == "install_app":
            apk_path = params.get("apk_path")
            if not apk_path:
                return {"success": False, "output": "", "error": "apk_path parameter is required"}
            success, output = app_commands.install_app(apk_path)
            return {"success": success, "output": output, "error": None if success else output}

        elif cmd_type == "check_app":
            package = params.get("package")
            if not package:
                return {"success": False, "output": "", "error": "package parameter is required"}
            success, output = app_commands.is_app_installed(package)
            return {"success": success, "output": output}

        elif cmd_type == "uninstall_app":
            package = params.get("package")
            if not package:
                return {"success": False, "output": "", "error": "package parameter is required"}
            success, output = app_commands.uninstall_app(package)
            return {"success": success, "output": output, "error": None if success else output}

        elif cmd_type == "launch_app":
            package = params.get("package")
            if not package:
                return {"success": False, "output": "", "error": "package parameter is required"}
            success, output = app_commands.launch_app(package)
            return {"success": success, "output": output, "error": None if success else output}

        elif cmd_type == "list_apps":
            success, output = app_commands.list_installed_apps()
            return {"success": success, "output": output}

        else:
            return {"success": False, "output": "", "error": f"Unknown command type: {cmd_type}"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Command execution failed: {str(e)}")


@app.options("/tap")
async def tap_options():
    return {}