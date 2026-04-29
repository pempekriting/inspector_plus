# Architecture

## System Design

```
┌─────────────────────────────────────────────────────────────────┐
│                        Tauri Desktop App                        │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │              React Frontend (localhost:5173)              │  │
│  │                                                           │  │
│  │   ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │  │
│  │   │ Screenshot  │  │  Hierarchy  │  │  Overlay         │  │  │
│  │   │  Canvas     │  │    Tree     │  │  (hover highlight)│  │  │
│  │   └──────┬──────┘  └──────┬──────┘  └──────────┬────────┘  │  │
│  │          │               │                     │           │  │
│  │          └───────────────┼─────────────────────┘           │  │
│  │                          │                                 │  │
│  │   ┌──────────────────────┴──────────────────────────────┐  │  │
│  │   │              useDevice (API hooks)                   │  │  │
│  │   └──────────────────────┬──────────────────────────────┘  │  │
│  └──────────────────────────┼──────────────────────────────────┘  │
│                             │ HTTP (port 8001)                   │
└─────────────────────────────┼────────────────────────────────────┘
                              │
┌─────────────────────────────┼────────────────────────────────────┐
│               Python Backend (FastAPI)                            │
│  ┌──────────────────────────┴──────────────────────────────┐    │
│  │                    REST API                             │    │
│  │  GET /hierarchy  POST /tap  GET /screenshot            │    │
│  │  GET /device/status  GET /devices  POST /device/select  │    │
│  └──────┬────────────────────────┬───────────────────────┘    │
│         │                        │                             │
│  ┌──────┴──────┐          ┌──────┴──────┐                      │
│  │ Android     │          │ iOS        │                      │
│  │DeviceBridge │          │DeviceBridge│                      │
│  │   (ADB)     │          │  (idb)     │                      │
│  └──────┬──────┘          └──────┬──────┘                      │
│         │                        │                              │
│    ┌────┴────┐              ┌─────┴─────┐                        │
│    │ Android │              │ iOS Dev   │                        │
│    │ Device  │              │ /Simulator│                        │
│    └─────────┘              └───────────┘                        │
└─────────────────────────────────────────────────────────────────┘
```

## Backend

### Stack

- **Framework:** FastAPI 0.115.0
- **Server:** uvicorn[standard] 0.30.0
- **WebSocket:** websockets 12.0
- **Python:** 3.13+ (3.14 has WebSocket incompatibility)

### REST API

#### Health & Readiness
| Method | Endpoint | Description | Request | Response |
|--------|----------|-------------|---------|----------|
| GET | `/health` | Liveness probe | - | `{status, version}` |
| GET | `/ready` | Readiness probe (checks device connection) | - | `{ready, connected, device_count}` |

#### Device Management
| Method | Endpoint | Description | Request | Response |
|--------|----------|-------------|---------|----------|
| GET | `/device/status` | Connection + device list | - | `{connected, devices}` |
| GET | `/devices` | List all devices | - | `{devices: [...]}` |
| POST | `/device/select` | Select active device | `{udid: string|null}` | `{udid, platform}` |
| GET | `/device/contexts` | List WebView/native contexts (F3) | `udid` (query) | `{contexts: [...]}` |
| POST | `/device/switch-context` | Switch context (F3) | `{contextId: string}` | `{success}` |
| POST | `/device/adb` | Execute allowlisted ADB command | `{command: string, udid?}` | `{output, error, exitCode}` |

#### Hierarchy & Inspection
| Method | Endpoint | Description | Request | Response |
|--------|----------|-------------|---------|----------|
| GET | `/hierarchy` | UI tree JSON | `udid` (query) | `UiNode` tree |
| GET | `/hierarchy-and-screenshot` | Combined endpoint (single ADB round-trip) | `udid` (query) | `{hierarchy, screenshot: base64}` |
| GET | `/hierarchy/search` | Filtered search | `query`, `filter`, `udid` (query) | `{matches, count}` |
| GET | `/hierarchy/find` | Tree search with regex (F4) | `q`, `udid`, `regex` | `{results, count}` |
| GET | `/hierarchy/locators` | Generate Appium locators | `nodeId`, `udid` (query) | locator strategies |
| POST | `/hierarchy/audit` | WCAG accessibility audit | `udid` (query) | audit results |

#### Interactions
| Method | Endpoint | Description | Request | Response |
|--------|----------|-------------|---------|----------|
| POST | `/tap` | Tap coordinates | `{x: int, y: int, udid?}` | `{success}` |
| POST | `/input/text` | Text input | `{text: string, udid?}` | `{success}` |
| POST | `/device/press-key` | System keyevent (home/back/recent) | `{key: "home"\|"back"\|"recent", udid?}` | `{success}` |
| POST | `/device/swipe` | Swipe gesture | `{startX, startY, endX, endY, duration?, udid?}` | `{success}` |
| POST | `/device/drag` | Drag gesture (Android only) | `{startX, startY, endX, endY, duration?, udid?}` | `{success}` |
| POST | `/device/pinch` | Pinch gesture (Android only) | `{x, y, scale: float, udid?}` | `{success}` |
| GET | `/screenshot` | PNG binary | `udid` (query) | PNG binary |

**iOS Interaction Notes:**
- Tap and swipe convert pixel coordinates to point coordinates automatically
- `press_key` with `key=home` routes to `idb ui button HOME`
- Drag and pinch return `UNSUPPORTED_ACTION` error for iOS devices

#### App Commands
| Method | Endpoint | Description | Request | Response |
|--------|----------|-------------|---------|----------|
| POST | `/commands/execute` | install/uninstall/launch/check/list | `{type, params}` | command result |
| GET | `/app/commands/info` | Detailed APK info | `package`, `udid` (query) | version, SDK, permissions |

#### Test Recorder (F2)
| Method | Endpoint | Description | Request | Response |
|--------|----------|-------------|---------|----------|
| POST | `/recorder/record` | Record step | `{sessionId, action, nodeId, locator, value}` | `{stepCount}` |
| GET | `/recorder/export` | Export as Python/Java/JS | `sessionId`, `lang`, `platform` | `{script, filename, stepCount}` |
| POST | `/recorder/clear` | Clear session | `{sessionId}` | `{cleared}` |

### API Details

**GET /hierarchy**
```
Query: udid (optional) - device serial/udid
Response: UiNode tree
Error: 404 if no hierarchy found, 500 on failure
```

**POST /tap**
```json
Body: {"x": 100, "y": 200}
Response: {"success": true}
Error: 500 on failure
```

**GET /device/status**
```json
Response: {
  "connected": true,
  "devices": [
    {
      "serial": "ABC123XYZ",
      "udid": "ABC123XYZ",
      "platform": "android",
      "state": "device",
      "model": "Pixel 7",
      "manufacturer": "Google",
      "android_version": "14",
      "sdk": "34"
    }
  ]
}
```

### Device Bridge Architecture

```python
class DeviceBridgeBase(ABC):
    """Abstract base for all device bridges."""

    # Core methods
    @abstractmethod
    def connect(self) -> bool
    @abstractmethod
    def get_devices(self) -> list[dict]
    @abstractmethod
    def get_hierarchy(self) -> dict
    @abstractmethod
    def tap(self, x: int, y: int) -> bool
    @abstractmethod
    def get_screenshot(self) -> bytes

    # Search & inspection
    @abstractmethod
    def search_hierarchy(self, query: str, filter_type: str = "xpath") -> dict
    @abstractmethod
    def audit_accessibility(self, tree: dict) -> dict

    # Context & input
    @abstractmethod
    def get_contexts(self) -> List[dict]
    @abstractmethod
    def switch_context(self, context_id: str) -> bool
    @abstractmethod
    def input_text(self, text: str) -> bool

    # Advanced features
    def generate_locators(self, node: dict) -> dict
    def fetch_hierarchy_and_screenshot(self) -> tuple[dict, bytes]
    def execute_adb_command(self, command: str) -> dict
    def get_recorder_session(self, session_id: str) -> RecorderSession
```

**AndroidDeviceBridge**
- Uses ADB commands: `uiautomator dump`, `screencap -p`, `input tap`
- Parses XML hierarchy from `/sdcard/window_dump.xml`
- Falls back to default device if no serial specified
- ADB command validation via allowlist (see Security section)

**IOSDeviceBridge**
- Uses `idb` (iOS Device Bridge) with `uv run` fallback
- Hierarchy via `idb ui describe-all --json --nested`
- Falls back to `xcrun simctl list devices --json` if idb unavailable
- WDA source to tree conversion with scale factor (points vs pixels)
- iOS-specific locator strategies (accessibility-id, class chain, predicate string, xpath, class name + index)
- **Coordinate handling**: iOS uses point coordinates; `tap()` and `swipe()` automatically convert from pixel coordinates (received from frontend) to points using `_ios_scale` factor
- **Supported actions**: `tap()`, `swipe()`, `input_text()`, `press_button("HOME"|"LOCK"|"SIDE_BUTTON")`
- **Unsupported actions**: `drag()` and `pinch()` raise `NotImplementedError`

### Bridge Selection Logic

```python
def get_bridge(udid: Optional[str] = None) -> DeviceBridgeBase:
    """Returns bridge for device. Caches per-UDID for consistent node IDs."""
    if not udid:
        udid = os.environ.get("ANDROID_SERIAL") or _get_first_android_device()
    if _is_ios_udid(udid):  # 24+ hex chars with dashes = iOS UDID
        return IOSDeviceBridge(udid)
    return AndroidDeviceBridge(serial=udid)
```

Bridges are cached in `_android_bridges[udid]` and `_ios_bridges[udid]` dicts for consistent node IDs across requests.

### Hierarchy XML Parsing

1. Run `uiautomator dump` on device
2. Pull `/sdcard/window_dump.xml` to local `/tmp/`
3. Parse with `xml.etree.ElementTree`
4. Convert attributes to UiNode format
5. Generate incremental IDs: `ClassName_N`

### Screenshot Flow

**Android:**
1. `adb shell screencap -p` -> raw PNG binary
2. Return as bytes

**iOS:**
1. `idb screenshot --output /tmp/ios_screenshot.png`
2. Read file and return bytes

### Error Handling

Typed error hierarchy with global handler:

```python
class AppError(Exception):
    """Base class for operational errors."""
    def __init__(self, message: str, code: str, status_code: int)
        self.message = message
        self.code = code
        self.status_code = status_code

class DeviceNotFoundError(AppError):      # 404 DEVICE_NOT_FOUND
class HierarchyNotFoundError(AppError):    # 404 HIERARCHY_NOT_FOUND
class CommandExecutionError(AppError):    # 500 COMMAND_EXECUTION_FAILED
class ScreenshotError(AppError):          # 500 SCREENSHOT_FAILED
class UnsupportedOnPlatformError(AppError):  # 400 UNSUPPORTED_ACTION (drag/pinch on iOS)
```

Global handler: `@app.exception_handler(AppError, app_error_handler)` returns JSON `{error: code, detail: message}`.

### ADB Security Model

ADB commands are validated via allowlist + blocklist (defense in depth):

**Allowed prefixes** (`_ALLOWED_ADB_PREFIXES`): `input`, `pm`, `am`, `screencap`, `dumpsys`, `getprop`, `setprop`, `monkey`, `uiautomator`, `cat`, `ls`, `mkdir`, `touch`

**Safe short commands** (`_SAFE_SHORT_COMMANDS`): `id`, `uptime`, `date`, `wm`, `settings get`

**Blocked dangerous execs** (`_DANGEROUS_EXECS`): `reboot`, `shutdown`, `dd`, `mkfs`, `mount`, `remount`, `sqlite3`, `tar`, `zip`, `unzip`

**Forbidden character sequences** (`_DANGEROUS_CHARS`): `&&`, `||`, `|`, `;`, `` ` ``, `$(`, `>`, `>>`, `&`

All ADB commands via `/device/adb` are validated before execution.

### Request ID Middleware

All requests get a UUID request ID via `add_request_id` middleware. The ID is:
- Added to response headers as `X-Request-ID`
- Included in all log entries for tracing

---

## Frontend

### Stack

- **Framework:** React 18.3.1
- **Build:** Vite 6.0.1
- **Language:** TypeScript 5.6
- **State:** Zustand 5.0.0 (UI state) + TanStack Query 4.x (server state)
- **Styling:** Tailwind CSS 3.4
- **Validation:** Zod (runtime schema validation)

### API Client Layer (`services/api.ts`)

TanStack Query with Zod schemas is the primary data-fetching layer:

```typescript
// Zod schemas for runtime validation
const BoundsSchema = z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() });
const UiNodeSchema = z.object({ id: z.string(), className: z.string().optional(), ... });

// React Query hooks
useDeviceStatus()      // refetchInterval: 10000ms
useDevices()
useSelectDevice()
useHierarchy()         // refetches via refreshCounter
useHierarchyAndScreenshot()  // combined endpoint
useTapDevice()
useExecuteCommand()
useLocators()
useAdbCommand()
useAccessibilityAudit() // F6: WCAG audit
useDeviceContexts()     // F3: WebView contexts
useSwitchContext()
useInstalledPackages()
useAppInfo()
useRecorder()           // F2: test recorder
```

The older `hooks/useDevice.ts` with raw fetch is still present but only used for polling (`useDevicePolling()`).

### Component Hierarchy

```
App
├── ScreenshotCanvas (60% width, flex-[3])
│   ├── LayoutBoundsOverlay   # D2: zoom/pan + layout mode
│   └── Overlay               # hover/selected/locked highlight
│
├── DevicePanel (header)     # device selector + theme toggle
├── TabBar                    # inspector | commands | apk-info
│
└── Inspector (tab content)
    ├── HierarchyPanel
    │   ├── DeviceActionsBar   # tap, swipe, drag, pinch, input text, system keys
    │   ├── HierarchyTree → TreeNode (recursive)
    │   │   ├── SearchBar (F4: search with regex)
    │   │   └── AccessibilityPanel (F6: WCAG audit results)
    │   └── PropertiesPanel → PropertyRow + LocatorPanel (read-only)
    ├── PropertiesPanel → PropertyRow + LocatorPanel
    └── RecorderPanel (F2: test recorder)
```

**All components (31+):**
`AccessibilityPanel`, `AdbPanel`, `ApkInfoPanel`, `BottomDrawer`, `CommandsDrawer`, `CommandsPanel`, `DeviceActionsBar`, `DevicePanel`, `EmptyState`, `ErrorBoundary`, `ErrorState`, `HierarchyPanel`, `HierarchyTree`, `LayoutBoundsOverlay`, `LocatorPanel`, `Overlay`, `PropertiesPanel`, `PropertyRow`, `RecorderPanel`, `ScreenshotCanvas`, `SearchBar`, `SkeletonLoader`, `StatusBar`, `StylePanel`, `SubTabBar`, `TabBar`

### Canvas Modes (D2)

ScreenshotCanvas supports three modes:
- `inspect` — click to lock element selection
- `coordinate` — show coordinate popup on click
- `layout` — display all bounds overlay on canvas

Zoom: 0.25x–4x (default 0.3x), Ctrl+scroll to zoom, click-drag to pan at high zoom.

### State Management

**hierarchyStore** (`stores/hierarchyStore.ts`)
```typescript
interface HierarchyState {
  // Core tree state
  uiTree: UiNode | null;
  hoveredNode: UiNode | null;
  selectedNode: UiNode | null;
  lockedNode: UiNode | null;           // F2: persistent lock
  hoveredCanvasPos: {x, y} | null;

  // Loading states
  isLoadingScreenshot: boolean;
  isLoadingHierarchy: boolean;

  // Refresh triggers
  refreshCounter: number;                // increment → re-fetches hierarchy
  screenshotRefreshCounter: number;       // manual screenshot refresh
  refetchFn: (() => void) | null;       // exposed refetch for UI
  isRefreshing: boolean;

  // Search (F4)
  searchQuery: string;
  searchFilter: "xpath" | "resource-id" | "text" | "content-desc" | "class";
  searchResults: SearchResult[];
  searchResultsCount: number;
  currentSearchIndex: number;
  isSearchActive: boolean;

  // Expansion state (D1)
  expandedNodes: Set<string>;

  // Canvas mode (D2)
  canvasMode: "inspect" | "coordinate" | "layout";

  // Context (F3: WebView)
  currentContext: string;

  // Actions
  triggerHierarchyRefresh: () => void;
  lockSelection: (node: UiNode | null) => void;
  setSearchResults: (results: SearchResult[]) => void;
  setCurrentSearchIndex: (index: number) => void;
  clearSearch: () => void;
  toggleExpanded: (nodeId: string) => void;
  expandAll: () => void;
  collapseAll: () => void;
}
```

**deviceStore** (`stores/deviceStore.ts`)
```typescript
interface DeviceState {
  deviceWidth: number;                   // default 1080
  deviceHeight: number;                 // default 1920
  devices: Device[];
  selectedDevice: string | null;         // localStorage persisted
  connected: boolean;
  setDeviceResolution: (w: number, h: number) => void;
  setConnected: (v: boolean) => void;
  setDevices: (devices: Device[]) => void;
  setSelectedDevice: (serial: string | null) => void;
}
```

**themeStore** (`stores/themeStore.ts`)
```typescript
interface ThemeState {
  theme: 'dark' | 'light';              // persisted to localStorage
  toggleTheme: () => void;
}
```

**recorderStore** (`stores/recorderStore.ts`)
```typescript
interface RecorderState {
  isRecording: boolean;
  sessionId: string;                     // auto-generated on recording start
  steps: RecordingStep[];
}
```

### Data Models

**UiNode** (from `types/shared.ts`)
```typescript
interface UiNode {
  id: string;                     // e.g. "LinearLayout_1"
  className?: string;             // e.g. "android.widget.LinearLayout"
  package?: string;               // e.g. "com.example.app"
  text?: string;                  // Element text
  resourceId?: string;            // e.g. "btn_submit" (without package)
  contentDesc?: string;           // Accessibility description
  bounds?: Bounds;                // Element bounds {x, y, width, height}
  children?: UiNode[];            // Child nodes

  // iOS / WDA fields
  accessibilityIdentifier?: string;
  accessibilityLabel?: string;
  accessible?: boolean;
  enabled?: boolean;
  focused?: boolean;

  // Capability tracking
  capabilities?: UiCapability[];

  // Style information
  styles?: Record<string, string>;

  // WDA-specific
  wdaElementId?: string;
  wdaParentId?: string;
  wdaType?: string;
}
```

**Bounds**
```typescript
interface Bounds {
  x: number;      // Top-left X
  y: number;      // Top-left Y
  width: number;  // Element width
  height: number; // Element height
}
```

**Device**
```typescript
interface Device {
  udid: string;
  serial?: string;
  state: string;           // "device" | "offline" | "Booted"
  model: string;
  name?: string;
  platform?: "android" | "ios";
  android_version?: string;
  os_version?: string;
  manufacturer?: string;
}
```

---

## Tauri Configuration

### tauri.conf.json

```json
{
  "productName": "InspectorPlus",
  "version": "0.0.1",
  "identifier": "com.inspectorplus.app",
  "build": {
    "beforeBuildCommand": "npm run build",
    "beforeDevCommand": "npm run dev",
    "frontendDist": "../dist",
    "devUrl": "http://localhost:5173"
  },
  "app": {
    "withGlobalTauri": true,
    "windows": [{
      "title": "InspectorPlus",
      "width": 1280,
      "height": 800,
      "minWidth": 900,
      "minHeight": 600,
      "resizable": true,
      "fullscreen": false
    }]
  }
}
```

### Rust Entry Point (main.rs)

The Rust main.rs:
1. Locates backend `.venv/bin/python`
2. Starts Python backend via `uvicorn main:app --port 8001`
3. Waits for backend ready (TCP check on port 8001)
4. Launches Tauri window

---

## CSS Theme System

### CSS Variables (Dark Theme)

```css
--bg-primary: #0f0f12;        /* Main background */
--bg-secondary: #1a1a1f;      /* Panel backgrounds */
--bg-tertiary: #242429;        /* Elevated surfaces */
--bg-elevated: #2e2e35;        /* Cards, dropdowns */
--border-subtle: #3a3a42;      /* Subtle borders */
--border-default: #4a4a55;     /* Default borders */
--text-primary: #f0f0f5;       /* Primary text */
--text-secondary: #a8a8b3;     /* Secondary text */
--text-tertiary: #6b6b78;      /* Muted text */
```

### Element Type Colors

| Element | Color | Usage |
|---------|-------|-------|
| FrameLayout, LinearLayout | `#2563eb` (blue) | Layout containers |
| TextView, EditText | `#0891b2` (cyan) | Text elements |
| Button | `#ea580c` (orange) | Buttons |
| ImageView, ImageButton | `#db2777` (pink) | Image elements |
| RecyclerView, ListView | `#d97706` (amber) | List containers |
| WebView, MapView | `#15803d` (green) | Web/map views |
| SurfaceView | `#dc2626` (red) | Surface views |
| View (default) | `#52525b` (gray) | Generic views |

---

## Design System

### Neo-Brutalism Style

- **Borders:** 3px solid black/dark gray
- **Shadows:** 6px 6px 0 black (offset shadow)
- **Radius:** Minimal (mostly 0 or 4px)
- **Typography:** Space Grotesk (headings), JetBrains Mono (code)

### Layout

- **Split:** 60% screenshot / 40% inspector (flex-[3] / flex-[2])
- **Padding:** 12px (p-3) around panels
- **Gap:** 6px between panels (via padding adjustment)

### Interactions

- **Hover:** Scale 0.98 + shadow reduction
- **Active:** Press effect (translate 2px)
- **Loading:** Shimmer animation on skeleton

---

## Known Limitations

1. **Python 3.14 Incompatibility:** WebSocket handler uses deprecated APIs removed in Python 3.14. Use Python 3.13.

2. **ADB Required:** Must have Android SDK with ADB installed and device connected.

3. **No Authentication:** Backend has no auth - only runs locally.

4. **iOS Simulator Only:** Real iOS devices require WDA (WebDriverAgent) via idb-companion.

---

## File Reference

| File | Purpose |
|------|---------|
| `backend/main.py` | FastAPI entry point, all REST endpoints, ADB security model |
| `backend/device/base.py` | Abstract DeviceBridgeBase class |
| `backend/device/android_bridge.py` | Android ADB implementation (tap, swipe, drag, input text, keyevents) |
| `backend/device/ios_bridge.py` | iOS idb implementation |
| `backend/commands/app_commands.py` | App install/uninstall/launch commands |
| `frontend/src/App.tsx` | Main layout (3-tab structure) |
| `frontend/src/components/ScreenshotCanvas.tsx` | Screenshot display + zoom/pan + modes |
| `frontend/src/components/HierarchyTree.tsx` | Recursive tree view + search |
| `frontend/src/components/HierarchyPanel.tsx` | Combined hierarchy + DeviceActionsBar + screenshot fetch |
| `frontend/src/components/DeviceActionsBar.tsx` | Device interaction actions (tap, swipe, drag, pinch, input text, system keys) |
| `frontend/src/components/PropertiesPanel.tsx` | Node properties (read-only) + LocatorPanel |
| `frontend/src/components/SubTabBar.tsx` | Sub-tab navigation (Hierarchy / Accessibility) |
| `frontend/src/components/StylePanel.tsx` | Layout chips (backgroundColor, textColor, padding, elevation) |
| `frontend/src/components/RecorderPanel.tsx` | Test recorder UI |
| `frontend/src/components/AccessibilityPanel.tsx` | WCAG audit results |
| `frontend/src/services/api.ts` | TanStack Query hooks + Zod schemas |
| `frontend/src/stores/hierarchyStore.ts` | UI tree state (refetchFn for auto-refresh) |
| `frontend/src/stores/deviceStore.ts` | Device connection state |
| `frontend/src/stores/recorderStore.ts` | Test recorder state |
| `frontend/src/stores/themeStore.ts` | Theme state | |