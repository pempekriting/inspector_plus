# Development Guide

## Prerequisites

- Python 3.13+ (not 3.14 — WebSocket compatibility issue)
- Node.js 18+
- npm or yarn
- ADB in PATH
- For iOS: idb-companion (`brew install facebook/fb/idb-companion`)

## Project Structure

```
inspector_plus/
├── backend/                    # Python FastAPI
│   ├── main.py                 # Entry + routes + error handlers
│   ├── pyproject.toml
│   ├── device/
│   │   ├── __init__.py         # Bridge factory
│   │   ├── base.py             # DeviceBridgeBase abstract
│   │   ├── android_bridge.py  # ADB + uiautomator
│   │   └── ios_bridge.py       # idb + WDA
│   ├── commands/
│   │   ├── app_commands.py
│   │   └── ios_app_commands.py
│   └── mcp/                    # MCP server (Node.js)
│       ├── src/
│       │   ├── server.ts         # Express + StreamableHTTP MCP server
│       │   ├── types/
│       │   ├── services/
│       │   ├── cache/
│       │   └── tools/
│       └── package.json
│
├── frontend/                   # React + TypeScript + Vite
│   ├── src/
│   │   ├── App.tsx              # Main layout
│   │   ├── components/
│   │   │   ├── SettingsPanel.tsx  # Runtime port config + server spawn
│   │   │   ├── DevicePanel.tsx
│   │   │   └── ...             # All other components
│   │   ├── stores/
│   │   │   ├── settingsStore.ts  # Persistent settings
│   │   │   ├── hierarchyStore.ts
│   │   │   ├── deviceStore.ts
│   │   │   └── themeStore.ts
│   │   ├── config/
│   │   │   └── apiConfig.ts     # Separate BE/MCP URL config
│   │   ├── services/api.ts      # TanStack Query + Zod
│   │   └── types/
│   └── src-tauri/              # Tauri desktop
│       ├── src/
│       │   ├── main.rs          # Entry + server lifecycle
│       │   ├── backend_manager.rs  # Python/FastAPI process manager
│       │   ├── mcp_manager.rs   # Node.js MCP process manager
│       │   └── commands.rs      # Tauri IPC commands
│
├── docs/
│   ├── ARCHITECTURE.md          # System design
│   └── DEVELOPMENT.md            # This file
│
├── SPEC.md                     # Technical reference
├── README.md                   # Quick overview
└── CLAUDE.md                   # Claude Code instructions
```

## Backend Setup

```bash
cd backend
uv sync --python python3.13
```

Start:
```bash
uv run uvicorn main:app --reload --port 8001
```

## Frontend Setup

```bash
cd frontend
npm install
```

Start:
```bash
npm run dev      # Browser mode (http://localhost:5173)
npm run tauri dev  # Desktop app
```

## MCP Server Setup

```bash
cd backend/mcp
npm install
```

Start:
```bash
npm run dev      # Development (tsx watch)
npm run build && npm start  # Production (port 8002)
```

## Running Tests

**Backend:**
```bash
cd backend
uv run pytest
```

**Frontend:**
```bash
cd frontend
npm test
```

## Adding New Features

### Backend: New API Endpoint

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
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed: {e}")
```

### Frontend: New TanStack Query Hook

```typescript
// services/api.ts
const NewEndpointSchema = z.object({ field: z.string() });

export function useNewEndpoint(udid?: string) {
  return useQuery({
    queryKey: ['new-endpoint', udid],
    queryFn: () => apiFetch('/new-endpoint', { params: { udid } }),
  });
}
```

### New MCP Tool

```typescript
// backend/mcp/src/tools/hierarchy.ts
export async function getNodeTool(input) {
  // Implementation
}

// backend/mcp/src/server.ts
server.registerTool('get_node', {
  description: '...',
  inputSchema: z.object({ nodeId: z.string() }),
}, async ({ nodeId }) => {
  return handleToolCall('get_node', { nodeId });
});
```

## Troubleshooting

### ADB not found
```bash
which adb
# Install Android SDK platform tools if missing
```

### Port 8001 in use
```bash
lsof -i :8001
kill -9 <PID>
# Or use Settings panel in Tauri app to restart on different port
```

### Port 8002 in use (MCP server)
```bash
lsof -i :8002
kill -9 <PID>
# Or set MCP_PORT env var before starting
```

### Python 3.14 detected
```bash
python3 --version  # Should be 3.13.x
# Use pyenv or conda to install 3.13 if needed
```

### Tauri build fails
```bash
cd frontend/src-tauri
cargo clean
npm run tauri build
```

### MCP server won't start
```bash
cd backend/mcp
npm install
npm run build
# Check for TypeScript errors
```

## Code Style

### Python
- Type hints on all functions
- Use `async` for FastAPI handlers
- Validate input with Pydantic models
- Follow PEP 8

### TypeScript
- Strict TypeScript
- Zustand for state management
- `memo()` for performance-critical components

## Adding New Device Platform

1. Create `backend/device/new_platform_bridge.py`
2. Inherit from `DeviceBridgeBase`
3. Implement all abstract methods
4. Update `get_bridge()` in `main.py`
5. Update frontend device store if needed