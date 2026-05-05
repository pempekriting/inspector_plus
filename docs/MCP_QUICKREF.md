# MCP Server Quick Reference

## Installation

### Prerequisites
- Node.js 18+
- npm

### Setup
```bash
cd backend/mcp
npm install
```

### Start Server
```bash
cd backend/mcp
npm run dev
```

Server runs on port 8002 (or `MCP_PORT` env var).

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `POST` | `/mcp` | MCP protocol endpoint (tools, initialization) |
| `GET` | `/subscribe/:deviceId` | SSE stream for real-time tree updates |

## Available Tools

| Tool | Arguments | Description |
|------|-----------|-------------|
| `get_hierarchy` | `deviceId: string`, `maxDepth?: number` | Full UI tree |
| `get_node` | `nodeId: string` | Single node details |
| `get_children` | `nodeId: string`, `cursor?: string`, `pageSize?: number` | Paginated children |
| `get_path` | `nodeId: string` | Root to node path |
| `get_ancestors` | `nodeId: string` | All ancestors |
| `search_nodes` | `deviceId: string`, `query: string`, `matchType?: "text"\|"xpath"\|"regex"`, `limit?: number` | Search nodes |

## cURL Examples

### Initialize
```bash
curl -X POST http://localhost:8002/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}}}'
```

### List tools
```bash
curl -X POST http://localhost:8002/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
```

### Call get_hierarchy
```bash
curl -X POST http://localhost:8002/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_hierarchy","arguments":{"deviceId":"YOUR_DEVICE_SERIAL"}}}'
```

### Call search_nodes
```bash
curl -X POST http://localhost:8002/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"search_nodes","arguments":{"deviceId":"YOUR_DEVICE_SERIAL","query":"Submit","matchType":"text"}}}'
```

## Claude Code Integration

```bash
claude mcp add inspector-plus -- npx tsx backend/mcp/src/server.ts
```

Or add to `~/.claude/mcp.json`:
```json
{
  "mcpServers": {
    "inspector-plus": {
      "command": "npx",
      "args": ["tsx", "/Users/azzamnizar/Documents/project/inspector_plus/backend/mcp/src/server.ts"]
    }
  }
}
```

## Environment Variables

| Var | Default | Description |
|-----|---------|-------------|
| `MCP_PORT` | `8002` | Server port |

## Troubleshooting

### RTK Hook Corrupts JSON Responses
If you see type placeholders like `"string"` instead of actual values in responses, the RTK (Rust Token Killer) hook may be intercepting and corrupting curl requests.

**Fix:** Use `rtk proxy curl` instead of plain `curl`:
```bash
rtk proxy curl -s http://localhost:8002/health
rtk proxy curl -s -X POST http://localhost:8002/mcp ...
```

Or disable RTK by adding to project `CLAUDE.md`:
```bash
## Disable RTK Rewrite
Use `rtk proxy curl` to bypass RTK rewrite for API calls.
```

### Claude Code MCP Shows "Failed to Connect"
Ensure the MCP server is running:
```bash
curl -s http://localhost:8002/health
```

If server is running but Claude Code still fails, check:
1. Port 8002 is not in use by another process: `lsof -ti :8002`
2. Try restarting the server: `cd backend/mcp && npm run dev`
3. Check Claude Code MCP status: `claude mcp list`