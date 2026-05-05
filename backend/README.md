# InspectorPlus Backend

FastAPI backend for Android/iOS UI inspection via ADB and idb.

## Requirements

- Python 3.13+ (not 3.14 - WebSocket compatibility issue)
- ADB (Android Debug Bridge) installed and in PATH
- For iOS: idb-companion (`brew install facebook/fb/idb-companion`)
- Android device/emulator or iOS simulator connected

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
| GET | `/health` | Liveness probe |
| GET | `/ready` | Readiness probe (checks device connection) |
| GET | `/hierarchy` | Fetch UI hierarchy from device |
| GET | `/hierarchy-and-screenshot` | Combined hierarchy + base64 screenshot |
| GET | `/hierarchy/search` | Filtered search by xpath/resource-id/text/content-desc/class |
| GET | `/hierarchy/find` | Tree search with regex (F4) |
| GET | `/hierarchy/locators` | Generate Appium locators for a node |
| POST | `/hierarchy/audit` | WCAG accessibility audit |
| POST | `/tap` | Tap device at coordinates |
| POST | `/input/text` | Input text |
| GET | `/screenshot` | Get PNG screenshot |
| GET | `/device/status` | Get connection and device info |
| GET | `/devices` | List all connected devices |
| POST | `/device/select` | Switch active device |
| POST | `/device/adb` | Execute allowlisted ADB command |
| GET | `/device/contexts` | List WebView/native contexts |
| POST | `/device/switch-context` | Switch context |
| POST | `/recorder/record` | Record test step |
| GET | `/recorder/export` | Export recording as Python/Java/JS |
| POST | `/recorder/clear` | Clear recording |
| GET | `/app/commands/info` | Get detailed APK info |
| POST | `/commands/execute` | Execute commands (install/uninstall/launch/check/list apps) |

## ADB Commands Used

- `adb devices -l` - List devices
- `adb -s <serial> shell uiautomator dump` - Dump UI hierarchy
- `adb -s <serial> shell screencap -p` - Capture screenshot
- `adb -s <serial> shell input tap <x> <y>` - Tap at coordinates

## Project Structure

```
backend/
├── main.py                  # FastAPI entry point + all routes + ADB security model
├── pyproject.toml           # Dependencies
├── device/
│   ├── __init__.py          # Bridge factory (create_bridge_for_device)
│   ├── base.py              # DeviceBridgeBase abstract class
│   ├── android_bridge.py    # Android ADB implementation
│   └── ios_bridge.py        # iOS idb implementation
└── commands/
    ├── app_commands.py      # Android app commands
    └── ios_app_commands.py  # iOS app commands
```

## Device Selection

Default device used when no serial/udid specified. Switch via `/device/select`:

```bash
curl -X POST http://localhost:8001/device/select \
  -H "Content-Type: application/json" \
  -d '{"udid": "emulator-5554"}'
```

## Environment

Uses `uv` for Python dependency management.

## MCP Server (AI Tool Access)

A TypeScript MCP server exposes hierarchy data for AI clients. See `docs/MCP_SERVER.md` for full documentation or `SPEC.md` for consolidated reference.

```bash
cd backend/mcp
npm install
npm run dev      # Development (tsx watch)
npm run build && npm start   # Production
```

**Port:** 8002 (configure via `MCP_PORT` env var)