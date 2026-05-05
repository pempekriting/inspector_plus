/**
 * Search MCP tools - search_nodes, filter_nodes.
 */

import { z } from "zod";
import {
  SearchNodesInputSchema,
  SearchToolResponse,
} from "../types/mcp-types.js";
import { searchNodes } from "../services/tree-service.js";

/**
 * Tool: search_nodes
 * Search hierarchy by text, xpath, or regex.
 */
export async function searchNodesTool(input: z.infer<typeof SearchNodesInputSchema>): Promise<SearchToolResponse> {
  const { deviceId, query, matchType, limit } = input;

  const result = await searchNodes(deviceId, query, matchType, limit);

  return {
    data: {
      matches: result.matches,
      query,
      matchType,
    },
    _meta: {
      source: "android", // Would be determined from device lookup
      totalMatches: result.totalMatches,
    },
  };
}

// Tool definitions for MCP server registration
export const searchTools = [
  {
    name: "search_nodes",
    description: "Search the UI tree for nodes matching text, xpath, or regex. Returns all matches with their node data and path.",
    inputSchema: SearchNodesInputSchema,
    handler: searchNodesTool,
  },
];