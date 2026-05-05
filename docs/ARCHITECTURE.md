# Architecture

## System Design

```
┌─────────────────────────────────────────────────────────────────┐
│                        Tauri Desktop App                        │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │              React Frontend (localhost:5173)              │  │
│  │   ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │  │
│  │   │ Screenshot  │  │  Hierarchy  │  │  Overlay        │  │  │
│  │   │  Canvas     │  │    Tree     │  │  (hover highlight)│  │  │
│  │   └──────┬──────┘  └──────┬──────┘  └──────────┬────────┘  │  │
│  │          └───────────────┼─────────────────────┘           │  │
│  │   ┌─────────────────────┴──────────────────────────┐     │  │
│  │   │              TanStack Query (api.ts)             │     │  │
│  │   └─────────────────────┬──────────────────────────┘     │  │
│  └─────────────────────────┼──────────────────────────────┘   │
│                             │ HTTP (port 8001)                │
└─────────────────────────────┼────────────────────────────────┘
                              │
┌─────────────────────────────┼────────────────────────────────┐
│               Python Backend (FastAPI - port 8001)             │
│  ┌──────────────────────────┴──────────────────────────────┐  │
│  │                    REST API                             │  │
│  └──────┬────────────────────────┬─────────────────────────┘  │
│         │                        │                            │
│  ┌──────┴──────┐          ┌──────┴──────┐                   │
│  │ Android     │          │ iOS        │                   │
│  │DeviceBridge │          │DeviceBridge │                   │
│  │   (ADB)     │          │  (idb)      │                   │
│  └──────┬──────┘          └──────┬──────┘                   │
│         │                        │                           │
│    ┌────┴────┐              ┌─────┴─────┐                   │
│    │ Android │              │ iOS Dev   │                   │
│    │ Device  │              │ /Simulator│                   │
│    └─────────┘              └───────────┘                    │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────┼────────────────────────────────┐
│     MCP Server (port 8002)  │  AI clients (Claude Code)     │
│  ┌──────────────────────────┴──────────────────────────────┐  │
│  │  StreamableHTTP + Express  │  Tools: get_hierarchy, etc  │  │
│  └──────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

## Backend Architecture

### FastAPI + Uvicorn

- **Port:** 8001
- **Python:** 3.13+ (3.14 has WebSocket incompatibility)
- **CORS:** Enabled for frontend origin
- **Rate limiting:** 5/second on hierarchy endpoints

### Device Bridge Pattern

```
get_bridge(udid?)
    │
    ├── iOS UDID (24+ hex chars) → IOSDeviceBridge
    │
    └── Android serial → AndroidDeviceBridge
```

Bridges are cached per UDID for consistent node IDs across requests.

### REST API

| Category | Endpoints |
|----------|-----------|
| Health | `GET /health`, `GET /ready` |
| Hierarchy | `GET /hierarchy`, `GET /hierarchy-and-screenshot`, `GET /hierarchy/search`, `GET /hierarchy/find`, `GET /hierarchy/locators`, `POST /hierarchy/audit` |
| Interactions | `POST /tap`, `POST /input/text`, `POST /device/press-key`, `POST /device/swipe`, `POST /device/drag`, `POST /device/pinch` |
| Device | `GET /device/status`, `GET /devices`, `POST /device/select`, `GET /device/contexts`, `POST /device/switch-context`, `POST /device/adb` |
| Screenshot | `GET /screenshot` |
| App Commands | `GET /app/commands/info`, `POST /commands/execute` |
| Recorder | `POST /recorder/record`, `GET /recorder/export`, `POST /recorder/clear` |

### Hierarchy Data Flow

```
1. uiautomator dump → XML on device
2. Pull /sdcard/window_dump.xml → local
3. Parse XML with lxml → Python dict
4. Generate node IDs: ClassName_N
5. Convert bounds [x1,y1,x2,y2] → {x, y, width, height}
6. Return nested UiNode tree
```

## MCP Server Architecture

### Purpose

Serve tree hierarchy data to AI clients (Claude Code) via MCP protocol for POM (Page Object Model) generation.

### Stack

- **Runtime:** Node.js + TypeScript
- **MCP SDK:** @modelcontextprotocol/sdk 1.29+
- **Transport:** Streamable HTTP (JSON-RPC 2.0)
- **Framework:** Express.js

### File Structure

```
backend/mcp/
├── src/
│   ├── server.ts              # Express + MCP + SSE
│   ├── types/mcp-types.ts     # Zod schemas, types
│   ├── services/tree-service.ts  # FastAPI bridge + caching
│   ├── cache/tree-cache.ts    # TTL cache (30s)
│   └── tools/
│       ├── hierarchy.ts       # get_hierarchy, get_node
│       ├── traversal.ts       # get_children, get_path, get_ancestors
│       └── search.ts          # search_nodes
├── package.json
└── tsconfig.json
```

### Available Tools

| Tool | Args | Description |
|------|------|-------------|
| `get_hierarchy` | deviceId, maxDepth? | Full UI tree |
| `get_node` | nodeId | Single node |
| `get_children` | nodeId, cursor?, pageSize? | Paginated children |
| `get_path` | nodeId | Root→node path |
| `get_ancestors` | nodeId | All ancestors |
| `search_nodes` | deviceId, query, matchType?, limit? | Text/xpath/regex search |

### MCP Request Flow

```
1. POST /mcp → initialize (protocolVersion, clientInfo)
2. POST /mcp → notifications/initialized
3. POST /mcp → tools/list (get available tools)
4. POST /mcp → tools/call (invoke tool)
5. GET /subscribe/:deviceId → SSE stream (real-time updates)
```

### Caching

- In-memory TTL cache: 30 seconds
- Cache key: `hierarchy:{deviceId}`
- Invalidated on tree refresh

## Frontend Architecture

### TanStack Query + Zod

Primary data fetching layer with runtime validation:

```typescript
// Zod schemas validate API responses
const UiNodeSchema = z.object({
  id: z.string(),
  className: z.string().optional(),
  text: z.string().optional(),
  bounds: BoundsSchema,
  children: z.array(lazy(() => UiNodeSchema)).optional(),
});

// Query hooks
useHierarchyAndScreenshot()  // Combined endpoint, staleTime 2000ms
useDeviceStatus()          // Polling every 10s
useTapDevice()
useLocators()
```

### Component Hierarchy

```
App
├── ScreenshotCanvas (60% width)
│   └── Overlay (hover/selected/locked highlight)
├── DevicePanel (header toolbar)
├── TabBar (inspector | commands | apk-info)
└── Inspector (tab content)
    ├── HierarchyPanel
    │   ├── DeviceActionsBar
    │   ├── SearchBar
    │   └── HierarchyTree → TreeNode (recursive)
    ├── PropertiesPanel
    │   ├── PropertyRow
    │   └── LocatorPanel
    └── RecorderPanel
```

### State Management (Zustand)

| Store | Purpose |
|-------|---------|
| `hierarchyStore` | Tree, nodes, search, refresh |
| `deviceStore` | Devices, resolution, selection |
| `themeStore` | Dark/light theme |
| `recorderStore` | Recording session |

### Canvas Modes

| Mode | Behavior |
|------|----------|
| `inspect` | Click to lock element |
| `coordinate` | Show coordinate popup on click |
| `layout` | Display all element bounds overlay |

Zoom: 0.25x–4x (default 0.3x), Ctrl+scroll to zoom, drag to pan at high zoom.

## CSS Theme System

### Dark Theme (Default)

```css
--bg-primary: #0f0f12;
--bg-secondary: #1a1a1f;
--bg-tertiary: #242429;
--border-subtle: #3a3a42;
--border-default: #4a4a55;
--text-primary: #f0f0f5;
--text-secondary: #a8a8b3;
```

### Element Type Colors

| Type | Color | Example |
|------|-------|---------|
| Layout containers | `#2563eb` | FrameLayout, LinearLayout |
| Text elements | `#0891b2` | TextView, EditText |
| Buttons | `#ea580c` | Button |
| Image elements | `#db2777` | ImageView, ImageButton |
| List containers | `#d97706` | RecyclerView, ListView |
| Web/Map | `#15803d` | WebView, MapView |

### Neo-Brutalism Design

- 3px solid borders
- 6px 6px offset shadows
- Minimal border radius (0-4px)
- Press effect on active buttons

## Error Handling

### Backend (Typed Errors)

```python
AppError (base)
├── DeviceNotFoundError (404)
├── HierarchyNotFoundError (404)
├── CommandExecutionError (500)
└── UnsupportedOnPlatformError (400)
```

Global handler: `app.add_exception_handler(AppError, app_error_handler)`

### Frontend

- `ErrorBoundary` wraps component tree
- `ErrorState` shows retry button
- API errors mapped via `getErrorMessage()`

## Security

### ADB Allowlist

Allowed prefixes: `input`, `pm`, `am`, `screencap`, `dumpsys`, `getprop`, `setprop`, `monkey`, `uiautomator`, `cat`, `ls`, `mkdir`, `touch`

Blocked: `reboot`, `shutdown`, `dd`, `mkfs`, `mount`, `remount`, `sqlite3`, `tar`, `zip`, `unzip`

Forbidden chars: `&&`, `||`, `|`, `;`, `` ` ``, `$(`, `>`, `>>`, `&`

## Known Limitations

1. **Python 3.14** — WebSocket APIs removed, use 3.13
2. **ADB required** — Android SDK with ADB in PATH
3. **No auth** — Backend runs locally only
4. **iOS real devices** — Require WDA via idb-companion