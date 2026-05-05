/**
 * Traversal MCP tools - get_children, get_ancestors, get_path.
 */

import { z } from "zod";
import {
  GetChildrenInputSchema,
  GetPathInputSchema,
  GetAncestorsInputSchema,
  ChildrenToolResponse,
  PathToolResponse,
} from "../types/mcp-types.js";
import { getChildren, getAncestors, getPath } from "../services/tree-service.js";

/**
 * Tool: get_children
 * Fetches direct children of a node with pagination.
 */
export async function getChildrenTool(input: z.infer<typeof GetChildrenInputSchema>): Promise<ChildrenToolResponse> {
  const { nodeId, cursor, pageSize } = input;

  const result = await getChildren(nodeId, undefined, cursor, pageSize);

  return {
    data: {
      children: result.data,
      parentId: result.parentId,
    },
    nextCursor: result.nextCursor ?? undefined,
    hasMore: result.hasMore,
    _meta: {
      source: "android", // Would be determined from node lookup
      totalCount: result.data.length,
    },
  };
}

/**
 * Tool: get_path
 * Gets the path from root to a node (list of ancestor labels).
 */
export async function getPathTool(input: z.infer<typeof GetPathInputSchema>): Promise<PathToolResponse> {
  const { nodeId } = input;

  const path = await getPath(nodeId, undefined);

  return {
    data: {
      ancestors: [],
      node: { id: nodeId, label: path[path.length - 1] || "", nodeType: "", attributes: {}, actions: [], childCount: 0, _meta: { path: path.join("/") } },
    },
    path,
  };
}

/**
 * Tool: get_ancestors
 * Gets all ancestor nodes from root to target.
 */
export async function getAncestorsTool(input: z.infer<typeof GetAncestorsInputSchema>): Promise<PathToolResponse> {
  const { nodeId } = input;

  const result = await getAncestors(nodeId, undefined);

  return {
    data: result,
    path: result.ancestors.map(a => a.label),
  };
}

// Tool definitions for MCP server registration
export const traversalTools = [
  {
    name: "get_children",
    description: "Get direct children of a node with cursor-based pagination. Useful for traversing large trees without loading everything at once.",
    inputSchema: GetChildrenInputSchema,
    handler: getChildrenTool,
  },
  {
    name: "get_path",
    description: "Get the path from root to a node (ancestor labels as array).",
    inputSchema: GetPathInputSchema,
    handler: getPathTool,
  },
  {
    name: "get_ancestors",
    description: "Get all ancestor nodes from root to the target node.",
    inputSchema: GetAncestorsInputSchema,
    handler: getAncestorsTool,
  },
];