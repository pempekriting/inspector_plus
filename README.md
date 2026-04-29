# InspectorPlus

Real-time Android/iOS device UI inspection tool with hierarchical view exploration, tap-to-inspect, and desktop GUI.

**Version:** 0.0.1

---

## Features

- Live screenshot streaming with 2s auto-refresh
- Hierarchical UI element tree view with expand/collapse
- Hover-to-highlight on canvas (shows element bounds)
- Click-to-tap on device screen
- Multi-device selection via dropdown
- Element property inspection (class, package, resource-id, text, bounds)
- Dark/light Neo-Brutalism theme
- Desktop app via Tauri (or browser-based dev mode)

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
| Frontend Framework | React 18 + TypeScript |
| Build Tool | Vite 6 |
| State Management | Zustand 5 |
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
│   ├── main.py              # FastAPI entry point, routes
│   ├── pyproject.toml       # Python dependencies
│   └── device/
│       ├── __init__.py       # Bridge factory
│       ├── base.py           # DeviceBridgeBase abstract class
│       ├── android_bridge.py # Android ADB implementation
│       └── ios_bridge.py     # iOS idb implementation
│
├── frontend/
│   ├── src/
│   │   ├── App.tsx           # Main layout
│   │   ├── main.tsx          # React entry
│   │   ├── index.css         # Global styles + theme
│   │   ├── components/
│   │   │   ├── ScreenshotCanvas.tsx
│   │   │   ├── HierarchyTree.tsx
│   │   │   └── Overlay.tsx
│   │   ├── stores/
│   │   │   ├── hierarchyStore.ts
│   │   │   ├── deviceStore.ts
│   │   │   └── themeStore.ts
│   │   └── hooks/
│   │       └── useDevice.ts
│   ├── src-tauri/
│   │   ├── tauri.conf.json
│   │   └── src/main.rs
│   └── package.json
│
├── docs/                    # Detailed documentation
│   ├── README.md            # Doc index
│   ├── DEVELOPMENT.md        # Setup & dev guide
│   └── ARCHITECTURE.md       # Technical details
│
├── CLAUDE.md                # Claude Code instructions
├── README.md                # This file
└── SPEC.md                  # Feature specification
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/hierarchy` | Fetch UI hierarchy |
| POST | `/tap` | Tap at coordinates |
| GET | `/device/status` | Connection status |
| GET | `/devices` | List all devices |
| POST | `/device/select` | Switch active device |
| GET | `/screenshot` | PNG screenshot stream |

See [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md#rest-api) for full API details.

---

## Known Limitations

1. **Python 3.14 Incompatibility** - WebSocket uses deprecated APIs removed in Python 3.14. Use Python 3.13.
2. **ADB Required** - Must have Android SDK with ADB installed.
4. **No Authentication** - Backend has no auth, only runs locally.

---

## License

MIT