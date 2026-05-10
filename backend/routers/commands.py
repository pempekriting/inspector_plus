import asyncio
import logging

from fastapi import APIRouter, HTTPException

import dependencies
from commands.app_commands import AppCommands
from commands.ios_app_commands import IOSAppCommands
from models import CommandRequest

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/app/commands/info")
async def get_app_info(package: str, udid: str | None = None):
    """Get detailed information about an installed package."""
    if not package or len(package) > 255:
        raise HTTPException(status_code=400, detail="Invalid package name")
    bridge = dependencies.get_bridge_or_raise(udid)
    is_ios = dependencies._is_ios_udid(udid) if udid else False
    if is_ios:
        app_commands = IOSAppCommands(udid=udid)
    else:
        serial = udid or (bridge.serial if hasattr(bridge, "serial") else None)
        app_commands = AppCommands(serial=serial)
    success, info = await asyncio.to_thread(app_commands.get_app_info, package)
    if not success:
        raise HTTPException(status_code=404, detail=info.get("error", "Package not found"))
    info["platform"] = "ios" if is_ios else "android"
    return info


@router.post("/commands/execute")
async def execute_command(req: CommandRequest, udid: str | None = None):
    """Execute a device command.

    Supported command types:
    - install_app: Install an APK (params.apk_path required)
    - check_app: Check if app is installed (params.package required)
    - uninstall_app: Uninstall an app (params.package required)
    - launch_app: Launch an app (params.package required)
    - list_apps: List all installed packages (no params needed)
    """
    bridge = dependencies.get_bridge_or_raise(udid)
    is_ios = dependencies._is_ios_udid(udid) if udid else False
    if is_ios:
        app_commands = IOSAppCommands(udid=udid)
    else:
        serial = udid or (bridge.serial if hasattr(bridge, "serial") else None)
        app_commands = AppCommands(serial=serial)

    cmd_type = req.type
    params = req.params or {}

    if cmd_type == "install_app":
        apk_path = params.get("apk_path")
        if not apk_path:
            return {"success": False, "output": "", "error": "apk_path parameter is required"}
        success, output = await asyncio.to_thread(app_commands.install_app, apk_path)
        return {"success": success, "output": output, "error": None if success else output}

    if cmd_type == "check_app":
        package = params.get("package")
        if not package:
            return {"success": False, "output": "", "error": "package parameter is required"}
        success, output = await asyncio.to_thread(app_commands.is_app_installed, package)
        return {"success": success, "output": output}

    if cmd_type == "uninstall_app":
        package = params.get("package")
        if not package:
            return {"success": False, "output": "", "error": "package parameter is required"}
        success, output = await asyncio.to_thread(app_commands.uninstall_app, package)
        return {"success": success, "output": output, "error": None if success else output}

    if cmd_type == "launch_app":
        package = params.get("package")
        if not package:
            return {"success": False, "output": "", "error": "package parameter is required"}
        success, output = await asyncio.to_thread(app_commands.launch_app, package)
        return {"success": success, "output": output, "error": None if success else output}

    if cmd_type == "list_apps":
        success, output = await asyncio.to_thread(app_commands.list_installed_apps)
        return {"success": success, "output": output}

    return {"success": False, "output": "", "error": f"Unknown command type: {cmd_type}"}
