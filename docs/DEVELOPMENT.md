# Development Guide

## Prerequisites

- Python 3.13+ (not 3.14 - WebSocket compatibility issue)
- Node.js 18+
- npm or yarn
- ADB (Android Debug Bridge) installed and in PATH
- For iOS: idb-companion (`brew install facebook/fb/idb-companion`)

## Environment Setup

### 1. Backend Setup

```bash
cd backend

# Create virtual environment with Python 3.13
uv sync --python python3.13

# Or if uv not installed
python3.13 -m venv .venv
source .venv/bin/activate
pip install fastapi uvicorn websockets pydantic
```

### 2. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Or if using yarn
yarn
```

### 3. Tauri Setup (for desktop app)

```bash
# Install Rust if not available
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Verify installation
rustc --version
cargo --version
```

## Running the Application

### Development Mode (Browser)

**Terminal 1 - Backend:**
```bash
cd backend
uv sync --python python3.13
uvicorn main:app --reload --port 8001
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

Open `http://localhost:5173` in your browser.

### Tauri Desktop App

```bash
cd frontend
npm run tauri dev
```

This will:
1. Start the Python backend automatically
2. Open the Tauri window
3. Connect frontend to backend

### Build for Production

**Frontend + Tauri:**
```bash
cd frontend
npm run tauri build
```

Output: `frontend/src-tauri/target/release/inspectorplus`

## Project Structure

```
inspector_plus/
├── backend/
│   ├── main.py              # FastAPI entry point + all routes + ADB security model
│   ├── pyproject.toml       # Python dependencies
│   ├── .venv/               # Virtual environment
│   ├── device/
│   │   ├── __init__.py      # Bridge factory (create_bridge_for_device)
│   │   ├── base.py          # DeviceBridgeBase abstract class (15+ methods)
│   │   ├── android_bridge.py # ADB + uiautomator implementation
│   │   └── ios_bridge.py     # idb + WDA implementation
│   └── commands/
│       ├── app_commands.py      # Android app commands
│       └── ios_app_commands.py  # iOS app commands
│
├── frontend/
│   ├── src/
│   │   ├── App.tsx           # Main layout (3-tab: inspector/commands/apk-info)
│   │   ├── main.tsx          # React entry point + QueryClient provider
│   │   ├── index.css         # Global styles + CSS variables
│   │   ├── components/       # 29+ components
│   │   ├── stores/           # Zustand stores (hierarchy, device, theme, recorder)
│   │   ├── hooks/
│   │   │   └── useDevice.ts  # Polling hook (legacy)
│   │   └── services/
│   │       └── api.ts        # TanStack Query hooks + Zod schemas (primary)
│   ├── src-tauri/
│   │   ├── tauri.conf.json   # Tauri configuration
│   │   ├── Cargo.toml        # Rust dependencies
│   │   └── src/
│   │       └── main.rs       # Rust entry point
│   ├── package.json
│   └── vite.config.ts
│
├── docs/                    # Documentation
│   ├── DEVELOPMENT.md        # This file
│   └── ARCHITECTURE.md       # Technical architecture
│
├── CLAUDE.md                # Claude Code instructions
├── README.md                # Project overview
└── SPEC.md                  # Feature specification
```

## Development Workflow

### 1. Making Backend Changes

The backend runs independently. After modifying backend code:
- If using `uvicorn --reload`, changes auto-reload
- Otherwise restart: `uvicorn main:app --reload --port 8001`

### 2. Making Frontend Changes

Changes hot-reload via Vite. No restart needed.

### 3. Making Tauri/Rust Changes

Requires app restart:
```bash
npm run tauri dev
```

### 4. Adding New API Endpoints

**Backend (main.py):**
```python
from main import AppError, DeviceNotFoundError

@app.get("/new-endpoint")
async def new_endpoint(udid: Optional[str] = None):
    bridge = get_bridge(udid)
    if bridge is None:
        raise DeviceNotFoundError()
    try:
        result = bridge.some_method()
        return result
    except AppError:
        raise  # Let global handler deal with it
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to ...")
```

**Frontend (services/api.ts) — TanStack Query + Zod:**
```typescript
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './services/api';

// Add Zod schema for request/response
const NewEndpointSchema = z.object({ field: z.string() });

export function useNewEndpoint(udid?: string) {
  return useQuery({
    queryKey: ['new-endpoint', udid],
    queryFn: () => apiFetch('/new-endpoint', { params: { udid } }),
  });
}
```

## Testing

### Manual Testing

1. Connect Android device via USB or start emulator
2. Verify ADB connection: `adb devices`
3. Start backend and frontend
4. Test interactions:
   - Screenshot displays correctly
   - Tree view populates
   - Hover highlights work
   - Click-to-tap works

### iOS Testing

1. Install idb-companion: `brew install facebook/fb/idb-companion`
2. List simulators: `xcrun simctl list devices`
3. Boot a simulator
4. idb should detect it automatically

## Troubleshooting

### ADB Not Found

```bash
# Check if adb is installed
which adb

# If not found, install Android SDK platform tools
```

### Backend Port Already in Use

```bash
# Find and kill process on port 8001
lsof -i :8001
kill -9 <PID>
```

### Python Version Issue

```bash
# Check Python version
python3 --version

# Should be 3.13.x, not 3.14.x
# If on 3.14, use pyenv or conda to install 3.13
```

### Tauri Build Fails

```bash
# Clean Rust build cache
cd frontend/src-tauri
cargo clean

# Rebuild
npm run tauri build
```

## Code Style

### Python (Backend)

- Use type hints
- Follow PEP 8
- Use `async` for FastAPI handlers
- Validate input with Pydantic models

### TypeScript (Frontend)

- Use strict TypeScript
- Prefer Zustand stores over React Context
- Use `memo()` for performance-critical components
- Follow existing naming conventions

## Adding New Device Platforms

1. Create new bridge class in `backend/device/`
2. Inherit from `DeviceBridgeBase`
3. Implement all abstract methods
4. Update `get_bridge()` in `main.py` to detect new platform
5. Update frontend device store if platform needs special handling