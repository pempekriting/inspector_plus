/**
 * Hierarchy MCP tools - get_hierarchy, get_subtree, get_node.
 */

import { z } from "zod";
import {
  GetHierarchyInputSchema,
  GetNodeInputSchema,
  TreeToolResponse,
  NodeToolResponse,
} from "../types/mcp-types.js";
import { getHierarchy, getNode } from "../services/tree-service.js";

/**
 * Tool: get_hierarchy
 * Fetches the full tree hierarchy for a device.
 */
export async function getHierarchyTool(input: z.infer<typeof GetHierarchyInputSchema>): Promise<TreeToolResponse> {
  const { deviceId, maxDepth } = input;

  const result = await getHierarchy(deviceId, maxDepth);

  return {
    data: {
      tree: result.tree,
      path: [],
      stats: result.stats,
    },
    _meta: result._meta,
  };
}

/**
 * Tool: get_node
 * Fetches a specific node and its path from root.
 */
export async function getNodeTool(input: z.infer<typeof GetNodeInputSchema>): Promise<NodeToolResponse> {
  const { nodeId } = input;

  // Device ID is required for node lookup - we need to store node→device mapping
  // For now, require deviceId in the input
  const result = await getNode(nodeId, undefined);

  return {
    data: {
      node: result.node,
      path: result.path,
    },
    _meta: {
      source: "android" as const, // Would be determined from device lookup
    },
  };
}

// Tool definitions for MCP server registration
export const hierarchyTools = [
  {
    name: "get_hierarchy",
    description: "Fetch the full UI tree hierarchy for a connected device. Returns nested tree structure with node IDs, labels, bounds, and available actions.",
    inputSchema: GetHierarchyInputSchema,
    handler: getHierarchyTool,
  },
  {
    name: "get_node",
    description: "Retrieve a specific node by its ID and get the path from root.",
    inputSchema: GetNodeInputSchema,
    handler: getNodeTool,
  },
];