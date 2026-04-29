import pytest
from fastapi import FastAPI, WebSocket
import asyncio

# Test app for WebSocket testing
test_app = FastAPI()

@test_app.websocket("/ws/test")
async def ws_echo(ws: WebSocket):
    await ws.accept()
    try:
        await ws.send_text("Hello from backend")
        await asyncio.sleep(0.5)
        binary_data = bytes([0x00, 0x40, 0x00, 0x00, 0x08, 0xb1, 0xed, 0x02])
        await ws.send_bytes(binary_data)
        await asyncio.sleep(0.5)
    finally:
        await ws.close()