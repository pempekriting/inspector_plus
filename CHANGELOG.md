# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Comprehensive contributing documentation (CONTRIBUTING.md, CODE_OF_CONDUCT.md, CHANGELOG.md, SECURITY.md, SUPPORT.md)
- GitHub issue and pull request templates
- MIT LICENSE file

### Fixed
- iOS hierarchy unavailable due to missing `fb-idb` Python package — replaced broken `idb_companion` fallback with direct `uv run idb --udid <udid>` integration ([#76](https://github.com/pempekriting/inspector_plus/pull/76))

## [0.0.1] - 2026-05-10

### Added

#### Core Inspection
- Screenshot streaming via combined `/hierarchy-and-screenshot` endpoint with base64 PNG
- Hierarchical UI tree with expand/collapse, node IDs, bounds, text, resource-id
- Hover-to-highlight element bounds overlay on canvas
- Click-to-tap tap device screen by clicking canvas
- Multi-device selection dropdown for Android/iOS devices
- D2 Canvas Modes: inspect / coordinate / layout with zoom 0.25x-4x (Ctrl+scroll)

#### Advanced Panels
- Hierarchy panel with F4 Search (regex, xpath, resource-id/text filter)
- Accessibility panel with F6 WCAG Audit (severity detection)
- Test Recorder panel with F2 record steps and export to Python/Java/JS
- Network Debug panel with D7 mitmproxy App Proxy and VPN Full Intercept

#### Device & Interaction
- iOS device support via fb-idb + idb_companion
- ADB Command Panel for allowlisted shell commands
- Locator Generation with Appium strategies (id, xpath, text, etc.)
- APK Info Panel (version, SDK, permissions, install type)
- F3 WebView Contexts switching between native and webview
- Multi-pointer gesture execution (drag, pinch, swipe, custom)

#### Runtime
- Runtime port switching for BE/MCP ports via Settings panel
- Dark/light Neo-Brutalism theme with runtime switching
- Onboarding modal for first-run setup

#### Network Debug
- Two interception modes: App Proxy (`settings put global http_proxy` + `adb reverse`) and VPN Full Intercept (VPN Service on device)
- Live traffic stream via WebSocket
- Filter by URL, method, status code
- Request/response headers and body viewer
- MITM certificate push-to-device
- Android VPN app with AUTO_START support

#### Backend Architecture
- FastAPI backend with Python 3.13 (port 8001)
- Device bridge pattern: AndroidDeviceBridge (ADB + uiautomator), IOSDeviceBridge (idb)
- Typed error hierarchy (AppError, DeviceNotFoundError, HierarchyNotFoundError, etc.)
- ADB command allowlist with dangerous command blocking
- Rate limiting (5/second on hierarchy endpoints)
- CORS enabled for frontend origin

#### MCP Server
- TypeScript MCP server (port 8002) for AI tool consumption
- Streamable HTTP transport with JSON-RPC 2.0
- Tools: get_hierarchy, get_node, get_children, get_path, get_ancestors, search_nodes
- SSE real-time tree subscription endpoint
- TTL cache (30s) with hierarchy invalidation on refresh

#### Testing
- Backend: 184+ pytest tests across 8 test files
- Frontend: 147 vitest tests across 10 test files
- Pre-commit hooks (ruff format/check) for Python

#### Documentation
- README.md with features overview and quick start
- CLAUDE.md for AI coding agent instructions
- SPEC.md with API reference, data models, MCP server docs
- docs/ARCHITECTURE.md with system design and REST API
- docs/DEVELOPMENT.md with dev setup and troubleshooting
- docs/NETWORK.md with network debug architecture
- docs/MCP_QUICKREF.md with MCP server reference
