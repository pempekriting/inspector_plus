/**
 * MCP-specific type definitions for tree hierarchy tools.
 * These types are designed for AI consumption with friendly conventions.
 */

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
  const decoded = JSON.parse(Buffer.from(cursor, "base64").toString("utf-8"));
  if (typeof decoded.index !== "number" || typeof decoded.parentId !== "string") {
    throw new Error("Invalid cursor: missing required fields");
  }
  return decoded;
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