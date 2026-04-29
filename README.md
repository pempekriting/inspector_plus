# InspectorPlus

Real-time Android/iOS device UI inspection tool with hierarchical view exploration, tap-to-inspect, and desktop GUI.

**Version:** 0.0.1

![InspectorPlus Logo](docs/inspectorplus_logo.png)

---

## Features

- Screenshot streaming via combined `/hierarchy-and-screenshot` endpoint (refresh on demand or device switch)
- Hierarchical UI element tree view with expand/collapse
- Hover-to-highlight on canvas (shows element bounds)
- Click-to-tap on device screen
- Multi-device selection via dropdown
- Element property inspection (class, package, resource-id, text, bounds)
- Dark/light Neo-Brutalism theme
- Desktop app via Tauri (or browser-based dev mode)
- F2 Test Recorder — record test steps and export as Python/Java/JS scripts
- F3 WebView Contexts — switch between native and webview contexts
- F4 Hierarchy Search — search with regex, filter by xpath/resource-id/text/content-desc/class
- F6 WCAG Accessibility Audit — audit accessibility issues on UI nodes
- D2 Canvas Modes - inspect/coordinate/layout modes with zoom (0.25x-4x) and pan
- iOS Device Support - tap, swipe, text input, home button via idb (drag/pinch/zoom/back/recent disabled)
- ADB Command Panel - execute allowlisted ADB shell commands directly
- Locator Generation - generate Appium locator strategies (accessibility-id, class chain, predicate string, xpath)
- APK Info Panel - view detailed package info (version, SDK, permissions)
- Layout Bounds Overlay - display all element bounds on canvas

---

## Quick Start

### Prerequisites

- Python 3.13+ (not 3.14 - WebSocket compatibility issue)
- Node.js 18+
- ADB (Android Debug Bridge) installed and in PATH
- Android device/emulator connected via USB or TCP

### Option 1: Browser Dev Mode

**Terminal 1 - Backend:**
```bash
cd backend
uv sync --python python3.13
uvicorn main:app --reload --port 8001
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`

### Option 2: Tauri Desktop App

```bash
cd frontend
npm install
npm run tauri dev
```

This automatically starts the Python backend and opens the desktop window.

---

## Documentation

| Document | Description |
|----------|-------------|
| [docs/README.md](./docs/README.md) | Documentation index |
| [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md) | Development guide, setup, testing |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | Technical architecture, API reference |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Tauri Desktop App                     │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │               React Frontend (localhost:5173)            │ │
│  │  ScreenshotCanvas ←HTTP→ useDevice (API hooks)          │ │
│  └─────────────────────────────────┬───────────────────────┘ │
└─────────────────────────────────────┼─────────────────────────┘
                                      │ HTTP (port 8001)
┌─────────────────────────────────────┼─────────────────────────┐
│               Python Backend (FastAPI)                        │
│  REST API: /hierarchy, /tap, /screenshot, /devices           │
│         │                        │                            │
│  ┌──────┴──────┐          ┌──────┴──────┐                     │
│  │AndroidBridge│          │ IOSDeviceBridge│                  │
│  │   (ADB)    │          │    (idb)     │                     │
└───────────────┼──────────────────────────┼─────────────────────┘
                │                          │
           ┌────┴────┐              ┌─────┴─────┐
           │ Android │              │ iOS Dev   │
           │ Device  │              │ /Simulator│
           └─────────┘              └───────────┘
```

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Desktop Shell | Tauri 2 (Rust) |
| Frontend Framework | React 18.3 + TypeScript |
| Build Tool | Vite 6.0 |
| State Management | Zustand 5.0 |
| Data Fetching | TanStack Query 5.100 |
| Validation | Zod 4.3 |
| Styling | Tailwind CSS 3.4 |
| Backend Framework | FastAPI 0.115 |
| Python Version | 3.13+ |
| Android Communication | ADB (uiautomator, screencap) |
| iOS Communication | idb-companion |

---

## Project Structure

```
inspector_plus/
├── backend/
│   ├── main.py                  # FastAPI entry point, routes
│   ├── pyproject.toml           # Python dependencies
│   ├── uv.lock                  # Locked dependencies
│   ├── Dockerfile               # Container build
│   ├── .env.example             # Environment template
│   ├── README.md               # Backend-specific docs
│   ├── test_app.py             # pytest test suite
│   ├── test_app_commands.py
│   ├── test_base.py
│   ├── test_device_bridges.py
│   ├── test_validate.py
│   ├── test_ws.py
│   ├── test_ws_server.py
│   ├── commands/
│   │   ├── app_commands.py      # Appium-like command executor
│   │   └── ios_app_commands.py
│   └── device/
│       ├── __init__.py          # Bridge factory
│       ├── base.py              # DeviceBridgeBase abstract class
│       ├── android_bridge.py     # Android ADB implementation
│       └── ios_bridge.py         # iOS idb implementation
│
├── frontend/
│   ├── src/
│   │   ├── App.tsx              # Main layout
│   │   ├── main.tsx             # React entry
│   │   ├── index.css            # Global styles + theme
│   │   ├── components/
│   │   │   ├── AccessibilityPanel.tsx
│   │   │   ├── AdbPanel.tsx
│   │   │   ├── ApkInfoPanel.tsx
│   │   │   ├── BottomDrawer.tsx
│   │   │   ├── CommandsDrawer.tsx
│   │   │   ├── CommandsPanel.tsx
│   │   │   ├── DevicePanel.tsx
│   │   │   ├── EmptyState.tsx
│   │   │   ├── ErrorBoundary.tsx
│   │   │   ├── ErrorState.tsx
│   │   │   ├── HierarchyPanel.tsx
│   │   │   ├── HierarchyTree.tsx
│   │   │   ├── LayoutBoundsOverlay.tsx
│   │   │   ├── LocatorPanel.tsx
│   │   │   ├── Overlay.tsx
│   │   │   ├── PropertiesPanel.tsx
│   │   │   ├── PropertyRow.tsx
│   │   │   ├── RecorderPanel.tsx
│   │   │   ├── ScreenshotCanvas.tsx
│   │   │   ├── SearchBar.tsx
│   │   │   ├── SkeletonLoader.tsx
│   │   │   ├── StatusBar.tsx
│   │   │   ├── StylePanel.tsx
│   │   │   └── TabBar.tsx
│   │   ├── stores/
│   │   │   ├── hierarchyStore.ts
│   │   │   ├── deviceStore.ts
│   │   │   ├── recorderStore.ts
│   │   │   └── themeStore.ts
│   │   ├── hooks/
│   │   │   ├── useDevice.ts
│   │   │   ├── useCommands.ts
│   │   │   └── useRecording.ts
│   │   └── services/
│   │       └── api.ts
│   ├── src-tauri/
│   │   ├── tauri.conf.json
│   │   ├── capabilities/
│   │   ├── gen/
│   │   ├── icons/
│   │   ├── src/main.rs
│   │   ├── build.rs
│   │   ├── Cargo.toml
│   │   └── Cargo.lock
│   ├── package.json
│   ├── postcss.config.js
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   ├── tsconfig.node.json
│   ├── vite.config.ts
│   ├── vitest.config.ts
│   ├── vitest.setup.ts
│   ├── .env.example
│   ├── .gitignore
│   └── README.md
│
├── docs/
│   ├── README.md
│   ├── DEVELOPMENT.md
│   └── ARCHITECTURE.md
│
├── CLAUDE.md                     # Claude Code instructions
└── README.md                     # This file
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/ready` | Readiness probe (checks device connection) |
| GET | `/hierarchy` | Fetch UI hierarchy |
| GET | `/hierarchy-and-screenshot` | Combined hierarchy + screenshot |
| GET | `/hierarchy/search` | Filtered search by xpath/resource-id/text/content-desc/class |
| GET | `/hierarchy/find` | Tree search with regex |
| GET | `/hierarchy/locators` | Generate Appium locator strategies |
| POST | `/hierarchy/audit` | WCAG accessibility audit |
| POST | `/tap` | Tap at coordinates |
| POST | `/input/text` | Text input to device |
| GET | `/device/status` | Connection status |
| GET | `/devices` | List all devices |
| POST | `/device/select` | Switch active device |
| GET | `/device/contexts` | List WebView/native contexts |
| POST | `/device/switch-context` | Switch context (native/webview) |
| POST | `/device/adb` | Execute allowlisted ADB command |
| GET | `/screenshot` | PNG screenshot stream |
| GET | `/app/commands/info` | Get detailed APK info |
| POST | `/commands/execute` | Execute device commands |
| POST | `/recorder/record` | Record test step |
| GET | `/recorder/export` | Export recording as Python/Java/JS |
| POST | `/recorder/clear` | Clear recording session |

See [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md#rest-api) for full API details.

---

## Known Limitations

1. **Python 3.14 Incompatibility** - WebSocket uses deprecated APIs removed in Python 3.14. Use Python 3.13.
2. **ADB Required** - Must have Android SDK with ADB installed.
3. **No Authentication** - Backend has no auth, only runs locally.

---

## License

MIT
