import asyncio
import logging

from fastapi import APIRouter
from fastapi.responses import JSONResponse

import dependencies
from config import settings

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/health")
async def health_check():
    """Liveness probe - server is running."""
    return {"status": "ok", "version": settings.APP_VERSION}


@router.get("/ready")
async def ready_check():
    """Readiness probe - device is connected and hierarchy accessible.

    Runs Android and iOS device checks concurrently with a 5-second timeout
    to prevent blocking orchestrator health check loops.
    """

    async def check_android():
        bridge = dependencies._get_android_bridge()
        return await asyncio.to_thread(bridge.get_devices)

    async def check_ios():
        return await asyncio.to_thread(dependencies._get_ios_devices)

    try:
        android_devices, ios_devices = await asyncio.wait_for(
            asyncio.gather(check_android(), check_ios()),
            timeout=5.0,
        )
        all_devices = android_devices + ios_devices
        connected = any(d.get("state") in ("device", "connected", "unknown") for d in all_devices)
        return {"ready": True, "connected": connected, "device_count": len(all_devices)}
    except TimeoutError:
        logger.warning("Ready check timed out after 5 seconds")
        return JSONResponse(status_code=503, content={"ready": False, "error": "Device check timed out"})
    except Exception as e:
        logger.warning("Ready check failed: %s", str(e))
        return JSONResponse(status_code=503, content={"ready": False, "error": str(e)})
