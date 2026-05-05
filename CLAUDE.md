# CLAUDE.md — InspectorPlus

> AI coding agent instructions for InspectorPlus (Android/iOS UI inspector)

## Project Overview

InspectorPlus is a real-time Android/iOS device UI inspection tool built with:
- **Backend:** Python 3.13 + FastAPI + uvicorn (port 8001)
- **Frontend:** React 18 + TypeScript + Vite + Tailwind CSS + Zustand
- **Desktop:** Tauri 2 (Rust)
- **Android:** ADB + uiautomator
- **iOS:** idb-companion + xcrun simctl

**Key functionality:** Live screenshot streaming, hierarchical UI element tree view, tap-to-inspect, hover-to-highlight, click-to-tap on device.

## Stack & Conventions

### Python (Backend)

- **Runtime:** Python 3.13 only — Python 3.14 breaks WebSocket APIs
- **Package manager:** `uv` (from `pyproject.toml`)
- **Dev server:** `uvicorn main:app --reload --port 8001`
- **Run commands:** `cd backend && uv run uvicorn main:app --reload --port 8001`

### Error Handling Pattern

Use the typed error hierarchy in `main.py`:
```python
from main import AppError, DeviceNotFoundError, HierarchyNotFoundError

class DeviceNotFoundError(AppError):
    def __init__(self, detail: str = "No device connected"):
        super().__init__(detail, "DEVICE_NOT_FOUND", 404)
```

Register in FastAPI:
```python
app.add_exception_handler(AppError, app_error_handler)
```

When `get_bridge(udid)` returns `None`, always guard with:
```python
bridge = get_bridge(udid)
if bridge is None:
    raise DeviceNotFoundError()
```

### Device Bridge Pattern

Bridges live in `backend/device/`:
- `base.py` — `DeviceBridgeBase` abstract class
- `android_bridge.py` — Android implementation (ADB + uiautomator)
- `ios_bridge.py` — iOS implementation (idb)
- `__init__.py` — bridge factory (`create_bridge_for_device()`)

Factory usage:
```python
from device import create_bridge_for_device, AndroidDeviceBridge, DeviceBridgeBase
bridge: DeviceBridgeBase = create_bridge_for_device(serial)  # serial=None for default
```

### Frontend State (Zustand)

Stores in `frontend/src/stores/`:
- `hierarchyStore.ts` — UI tree, hovered/selected nodes, search state, refresh counters
- `deviceStore.ts` — device list, selected device, resolution
- `themeStore.ts` — dark/light theme toggle

**Polling pattern:** Use `useDevicePolling()` hook (exports `isLoading` + `error` state), polls `checkDeviceStatus` every 5s.

### Frontend API Layer

`frontend/src/services/api.ts` — all HTTP calls to backend.

**Env var:** `VITE_API_URL` (defaults to `http://localhost:8001` if not set).

## File Layout

```
inspector_plus/
├── backend/
│   ├── main.py                  # FastAPI entry + typed errors + routes
│   ├── test_app.py              # 35 pytest tests (covers all endpoints)
│   ├── pyproject.toml
│   ├── Dockerfile
│   ├── mcp/                     # MCP server for AI tool consumption
│   │   ├── src/
│   │   │   ├── server.ts         # Express + StreamableHTTP MCP server
│   │   │   ├── types/mcp-types.ts
│   │   │   ├── services/tree-service.ts
│   │   │   ├── cache/tree-cache.ts
│   │   │   └── tools/           # hierarchy, traversal, search tools
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── commands/
│       └── app_commands.py      # Appium-like command executor
├── frontend/
│   ├── src/
│   │   ├── App.tsx              # Main layout (~149 lines, composes panels)
│   │   ├── components/
│   │   │   ├── DevicePanel.tsx   # Device selector, status, theme toggle
│   │   │   ├── HierarchyPanel.tsx # Tree view, search bar, polling
│   │   │   ├── PropertiesPanel.tsx # Node properties using PropertyRow
│   │   │   ├── StatusBar.tsx    # Status bar with version badge
│   │   │   ├── HierarchyTree.tsx # Recursive tree rendering
│   │   │   ├── PropertyRow.tsx   # Property row for node details
│   │   │   ├── CommandsPanel.tsx # Command execution UI
│   │   │   └── ...
│   │   ├── stores/              # Zustand stores (well-tested with vitest)
│   │   ├── hooks/useDevice.ts   # API hooks + useDevicePolling
│   │   └── services/api.ts      # API base URL from VITE_API_URL
│   └── package.json
├── docs/
│   ├── ARCHITECTURE.md          # API reference, data models
│   └── DEVELOPMENT.md
└── SPEC.md                      # Feature spec (partially stale — verify against actual code)
```

## Testing

- **Frontend:** `cd frontend && npm test` (vitest) — 4 test files, 28 tests passing
- **Backend:** `cd backend && uv run pytest` — `test_app.py`, 35 tests covering all endpoints, error handling, and middleware

## Coding Agent Workflow

When spawning a coding agent for this project:

### Step 1 — Read the relevant skill first

| Task type | Skill to read |
|-----------|--------------|
| Frontend work (React, TypeScript, Vite) | `~/.openclaw/workspace/.skills/frontend-dev/SKILL.md` |
| Backend work (FastAPI, Python) | `~/.openclaw/workspace/.skills/fullstack-dev/SKILL.md` |
| New feature / full stack | `fullstack-dev` first, then `frontend-dev` |

### Step 2 — Include skill conventions in the agent prompt

Copy the skill's conventions (component patterns, naming rules, state patterns, typing rules) into the prompt. The agent should follow the same rules the skill teaches.

### Step 3 — Validate after completion

- Frontend: `cd frontend && npm run build` (must pass with zero errors)
- Backend: `cd backend && uv run pytest` (all tests must pass)
- Both before reporting done

## Key Rules

### Before Running Backend
```bash
cd backend
uv sync --python python3.13   # Creates .venv/
adb start-server               # Ensure ADB is running
```

### Before Running Frontend
```bash
cd frontend
npm install
npm run dev                    # or npm run tauri dev for desktop
```

### Coding Rules

1. **Never use `Field()` on FastAPI query params** — use `Query()` or inline validation
2. **`--every` and `--cron` are mutually exclusive** in OpenClaw cron commands
3. **Edit tool whitespace must match exactly** — use Python string replacement as fallback
4. **For Vite TypeScript projects** — add `/// <reference types="vite/client" />` to a `.d.ts` file to fix `import.meta.env` TypeScript errors
5. **API base URL** — always use `import.meta.env.VITE_API_URL` not hardcoded strings
6. **Mock Zustand stores in tests** — use `vi.mocked(useHierarchyStore).mockReturnValue(...)` not `require()` inside test bodies
7. **Always check `get_bridge()` for `None`** before calling methods on the returned bridge

## Architecture Notes

### Refresh Mechanism
- Screenshot uses combined `/hierarchy-and-screenshot` endpoint with TanStack Query (staleTime 2000ms)
- Hierarchy refresh: `triggerHierarchyRefresh()` increments `refreshCounter`
- Screenshot refresh: `triggerScreenshotRefresh()` increments `screenshotRefreshCounter` (manual only)
- Device switch: resets resolution + refreshes both screenshot and hierarchy via refetch

### Coordinate Conversion
- Canvas click → device coordinates: `(canvasX / canvasWidth) * deviceWidth`
- `findNodeAtPoint()` traverses UI tree to find element at given canvas coordinates

### Screenshot Flow
1. `GET /screenshot` → backend runs `screencap -p` on device
2. Returns PNG binary stream
3. Canvas displays via `URL.createObjectURL`

### Hierarchy Flow
1. `GET /hierarchy` → backend runs `uiautomator dump`
2. Pulls XML from `/sdcard/window_dump.xml` → parses to JSON
3. Each node gets incremental ID: `ClassName_N`
4. Bounds `[x1,y1,x2,y2]` → `{x, y, width, height}`

### MCP Server (Port 8002)
Separate TypeScript MCP server for AI tool consumption. Exposes the same hierarchy data via MCP protocol.

**Start:** `cd backend/mcp && npm run dev`
**Endpoints:** `POST /mcp` (tools), `GET /health`, `GET /subscribe/:deviceId` (SSE)
**Tools:** `get_hierarchy`, `get_node`, `get_children`, `get_path`, `get_ancestors`, `search_nodes`

### Connecting Claude Code to MCP Server

The MCP server exposes AI tools for POM (Page Object Model) generation. To use with Claude Code:

**Option 1: Claude Code CLI**
```bash
# Add MCP server to Claude Code
claude mcp add inspector-plus -- npx tsx backend/mcp/src/server.ts

# Or if already running on port 8002
claude mcp add inspector-plus -- http://localhost:8002/mcp
```

**Option 2: Via config file (~/.claude/mcp.json)**
```json
{
  "mcpServers": {
    "inspector-plus": {
      "command": "npx",
      "args": ["tsx", "/Users/azzamnizar/Documents/project/inspector_plus/backend/mcp/src/server.ts"]
    }
  }
}
```

**Available Tools after connection:**
- `get_hierarchy` - Fetch full UI tree for a device
- `get_node` - Get specific node by ID
- `get_children` - Paginated children of a node
- `get_path` - Path from root to node
- `get_ancestors` - All ancestor nodes
- `search_nodes` - Search by text, xpath, or regex

**Manual testing with cURL:**
```bash
# Initialize
curl -X POST http://localhost:8002/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}}}'

# List tools
curl -X POST http://localhost:8002/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'

# Call get_hierarchy
curl -X POST http://localhost:8002/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_hierarchy","arguments":{"deviceId":"YOUR_DEVICE_SERIAL"}}}'
```

## RTK Rewrite Bypass

This project uses `rtk proxy curl` to bypass RTK (Rust Token Killer) rewrite for API calls. The RTK hook can corrupt JSON responses when using plain `curl`:

```bash
# Use rtk proxy to get actual data
rtk proxy curl -s http://localhost:8001/devices

# MCP server with rtk proxy
rtk proxy curl -s -X POST http://localhost:8002/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}}}'
```