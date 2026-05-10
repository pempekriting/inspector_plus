import asyncio
import contextlib
import logging
import subprocess

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter()


class StartProxyRequest(BaseModel):
    port: int = 8080
    udid: str | None = None


class StartVpnRequest(BaseModel):
    port: int = 8080
    udid: str | None = None


class InstallCertRequest(BaseModel):
    udid: str | None = None


@router.post("/proxy/start")
async def start_proxy(req: StartProxyRequest):
    """Start mitmproxy and setup device proxy tunnel."""
    from network.mitm_manager import MitmproxyManager

    manager = MitmproxyManager.get_instance()

    logger.info(f"[start_proxy] requested port={req.port}, udid={req.udid}")
    result = manager.start(req.port)
    logger.info(f"[start_proxy] mitmdump start result={result}")
    if not result.get("success"):
        return result

    # Bridge needs to know the ACTUAL port mitmdump ended up on (auto-port-find may have changed it)
    actual_port = result.get("port", req.port)
    logger.info(f"[start_proxy] actual_port={actual_port}")

    if req.udid:
        from device import create_bridge_for_device

        bridge = create_bridge_for_device(req.udid)
        try:
            tunnel_result = bridge.setup_network_proxy(actual_port)
            logger.info(f"[start_proxy] tunnel_result={tunnel_result}")
            result.update(tunnel_result)
        except Exception as e:
            logger.error(f"Failed to setup device tunnel: {e}")
            result["tunnel_error"] = str(e)

    return result


@router.post("/proxy/stop")
async def stop_proxy():
    """Stop mitmproxy and clean up device tunnels."""
    from network.mitm_manager import MitmproxyManager

    manager = MitmproxyManager.get_instance()
    result = manager.stop()
    # Clean up adb reverse entries
    with contextlib.suppress(Exception):
        subprocess.run(["adb", "reverse", "--remove-all"], capture_output=True, timeout=5)
    return result


@router.post("/proxy/vpn/start")
async def start_vpn_proxy(req: StartVpnRequest):
    """Start VPN-based full traffic interception."""
    if not req.udid:
        return {"success": False, "error": "No device specified"}

    from device import create_bridge_for_device

    bridge = create_bridge_for_device(req.udid)

    logger.info(f"[start_vpn_proxy] udid={req.udid}, port={req.port}")
    result = bridge.setup_vpn_proxy(req.port)
    logger.info(f"[start_vpn_proxy] result={result}")
    return result


@router.post("/proxy/vpn/stop")
async def stop_vpn_proxy(udid: str | None = Query(None)):
    """Stop VPN interception."""
    if not udid:
        return {"success": False, "error": "No device specified"}

    from device import create_bridge_for_device

    bridge = create_bridge_for_device(udid)

    logger.info(f"[stop_vpn_proxy] udid={udid}")
    result = bridge.stop_vpn_proxy()
    logger.info(f"[stop_vpn_proxy] result={result}")
    return result


@router.get("/proxy/vpn/status")
async def vpn_status(udid: str | None = Query(None)):
    """Get VPN interception status."""
    if not udid:
        return {"running": False, "error": "No device specified"}

    from device import create_bridge_for_device

    bridge = create_bridge_for_device(udid)
    return {"running": bridge.is_vpn_running()}


@router.get("/proxy/status")
async def proxy_status():
    """Get mitmproxy status."""
    from network.mitm_manager import MitmproxyManager

    manager = MitmproxyManager.get_instance()
    return manager.get_status()


@router.get("/traffic")
async def get_traffic(since: float = 0, udid: str | None = None):
    """Get captured network flows."""
    from network.mitm_manager import MitmproxyManager

    manager = MitmproxyManager.get_instance()
    flows = manager.get_flows(since)
    logger.info(f"[get_traffic] since={since}, flows_count={len(flows)}, flow_file={manager.get_latest_flow_file()}")
    return {"flows": flows, "count": len(flows)}


@router.post("/cert/install")
async def install_cert(req: InstallCertRequest):
    """Install MITM certificate on device."""
    if not req.udid:
        return {"success": False, "error": "No device specified"}
    from device import create_bridge_for_device

    bridge = create_bridge_for_device(req.udid)
    return bridge.install_certificate()


@router.get("/info")
async def network_info(udid: str | None = None):
    """Get device network diagnostic info."""
    from device import create_bridge_for_device

    if not udid:
        return {"error": "No device specified"}
    bridge = create_bridge_for_device(udid)
    return bridge.get_network_info()


@router.websocket("/stream")
async def traffic_stream(websocket: WebSocket, udid: str | None = Query(None)):
    """WebSocket endpoint for live traffic streaming."""
    await websocket.accept()
    logger.info(f"[traffic_stream] WebSocket connected, udid={udid}")

    from network.mitm_manager import MitmproxyManager

    manager = MitmproxyManager.get_instance()

    last_timestamp = 0.0
    try:
        while True:
            # Stop streaming if mitmdump is not running
            if not manager.is_running():
                logger.info("[traffic_stream] mitmdump not running, closing stream")
                break
            await websocket.send_json({"type": "ping"})
            flows = manager.get_flows(since=last_timestamp)
            for flow in flows:
                await websocket.send_json({"type": "flow", "data": flow})
                last_timestamp = max(last_timestamp, flow.get("timestamp", 0))
            await asyncio.sleep(0.5)
    except WebSocketDisconnect:
        logger.info("[traffic_stream] WebSocket disconnected")
    except Exception as e:
        logger.error(f"[traffic_stream] error: {e}")
