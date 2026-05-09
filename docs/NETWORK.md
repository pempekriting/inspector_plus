# Network Debug — Full Interception Mode

InspectorPlus Network Debug supports two interception modes:

| Mode | Technique | Catches |
|------|-----------|---------|
| **App Proxy** | `settings put global http_proxy` + `adb reverse` | Only apps honoring system proxy |
| **Full Intercept** | VPN Service on device | ALL device traffic |

Full Intercept uses Android's VpnService API to capture traffic that bypasses the system proxy — the same technique used by HTTP Toolkit, Charles, and Proxyman.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  FRONTEND                                                │
│  NetworkPanel — WebSocket streams live flows              │
└──────────────────────────┬─────────────────────────────────┘
                       │ HTTP / WebSocket
                       ↓
┌──────────────────────────────────────────────────────────┐
│  BACKEND (FastAPI :8001)                                │
│  MitmproxyManager — mitmdump process lifecycle         │
│  network/routes.py — VPN endpoints                     │
└──────────┬─────────────────────────────┬────────────────┘
           │ ADB                      │
           ↓                          ↓
┌──────────────────────────────────────────────────────────┐
│  DEVICE (Android emulator / phone)                      │
│  InspectorVPN app — VpnService (10.0.0.2/32, route 0.0.0.0/0)
│  LocalTcpProxy :8081 — proxies to host via protect()
└───────────────────────────────────────────────────────
                       │
                       │ adb reverse tcp:8081 tcp:{mitmdump_port}
                       ↓
┌──────────────────────────────────────────────────┐
│  HOST mitmdump :{port} — captures to .mitm file   │
└──────────────────────────────────────────────────┘
```

## Traffic Flow (Full Intercept)

```
1. backend/setup_vpn_proxy(8080)
   a. install_vpn_app() — adb install -r inspector_vpn.apk
   b. MitmproxyManager.start() — spawn mitmdump -p {port}
   c. adb reverse tcp:8081 tcp:{port}
   d. am start -a AUTO_START — MainActivity auto-starts service

2. InspectorVpnService.onStartCommand()
   a. VpnService.prepare() — permission dialog (first time only)
   b. Builder.establish() — VPN interface 10.0.0.2/32, route 0.0.0.0/0
   c. startLocalProxy() — ServerSocket :8081

3. VPN traffic path:
   App → VPN interface (10.0.0.2) → local proxy :8081
   → protected socket → adb reverse tunnel → host mitmdump
   → .mitm flow file → backend reads → WebSocket → frontend

4. User taps Stop → am force-stop + adb reverse --remove tcp:8081
```

## VPN App (inspector_vpn/)

```
inspector_vpn/
├── app/src/main/java/com/inspectorplus/vpn/
│   ├── InspectorVpnService.java  # VpnService lifecycle
│   └── MainActivity.java          # Permission + auto_start
├── app/src/main/AndroidManifest.xml
└── build.gradle.kts
```

### InspectorVpnService.java

- `Builder.establish()` — VPN interface 10.0.0.2/32, route 0.0.0.0/0, DNS 8.8.8.8/1.1.1.1
- `startLocalProxy()` — ServerSocket :8081 accepts VPN traffic
- `handleProxyConnection()` — bidirectional proxy with `protect(socket)` preventing loopback
- `protect(socket)` — CRITICAL: without this, proxy connection loops back through VPN
- `onRevoke()` / `onDestroy()` — sets running=false, closes sockets, stopSelf()
- Foreground notification (Android 9+)

### MainActivity.java

Two modes:

**Auto-start mode** (launched from backend via `am start -a AUTO_START`):
```
getIntent().getAction() == "com.inspectorplus.vpn.AUTO_START"
  → prepare VPN permission
  → start InspectorVpnService
  → finish() immediately (no UI shown)
```

**Manual mode** (user taps app icon):
```
Shows Start/Stop button UI
VpnService.prepare() → permission dialog → startService()
```

## Backend Integration

### DeviceBridgeBase Methods (android_bridge.py)

```python
setup_vpn_proxy(port=8080)  # → installs APK, starts mitmdump, adb reverse, launches VPN
stop_vpn_proxy()             # → force-stop app, remove adb reverse
is_vpn_running()              # → dumpsys vpn | grep package|tun0
get_host_ip()                 # → adb shell ip route | grep default via
```

### API Endpoints (routes.py)

| Method | Path | Body/Query | Description |
|--------|------|------------|--------------|
| POST | `/network/proxy/vpn/start` | `{port, udid}` | Start VPN interception |
| POST | `/network/proxy/vpn/stop` | `{udid}` | Stop VPN |
| GET | `/network/proxy/vpn/status` | `?udid=` | Check running state |

### Frontend Hooks (api.ts)

```typescript
useVpnStatus(udid?)    // refetchInterval: 5000
useStartVpn()          // POST /proxy/vpn/start
useStopVpn()           // POST /proxy/vpn/stop
```

---

## APK Build & Deploy

```bash
# Build
cd backend/inspector_vpn
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
./gradlew assembleDebug

# APK lands at:
# app/build/outputs/apk/debug/app-debug.apk

# Copy to backend path (backend references inspector_vpn.apk):
cp app/build/outputs/apk/debug/app-debug.apk \
   app/build/outputs/apk/debug/inspector_vpn.apk

# Install on device
adb install -r backend/inspector_vpn/app/build/outputs/apk/debug/inspector_vpn.apk

# Check VPN status
adb shell dumpsys vpn

# Uninstall
adb uninstall com.inspectorplus.vpn
```

## Limitations

- **iOS**: VPN interception not supported — iOS network inspection requires MDM profile
- **Battery**: VPN with continuous packet processing is power-intensive on real devices
- **Certificate pinning**: Apps with certificate pinning still won't show HTTPS content unless pinning is bypassed via Frida or root
- **Android version**: minSdk 24 (Android 7.0+), targetSdk 34

## Troubleshooting

| Symptom | Cause | Fix |
|---------|--------|-----|
| `am startservice: permission denied` | Service requires signature permission | Launch MainActivity instead of service directly |
| `dumpsys vpn` returns empty | Service not started | Check `am startservice` output in backend logs |
| Traffic not appearing | App ignores proxy | Switch to Full Intercept VPN mode |
| Button stays at Start | Backend returning `running:false` | Check `is_vpn_running()` logs |
| APK not found | Wrong filename | Ensure `inspector_vpn.apk` copy step was run |
