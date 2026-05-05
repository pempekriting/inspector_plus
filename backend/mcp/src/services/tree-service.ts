/**
 * Tree service - bridges MCP tools to FastAPI backend hierarchy endpoints.
 * Handles data fetching, transformation, and caching.
 */

import { AiFriendlyNode, NodeNotFoundError, DeviceNotConnectedError, PageResult, encodeCursor, decodeCursor } from "../types/mcp-types.js";
import { treeCache } from "../cache/tree-cache.js";

const FASTAPI_BASE = process.env.FASTAPI_URL || "http://localhost:8001";
const DEFAULT_PAGE_SIZE = 50;

// =============================================================================
// Data Transformation (UiNode → AiFriendlyNode)
// =============================================================================

function isAndroidSource(source: string): boolean {
  return source === "android" || !source;
}

function countNodes(node: AiFriendlyNode): number {
  let count = 1;
  if (node.children) {
    for (const child of node.children) {
      count += countNodes(child);
    }
  }
  return count;
}

function getDepth(node: AiFriendlyNode, currentDepth: number = 0): number {
  let maxDepth = currentDepth;
  if (node.children && node.children.length > 0) {
    for (const child of node.children) {
      const childDepth = getDepth(child, currentDepth + 1);
      maxDepth = Math.max(maxDepth, childDepth);
    }
  }
  return maxDepth;
}

function buildPath(node: AiFriendlyNode, parentPath: string[] = []): string[] {
  const currentPath = [...parentPath, node.label || node.nodeType];
  if (node.children) {
    for (const child of node.children) {
      buildPath(child, currentPath);
    }
  }
  return parentPath;
}

/**
 * Transform raw UiNode to AI-friendly AiFriendlyNode.
 */
function transformNode(raw: any, depth: number = 0, parentPath: string[] = []): AiFriendlyNode {
  const path = [...parentPath, raw.className || raw.nodeType || "unknown"];

  // Determine actions from capabilities
  const actions: ("tap" | "input" | "scroll" | "long_press" | "focus" | "check")[] = [];
  if (raw.clickable || raw.tap) actions.push("tap");
  if (raw.enabled === false) {} // disabled, no actions
  if (raw.scrollable) actions.push("scroll");
  if (raw.longClickable || raw.long_press) actions.push("long_press");
  if (raw.focusable) actions.push("focus");
  if (raw.checkable) actions.push("check");

  // Build attributes object with all relevant properties
  const attributes: Record<string, string | boolean | number> = {};
  const knownAttrs = [
    "text", "resourceId", "contentDesc", "className", "package",
    "checkable", "checked", "clickable", "enabled", "focusable", "focused",
    "longClickable", "scrollable", "selected", "password", "visibleToUser",
    // iOS fields
    "label", "value", "name", "elementId", "role", "subrole", "title", "help"
  ];
  for (const attr of knownAttrs) {
    if (raw[attr] !== undefined && raw[attr] !== null) {
      attributes[attr] = raw[attr];
    }
  }

  return {
    id: raw.id || raw.nodeId || `${raw.className || "node"}_${depth}`,
    label: raw.text || raw.contentDesc || raw.label || raw.name || raw.resourceId || "[no label]",
    nodeType: raw.className || raw.role || "unknown",
    bounds: raw.bounds,
    attributes,
    actions,
    childCount: raw.children?.length || 0,
    children: raw.children?.map((child: any) => transformNode(child, depth + 1, path)),
    _meta: {
      rawId: raw.resourceId || raw.elementId,
      package: raw.package,
      path: path.join("/"),
    },
  };
}

// =============================================================================
// API Communication with FastAPI Backend
// =============================================================================

interface FastAPIResponse<T> {
  data?: T;
  error?: string;
}

async function fetchFromFastAPI<T>(endpoint: string): Promise<T> {
  const response = await fetch(`${FASTAPI_BASE}${endpoint}`, {
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(10000), // 10s timeout
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`FastAPI ${response.status}: ${error}`);
  }

  return response.json() as Promise<T>;
}

// =============================================================================
// Tree Service Methods
// =============================================================================

/**
 * Get full hierarchy tree for a device.
 */
export async function getHierarchy(deviceId: string, maxDepth?: number): Promise<{
  tree: AiFriendlyNode;
  stats: { totalNodes: number; depth: number; lastRefresh: string };
  _meta: { source: "android" | "ios"; cached: boolean };
}> {
  const cacheKey = `hierarchy:${deviceId}`;

  // Check cache first
  const cached = treeCache.get(cacheKey) as any;
  if (cached) {
    return { ...cached, _meta: { ...cached._meta, cached: true } };
  }

  // Fetch from FastAPI backend
  const url = `/hierarchy${deviceId ? `?udid=${encodeURIComponent(deviceId)}` : ""}`;
  const raw = await fetchFromFastAPI<any>(url);

  if (raw.error) {
    throw new DeviceNotConnectedError(deviceId);
  }

  // Transform to AI-friendly format
  const tree = transformNode(raw);

  const result = {
    tree,
    stats: {
      totalNodes: countNodes(tree),
      depth: getDepth(tree),
      lastRefresh: new Date().toISOString(),
    },
    _meta: {
      source: (isAndroidSource(raw.source) ? "android" : "ios") as "android" | "ios",
      cached: false,
    },
  };

  // Cache for 30 seconds
  treeCache.set(cacheKey, result, 30000);

  return result;
}

/**
 * Get a specific node by ID.
 */
export async function getNode(nodeId: string, deviceId?: string): Promise<{
  node: AiFriendlyNode;
  path: string[];
}> {
  // Fetch full hierarchy and find node
  const hierarchy = deviceId
    ? (await getHierarchy(deviceId)).tree
    : null;

  // For now, fetch and search - in production would have dedicated endpoint
  if (!hierarchy) {
    throw new NodeNotFoundError(nodeId);
  }

  // Recursive search for node
  function findNode(nodes: AiFriendlyNode[], targetId: string): AiFriendlyNode | null {
    for (const node of nodes) {
      if (node.id === targetId) return node;
      if (node.children) {
        const found = findNode(node.children, targetId);
        if (found) return found;
      }
    }
    return null;
  }

  const node = findNode([hierarchy], nodeId);
  if (!node) {
    throw new NodeNotFoundError(nodeId);
  }

  // Build path
  function findPath(nodes: AiFriendlyNode[], targetId: string, path: string[] = []): string[] | null {
    for (const node of nodes) {
      const currentPath = [...path, node.label || node.nodeType];
      if (node.id === targetId) return currentPath;
      if (node.children) {
        const found = findPath(node.children, targetId, currentPath);
        if (found) return found;
      }
    }
    return null;
  }

  const path = findPath([hierarchy], nodeId) || [];

  return { node, path };
}

/**
 * Get children of a node with pagination.
 */
export async function getChildren(
  nodeId: string,
  deviceId?: string,
  cursor?: string,
  pageSize: number = DEFAULT_PAGE_SIZE
): Promise<PageResult<AiFriendlyNode> & { hasMore: boolean; parentId: string }> {
  // Fetch node info
  const { node } = await getNode(nodeId, deviceId);

  if (!node.children || node.children.length === 0) {
    return { data: [], nextCursor: null, hasMore: false, parentId: nodeId };
  }

  const children = node.children;
  let startIndex = 0;

  if (cursor) {
    const decoded = decodeCursor(cursor);
    startIndex = decoded.index || 0;
  }

  const page = children.slice(startIndex, startIndex + pageSize);
  const hasMore = startIndex + pageSize < children.length;

  return {
    data: page,
    nextCursor: hasMore ? encodeCursor({ index: startIndex + pageSize, parentId: nodeId }) : null,
    hasMore,
    parentId: nodeId,
  };
}

/**
 * Get ancestors of a node (full node objects, not just labels).
 */
export async function getAncestors(nodeId: string, deviceId?: string): Promise<{
  ancestors: AiFriendlyNode[];
  node: AiFriendlyNode;
}> {
  const { node, path } = await getNode(nodeId, deviceId);

  // Walk the hierarchy to find actual ancestor nodes (not just path labels)
  const hierarchy = deviceId
    ? (await getHierarchy(deviceId)).tree
    : null;

  if (!hierarchy) {
    return { ancestors: [], node };
  }

  // Find path from root to target node and collect ancestors
  const ancestors: AiFriendlyNode[] = [];

  function findNodeWithAncestors(
    nodes: AiFriendlyNode[],
    targetId: string,
    currentAncestors: AiFriendlyNode[]
  ): AiFriendlyNode | null {
    for (const n of nodes) {
      const newAncestors = [...currentAncestors, n];
      if (n.id === targetId) {
        // Found target - return ancestors (excluding self)
        ancestors.push(...currentAncestors);
        return n;
      }
      if (n.children) {
        const found = findNodeWithAncestors(n.children, targetId, newAncestors);
        if (found) return found;
      }
    }
    return null;
  }

  const found = findNodeWithAncestors([hierarchy], nodeId, []);
  if (!found) {
    return { ancestors: [], node };
  }

  return { ancestors, node };
}

/**
 * Get path from root to node (labels only for now).
 */
export async function getPath(nodeId: string, deviceId?: string): Promise<string[]> {
  const { path } = await getNode(nodeId, deviceId);
  return path;
}

/**
 * Search nodes by text, xpath, or regex.
 */
export async function searchNodes(
  deviceId: string,
  query: string,
  matchType: "text" | "xpath" | "regex" = "text",
  limit: number = 100
): Promise<{ matches: AiFriendlyNode[]; totalMatches: number }> {
  const cacheKey = `search:${deviceId}:${matchType}:${query}`;

  // Use FastAPI search endpoint
  const filter = matchType === "text" ? "text" : matchType === "xpath" ? "xpath" : "text";
  const url = `/hierarchy/search?query=${encodeURIComponent(query)}&filter=${filter}${deviceId ? `&udid=${encodeURIComponent(deviceId)}` : ""}`;

  const results = await fetchFromFastAPI<any>(url);

  if (results.error) {
    throw new Error(results.error);
  }

  // Transform results
  const matches = (results.results || results.nodes || []).slice(0, limit).map((r: any) => {
    const node = r.node || r;
    return transformNode(node);
  });

  return { matches, totalMatches: matches.length };
}

// =============================================================================
// SSE Subscription for Real-time Updates
// =============================================================================

type Subscriber = (event: { type: string; data: any }) => void;

const subscribers = new Map<string, Set<Subscriber>>();

/**
 * Subscribe to tree changes for a device.
 */
export function subscribeTree(deviceId: string, callback: Subscriber): () => void {
  if (!subscribers.has(deviceId)) {
    subscribers.set(deviceId, new Set());
  }
  subscribers.get(deviceId)!.add(callback);

  // Return unsubscribe function
  return () => {
    const deviceSubs = subscribers.get(deviceId);
    if (deviceSubs) {
      deviceSubs.delete(callback);
      if (deviceSubs.size === 0) {
        subscribers.delete(deviceId);
      }
    }
  };
}

/**
 * Notify subscribers of tree change.
 */
export function notifyTreeChange(deviceId: string): void {
  const deviceSubs = subscribers.get(deviceId);
  if (deviceSubs) {
    for (const callback of deviceSubs) {
      callback({ type: "tree_changed", data: { deviceId, timestamp: Date.now() } });
    }
  }
}

/**
 * Get active subscriber count.
 */
export function getSubscriberCount(deviceId?: string): number {
  if (deviceId) {
    return subscribers.get(deviceId)?.size || 0;
  }
  let total = 0;
  for (const subs of subscribers.values()) {
    total += subs.size;
  }
  return total;
}