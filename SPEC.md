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
├── HierarchyTree       ← recursive tree, search, keyboard nav, lock on click
├── Overlay             ← hover/selected/locked highlight on canvas
├── HierarchyPanel
│   ├── DeviceActionsBar  ← tap, swipe, drag, pinch, input text, system keys (extracted from Properties)
│   ├── HierarchyTree    ← recursive tree
│   └── PropertiesPanel   ← read-only: Identity, State, Geometry, Locators (StylePanel removed)
├── SubTabBar           ← Hierarchy | Accessibility sub-tabs
├── CommandsDrawer      ← App Commands + ADB Shell in bottom drawer
├── DevicePanel         ← device selector, online/offline status
├── TabBar              ← inspector | commands tabs
└── BottomDrawer        ← collapsible, shared by CommandsDrawer

Backend (FastAPI)
├── REST: /screenshot, /hierarchy, /tap, /input/text, /device/status, /devices
├── Bridges: AndroidDeviceBridge (ADB), IOSDeviceBridge (idb)
└── Commands: AppCommands (install/uninstall/launch/list)
```

---

## Frontend Components

| Component | File | Purpose |
|-----------|------|---------|
| ScreenshotCanvas | `components/ScreenshotCanvas.tsx` | Screenshot display, zoom (0.3x default), click-to-tap, element lock |
| HierarchyTree | `components/HierarchyTree.tsx` | Recursive tree, search, keyboard nav, lock on click/Enter |
| Overlay | `components/Overlay.tsx` | Canvas highlight: locked=yellow, selected/hovered=cyan |
| HierarchyPanel | `components/HierarchyPanel.tsx` | Wrapper: DeviceActionsBar + HierarchyTree + PropertiesPanel |
| DeviceActionsBar | `components/DeviceActionsBar.tsx` | Device interactions: tap, swipe, drag, pinch, input text, system keys |
| SubTabBar | `components/SubTabBar.tsx` | Hierarchy / Accessibility sub-tab navigation |
| PropertiesPanel | `components/PropertiesPanel.tsx` | Node props (read-only): Identity, State, Geometry, Locators |
| DevicePanel | `components/DevicePanel.tsx` | Device selector, auto-selects first device on reconnect |
| CommandsDrawer | `components/CommandsDrawer.tsx` | App Commands + ADB Shell in bottom drawer |
| BottomDrawer | `components/BottomDrawer.tsx` | Collapsible drawer container |
| StatusBar | `components/StatusBar.tsx` | Connection status, version |
| TabBar | `components/TabBar.tsx` | inspector / commands tabs |
| ErrorBoundary | `components/ErrorBoundary.tsx` | Error boundary for component tree |
| EmptyState | `components/EmptyState.tsx` | Icon + title + description + optional action |
| ErrorState | `components/ErrorState.tsx` | Error display with retry |
| SkeletonLoader | `components/SkeletonLoader.tsx` | Shimmer loaders for tree + canvas |
| SearchBar | `components/SearchBar.tsx` | Search input in tree header |
| PropertyRow | `components/PropertyRow.tsx` | Key-value row in PropertiesPanel |
| StylePanel | `components/StylePanel.tsx` | Layout chips: backgroundColor, textColor, padding, elevation |

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

## Known Issues Fixed (2026-04-26)
- ScreenshotCanvas useEffect missing `selectedDevice` in deps → canvas not updating on device switch
- Backend `get_bridge("")` fell through to `AndroidDeviceBridge(serial=None)` → "more than one device" error
- `adb devices -1` returns empty on macOS → now parses `adb devices` full output
- DevicePanel didn't sync `connected` state to deviceStore
- Empty udid from frontend bypassed backend device resolution → now backend always resolves empty to first device
- AbortError spam in console on device switch → now silently absorbed

---

## Phased Delivery

| Phase | Status | Scope |
|-------|--------|-------|
| v1.0 | ✅ Done | Core inspection (screenshot, hierarchy, tap, devices) |
| v1.1 | ✅ Done | Lock feature, empty states, device reconnect, test coverage |
| v1.2 | ✅ Done | Accessibility Audit, WebView Support, Recorder |

---

## Project Structure

```
inspector_plus/
├── SPEC.md                  ← this file
├── README.md
├── backend/
│   ├── main.py              # FastAPI entry + all REST routes
│   ├── device/
│   │   ├── android_bridge.py   # ADB + uiautomator
│   │   └── ios_bridge.py        # idb CLI
│   ├── commands/
│   │   └── app_commands.py     # install/uninstall/launch/list
│   ├── test_app.py              # 35 REST tests
│   ├── test_device_bridges.py   # 36 bridge tests
│   └── test_app_commands.py     # 17 app command tests
└── frontend/
    ├── src/
    │   ├── App.tsx              # main layout
    │   ├── components/           # 31+ components
│   │   ├── AccessibilityPanel.tsx
│   │   ├── AdbPanel.tsx
│   │   ├── ApkInfoPanel.tsx
│   │   ├── BottomDrawer.tsx
│   │   ├── CommandsDrawer.tsx
│   │   ├── CommandsPanel.tsx
│   │   ├── DevicePanel.tsx
│   │   ├── EmptyState.tsx
│   │   ├── ErrorBoundary.tsx
│   │   ├── ErrorState.tsx
│   │   ├── HierarchyPanel.tsx
│   │   ├── HierarchyTree.tsx
│   │   ├── LayoutBoundsOverlay.tsx
│   │   ├── LocatorPanel.tsx
│   │   ├── Overlay.tsx
│   │   ├── PropertiesPanel.tsx
│   │   ├── PropertyRow.tsx
│   │   ├── RecorderPanel.tsx
│   │   ├── ScreenshotCanvas.tsx
│   │   ├── SearchBar.tsx
│   │   ├── SkeletonLoader.tsx
│   │   ├── StatusBar.tsx
│   │   ├── StylePanel.tsx
│   │   └── TabBar.tsx
│   ├── stores/              # hierarchyStore, deviceStore, themeStore, recorderStore
    │   ├── stores/              # hierarchyStore, deviceStore, themeStore
    │   ├── hooks/                # useDevice.ts
    │   ├── services/             # api.ts (TanStack Query hooks)
    │   ├── utils/               # locators.ts, coordinates.ts
    │   └── types/               # shared.ts
    └── vitest.config.ts
```