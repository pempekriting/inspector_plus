# CLAUDE.md — InspectorPlus

> AI coding agent instructions for InspectorPlus (Android/iOS UI inspector)

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

These rules apply to every task in this project unless explicitly overridden.
Bias: caution over speed on non-trivial work. Use judgment on trivial tasks.

## Rule 1 — Think Before Coding
State assumptions explicitly. If uncertain, ask rather than guess.
Present multiple interpretations when ambiguity exists.
Push back when a simpler approach exists.
Stop when confused. Name what's unclear.

## Rule 2 — Simplicity First
Minimum code that solves the problem. Nothing speculative.
No features beyond what was asked. No abstractions for single-use code.
Test: would a senior engineer say this is overcomplicated? If yes, simplify.

## Rule 3 — Surgical Changes
Touch only what you must. Clean up only your own mess.
Don't "improve" adjacent code, comments, or formatting.
Don't refactor what isn't broken. Match existing style.

## Rule 4 — Goal-Driven Execution
Define success criteria. Loop until verified.
Don't follow steps. Define success and iterate.
Strong success criteria let you loop independently.

## Rule 5 — Use the model only for judgment calls
Use me for: classification, drafting, summarization, extraction.
Do NOT use me for: routing, retries, deterministic transforms.
If code can answer, code answers.

## Rule 6 — Token budgets are not advisory
Per-task: 4,000 tokens. Per-session: 30,000 tokens.
If approaching budget, summarize and start fresh.
Surface the breach. Do not silently overrun.

## Rule 7 — Surface conflicts, don't average them
If two patterns contradict, pick one (more recent / more tested).
Explain why. Flag the other for cleanup.
Don't blend conflicting patterns.

## Rule 8 — Read before you write
Before adding code, read exports, immediate callers, shared utilities.
"Looks orthogonal" is dangerous. If unsure why code is structured a way, ask.

## Rule 9 — Tests verify intent, not just behavior
Tests must encode WHY behavior matters, not just WHAT it does.
A test that can't fail when business logic changes is wrong.

## Rule 10 — Checkpoint after every significant step
Summarize what was done, what's verified, what's left.
Don't continue from a state you can't describe back.
If you lose track, stop and restate.

## Rule 11 — Match the codebase's conventions, even if you disagree
Conformance > taste inside the codebase.
If you genuinely think a convention is harmful, surface it. Don't fork silently.

## Rule 12 — Fail loud
"Completed" is wrong if anything was skipped silently.
"Tests pass" is wrong if any were skipped.
Default to surfacing uncertainty, not hiding it.

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
- `settingsStore.ts` — persistent settings (BE/MCP URLs)
- `networkStore.ts` — traffic flows, proxy/VPN status, WebSocket state
- `recorderStore.ts` — recording session, steps, language

### Frontend API Layer

`frontend/src/services/api.ts` — all HTTP calls to backend.

**Env var:** `VITE_API_URL` (defaults to `http://localhost:8001` if not set).

**Separate MCP URL config:** `frontend/src/config/apiConfig.ts` manages backend and MCP URLs independently, with localStorage override.

## File Layout

```
inspector_plus/
├── .pre-commit-config.yaml     # Ruff format/check hooks
├── backend/
│   ├── main.py                  # FastAPI entry + typed errors + routes
│   ├── test_app.py              # FastAPI endpoint tests
│   ├── test_device_bridges.py   # Android/iOS bridge tests
│   ├── test_app_commands.py     # AppCommands tests
│   ├── test_validate.py         # ADB validation tests
│   ├── test_base.py             # Bridge base tests
│   ├── test_ws.py               # WebSocket tests
│   ├── test_ws_server.py        # WebSocket server tests
│   ├── pyproject.toml
│   ├── Dockerfile
│   ├── device/
│   │   ├── __init__.py          # Bridge factory (create_bridge_for_device)
│   │   ├── base.py              # DeviceBridgeBase abstract class
│   │   ├── android_bridge.py   # Android ADB + uiautomator implementation
│   │   ├── ios_bridge.py        # iOS idb + WDA implementation
│   │   ├── recorder.py         # Recording session per device
│   │   ├── accessibility_utils.py
│   │   └── utils.py
│   ├── network/
│   │   ├── routes.py            # Network debug endpoints (/network/*)
│   │   ├── mitm_manager.py     # mitmdump process singleton
│   │   └── flow_parser.py       # .mitm flow file parser
│   ├── commands/
│   │   ├── app_commands.py     # Android app commands
│   │   └── ios_app_commands.py  # iOS app commands
│   ├── tests/
│   │   ├── test_flow_parser.py     # Flow file parsing tests
│   │   ├── test_mitm_manager.py    # MitmproxyManager singleton tests
│   │   ├── test_network_routes.py # Network API endpoint tests
│   │   ├── test_android_helpers.py
│   │   ├── test_ios_app_commands.py
│   │   ├── test_recorder_session.py
│   │   ├── test_ios_recorder_session.py
│   │   └── test_main_helpers.py
│   ├── inspector_vpn/           # Android VPN app (Gradle/Kotlin)
│   │   └── app/src/main/java/com/inspectorplus/vpn/
│   │       ├── InspectorVpnService.java
│   │       ├── MainActivity.java
│   │       └── AndroidManifest.xml
│   └── mcp/                     # MCP server for AI tool consumption
│       ├── src/
│       │   ├── server.ts         # Express + StreamableHTTP MCP server
│       │   ├── types/mcp-types.ts
│       │   ├── services/tree-service.ts
│       │   ├── cache/tree-cache.ts
│       │   └── tools/           # hierarchy, traversal, search tools
│       ├── package.json
│       └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── App.tsx              # Main layout, TabBar, SubTabBar
│   │   ├── components/           # 30+ React components
│   │   │   ├── AccessibilityPanel.tsx
│   │   │   ├── AdbPanel.tsx
│   │   │   ├── ApkInfoPanel.tsx
│   │   │   ├── BottomDrawer.tsx
│   │   │   ├── CommandsDrawer.tsx
│   │   │   ├── CommandsPanel.tsx
│   │   │   ├── DeviceActionsBar.tsx
│   │   │   ├── DevicePanel.tsx
│   │   │   ├── EmptyState.tsx
│   │   │   ├── ErrorBoundary.tsx
│   │   │   ├── ErrorState.tsx
│   │   │   ├── HierarchyPanel.tsx
│   │   │   ├── HierarchyTree.tsx
│   │   │   ├── LayoutBoundsOverlay.tsx
│   │   │   ├── LocatorPanel.tsx
│   │   │   ├── NetworkPanel.tsx
│   │   │   ├── OnboardingModal.tsx
│   │   │   ├── Overlay.tsx
│   │   │   ├── PropertiesPanel.tsx
│   │   │   ├── PropertyRow.tsx
│   │   │   ├── RecorderPanel.tsx
│   │   │   ├── ScreenshotCanvas.tsx
│   │   │   ├── SearchBar.tsx
│   │   │   ├── SettingsPanel.tsx
│   │   │   ├── SkeletonLoader.tsx
│   │   │   ├── StatusBar.tsx
│   │   │   ├── StylePanel.tsx
│   │   │   ├── SubTabBar.tsx
│   │   │   └── TabBar.tsx
│   │   ├── stores/
│   │   │   ├── hierarchyStore.ts
│   │   │   ├── deviceStore.ts
│   │   │   ├── themeStore.ts
│   │   │   ├── settingsStore.ts
│   │   │   ├── networkStore.ts
│   │   │   └── recorderStore.ts
│   │   ├── config/
│   │   │   └── apiConfig.ts
│   │   ├── hooks/useDevice.ts
│   │   ├── services/api.ts
│   │   └── types/network.ts
│   └── tests/
│       ├── hooks/              # useDevice, useCommands, useRecording
│       ├── services/           # api tests
│       ├── stores/             # hierarchyStore, deviceStore, themeStore, recorderStore, networkStore, settingsStore
│       └── utils/               # coordinates, locators, layoutGeometry
└── docs/
    ├── ARCHITECTURE.md
    ├── DEVELOPMENT.md
    ├── MCP_QUICKREF.md
    └── NETWORK.md
├── SPEC.md
├── CONTRIBUTING.md
├── LICENSE
└── CLAUDE.md
```

## Testing

- **Frontend:** `cd frontend && npm test` (vitest) — 36 test files, 238 tests
  - `tests/hooks/` — useDevice, useCommands, useRecording
  - `tests/services/` — api
  - `tests/stores/` — hierarchyStore, deviceStore, themeStore, recorderStore, networkStore, settingsStore
  - `tests/utils/` — coordinates, locators, layoutGeometry
  - `src/components/__tests__/` — component tests
- **Backend:** `cd backend && uv run pytest` — 366 tests across 14 test files
  - `test_app.py`, `test_device_bridges.py`, `test_app_commands.py`, `test_validate.py`
  - `test_base.py`, `test_ws*.py`
  - `tests/` subdirectory — android_helpers, ios_app_commands, recorder_session, ios_recorder_session, main_helpers, **test_flow_parser, test_mitm_manager, test_network_routes**

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

---

## Implementation Best Practices

### Adding a New Backend Endpoint

1. **Define request/response models** using Pydantic `BaseModel` in the routes file
2. **Use `Query()` not `Field()`** for query parameters
3. **Guard bridge lookups**: always check `get_bridge(udid)` for `None`
4. **Use async for I/O-bound operations** (ADB calls, file I/O)
5. **Register the route** on the `router` and include it in `main.py` via `app.include_router()`
6. **Add tests**: follow the pattern in `tests/test_network_routes.py`

```python
from fastapi import APIRouter, Query
from pydantic import BaseModel

router = APIRouter()

class NewEndpointRequest(BaseModel):
    udid: str | None = None

@router.post("/new-endpoint")
async def new_endpoint(req: NewEndpointRequest):
    if req.udid:
        bridge = get_bridge(req.udid)
        if bridge is None:
            raise DeviceNotFoundError()
    # ...
```

### Adding a New Backend Device Bridge

1. Inherit from `DeviceBridgeBase` in `backend/device/base.py`
2. Implement all abstract methods: `get_hierarchy()`, `get_screenshot()`, `tap()`, `input_text()`, etc.
3. Add the bridge type to `backend/device/__init__.py` factory
4. Add tests in `tests/test_device_bridges.py` with `mock_android_bridge` / `mock_ios_bridge` fixtures
5. **Thread safety**: if the bridge manages state, ensure thread-safe access via locks

### Adding a New Frontend Store (Zustand)

1. Create `frontend/src/stores/myStore.ts` with typed interface
2. **Always persist** if the store holds user preferences (use `localStorage`)
3. **Reset pattern**: provide a way to reset state for test isolation
4. **Add tests** in `frontend/tests/stores/myStore.test.ts`
5. **Never hardcode URLs** — use `import.meta.env.VITE_API_URL` or the `apiConfig` layer

```typescript
import { create } from 'zustand';

interface MyState {
  value: string;
  setValue: (v: string) => void;
}

export const useMyStore = create<MyState>((set) => ({
  value: 'default',
  setValue: (value) => set({ value }),
}));
```

### Adding a New Frontend API Call

1. Add the function to `frontend/src/services/api.ts`
2. Use `fetch` with proper error handling
3. **Type the response** with a Zod schema or TypeScript interface
4. **Add tests** in `frontend/tests/services/api.test.ts`

```typescript
import { getApiUrl } from '@/config/apiConfig';

export async function fetchDeviceInfo(udid: string) {
  const res = await fetch(`${getApiUrl()}/devices/${udid}`);
  if (!res.ok) throw new Error('Failed to fetch device info');
  return res.json();
}
```

### Concurrency & Thread Safety

- **Backend bridges are singletons** per device — protect shared state with `threading.Lock()`
- **MitmproxyManager** uses `_lock = threading.Lock()` for singleton safety
- **Reset singletons** in test fixtures via `autouse=True` fixtures that call `reset_instance()`
- **Don't block the event loop** — use `asyncio` for concurrent operations; don't use `time.sleep()` in async endpoints

### Observability & Logging

Use structured logging with the project logger pattern:
```python
import logging
logger = logging.getLogger(__name__)

logger.info(f"[myoperation] details={details}")
logger.error(f"[myoperation] failed: {e}")
```

**Key log sources to check** when debugging:
- `[start_proxy]` — mitmdump lifecycle in `network/routes.py`
- `[MitmproxyManager]` — mitmdump process management
- `[flow_parser]` — flow file parsing
- `[get_hierarchy]` — hierarchy fetching per device

### Security: ADB Command Validation

ADB commands must be validated against an allowlist before execution:
- **`_validate_adb_command()`** in `main.py` checks for dangerous characters and patterns
- **Blocked patterns**: `rm -rf`, `mv` to system dirs, pipes, redirects, semicolons
- **Never execute raw user input** as ADB commands — always go through the validator
- **For iOS**: commands go through `idb` which has its own permission model

### Platform-Specific Quirks

**Android:**
- XML hierarchy from `uiautomator dump` uses bounds format `[x1,y1,x2,y2]`
- `ClassName_N` format for generated node IDs
- VPN mode uses `10.0.0.2/32` route, requires AUTO_START permission
- `adb reverse` needed for proxy tunnel from device to host

**iOS:**
- Uses `idb-companion` for device communication (not ADB)
- WebDriver Agent (WDA) for UI inspection
- No VPN interception — proxy mode only
- Different hierarchy structure from Android

### Error Propagation

- **Backend**: Use `AppError` subclasses; they auto-register with FastAPI exception handler
- **Frontend**: API errors are caught in `api.ts` and surfaced via `useQuery.error` or `useMutation.error`
- **WebSocket**: Errors disconnect the client — implement reconnection logic in the frontend
- **Never swallow exceptions silently** — always log or re-raise with context

### Performance Considerations

- **Screenshot streaming**: Use binary PNG streams, not base64 in JSON
- **Hierarchy parsing**: Cache parsed tree in bridge; only re-fetch on explicit refresh
- **Network flows**: mitmproxy writes to `.mitm` files — don't parse on every request; use `since` filter
- **Frontend renders**: Use `React.memo` for tree nodes; virtualize long lists with `react-window`
- **TanStack Query**: `staleTime: 2000ms` for screenshot; `staleTime: Infinity` for hierarchy (manual refresh only)

---

## Architecture Notes

### Runtime Port Switching (Tauri Desktop)

Both backend (port 8001) and MCP (port 8002) can be restarted on different ports via Settings panel in the Tauri desktop app.

**Tauri-managed server lifecycle:**
- `BackendManager` — spawns/manages Python/FastAPI process
- `McpManager` — spawns/manages Node.js MCP server process
- `restart_backend(port?)` / `restart_mcp(port?)` — Tauri IPC commands

**SettingsPanel flow:**
1. User changes port in Settings → clicks "Apply"
2. Frontend calls `invoke("restart_backend", { port })` + `invoke("restart_mcp", { port })`
3. Rust managers stop old processes, start new ones on new ports
4. Frontend saves URLs to localStorage via `settingsStore`

**Browser dev mode limitation:** Cannot spawn processes from browser. Apply button only saves URLs — servers must be started manually via terminal.

### Refresh Mechanism
- Screenshot uses combined `/hierarchy-and-screenshot` endpoint with TanStack Query (staleTime 2000ms)
- Hierarchy refresh: `triggerHierarchyRefresh()` increments `refreshCounter` (manual trigger)
- Screenshot refresh: `triggerScreenshotRefresh()` increments `screenshotRefreshCounter` (manual only)
- Device switch: resets resolution + refreshes both screenshot and hierarchy via refetch
- No auto-refresh polling for hierarchy — manual trigger only

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

**Prerequisites:** Node.js 18+, npm

**Setup:**
```bash
cd backend/mcp
npm install
```

**Start:** `cd backend/mcp && npm run dev`
**Endpoints:** `POST /mcp` (tools), `GET /health`, `GET /subscribe/:deviceId` (SSE)
**Tools:** `get_hierarchy`, `get_node`, `get_children`, `get_path`, `get_ancestors`, `search_nodes`

**CORS:** Enabled for all origins to allow browser-based health checks.

**Troubleshooting:**
- If curl returns type placeholders instead of values, use `rtk proxy curl` instead
- If Claude Code shows "Failed to Connect", check server: `curl -s http://localhost:8002/health`
- Port conflicts: `lsof -ti :8002 | xargs kill -9`

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

For detailed MCP server documentation, see `docs/MCP_QUICKREF.md`.
