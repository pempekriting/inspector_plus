# InspectorPlus — Mobile UI Inspector (Android + iOS)

**Version:** 0.0.1 | Updated 2026-04-29

Real-time Android/iOS device inspection tool with hierarchical view exploration, tap-to-inspect, element locking, and device emulation control.

---

## Quick Start

### Prerequisites
- Python 3.13+ | Node.js 18+ | ADB in PATH

### Start Backend
```bash
cd backend && uv sync && uvicorn main:app --reload --port 8001
```

### Start Frontend
```bash
cd frontend && npm install && npm run dev
```

Open `http://localhost:5173`

---

## Architecture

```
Frontend (React + Zustand + Tailwind)
├── ScreenshotCanvas    ← screenshot display, zoom/pan, click-to-tap, click-to-lock
├── Overlay             ← hover/selected/locked highlight on canvas
├── Header toolbar
│   ├── DevicePanel    ← device selector dropdown
│   ├── ThemeToggle    ← dark/light switch
│   ├── KeyboardShortcuts
│   └── SettingsButton ← opens SettingsPanel modal
├── TabBar              ← inspector | commands tabs
└── Inspector content
    ├── SubTabBar       ← hierarchy | accessibility | recorder sub-tabs
    ├── HierarchyPanel
    │   └── SearchBar + HierarchyTree (recursive)
    ├── AccessibilityPanel
    └── RecorderPanel

Backend (FastAPI)
├── REST: /screenshot, /hierarchy, /tap, /input/text, /device/status, /devices
├── Bridges: AndroidDeviceBridge (ADB), IOSDeviceBridge (idb)
└── Commands: AppCommands (install/uninstall/launch/list)

MCP Server (TypeScript - port 8002)
├── Tools: get_hierarchy, get_node, get_children, get_path, get_ancestors, search_nodes
├── Transport: Streamable HTTP (JSON-RPC 2.0)
└── SSE: /subscribe/:deviceId for real-time tree updates

SettingsPanel (Tauri desktop)
├── Backend URL: text input + Verify + Scan buttons
├── MCP URL: text input + Verify + Scan buttons
├── Apply: restart servers on new ports via Tauri IPC
└── Reset Defaults
```

**Runtime Port Switching (Tauri only):**
- Backend (port 8001) and MCP (port 8002) can be restarted on different ports via Settings panel
- Tauri manages child processes via `BackendManager` and `McpManager` Rust structs
- Browser dev mode: Apply only saves URLs, cannot spawn processes

---

## Frontend Components

| Component | File | Purpose |
|-----------|------|---------|
| ScreenshotCanvas | `components/ScreenshotCanvas.tsx` | Screenshot display, zoom (0.3x default), click-to-tap, element lock |
| HierarchyTree | `components/HierarchyTree.tsx` | Recursive tree, search, keyboard nav, lock on click/Enter |
| Overlay | `components/Overlay.tsx` | Canvas highlight: locked=yellow, selected/hovered=cyan |
| HierarchyPanel | `components/HierarchyPanel.tsx` | Wrapper: SearchBar + HierarchyTree + PropertiesPanel |
| SubTabBar | `components/SubTabBar.tsx` | Hierarchy / Accessibility / Recorder sub-tab navigation |
| PropertiesPanel | `components/PropertiesPanel.tsx` | Node props (read-only): Identity, State, Geometry, Locators |
| DevicePanel | `components/DevicePanel.tsx` | Device selector dropdown, auto-selects first device on reconnect |
| SettingsPanel | `components/SettingsPanel.tsx` | Runtime port config: BE/MCP URL fields, Verify/Scan, Apply to restart servers |
| TabBar | `components/TabBar.tsx` | inspector / commands tabs |
| RecorderPanel | `components/RecorderPanel.tsx` | Record test steps and export |
| AccessibilityPanel | `components/AccessibilityPanel.tsx` | WCAG accessibility audit |
| StatusBar | `components/StatusBar.tsx` | Connection status, version |
| ErrorBoundary | `components/ErrorBoundary.tsx` | Error boundary for component tree |
| EmptyState | `components/EmptyState.tsx` | Icon + title + description + optional action |
| ErrorState | `components/ErrorState.tsx` | Error display with retry |
| SkeletonLoader | `components/SkeletonLoader.tsx` | Shimmer loaders for tree + canvas |
| SearchBar | `components/SearchBar.tsx` | Search input in tree header |
| PropertyRow | `components/PropertyRow.tsx` | Key-value row in PropertiesPanel |

**Implemented:** `ApkInfoPanel` — 3rd tab in TabBar, shows APK details (version, SDK, permissions)

**Implemented:** `RecorderPanel`, `AccessibilityPanel`, `AdbPanel` (all wired to App)

---

## State Management

### hierarchyStore (`stores/hierarchyStore.ts`)
```typescript
{
  uiTree: UiNode | null
  hoveredNode: UiNode | null       // hover preview
  selectedNode: UiNode | null     // click-selected (not locked)
  lockedNode: UiNode | null       // persistent lock — survives hover
  hoveredCanvasPos: {x, y} | null
  isLoadingScreenshot: boolean
  isLoadingHierarchy: boolean
  refreshCounter: number            // increment → HierarchyTree re-fetches
  screenshotRefreshCounter: number  // manual screenshot refresh trigger
  searchQuery: string
  searchFilter: "xpath" | "resource-id" | "text" | "content-desc" | "class"
  canvasMode: "inspect" | "coordinate"
  searchResults: SearchResult[]
  searchResultsCount: number
  currentSearchIndex: number
  isSearchActive: boolean
  expandedNodes: Set<string>       // D1 collapsed state
  currentContext: string
  lockSelection: (node: UiNode | null) => void
}
```

### deviceStore (`stores/deviceStore.ts`)
```typescript
{
  connected: boolean
  deviceWidth: number
  deviceHeight: number
  devices: Device[]
  selectedDevice: string | null    // localStorage persisted
  setConnected, setDeviceResolution, setDevices, setSelectedDevice
}
```

---

## Key Behaviors (Current)

### Element Selection Locking
- Click element on canvas → `setSelectedNode` + `lockSelection(node)` → overlay stays
- Click element in tree → same behavior
- Hover does NOT overwrite `lockedNode`
- Escape key → `lockSelection(null)` + `setSelectedNode(null)`
- Enter key on focused tree node → locks it
- Overlay renders whenever `lockedNode` OR `hoveredNode` is set

### Empty States (device off/on)
- DevicePanel: auto-selects first connected device when devices recover
- HierarchyTree: returns early if `!selectedDevice` → shows skeleton, tree cleared
- ScreenshotCanvas: returns early if `!selectedDevice` → clears image, shows empty canvas

### Screenshot + Hierarchy Sync
- No auto-refresh polling (removed)
- Screenshot useEffect depends on: `selectedDevice` + `screenshotRefreshCounter`
- HierarchyTree useEffect depends on: `refreshKey=selectedDevice` + `refreshCounter`
- DevicePanel: single `useDeviceStatus` poll at 10s interval

### Backend Empty UDID Resolution
- `get_bridge("")` or `get_bridge(None)` → `_get_first_android_device()` → parses `adb devices` output, returns first serial
- Prevents "more than one device/emulator" error with multi-emulator setups

---

## Backend API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Liveness probe |
| GET | `/ready` | Readiness probe (checks device connection) |
| GET | `/screenshot?udid=` | PNG binary; empty udid → first Android device |
| GET | `/hierarchy?udid=` | UiNode JSON; empty udid → first Android device |
| GET | `/hierarchy-and-screenshot?udid=` | Combined endpoint (single ADB round-trip) |
| GET | `/hierarchy/search?query=&filter=&udid=` | Element search |
| GET | `/hierarchy/find?q=&udid=&regex=` | Tree search with regex |
| GET | `/hierarchy/locators?nodeId=&udid=` | Generate Appium locators for node |
| POST | `/hierarchy/audit` | WCAG accessibility audit |
| POST | `/tap` | `{"x": int, "y": int, "udid"?}` |
| POST | `/input/text` | `{"text": string, "udid"?}` |
| POST | `/device/press-key` | `{"key": "home"\|"back"\|"recent", "udid"?}` |
| POST | `/device/swipe` | `{"startX", "startY", "endX", "endY", "duration"?, "udid"?}` |
| POST | `/device/drag` | `{"startX", "startY", "endX", "endY", "duration"?, "udid"?}` |
| POST | `/device/pinch` | `{"x", "y", "scale": float, "udid"?}` |
| GET | `/device/status` | `{connected, devices}` |
| GET | `/devices` | `{devices: [...]}` |
| POST | `/device/select` | `{"udid": string|null}` |
| GET | `/device/contexts?udid=` | List WebView/native contexts |
| POST | `/device/switch-context` | Switch context |
| POST | `/device/adb` | Execute allowlisted ADB command |
| GET | `/app/commands/info?package=&udid=` | Detailed app info |
| POST | `/commands/execute` | install/uninstall/launch/check/list |
| POST | `/recorder/record` | Record test step |
| GET | `/recorder/export?sessionId=&lang=&platform=` | Export as Python/Java/JS |
| POST | `/recorder/clear` | Clear recording session |

---

## Design Decisions (D1–D7, Current State)

### D1 — Collapsible Hierarchy Tree ✅
- D1 implemented; chevron toggle; Expand All / Collapse All buttons; `expandedNodes` Set

### D2 — Canvas Zoom + Pan ✅
- Default zoom: 0.3x; range 0.25x–4x; click-drag pan at high zoom; Ctrl+scroll zoom

### D3 — Empty States ✅
- No device: DevicePanel shows "No devices found" with retry
- No hierarchy: HierarchyTree shows skeleton loader (loading=true, uiTree=null)
- No screenshot: ScreenshotCanvas shows empty canvas state
- Error state: ErrorState with retry button

### D4 — Keyboard Navigation ✅
- ↑/↓: navigate tree; Enter: lock element; ←/→: expand/collapse; Esc: unlock + deselect

### D5 — ADB Shell → Bottom Drawer ✅
- CommandsDrawer (bottom drawer, ~200px, collapsible) contains App Commands tab + ADB Shell tab

### D6 — Skeleton Loaders ✅
- Tree: SkeletonLoader rows; Canvas: SkeletonCanvas with aspect ratio

### D7 — Actionable Error States ✅
- ErrorState component with icon + title + description + retry button

---

## Data Models

### UiNode
```typescript
interface UiNode {
  id: string
  className?: string
  package?: string
  text?: string
  resourceId?: string
  contentDesc?: string
  bounds: { x: number; y: number; width: number; height: number }
  children?: UiNode[]
  capabilities?: UiCapability[]
  styles?: Record<string, string>
}
```

### Device
```typescript
interface Device {
  udid: string
  serial?: string
  state: string           // "device" | "offline" | "unknown"
  model?: string
  name?: string
  platform?: "android" | "ios"
  os_version?: string
  android_version?: string
}
```

---

## Tests

**Frontend:** 31 passing (Vitest)
- `stores/__tests__/themeStore.test.ts` — 9 tests
- `stores/__tests__/hierarchyStore.test.ts` — 18 tests (incl. lockSelection tests)
- `components/__tests__/ErrorBoundary.test.tsx` — 2 tests
- `components/__tests__/HierarchyTree.test.tsx` — 2 tests

**Backend:** 118 passing (pytest)
- `test_app.py` — REST API endpoint tests
- `test_device_bridges.py` — Android/iOS bridge unit tests
- `test_app_commands.py` — AppCommands tests


---

## MCP Server (AI Tool Access)

MCP (Model Context Protocol) server that serves tree hierarchy data for AI clients (Claude Code, etc.), enabling POM (Page Object Model) generation.

### Quick Start

```bash
# Terminal 1: FastAPI backend
cd backend && uv run uvicorn main:app --reload --port 8001

# Terminal 2: MCP server
cd backend/mcp && npm install && npm run dev
```

**MCP Port:** 8002 (configure via `MCP_PORT` env var)

### Configuration

| Env Variable | Default | Description |
|--------------|---------|-------------|
| `MCP_PORT` | `8002` | MCP server port |
| `FASTAPI_URL` | `http://localhost:8001` | FastAPI backend URL |

### Available Tools

| Tool | Arguments | Description |
|------|-----------|-------------|
| `get_hierarchy` | `deviceId`, `maxDepth?` | Fetch full UI tree hierarchy |
| `get_node` | `nodeId` | Get specific node by ID |
| `get_children` | `nodeId`, `cursor?`, `pageSize?` | Paginated children |
| `get_path` | `nodeId` | Path from root to node |
| `get_ancestors` | `nodeId` | All ancestor nodes |
| `search_nodes` | `deviceId`, `query`, `matchType?`, `limit?` | Search by text/xpath/regex |

### MCP Protocol (JSON-RPC 2.0)

**Initialize:**
```bash
curl -X POST http://localhost:8002/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":0,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"cli","version":"1.0.0"}}}'

curl -X POST http://localhost:8002/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"notifications/initialized","params":{}}'
```

**List Tools:**
```bash
curl -X POST http://localhost:8002/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

**Call Tool (get_hierarchy):**
```bash
curl -X POST http://localhost:8002/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_hierarchy","arguments":{"deviceId":"emulator-5554"}}}'
```

**Call Tool (search_nodes):**
```bash
curl -X POST http://localhost:8002/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"search_nodes","arguments":{"deviceId":"emulator-5554","query":"Login","matchType":"text"}}}'
```

### SSE Subscription (Real-time)

```bash
curl -N http://localhost:8002/subscribe/emulator-5554
```

### File Structure

```
backend/mcp/
├── src/
│   ├── server.ts              # Express + StreamableHTTP MCP
│   ├── types/mcp-types.ts    # Zod schemas, types
│   ├── services/tree-service.ts  # FastAPI bridge
│   ├── cache/tree-cache.ts    # TTL cache
│   └── tools/                 # hierarchy, traversal, search tools
├── package.json
└── tsconfig.json
```

### Error Responses

```json
// Device not connected
{"error": "Device not connected: emulator-5554", "code": "DEVICE_NOT_CONNECTED"}

// Node not found
{"error": "Node not found: Button_999", "code": "NODE_NOT_FOUND"}
```

### Response Format

Tool responses wrap JSON in `content.text`:

```javascript
// Parse get_hierarchy response
const parsed = JSON.parse(result.content[0].text);
// parsed.data.tree - hierarchy
// parsed.data.stats - { totalNodes, depth, lastRefresh }
// parsed._meta - { source: "android"|"ios", cached }
```

---

## Known Issues

1. **Python 3.14 Incompatibility:** WebSocket handler uses deprecated APIs removed in Python 3.14. Use Python 3.13.
2. **ADB Required:** Must have Android SDK with ADB installed and device connected.
3. **No Authentication:** Backend has no auth - only runs locally.
4. **iOS Simulator Only:** Real iOS devices require WDA (WebDriverAgent) via idb-companion.