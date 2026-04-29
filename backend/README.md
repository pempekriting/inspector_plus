# InspectorPlus Backend

FastAPI backend for Android UI inspection via ADB.

## Requirements

- Python 3.13+ (not 3.14 - WebSocket compatibility issue)
- ADB (Android Debug Bridge) installed and in PATH
- Android device/emulator connected

## Quick Start

```bash
cd backend
uv sync --python python3.13
uvicorn main:app --reload --port 8001
```

API documentation available at `http://localhost:8001/docs`

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/hierarchy` | Fetch UI hierarchy from device |
| POST | `/tap` | Tap device at coordinates |
| GET | `/device/status` | Get connection and device info |
| GET | `/devices` | List all connected ADB devices |
| POST | `/device/select` | Switch active device |
| GET | `/screenshot` | Get PNG screenshot |
| WS | `/test` | Echo test for debugging |

## ADB Commands Used

- `adb devices -l` - List devices
- `adb -s <serial> shell uiautomator dump` - Dump UI hierarchy
- `adb -s <serial> shell screencap -p` - Capture screenshot
- `adb -s <serial> shell input tap <x> <y>` - Tap at coordinates

## Project Structure

```
backend/
├── main.py              # FastAPI app + routes
├── pyproject.toml       # Dependencies
└── device/
    └── bridge.py       # DeviceBridge (ADB wrapper)
```

## Device Selection

Default device used when no serial specified. Switch via `/device/select`:

```bash
curl -X POST http://localhost:8001/device/select \
  -H "Content-Type: application/json" \
  -d '{"serial": "emulator-5554"}'
```

## Environment

Uses `uv` for Python dependency management. Lock file: `uvl.lock`