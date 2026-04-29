# InspectorPlus Documentation

Comprehensive documentation for the InspectorPlus project.

## Documentation Structure

### [README.md](./README.md)
Main project overview, quick start guide, and feature summary.

### [DEVELOPMENT.md](./DEVELOPMENT.md)
Development guide covering:
- Environment setup
- Running the application
- Project structure
- Testing
- Build & deployment

### [ARCHITECTURE.md](./ARCHITECTURE.md)
Technical architecture details:
- System design
- API reference
- Data models
- Component hierarchy
- Design system

---

## Quick Links

| Topic | Description |
|-------|-------------|
| [Development](./DEVELOPMENT.md) | Setup and development workflow |
| [Architecture](./ARCHITECTURE.md) | System design and technical details |
| [Backend API](./ARCHITECTURE.md#rest-api) | FastAPI endpoints reference |
| [Frontend Components](./ARCHITECTURE.md#frontend) | React component documentation |
| [Data Models](./ARCHITECTURE.md#data-models) | UiNode, Device, Bounds types |

---

## Stack Overview

| Layer | Technology |
|-------|------------|
| Desktop Shell | Tauri 2 (Rust) |
| Frontend | React 18 + TypeScript + Vite |
| State | Zustand 5 |
| Styling | Tailwind CSS 3.4 |
| Backend | FastAPI 0.115 (Python 3.13+) |
| Android | ADB (uiautomator, screencap) |
| iOS | idb-companion + WDA |

---

## Key Features

- Device screenshot via combined `/hierarchy-and-screenshot` endpoint (refresh on demand or device switch)
- Hierarchical UI element tree view
- Click-to-tap on device screen
- Hover-to-highlight element bounds
- Multi-device support (Android + iOS)
- Dark/light Neo-Brutalism theme
- Property inspection panel