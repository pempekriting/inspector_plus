/**
 * MCP-specific type definitions for tree hierarchy tools.
 * These types are designed for AI consumption with friendly conventions.
 */

import { z } from "zod";

// =============================================================================
// Core Tree Types (AI-Friendly)
// =============================================================================

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * AI-friendly node structure optimized for POM generation.
 * - `label` for display/logging
 * - `nodeType` for widget classification
 * - `actions` for available interactions
 * - `attributes` for flexible metadata
 */
export interface AiFriendlyNode {
  id: string;
  label: string;
  nodeType: string;
  bounds?: Bounds;
  attributes: Record<string, string | boolean | number>;
  actions: ("tap" | "input" | "scroll" | "long_press" | "focus" | "check")[];
  childCount: number;
  children?: AiFriendlyNode[];
  _meta: {
    rawId?: string;
    package?: string;
    path: string;
  };
}

// =============================================================================
// Tool Input Schemas (Zod)
// =============================================================================

export const GetHierarchyInputSchema = z.object({
  deviceId: z.string().describe("Device UDID"),
  maxDepth: z.number().optional().describe("Maximum depth to traverse (default: unlimited)"),
});

export type GetHierarchyInput = z.infer<typeof GetHierarchyInputSchema>;

export const GetNodeInputSchema = z.object({
  nodeId: z.string().describe("Unique node identifier (format: ClassName_N)"),
});

export type GetNodeInput = z.infer<typeof GetNodeInputSchema>;

export const GetChildrenInputSchema = z.object({
  nodeId: z.string().describe("Parent node ID"),
  cursor: z.string().optional().describe("Pagination cursor"),
  pageSize: z.number().optional().describe("Number of children to return (default: 50)"),
});

export type GetChildrenInput = z.infer<typeof GetChildrenInputSchema>;

export const SearchNodesInputSchema = z.object({
  deviceId: z.string().describe("Device UDID"),
  query: z.string().describe("Search query (text, xpath, or regex)"),
  matchType: z.enum(["text", "xpath", "regex"]).default("text"),
  limit: z.number().optional().describe("Maximum results to return (default: 100)"),
});

export type SearchNodesInput = z.infer<typeof SearchNodesInputSchema>;

export const GetPathInputSchema = z.object({
  nodeId: z.string().describe("Target node ID"),
});

export type GetPathInput = z.infer<typeof GetPathInputSchema>;

export const GetAncestorsInputSchema = z.object({
  nodeId: z.string().describe("Target node ID"),
});

export type GetAncestorsInput = z.infer<typeof GetAncestorsInputSchema>;

export const SubscribeTreeInputSchema = z.object({
  deviceId: z.string().describe("Device UDID to subscribe to"),
});

export type SubscribeTreeInput = z.infer<typeof SubscribeTreeInputSchema>;

// =============================================================================
// Tool Output Types
// =============================================================================

export interface TreeStats {
  totalNodes: number;
  depth: number;
  lastRefresh: string;
}

export interface TreeToolResponse {
  data: {
    tree: AiFriendlyNode;
    path: string[];
    stats: TreeStats;
  };
  nextCursor?: string;
  _meta: {
    source: "android" | "ios";
    cached: boolean;
  };
}

export interface NodeToolResponse {
  data: {
    node: AiFriendlyNode;
    path: string[];
  };
  _meta: {
    source: "android" | "ios";
  };
}

export interface ChildrenToolResponse {
  data: {
    children: AiFriendlyNode[];
    parentId: string;
  };
  nextCursor?: string;
  hasMore: boolean;
  _meta: {
    source: "android" | "ios";
    totalCount: number;
  };
}

export interface SearchToolResponse {
  data: {
    matches: AiFriendlyNode[];
    query: string;
    matchType: string;
  };
  _meta: {
    source: "android" | "ios";
    totalMatches: number;
  };
}

export interface PathToolResponse {
  data: {
    ancestors: AiFriendlyNode[];
    node: AiFriendlyNode;
  };
  path: string[];
}

// =============================================================================
// Pagination
// =============================================================================

export interface PageResult<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface PaginationCursor {
  index: number;
  parentId: string;
}

/**
 * Encode cursor to base64 string for safe transport.
 */
export function encodeCursor(cursor: PaginationCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64");
}

/**
 * Decode base64 cursor string back to PaginationCursor.
 */
export function decodeCursor(cursor: string): PaginationCursor {
  return JSON.parse(Buffer.from(cursor, "base64").toString("utf-8"));
}

// =============================================================================
// Error Types
// =============================================================================

export class McpToolError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 400,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "McpToolError";
  }
}

export class NodeNotFoundError extends McpToolError {
  constructor(nodeId: string, availableIds?: string[]) {
    super(
      `Node not found: ${nodeId}`,
      "NODE_NOT_FOUND",
      404,
      { nodeId, availableIds: availableIds?.slice(0, 10) }
    );
    this.name = "NodeNotFoundError";
  }
}

export class DeviceNotConnectedError extends McpToolError {
  constructor(deviceId: string) {
    super(
      `Device not connected: ${deviceId}`,
      "DEVICE_NOT_CONNECTED",
      503,
      { deviceId }
    );
    this.name = "DeviceNotConnectedError";
  }
}