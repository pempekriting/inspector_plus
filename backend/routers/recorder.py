import asyncio
import logging

from fastapi import APIRouter

import dependencies
from models import RecordStepRequest

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/recorder/record")
async def record_step(req: RecordStepRequest, udid: str | None = None):
    bridge = dependencies.get_bridge_or_raise(udid)
    session = await asyncio.to_thread(bridge.get_recorder_session, req.sessionId)
    session.add_step(req.action, req.nodeId, req.locator, req.value)
    return {"stepCount": len(session.steps)}


@router.get("/recorder/export")
async def export_recording(
    sessionId: str,
    lang: str = "python",
    platform: str = "android",
    udid: str | None = None,
):
    bridge = dependencies.get_bridge_or_raise(udid)
    session = await asyncio.to_thread(bridge.get_recorder_session, sessionId)
    script = session.export(lang, platform)
    ext = "py" if lang == "python" else "java" if lang == "java" else "js"
    return {
        "script": script,
        "filename": f"test_recording_{sessionId[:8]}.{ext}",
        "stepCount": len(session.steps),
    }


@router.post("/recorder/clear")
async def clear_recording(sessionId: str, udid: str | None = None):
    bridge = dependencies.get_bridge_or_raise(udid)
    session = await asyncio.to_thread(bridge.get_recorder_session, sessionId)
    session.clear()
    return {"cleared": True}
