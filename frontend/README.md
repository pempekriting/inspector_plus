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

- **Screenshot Canvas** — Displays device screen, click to tap, hover to inspect, zoom/pan (0.25x–4x, default 0.3x)
- **Hierarchy Tree** — Expandable tree view of UI elements, click to select, search with regex (F4)
- **Overlay** — Highlight hovered/selected/locked elements on screenshot with bounds tooltip
- **Device Selector** — Switch between multiple connected devices
- **Properties Panel** — Shows element details (class, package, resource-id, text, bounds, locators)
- **Test Recorder (F2)** — Record test steps, export as Python/Java/JS
- **Accessibility Audit (F6)** — WCAG compliance checking
- **Network Debug (D7)** — mitmproxy App Proxy + VPN Full Intercept with live traffic stream
- **Context Switching (F3)** — Switch between native and WebView contexts
- **Locator Generation** — Appium locator strategies for elements
- **APK Info Panel** — Version, SDK, permissions, install type
- **ADB Command Panel** — Execute allowlisted shell commands
- **Onboarding Modal** — First-run setup wizard
- **CommandsDrawer** — Bottom drawer with App Commands + ADB Shell tabs

## Project Structure

```
frontend/
├── src/
│   ├── App.tsx           # Main layout (2-tab: inspector/commands)
│   ├── index.css         # Theme + styles + CSS variables
│   ├── components/       # 30+ components
│   │   ├── ScreenshotCanvas.tsx
│   │   ├── HierarchyTree.tsx
│   │   ├── Overlay.tsx
│   │   ├── NetworkPanel.tsx
│   │   ├── RecorderPanel.tsx
│   │   ├── AccessibilityPanel.tsx
│   │   ├── CommandsDrawer.tsx
│   │   ├── CommandsPanel.tsx
│   │   ├── ApkInfoPanel.tsx
│   │   ├── AdbPanel.tsx
│   │   └── ...
│   ├── stores/           # 6 Zustand stores
│   │   ├── hierarchyStore.ts
│   │   ├── deviceStore.ts
│   │   ├── themeStore.ts
│   │   ├── settingsStore.ts
│   │   ├── networkStore.ts
│   │   └── recorderStore.ts
│   ├── hooks/
│   │   └── useDevice.ts
│   ├── services/
│   │   └── api.ts        # TanStack Query hooks + Zod schemas
│   └── config/
│       └── apiConfig.ts  # Separate BE/MCP URL config
├── tests/                # Vitest tests (10 files, 147 tests)
│   ├── hooks/
│   ├── services/
│   ├── stores/
│   └── utils/
└── package.json
```

## State Management

- **hierarchyStore** - UI tree, hover/select state, search results, canvas mode, refresh counters
- **deviceStore** - Device list, selected device, resolution, connection status
- **themeStore** - Dark/light theme (persisted to localStorage)
- **recorderStore** - Recording session, steps, language, platform
- **networkStore** - Traffic flows, proxy/VPN status, WebSocket state
- **settingsStore** - Persistent BE/MCP URLs

## Configuration

- **API Base URL**: `http://localhost:8001` (via `VITE_API_URL` env var, defaults to localhost:8001)
- **Device polling**: 10 seconds (useDeviceStatus refetchInterval)
- **Screenshot refresh**: via combined `/hierarchy-and-screenshot` (staleTime 2000ms, manual trigger or device switch)
- **Selected device** persisted to `localStorage`
- **No auto-refresh polling** for hierarchy — manual trigger only

## API Layer

Uses TanStack Query with Zod schemas for runtime validation:
- `useDeviceStatus()` - device connection polling (10s)
- `useDevices()` - list all devices
- `useHierarchy()` / `useHierarchyAndScreenshot()` - fetch UI tree
- `useTapDevice()` - tap coordinates
- `useLocators()` - Appium locator generation
- `useAccessibilityAudit()` - WCAG audit
- `useRecorder()` - test recording
- `useProxyStatus()` / `useStartProxy()` / `useStopProxy()` - mitmproxy control
- `useVpnStatus()` / `useStartVpn()` / `useStopVpn()` - VPN control
- `useNetworkTraffic()` / `useNetworkInfo()` - network diagnostics
- `useInstallCert()` - MITM certificate install

## Dependencies

- React 18.3
- Zustand 5 (state management)
- TanStack Query 4.x (server state)
- Zod (runtime validation)
- Tailwind CSS 3.4 (styling)
- Vite 6 (build tool)