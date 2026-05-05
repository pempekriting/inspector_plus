/**
 * MCP Server entry point for InspectorPlus tree hierarchy data.
 * Uses Streamable HTTP transport for production-ready AI tool serving.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types";
import { randomUUID } from "node:crypto";
import express, { Request, Response } from "express";
import * as z from "zod";

import { getHierarchy, getNode, getChildren, getAncestors, getPath, searchNodes, subscribeTree, getSubscriberCount } from "./services/tree-service.js";

const PORT = parseInt(process.env.MCP_PORT || "8002", 10);

// =============================================================================
// MCP Server Factory - create new instance per session
// =============================================================================

function createMcpServer(): McpServer {
  const s = new McpServer({
    name: "inspector-mcp",
    version: "0.1.0",
  });

  registerTools(s);
  return s;
}

// =============================================================================
// Tool Registration (reusable)
// =============================================================================

function registerTools(server: McpServer): void {
  server.registerTool(
    "get_hierarchy",
    {
      title: "Get Hierarchy",
      description: "Fetch the full UI tree hierarchy for a connected device. Returns nested tree structure with node IDs, labels, bounds, and available actions.",
      inputSchema: z.object({
        deviceId: z.string().describe("Device UDID"),
        maxDepth: z.number().optional().describe("Maximum depth to traverse"),
      }),
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
    async ({ deviceId, maxDepth }) => {
      try {
        const result = await getHierarchy(deviceId, maxDepth);
        return {
          content: [{ type: "text", text: JSON.stringify({
            data: {
              tree: result.tree,
              path: [],
              stats: result.stats,
            },
            _meta: result._meta,
          }) }],
        };
      } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text", text: JSON.stringify({ error: errMsg }) }], isError: true };
      }
    }
  );

  server.registerTool(
    "get_node",
    {
      title: "Get Node",
      description: "Retrieve a specific node by its ID and get the path from root.",
      inputSchema: z.object({
        nodeId: z.string().describe("Unique node identifier"),
        deviceId: z.string().optional().describe("Device UDID (optional, for faster lookup)"),
      }),
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
    async ({ nodeId, deviceId }) => {
      try {
        const result = await getNode(nodeId, deviceId);
        return {
          content: [{ type: "text", text: JSON.stringify({
            data: { node: result.node, path: result.path },
            _meta: { source: "android" },
          }) }],
        };
      } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text", text: JSON.stringify({ error: errMsg }) }], isError: true };
      }
    }
  );

  server.registerTool(
    "get_children",
    {
      title: "Get Children",
      description: "Get direct children of a node with cursor-based pagination.",
      inputSchema: z.object({
        nodeId: z.string().describe("Parent node ID"),
        deviceId: z.string().optional().describe("Device UDID (optional, for faster lookup)"),
        cursor: z.string().optional().describe("Pagination cursor"),
        pageSize: z.number().optional().describe("Number of children to return"),
      }),
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
    async ({ nodeId, deviceId, cursor, pageSize }) => {
      try {
        const result = await getChildren(nodeId, deviceId, cursor, pageSize);
        return {
          content: [{ type: "text", text: JSON.stringify({
            data: { children: result.data, parentId: result.parentId },
            nextCursor: result.nextCursor,
            hasMore: result.hasMore,
            _meta: { source: "android", totalCount: result.data.length },
          }) }],
        };
      } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text", text: JSON.stringify({ error: errMsg }) }], isError: true };
      }
    }
  );

  server.registerTool(
    "get_path",
    {
      title: "Get Path",
      description: "Get the path from root to a node.",
      inputSchema: z.object({
        nodeId: z.string().describe("Target node ID"),
        deviceId: z.string().optional().describe("Device UDID (optional, for faster lookup)"),
      }),
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
    async ({ nodeId, deviceId }) => {
      try {
        const path = await getPath(nodeId, deviceId);
        return {
          content: [{ type: "text", text: JSON.stringify({ path }) }],
        };
      } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text", text: JSON.stringify({ error: errMsg }) }], isError: true };
      }
    }
  );

  server.registerTool(
    "get_ancestors",
    {
      title: "Get Ancestors",
      description: "Get all ancestor nodes from root to target.",
      inputSchema: z.object({
        nodeId: z.string().describe("Target node ID"),
        deviceId: z.string().describe("Device UDID"),
      }),
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
    async ({ nodeId, deviceId }) => {
      try {
        const result = await getAncestors(nodeId, deviceId);
        return {
          content: [{ type: "text", text: JSON.stringify({
            data: result,
            path: result.ancestors.map((a: { label: string }) => a.label),
          }) }],
        };
      } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text", text: JSON.stringify({ error: errMsg }) }], isError: true };
      }
    }
  );

  server.registerTool(
    "search_nodes",
    {
      title: "Search Nodes",
      description: "Search the UI tree for nodes matching text, xpath, or regex.",
      inputSchema: z.object({
        deviceId: z.string().describe("Device UDID"),
        query: z.string().describe("Search query"),
        matchType: z.enum(["text", "xpath", "regex"]).default("text").describe("Match type"),
        limit: z.number().optional().describe("Maximum results"),
      }),
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
    async ({ deviceId, query, matchType, limit }) => {
      try {
        const result = await searchNodes(deviceId, query, matchType || "text", limit);
        return {
          content: [{ type: "text", text: JSON.stringify({
            data: { matches: result.matches, query, matchType },
            _meta: { source: "android", totalMatches: result.totalMatches },
          }) }],
        };
      } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text", text: JSON.stringify({ error: errMsg }) }], isError: true };
      }
    }
  );
}

// =============================================================================
// Express App with MCP Endpoint
// =============================================================================

const app = express();
app.use(express.json());

// Debug middleware to log all requests
app.use((req, res, next) => {
  console.log('[Debug]', req.method, req.path, 'sessionId:', req.headers['mcp-session-id'], 'body method:', req.body?.method);
  next();
});

// Health check
app.get("/health", (req: Request, res: Response) => {
  res.json({
    status: "ok",
    service: "inspector-mcp",
    version: "0.1.0",
    activeSubscriptions: getSubscriberCount(),
  });
});

// Store transports by session ID
const transports = new Map<string, StreamableHTTPServerTransport>();

// MCP endpoint
app.post("/mcp", async (req: Request, res: Response) => {
  const sessionId = (req.headers["mcp-session-id"] || req.headers["MCP-Session-ID"]) as string | undefined;

  console.log('[MCP] POST method:', req.body?.method, 'sessionId:', sessionId);

  if (sessionId && transports.has(sessionId)) {
    await transports.get(sessionId)!.handleRequest(req, res, req.body);
  } else if (!sessionId && isInitializeRequest(req.body)) {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid: string) => {
        console.log('[MCP] Session created:', sid);
        transports.set(sid, transport);
      },
    });

    transport.onclose = () => {
      if (transport.sessionId) {
        console.log('[MCP] Session closed:', transport.sessionId);
        transports.delete(transport.sessionId);
      }
    };

    const server = createMcpServer();
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } else {
    // For non-initialize requests without session, check if maybe client is stateless
    // If body has a method, assume it's a valid JSON-RPC request without session (stateless mode)
    if (req.body && req.body.method && typeof req.body.method === 'string') {
      console.log('[MCP] Stateless request detected, method:', req.body.method);
      // Create stateless transport (no session management)
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,  // Stateless mode
      });
      const server = createMcpServer();
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } else {
      console.log('[MCP] Invalid request - sessionId:', sessionId, 'isInit:', isInitializeRequest(req.body), 'body method:', req.body?.method);
      res.status(400).json({ error: "Invalid request" });
    }
  }
});

// GET endpoint for SSE streams (required by MCP spec)
app.get("/mcp", async (req: Request, res: Response) => {
  const sessionId = (req.headers["mcp-session-id"] || req.headers["MCP-Session-ID"]) as string | undefined;
  console.log('[MCP] GET sessionId:', sessionId);

  if (sessionId && transports.has(sessionId)) {
    await transports.get(sessionId)!.handleRequest(req, res);
  } else {
    res.status(400).send('Invalid or missing session ID');
  }
});

// DELETE endpoint for session termination (required by MCP spec)
app.delete("/mcp", async (req: Request, res: Response) => {
  const sessionId = (req.headers["mcp-session-id"] || req.headers["MCP-Session-ID"]) as string | undefined;
  console.log('[MCP] DELETE sessionId:', sessionId);

  if (sessionId && transports.has(sessionId)) {
    await transports.get(sessionId)!.handleRequest(req, res);
  } else {
    res.status(400).send('Invalid or missing session ID');
  }
});

// SSE subscription endpoint for real-time tree updates
app.get("/subscribe/:deviceId", (req: Request, res: Response) => {
  const deviceId = req.params.deviceId as string;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  res.write(`event: connected\ndata: ${JSON.stringify({ deviceId, timestamp: Date.now() })}\n\n`);

  const unsubscribe = subscribeTree(deviceId, (event) => {
    res.write(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`);
  });

  const heartbeat = setInterval(() => {
    res.write(`: heartbeat\n\n`);
  }, 30000);

  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`InspectorPlus MCP server running on port ${PORT}`);
  console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`SSE subscriptions: http://localhost:${PORT}/subscribe/:deviceId`);
});

// =============================================================================
// Graceful Shutdown
// =============================================================================

process.on("SIGTERM", () => {
  console.log("Shutting down MCP server...");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("Shutting down MCP server...");
  process.exit(0);
});