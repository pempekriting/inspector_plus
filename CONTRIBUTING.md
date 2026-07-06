# Contributing to InspectorPlus

Thank you for contributing to InspectorPlus! This guide covers everything you need to know to get started.

## Quick Links

- [Code of Conduct](./CODE_OF_CONDUCT.md)
- [Security Policy](./SECURITY.md)
- [Architecture Docs](./docs/ARCHITECTURE.md)
- [Development Guide](./docs/DEVELOPMENT.md)
- [Open Issues](https://github.com/azzamnizar/inspector_plus/issues)

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Development Setup](#development-setup)
3. [Making Changes](#making-changes)
4. [Commit Messages](#commit-messages)
5. [Pull Request Process](#pull-request-process)
6. [Testing](#testing)
7. [Code Style](#code-style)
8. [Writing Documentation](#writing-documentation)
9. [Reporting Bugs](#reporting-bugs)
10. [Suggesting Features](#suggesting-features)

---

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/<your-username>/inspector_plus.git
   cd inspector_plus
   ```
3. **Add the upstream remote:**
   ```bash
   git remote add upstream https://github.com/azzamnizar/inspector_plus.git
   ```
4. **Create a feature branch:**
   ```bash
   git checkout -b feat/your-feature-name
   ```

## Development Setup

### Prerequisites

- Python 3.13+ (not 3.14 — WebSocket incompatibility)
- Node.js 18+
- npm or pnpm
- ADB in PATH
- For iOS: idb_companion (`brew install idb-companion`) + fb-idb (auto-installed via `uv sync`)
- For Network Debug: `pip install mitmproxy`

### Backend

```bash
cd backend
uv sync --python python3.13
uv run uvicorn main:app --reload --port 8001
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Running Tests

**Backend:**
```bash
cd backend && uv run pytest
```

**Frontend:**
```bash
cd frontend && npm test
```

---

## Making Changes

1. **Keep your fork in sync** with upstream:
   ```bash
   git fetch upstream
   git merge upstream/main
   ```

2. **Make your changes** on a feature branch. Follow the [code style](#code-style) and [testing](#testing) guidelines.

3. **Run pre-commit hooks** (ruff format/check):
   ```bash
   cd backend
   uv run ruff format .
   uv run ruff check .
   ```

4. **Commit your changes** following the [commit message format](#commit-messages).

5. **Push to your fork:**
   ```bash
   git push origin feat/your-feature-name
   ```

6. **Open a Pull Request** on GitHub.

---

## Commit Messages

Use clear, descriptive commit messages. This project uses structured commit messages inspired by [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only changes |
| `style` | Formatting, missing semicolons, etc (no code change) |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `perf` | Performance improvement |
| `test` | Adding or correcting tests |
| `chore` | Maintenance tasks (dependencies, build config, etc.) |
| `build` | Changes that affect the build system or external dependencies |
| `ci` | CI/CD changes |

### Examples

```
feat(network): add VPN full intercept mode

Implements VPN-based traffic interception using Android VpnService API.
Catches traffic from apps with certificate pinning that bypass system proxy.

Closes #45
```

```
fix(hierarchy): correct bounds calculation for rotated elements

Bounds [x1,y1,x2,y2] are now correctly converted to {x,y,width,height}
for elements with display rotation applied.

Closes #78
```

```
docs(mcp): add subscribeTree tool to MCP quickref

Documents the SSE-based real-time tree subscription endpoint
available at GET /subscribe/:deviceId.
```

---

## Pull Request Process

### Before Opening a PR

1. **Ensure all tests pass** locally
2. **Run the build** to catch any compile errors:
   ```bash
   cd frontend && npm run build
   ```
3. **Sync with upstream** main branch
4. **Fill out the PR template** completely

### PR Template

```markdown
## Summary
<!-- 1-3 bullet points: what does this PR do? -->

## Test Plan
<!-- How was this tested? What cases does it cover? -->

## Checklist
- [ ] Tests pass (backend `uv run pytest`, frontend `npm test`)
- [ ] Frontend builds without errors (`npm run build`)
- [ ] Pre-commit hooks pass (`ruff format`, `ruff check`)
- [ ] Documentation updated if needed
- [ ] No new console.log or debug statements
```

### Review Process

1. Automated checks (CI, tests, build) must pass
2. At least one reviewer approval required
3. Address all reviewer comments before merging
4. Squash and merge for clean history

---

## Testing

### Backend Tests

Tests live in `backend/` alongside the code they test:

```
backend/
├── test_app.py              # API endpoint tests
├── test_device_bridges.py   # Bridge unit tests
├── test_app_commands.py     # AppCommands tests
├── test_validate.py         # ADB command validation tests
├── test_base.py             # Bridge base/dispatch tests
├── test_ws*.py               # WebSocket tests
└── tests/                   # Additional test modules
```

Run all backend tests:
```bash
cd backend && uv run pytest
```

Run a specific test file:
```bash
cd backend && uv run pytest test_app.py
```

Run with coverage:
```bash
cd backend && uv run pytest --cov=. --cov-report=term-missing
```

### Frontend Tests

Tests live in `frontend/tests/`:

```
frontend/tests/
├── hooks/          # useDevice, useCommands, useRecording
├── services/       # api
├── stores/         # hierarchyStore, deviceStore, themeStore, recorderStore
└── utils/          # coordinates, locators
```

Run all frontend tests:
```bash
cd frontend && npm test
```

Run a specific test file:
```bash
cd frontend && npm test -- tests/stores/hierarchyStore.test.ts
```

Run in watch mode:
```bash
cd frontend && npm test -- --watch
```

### Writing Tests

**Backend (pytest):**
```python
def test_feature_behavior(self, mock_dependency, client):
    response = client.get("/endpoint")
    assert response.status_code == 200
    assert response.json()["key"] == "value"
```

**Frontend (Vitest):**
```typescript
it('returns expected result', async () => {
  const result = await someFunction(input);
  expect(result).toEqual(expected);
});
```

---

## Code Style

### Python

- **Type hints** on all functions
- **async/await** for all FastAPI handlers
- **PEP 8** compliant
- **Pydantic** models for request/response validation
- **ruff** for formatting (`ruff format`) and linting (`ruff check`)

### TypeScript / React

- **Strict TypeScript** — no `any` without explicit justification
- **Zustand** for state management
- **`memo()`** for performance-critical components
- **`vi.mocked()`** for mocking Zustand stores in tests

### Formatting

```bash
# Python
cd backend && uv run ruff format .

# TypeScript
# Handled automatically by pre-commit hooks
```

### Key Rules

1. **Never use `Field()` on FastAPI query params** — use `Query()` or inline validation
2. **API base URL** — always use `import.meta.env.VITE_API_URL` not hardcoded strings
3. **Mock Zustand stores in tests** — use `vi.mocked(useHierarchyStore).mockReturnValue(...)` not `require()` inside test bodies
4. **Always check `get_bridge()` for `None`** before calling methods on the returned bridge

---

## Writing Documentation

- Update relevant `.md` files when adding or changing features
- Update `SPEC.md` when adding new API endpoints
- Update `docs/ARCHITECTURE.md` when changing system architecture
- Add docstrings to Python functions with type hints
- Add JSDoc comments to TypeScript functions

### Documentation Files

| File | Purpose |
|------|---------|
| `README.md` | Quick overview, features, quick start |
| `CLAUDE.md` | AI coding agent instructions |
| `SPEC.md` | API reference, data models, MCP server |
| `docs/ARCHITECTURE.md` | System design, REST API, component hierarchy |
| `docs/DEVELOPMENT.md` | Dev setup, testing, troubleshooting |
| `docs/NETWORK.md` | Network debug architecture, VPN app |
| `docs/MCP_QUICKREF.md` | MCP server quick reference |

---

## Reporting Bugs

### Before Submitting a Bug Report

1. **Search existing issues** to avoid duplicates
2. **Verify the bug** against latest main branch
3. **Collect relevant information:**
   - Python version (`python3 --version`)
   - Node version (`node --version`)
   - ADB version (`adb version`)
   - Steps to reproduce
   - Expected vs actual behavior
   - Device/emulator details (Android version, device model)

### Bug Report Template

```markdown
## Bug Description
<!-- Clear, concise description of the bug -->

## Steps to Reproduce
1. Go to '...'
2. Click on '...'
3. See error

## Expected Behavior
<!-- What should happen -->

## Actual Behavior
<!-- What actually happens -->

## Environment
- OS: [e.g. macOS 14.4, Ubuntu 22.04]
- Python: [e.g. 3.13.2]
- Node: [e.g. 18.20.1]
- Device: [e.g. Pixel 7 Android 14, iPhone 15 iOS 17]

## Screenshots / Logs
<!-- If applicable -->

## Additional Context
<!-- Anything else relevant -->
```

---

## Suggesting Features

### Before Suggesting a Feature

1. **Search existing issues** to avoid duplicates
2. **Consider if it's in scope** — InspectorPlus focuses on device UI inspection

### Feature Request Template

```markdown
## Feature Summary
<!-- Clear, concise description of the feature -->

## Problem Statement
<!-- What problem does this solve? -->

## Proposed Solution
<!-- How would you like it to work? -->

## Alternatives Considered
<!-- Other approaches you considered and why they weren't chosen -->

## Additional Context
<!-- Mockups, references, related issues -->
```

---

## Questions?

- **GitHub Issues** — for bugs and feature requests
- **Discussions** — for questions and general help

---

## License

By contributing to InspectorPlus, you agree that your contributions will be licensed under the MIT License.
