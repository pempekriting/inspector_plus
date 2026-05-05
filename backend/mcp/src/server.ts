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
// MCP Server Setup
// =============================================================================

const server = new McpServer({
  name: "inspector-mcp",
  version: "0.1.0",
});

// =============================================================================
// Tool Registration
// =============================================================================

server.registerTool(
  "get_hierarchy",
  {
    title: "Get Hierarchy",
    description: "Fetch the full UI tree hierarchy for a connected device. Returns nested tree structure with node IDs, labels, bounds, and available actions.",
    inputSchema: z.object({
      deviceId: z.string().describe("Device UDID"),
      maxDepth: z.number().optional().describe("Maximum depth to traverse"),
    }),
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
    }),
  },
  async ({ nodeId }) => {
    try {
      const result = await getNode(nodeId, undefined);
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
      cursor: z.string().optional().describe("Pagination cursor"),
      pageSize: z.number().optional().describe("Number of children to return"),
    }),
  },
  async ({ nodeId, cursor, pageSize }) => {
    try {
      const result = await getChildren(nodeId, undefined, cursor, pageSize);
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
    }),
  },
  async ({ nodeId }) => {
    try {
      const path = await getPath(nodeId, undefined);
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
    }),
  },
  async ({ nodeId }) => {
    try {
      const result = await getAncestors(nodeId, undefined);
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

// =============================================================================
// Express App with MCP Endpoint
// =============================================================================

const app = express();
app.use(express.json());

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
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  if (sessionId && transports.has(sessionId)) {
    const transport = transports.get(sessionId)!;
    await transport.handleRequest(req, res, req.body);
  } else if (!sessionId && isInitializeRequest(req.body)) {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid: string) => { transports.set(sid, transport); },
    });

    transport.onclose = () => {
      if (transport.sessionId) {
        transports.delete(transport.sessionId);
      }
    };

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } else {
    res.status(400).json({ error: "Invalid request" });
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