# Support

## Getting Help

There are several ways to get help with InspectorPlus:

### GitHub Discussions

For questions about how to use InspectorPlus, feature discussions, and general
help, use [GitHub Discussions](https://github.com/azzamnizar/inspector_plus/discussions).

### GitHub Issues

For bug reports and feature requests, please use
[GitHub Issues](https://github.com/azzamnizar/inspector_plus/issues).

Before opening an issue, please check:

- [Existing issues](https://github.com/azzamnizar/inspector_plus/issues) to avoid duplicates
- [Troubleshooting section](#troubleshooting) below
- [Development guide](./docs/DEVELOPMENT.md#troubleshooting)

### Feature Requests

For feature requests, use the
[Feature Request issue template](https://github.com/azzamnizar/inspector_plus/issues/new?template=feature_request.yml).
The more detail you provide, the better we can evaluate and implement your request.

---

## Troubleshooting

### ADB Not Found

```bash
which adb
# Install Android SDK platform tools if missing
```

### mitmdump Not Found

```bash
pip install mitmproxy
# or: uv pip install mitmproxy
```

### Port 8001 in Use

```bash
lsof -i :8001
kill -9 <PID>
# Or use Settings panel in Tauri app to restart on different port
```

### Port 8002 in Use (MCP Server)

```bash
lsof -i :8002
kill -9 <PID>
# Or set MCP_PORT env var before starting
```

### Python 3.14 Detected

```bash
python3 --version  # Should be 3.13.x
# Use pyenv or conda to install 3.13 if needed
```

### Tauri Build Fails

```bash
cd frontend/src-tauri
cargo clean
npm run tauri build
```

### MCP Server Won't Start

```bash
cd backend/mcp
npm install
npm run build
# Check for TypeScript errors
```

### Network Debug: No Traffic Appears

- Ensure the device is configured to use the proxy: `adb reverse tcp:8081 tcp:8081`
- For Full Intercept (VPN) mode, ensure InspectorVPN app is installed and VPN permission was granted
- Check mitmdump logs in the backend process output

### Network Debug: VPN Permission Dialog Not Appearing

- On first VPN start, Android shows a permission dialog. If it was previously denied,
  manually grant it in Settings > Apps > InspectorVPN > VPN.

### iOS idb Not Found

```bash
brew install facebook/fb/idb-companion
```

### Claude Code MCP Shows "Failed to Connect"

```bash
curl -s http://localhost:8002/health
# Ensure MCP server is running
```

For RTK hook corrupting JSON responses, use:
```bash
rtk proxy curl -s http://localhost:8002/health
```

---

## Environment Details

When asking for help, please include:

- **OS**: macOS version / Ubuntu version / Windows version
- **Python**: `python3 --version`
- **Node**: `node --version`
- **ADB**: `adb version`
- **InspectorPlus version**: from `backend/main.py` or README

---

## Related Documentation

| Document | What It Covers |
|----------|----------------|
| [README](./README.md) | Quick overview and features |
| [DEVELOPMENT.md](./docs/DEVELOPMENT.md) | Dev setup and troubleshooting |
| [ARCHITECTURE.md](./docs/ARCHITECTURE.md) | System design and API reference |
| [NETWORK.md](./docs/NETWORK.md) | Network debug setup and VPN app |
| [MCP_QUICKREF.md](./docs/MCP_QUICKREF.md) | MCP server usage |
