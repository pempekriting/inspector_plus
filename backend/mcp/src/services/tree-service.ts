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

export function isAndroidSource(source: string): boolean {
  return source === "android" || !source;
}

export function countNodes(node: AiFriendlyNode): number {
  let count = 1;
  if (node.children) {
    for (const child of node.children) {
      count += countNodes(child);
    }
  }
  return count;
}

export function getDepth(node: AiFriendlyNode, currentDepth: number = 0): number {
  let maxDepth = currentDepth;
  if (node.children && node.children.length > 0) {
    for (const child of node.children) {
      const childDepth = getDepth(child, currentDepth + 1);
      maxDepth = Math.max(maxDepth, childDepth);
    }
  }
  return maxDepth;
}

/**
 * Transform raw UiNode to AI-friendly AiFriendlyNode.
 */
export function transformNode(raw: any, depth: number = 0, parentPath: string[] = []): AiFriendlyNode {
  const path = [...parentPath, raw.className || raw.nodeType || "unknown"];

  // Determine actions from capabilities
  const actions: ("tap" | "input" | "scroll" | "long_press" | "focus" | "check")[] = [];
  if (raw.enabled !== false) {
    if (raw.clickable || raw.tap) actions.push("tap");
    if (raw.scrollable) actions.push("scroll");
    if (raw.longClickable || raw.long_press) actions.push("long_press");
    if (raw.focusable) actions.push("focus");
    if (raw.checkable) actions.push("check");
  }

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

interface NodeIndexEntry {
  node: AiFriendlyNode;
  path: string[];
  ancestors: AiFriendlyNode[];
}

/**
 * Per-device id→node index, keyed by the exact hierarchy tree object it was
 * built from. getHierarchy() already caches the tree for the TTL window, but
 * every getNode/getChildren/getPath/getAncestors call used to re-walk the
 * whole tree from scratch to find one node. Since the tree object reference
 * only changes when getHierarchy() actually refetches, comparing `tree`
 * identity lets repeat lookups within the same cache window be O(1) instead
 * of O(n), while a real refresh naturally invalidates the stale index.
 */
const nodeIndexCache = new Map<string, { tree: AiFriendlyNode; index: Map<string, NodeIndexEntry> }>();

function buildNodeIndex(root: AiFriendlyNode): Map<string, NodeIndexEntry> {
  const index = new Map<string, NodeIndexEntry>();
  const walk = (node: AiFriendlyNode, path: string[], ancestors: AiFriendlyNode[]) => {
    const currentPath = [...path, node.label || node.nodeType];
    index.set(node.id, { node, path: currentPath, ancestors });
    if (node.children) {
      for (const child of node.children) {
        walk(child, currentPath, [...ancestors, node]);
      }
    }
  };
  walk(root, [], []);
  return index;
}

function getNodeIndex(deviceId: string, tree: AiFriendlyNode): Map<string, NodeIndexEntry> {
  const cached = nodeIndexCache.get(deviceId);
  if (cached && cached.tree === tree) {
    return cached.index;
  }
  const index = buildNodeIndex(tree);
  nodeIndexCache.set(deviceId, { tree, index });
  return index;
}

/**
 * Get a specific node by ID.
 */
export async function getNode(nodeId: string, deviceId?: string, returnHierarchy: boolean = false): Promise<{
  node: AiFriendlyNode;
  path: string[];
  ancestors: AiFriendlyNode[];
  hierarchy?: AiFriendlyNode;
}> {
  // Fetch full hierarchy and find node
  const hierarchy = deviceId
    ? (await getHierarchy(deviceId)).tree
    : null;

  // For now, fetch and search - in production would have dedicated endpoint
  if (!hierarchy) {
    throw new NodeNotFoundError(nodeId);
  }

  const found = getNodeIndex(deviceId!, hierarchy).get(nodeId);
  if (!found) {
    throw new NodeNotFoundError(nodeId);
  }

  return returnHierarchy
    ? { node: found.node, path: found.path, ancestors: found.ancestors, hierarchy }
    : { node: found.node, path: found.path, ancestors: found.ancestors };
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
  const result = await getNode(nodeId, deviceId, true);
  return { ancestors: result.ancestors, node: result.node };
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

  // Check cache first
  const cached = treeCache.get(cacheKey) as any;
  if (cached) {
    return { ...cached, matches: cached.matches.slice(0, limit) };
  }

  // Regex mode has no equivalent in /hierarchy/search's filter types — it must
  // go through /hierarchy/find?regex=true, which actually runs re.search().
  // Routing it through /hierarchy/search?filter=text (as before) silently
  // degraded to a plain substring match with no error signal.
  const deviceQuery = deviceId ? `&udid=${encodeURIComponent(deviceId)}` : "";
  const url =
    matchType === "regex"
      ? `/hierarchy/find?q=${encodeURIComponent(query)}&regex=true${deviceQuery}`
      : `/hierarchy/search?query=${encodeURIComponent(query)}&filter=${matchType}${deviceQuery}`;

  const results = await fetchFromFastAPI<any>(url);

  if (results.error) {
    throw new Error(results.error);
  }

  // /hierarchy/find returns { results: [{ node, ... }] }, /hierarchy/search
  // returns { matches: [...] } — normalize both shapes here.
  const rawMatches = results.results || results.matches || results.nodes || [];
  const matches = rawMatches.map((r: any) => {
    const node = r.node || r;
    return transformNode(node);
  });

  const result = { matches, totalMatches: matches.length };

  // Cache for 60 seconds
  treeCache.set(cacheKey, result, 60000);

  return { ...result, matches: result.matches.slice(0, limit) };
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