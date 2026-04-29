# InspectorPlus Frontend

React + Vite frontend for Android/iOS UI inspection.

## Requirements

- Node.js 18+
- npm or pnpm

## Quick Start

```bash
cd frontend
npm install
npm run dev
```

App runs at `http://localhost:5173`

## Features

- **Screenshot Canvas** - Displays device screen, click to tap, hover to inspect, zoom/pan
- **Hierarchy Tree** - Expandable tree view of UI elements, click to select, search with regex (F4)
- **Overlay** - Highlight hovered elements on screenshot with bounds tooltip
- **Device Selector** - Switch between multiple connected devices
- **Properties Panel** - Shows element details (class, package, resource-id, text, bounds)
- **Test Recorder (F2)** - Record test steps, export as Python/Java/JS
- **Accessibility Audit (F6)** - WCAG compliance checking
- **Context Switching (F3)** - Switch between native and WebView contexts
- **Locator Generation** - Appium locator strategies for elements

## Project Structure

```
frontend/
├── src/
│   ├── App.tsx           # Main layout (3-tab: inspector/commands/apk-info)
│   ├── index.css         # Theme + styles + CSS variables
│   ├── components/       # 29+ components
│   │   ├── ScreenshotCanvas.tsx   # Screenshot + tap + zoom/pan
│   │   ├── HierarchyTree.tsx       # Tree view
│   │   ├── Overlay.tsx             # Hover highlight
│   │   ├── RecorderPanel.tsx      # Test recorder
│   │   ├── AccessibilityPanel.tsx # WCAG audit
│   │   └── ...
│   ├── stores/
│   │   ├── hierarchyStore.ts      # UI tree state, search, refresh
│   │   ├── deviceStore.ts         # Device state, resolution
│   │   ├── themeStore.ts          # Dark/light theme
│   │   └── recorderStore.ts       # Recording session state
│   ├── hooks/
│   │   └── useDevice.ts          # Device polling hook
│   └── services/
│       └── api.ts               # TanStack Query hooks + Zod schemas
└── package.json
```

## State Management

- **hierarchyStore** - UI tree, hover/select state, search results, canvas mode, refresh counters
- **deviceStore** - Device list, selected device, resolution, connection status
- **themeStore** - Dark/light theme (persisted to localStorage)
- **recorderStore** - Recording session, steps

## Configuration

- **API Base URL**: `http://localhost:8001` (via `VITE_API_URL` env var, defaults to localhost:8001)
- **Device polling**: 10 seconds (useDeviceStatus refetchInterval)
- **Screenshot refresh**: via combined `/hierarchy-and-screenshot` (staleTime 2000ms, manual trigger or device switch)
- **Selected device** persisted to `localStorage`

## API Layer

Uses TanStack Query with Zod schemas for runtime validation:
- `useDeviceStatus()` - device connection polling (10s)
- `useDevices()` - list all devices
- `useHierarchy()` / `useHierarchyAndScreenshot()` - fetch UI tree
- `useTapDevice()` - tap coordinates
- `useLocators()` - Appium locator generation
- `useAccessibilityAudit()` - WCAG audit
- `useRecorder()` - test recording

## Dependencies

- React 18.3
- Zustand 5 (state management)
- TanStack Query 4.x (server state)
- Zod (runtime validation)
- Tailwind CSS 3.4 (styling)
- Vite 6 (build tool)