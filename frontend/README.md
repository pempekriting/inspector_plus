# InspectorPlus Frontend

React + Vite frontend for Android UI inspection.

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

- **Screenshot Canvas** - Displays device screen, click to tap, hover to inspect
- **Hierarchy Tree** - Expandable tree view of UI elements, click to select
- **Overlay** - Highlight hovered elements on screenshot with bounds tooltip
- **Device Selector** - Switch between multiple connected devices
- **Properties Panel** - Shows element details (class, package, resource-id, text, bounds)

## Project Structure

```
frontend/
├── src/
│   ├── App.tsx           # Main layout
│   ├── index.css         # Theme + styles
│   ├── components/
│   │   ├── ScreenshotCanvas.tsx   # Screenshot + tap
│   │   ├── HierarchyTree.tsx       # Tree view
│   │   └── Overlay.tsx             # Hover highlight
│   ├── stores/
│   │   ├── hierarchyStore.ts      # UI tree state
│   │   └── deviceStore.ts         # Device state
│   └── hooks/
│       └── useDevice.ts           # API calls
└── package.json
```

## State Management

- **hierarchyStore** - UI tree, hover/select state, loading states, refresh counter
- **deviceStore** - Device list, selected device, resolution, connection status

## Configuration

- API Base URL: `http://localhost:8001` (configurable in `src/hooks/useDevice.ts`)
- Screenshot refresh: 2 seconds (fixed)
- Device polling: 5 seconds
- Selected device persisted to `localStorage`

## Dependencies

- React 18.3
- Zustand 5 (state management)
- Tailwind CSS 3.4 (styling)
- Vite 6 (build tool)