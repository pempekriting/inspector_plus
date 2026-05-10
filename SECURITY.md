# Security Policy

## Supported Versions

InspectorPlus is currently under active development. Only the latest release
is supported with security updates.

| Version | Supported          |
| ------- | ------------------ |
| 0.0.1   | :white_check_mark:  |
| < 0.0.1 | :x:               |

---

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security issue,
please report it responsibly.

### How to Report

**Please do NOT file a public GitHub issue for security vulnerabilities.**

Instead, please send your report directly to:

```
kgs.azzam@gmail.com
```

We aim to acknowledge within 48 hours and will provide a more detailed response
within 7 days. If the issue is confirmed, we will:

1. Acknowledge the report
2. Work on a fix
3. Release a patched version
4. Credit you in the release notes (unless you request otherwise)

### What to Include

Your report should include:

- **Description** — Clear description of the vulnerability
- **Steps to reproduce** — Minimal test case if possible
- **Impact** — What an attacker could do with this vulnerability
- **Environment** — Versions affected (Python, Node, OS, etc.)
- **Suggested fix** — If you have one (optional)

### What We Promise

- We will not pursue legal action against researchers who report vulnerabilities in good faith
- We will credit you in the security advisory and release notes (unless you prefer anonymity)
- We will keep you informed of the progress throughout the remediation process

---

## Security Best Practices

When using InspectorPlus, keep these security considerations in mind:

### Local Use Only

InspectorPlus is designed for local development and testing. The backend
runs without authentication and should only be accessible on localhost.

**Do NOT expose the backend port (8001) or MCP port (8002) to untrusted networks.**

### ADB Command Safety

The backend implements an allowlist-based ADB command filter that blocks:

- Dangerous commands: `reboot`, `shutdown`, `mount`, `rm -rf`, `dd`, etc.
- Command chaining: `&&`, `||`, `|`, `;`, `` ` ``, `$(`, `>`, `>>`
- Path traversal in package names

This is not a substitute for device security. Only connect InspectorPlus
to devices you control.

### Network Debug

When using the Network Debug feature:

- The mitmproxy traffic capture is for your own app traffic only
- VPN Full Intercept mode captures ALL device traffic — use only on devices you control
- Uninstall the InspectorVPN app when not in use
- The MITM certificate should only be installed on development devices

### iOS Development

- WDA (WebDriverAgent) connections via idb-companion should remain local
- Do not expose WDA ports to untrusted networks

---

## Known Limitations

- **No authentication** — Backend has no auth, runs locally only
- **ADB required** — Android SDK with ADB must be in PATH
- **iOS real devices** — Require WDA via idb-companion
- **iOS VPN** — VPN-based Full Intercept not supported on iOS (requires MDM profile)

---

## Updates

Security advisories will be published on the GitHub Security tab and
announced in the project release notes.
