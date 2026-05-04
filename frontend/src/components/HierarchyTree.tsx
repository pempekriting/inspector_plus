import { useState, useCallback, useEffect, memo, useMemo, useRef } from "react";
import { useHierarchyStore, UiNode, SearchFilter } from "../stores/hierarchyStore";
import { useThemeStore } from "../stores/themeStore";
import { useDeviceStore } from "../stores/deviceStore";
import { SearchBar } from "./SearchBar";
import { SkeletonLoader } from "./SkeletonLoader";
import { ErrorState } from "./ErrorState";
import { EmptyState } from "./EmptyState";
import type { UiCapability } from "../types/shared";
import { useRecording } from "../hooks/useRecording";
import { nodeToLocator } from "./ScreenshotCanvas";

const CAPABILITY_COLORS: Record<string, string> = {
  scroll: "#fbbf24",
  input:  "#a78bfa",
  long:   "#fb923c",
  link:   "#34d399",
};

function capColor(type: string): string {
  return CAPABILITY_COLORS[type] ?? "#6b7280";
}

const ELEMENT_ICONS: Record<string, { bg: string; color: string }> = {
  FrameLayout: { bg: 'var(--element-frame-bg)', color: 'var(--element-frame-text)' },
  LinearLayout: { bg: 'var(--element-linear-bg)', color: 'var(--element-linear-text)' },
  RelativeLayout: { bg: 'var(--element-linear-bg)', color: 'var(--element-linear-text)' },
  ConstraintLayout: { bg: 'var(--element-linear-bg)', color: 'var(--element-linear-text)' },
  TextView: { bg: 'var(--element-text-bg)', color: 'var(--element-text-text)' },
  Button: { bg: 'var(--element-button-bg)', color: 'var(--element-button-text)' },
  ImageView: { bg: 'var(--element-image-bg)', color: 'var(--element-image-text)' },
  ImageButton: { bg: 'var(--element-image-bg)', color: 'var(--element-image-text)' },
  View: { bg: 'var(--element-view-bg)', color: 'var(--element-view-text)' },
  EditText: { bg: 'var(--element-text-bg)', color: 'var(--element-text-text)' },
  RecyclerView: { bg: 'var(--element-recycler-bg)', color: 'var(--element-recycler-text)' },
  ListView: { bg: 'var(--element-recycler-bg)', color: 'var(--element-recycler-text)' },
  ScrollView: { bg: 'var(--element-recycler-bg)', color: 'var(--element-recycler-text)' },
  WebView: { bg: 'var(--element-web-bg)', color: 'var(--element-web-text)' },
  MapView: { bg: 'var(--element-web-bg)', color: 'var(--element-web-text)' },
  SurfaceView: { bg: 'var(--element-surface-bg)', color: 'var(--element-surface-text)' },
  default: { bg: 'var(--element-view-bg)', color: 'var(--element-view-text)' },
};

function getIconStyle(className: string | undefined) {
  if (!className) return ELEMENT_ICONS.default;
  const shortName = className.split('.').pop() || '';
  return ELEMENT_ICONS[shortName] || ELEMENT_ICONS.default;
}

// Filter-aware node matching — respects the selected search filter type
function nodeMatchesFilter(node: UiNode, query: string, filter: SearchFilter): boolean {
  if (!query.trim()) return true;
  const term = query.toLowerCase();
  switch (filter) {
    case "text":
      return node.text?.toLowerCase().includes(term) ?? false;
    case "resource-id":
      return node.resourceId?.toLowerCase().includes(term) ?? false;
    case "content-desc":
      return node.contentDesc?.toLowerCase().includes(term) ?? false;
    case "class":
      return node.className?.toLowerCase().includes(term) ?? false;
    case "xpath":
    default:
      // XPath: generic substring across all fields
      return [node.text, node.contentDesc, node.resourceId, node.className].some(f => f?.toLowerCase().includes(term));
  }
}

function countMatches(node: UiNode, query: string, filter: SearchFilter): number {
  let count = nodeMatchesFilter(node, query, filter) ? 1 : 0;
  if (node.children) {
    for (const child of node.children) {
      count += countMatches(child, query, filter);
    }
  }
  return count;
}

// Flatten visible nodes for keyboard navigation
// searchResults provides BE's matched subtree to use for rendering matched nodes
function flattenVisibleNodes(
  node: UiNode,
  expandedNodes: Set<string>,
  searchQuery: string,
  searchFilter: SearchFilter,
  matchSet: Set<string> | null,
  searchResults: { nodeId: string; node: UiNode }[] = []
): UiNode[] {
  const result: UiNode[] = [];
  const nodeIsMatched = matchSet?.has(node.id) ?? false;
  const matchesFilter = nodeMatchesFilter(node, searchQuery, searchFilter);

  // Include node if it passes local filter OR if it's in matched path
  if (!matchesFilter && !nodeIsMatched) return result;
  result.push(node);

  // Determine children source:
  // - For matched nodes, use BE's subtree children (to show correct matched subtree)
  // - For non-matched nodes, use uiTree's children
  // - For BE's descendants of matched nodes, also use BE's subtree
  let children: UiNode[] | undefined;
  if (nodeIsMatched) {
    // Find this node's BE subtree - use BE's children
    const matchedResult = searchResults.find(r => r.nodeId === node.id);
    if (matchedResult?.node?.children) {
      children = matchedResult.node.children;
    }
  }
  if (!children) {
    children = node.children;
  }

  // Recurse into children if node is expanded
  // For matched nodes, recurse regardless of expanded state to show full BE subtree
  if (children && (expandedNodes.has(node.id) || nodeIsMatched)) {
    for (const child of children) {
      result.push(...flattenVisibleNodes(child, expandedNodes, searchQuery, searchFilter, matchSet, searchResults));
    }
  }
  return result;
}

export function HierarchyTree({ refreshKey = null, onRefresh }: { refreshKey?: string | null; onRefresh?: () => void }) {
  const {
    uiTree,
    hoveredNode,
    selectedNode,
    refreshCounter,
    setUiTree,
    setHoveredNode,
    setSelectedNode,
    setLoadingHierarchy,
    searchQuery,
    searchFilter,
    isSearchActive,
    searchResults,
    searchResultsCount,
    currentSearchIndex,
    setCurrentSearchIndex,
    expandedNodes,
    toggleExpanded,
    expandAll,
    collapseAll,
    lockSelection,
    lockedNode,
    isLoadingHierarchy,
    isRefreshing,
  } = useHierarchyStore();
  const { theme } = useThemeStore();
  const isDark = theme === 'dark';
  const { isRecording, recordStep } = useRecording();

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { selectedDevice } = useDeviceStore();

  // Total node count
  const totalNodeCount = useMemo(() => {
    if (!uiTree) return 0;
    let count = 0;
    const traverse = (n: UiNode) => {
      count++;
      if (n.children) n.children.forEach(traverse);
    };
    traverse(uiTree);
    return count;
  }, [uiTree]);

  // Build set of node IDs visible during search.
  // Include: matched nodes, their ancestors, AND the tree root (so traversal can start).
  // Ancestors are found by traversing the tree to locate each matched node's ID.
  const matchSet = useMemo(() => {
    if (!isSearchActive || searchResults.length === 0 || !uiTree) return null;
    const matchedIds = new Set(searchResults.map(r => r.nodeId));
    const ancestors = new Set<string>();

    function findAncestors(node: UiNode, targetId: string, path: string[]): boolean {
      if (node.id === targetId) {
        for (const a of path) ancestors.add(a);
        return true;
      }
      if (node.children) {
        for (const child of node.children) {
          if (findAncestors(child, targetId, [...path, node.id])) return true;
        }
      }
      return false;
    }

    for (const result of searchResults) {
      findAncestors(uiTree, result.nodeId, []);
    }

    const allIds = new Set<string>([...matchedIds, ...ancestors, uiTree.id]);
    return allIds;
  }, [isSearchActive, searchResults, uiTree]);

  // D4: Flattened visible nodes for keyboard navigation
  const visibleNodes = useMemo(() => {
    if (!uiTree) return [];
    return flattenVisibleNodes(uiTree, expandedNodes, searchQuery, searchFilter, matchSet, searchResults);
  }, [uiTree, expandedNodes, searchQuery, searchFilter, matchSet, searchResults]);

  const [focusedIndex, setFocusedIndex] = useState(-1);
  const treeRef = useRef<HTMLDivElement>(null);

  // Match count — use backend count when available, otherwise local filter-aware count
  const matchCount = useMemo(() => {
    if (isSearchActive && searchResultsCount > 0) return searchResultsCount;
    if (!uiTree || !searchQuery) return 0;
    return countMatches(uiTree, searchQuery, searchFilter);
  }, [uiTree, searchQuery, searchFilter, isSearchActive, searchResultsCount]);

  // F4: When backend returns search results, auto-expand all ancestor nodes
  // so matches hidden under collapsed parents become visible
  useEffect(() => {
    if (!uiTree || !isSearchActive || searchResults.length === 0) return;
    const matchedIds = new Set(searchResults.map(r => r.nodeId));
    const ancestorsToExpand = new Set<string>();

    function findAncestors(node: UiNode, targetId: string, path: Set<string>): boolean {
      if (node.id === targetId) {
        path.forEach(id => ancestorsToExpand.add(id));
        return true;
      }
      if (node.children) {
        path.add(node.id);
        for (const child of node.children) {
          if (findAncestors(child, targetId, path)) return true;
        }
        path.delete(node.id);
      }
      return false;
    }

    for (const result of searchResults) {
      findAncestors(uiTree, result.nodeId, new Set());
    }

    // Expand all ancestors that aren't already expanded
    const notYetExpanded = [...ancestorsToExpand].filter(id => !expandedNodes.has(id));
    if (notYetExpanded.length > 0) {
      const nextExpanded = new Set(expandedNodes);
      notYetExpanded.forEach(id => nextExpanded.add(id));
      // We need to update expandedNodes in the store - use the expandAll pattern
      notYetExpanded.forEach(id => {
        if (!expandedNodes.has(id)) toggleExpanded(id);
      });
    }
  }, [isSearchActive, searchResults, uiTree]);

  // F4: Navigate to first search result (after expansion)
  useEffect(() => {
    if (!isSearchActive || searchResults.length === 0) return;
    const firstResult = searchResults[0];
    // Wait a tick for DOM to update after expand
    const timer = setTimeout(() => {
      const idx = visibleNodes.findIndex(n => n.id === firstResult.nodeId);
      if (idx >= 0) {
        setFocusedIndex(idx);
        setSelectedNode(visibleNodes[idx]);
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [isSearchActive, searchResults, visibleNodes]);

  // D4: Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if user is typing in an input/textarea (allow cursor movement)
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        useHierarchyStore.getState().lockSelection(null);
        useHierarchyStore.getState().setSelectedNode(null);
        useHierarchyStore.getState().setHoveredNode(null);
        setFocusedIndex(-1);
        return;
      }

      if (!useHierarchyStore.getState().uiTree) return;

      const store = useHierarchyStore.getState();
      const { expandedNodes, toggleExpanded, setSelectedNode, setHoveredNode, lockSelection } = store;

      // D4: Arrow navigation
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const nextIdx = focusedIndex < visibleNodes.length - 1 ? focusedIndex + 1 : 0;
        setFocusedIndex(nextIdx);
        setSelectedNode(visibleNodes[nextIdx]);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prevIdx = focusedIndex > 0 ? focusedIndex - 1 : visibleNodes.length - 1;
        setFocusedIndex(prevIdx);
        setSelectedNode(visibleNodes[prevIdx]);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        const node = visibleNodes[focusedIndex];
        if (node && node.children && node.children.length > 0) {
          toggleExpanded(node.id);
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const node = visibleNodes[focusedIndex];
        if (node && node.children && node.children.length > 0 && expandedNodes.has(node.id)) {
          toggleExpanded(node.id);
        }
      } else if (e.key === 'Enter') {
        const node = visibleNodes[focusedIndex];
        if (node) {
          setSelectedNode(node);
          setHoveredNode(node);
          lockSelection(node);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusedIndex, visibleNodes]);

  const handleHover = useCallback((node: UiNode) => setHoveredNode(node), [setHoveredNode]);
  const handleHoverClear = useCallback(() => setHoveredNode(null), [setHoveredNode]);

  // Refresh button handler - calls refetch from store
  const refetchFn = useHierarchyStore(s => s.refetchFn);
  const handleRefresh = useCallback(() => {
    if (refetchFn.current) {
      useHierarchyStore.setState({ isRefreshing: true });
      refetchFn.current();
    }
  }, [refetchFn]);

  // D1: Expand/Collapse All
  const handleExpandAll = () => {
    if (uiTree) expandAll(uiTree);
  };
  const handleCollapseAll = () => {
    collapseAll();
  };

  // D7: Error state
  if (loadError && !uiTree) {
    return (
      <div className="flex flex-col h-full">
        <SearchBar />
        <TreeHeader
          isDark={isDark}
          count={0}
          onRefresh={handleRefresh}
          loading={false}
          matchCount={0}
          hasSearch={false}
          onExpandAll={handleExpandAll}
          onCollapseAll={handleCollapseAll}
        />
        <ErrorState
          title="Failed to load hierarchy"
          description={loadError}
          onRetry={handleRefresh}
          isDark={isDark}
        />
      </div>
    );
  }

  // Loading + no tree: show skeleton
  if (!uiTree) {
    return (
      <div className="flex flex-col h-full">
        <SearchBar />
        <TreeHeader
          isDark={isDark}
          count={0}
          onRefresh={handleRefresh}
          loading={isRefreshing}
          matchCount={0}
          hasSearch={false}
          onExpandAll={handleExpandAll}
          onCollapseAll={handleCollapseAll}
        />
        <SkeletonLoader rows={8} isDark={isDark} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" onMouseLeave={handleHoverClear}>
      <SearchBar />
      <TreeHeader
        isDark={isDark}
        count={totalNodeCount}
        onRefresh={handleRefresh}
        loading={isRefreshing}
        matchCount={matchCount}
        hasSearch={!!searchQuery}
        onExpandAll={handleExpandAll}
        onCollapseAll={handleCollapseAll}
      />
      <div
        ref={treeRef}
        className="flex-1 overflow-hidden relative"
        tabIndex={0}
        onClick={() => {
          // If user clicks on tree area while searching, keep focus on search input
          // This allows arrow keys to move cursor in the input instead of navigating tree
          const searchInput = document.querySelector('input[placeholder*="Search elements"]') as HTMLInputElement;
          if (searchInput && searchInput.value.length > 0) {
            searchInput.focus();
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            useHierarchyStore.getState().lockSelection(null);
            useHierarchyStore.getState().setSelectedNode(null);
            useHierarchyStore.getState().setHoveredNode(null);
            setFocusedIndex(-1);
          } else {
            e.stopPropagation();
          }
        }}
        style={{
          background: isDark ? '#0a0a0c' : '#f5f5f5',
          opacity: isLoadingHierarchy ? 0.3 : 1,
          transition: 'opacity 0.15s ease-out',
          pointerEvents: isLoadingHierarchy ? 'none' : 'auto',
        }}
      >
        <div className="h-full overflow-auto tree-scroll py-2 px-2">
          {/* WORKAROUND: When search is active with results, render matched nodes directly from BE response */}
          {isSearchActive && searchResults.length > 0 ? (
            searchResults.map((result) => (
              <SearchResultNode
                key={result.nodeId}
                result={result}
                searchResults={searchResults}
                expandedNodes={expandedNodes}
                onToggleExpand={toggleExpanded}
                isDark={isDark}
                onHover={handleHover}
                onSelect={(n) => {
                  setSelectedNode(n);
                  lockSelection(n);
                  // Record click step if recording is active
                  if (isRecording) {
                    recordStep({
                      action: "click",
                      nodeId: n.id,
                      locator: nodeToLocator(n),
                    });
                  }
                }}
                depth={0}
              />
            ))
          ) : (
            <TreeNode
              node={uiTree}
              hoveredNode={hoveredNode}
              selectedNode={selectedNode}
              lockedNode={lockedNode}
              focusedNode={visibleNodes[focusedIndex]}
              onHover={handleHover}
              onSelect={(n) => {
                setSelectedNode(n);
                lockSelection(n);
                // Update focused index
                const idx = visibleNodes.findIndex(vn => vn.id === n.id);
                if (idx >= 0) setFocusedIndex(idx);
                // Record click step if recording is active
                if (isRecording) {
                  recordStep({
                    action: "click",
                    nodeId: n.id,
                    locator: nodeToLocator(n),
                  });
                }
              }}
              depth={0}
              expandedNodes={expandedNodes}
              onToggleExpand={toggleExpanded}
              isDark={isDark}
              searchQuery={searchQuery}
              searchFilter={searchFilter}
              searchResults={searchResults}
              currentSearchIndex={currentSearchIndex}
              matchSet={matchSet ?? undefined}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// WORKAROUND: Simple component to render matched search results directly from BE response
function SearchResultNode({
  result,
  searchResults,
  expandedNodes,
  onToggleExpand,
  isDark,
  onHover,
  onSelect,
  depth,
}: {
  result: { nodeId: string; node: UiNode };
  searchResults: { nodeId: string; matchField: string; matchedText: string; node: UiNode }[];
  expandedNodes: Set<string>;
  onToggleExpand: (nodeId: string) => void;
  isDark: boolean;
  onHover: (node: UiNode) => void;
  onSelect: (node: UiNode) => void;
  depth: number;
}) {
  const node = result.node;
  const hasChildren = node.children && node.children.length > 0;
  const isExpanded = expandedNodes.has(node.id);
  const shortClassName = node.className?.split('.').pop() || 'View';
  const indent = depth * 16 + 8;
  const iconStyle = getIconStyle(node.className);

  return (
    <div>
      <div
        className="flex items-center py-1.5 cursor-pointer select-none rounded"
        style={{
          paddingLeft: `${indent}px`,
          background: 'rgba(253, 224, 71, 0.12)',
          borderLeft: `3px solid ${isDark ? 'var(--accent-cyan)' : '#2563eb'}`,
          minWidth: '0',
        }}
        onMouseEnter={() => onHover(node)}
        onClick={() => onSelect(node)}
      >
        <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
          {hasChildren ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand(node.id);
              }}
              className="w-4 h-4 flex items-center justify-center rounded transition-transform duration-150"
              style={{
                background: isDark ? '#1f1f23' : '#ffffff',
                border: isDark ? '1.5px solid #3f3f46' : '1.5px solid #cccccc',
                transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
              }}
            >
              <svg className="w-2.5 h-2.5" style={{ color: isDark ? '#71717a' : '#666666' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <path d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ) : (
            <span className="w-2 h-2" />
          )}
        </div>

        <div
          className="flex-shrink-0 flex items-center justify-center mr-2"
          style={{
            width: 16,
            height: 16,
            background: iconStyle.bg,
            color: iconStyle.color,
            borderRadius: 2,
            fontSize: 8,
            fontWeight: 700,
            border: '1.5px solid rgba(0,0,0,0.2)',
          }}
        >
          {shortClassName[0]}
        </div>

        <div className="flex items-center gap-2 flex-shrink min-w-0">
          <span className="text-[10px] font-bold truncate" style={{ color: isDark ? '#f0f0f5' : '#1a1a2e' }}>
            {shortClassName}
          </span>
          {node.resourceId ? (
            <span className="text-[10px] font-mono truncate" style={{ color: isDark ? 'var(--accent-cyan)' : '#2563eb' }}>
              #{node.resourceId}
            </span>
          ) : node.contentDesc ? (
            <span className="text-[10px] italic font-mono truncate" style={{ color: isDark ? '#f72585' : '#e94560' }}>
              {node.contentDesc}
            </span>
          ) : node.text ? (
            <span className="text-[10px] font-mono truncate" style={{ color: isDark ? '#fee440' : '#d97706' }}>
              "{node.text}"
            </span>
          ) : null}
        </div>

        {node.bounds && (
          <span className="text-[9px] ml-2 flex-shrink-0 font-mono" style={{ color: isDark ? '#52525b' : '#999999' }}>
            {node.bounds.width}x{node.bounds.height}
          </span>
        )}
      </div>

      {/* Render children from BE's response */}
      {hasChildren && isExpanded && (
        <div className="overflow-hidden" style={{ animation: 'fade-in-up 0.15s ease-out' }}>
          {node.children!.map((child, index) => (
            <SearchResultNode
              key={`${child.id || index}`}
              result={{ nodeId: child.id, node: child }}
              searchResults={searchResults}
              expandedNodes={expandedNodes}
              onToggleExpand={onToggleExpand}
              isDark={isDark}
              onHover={onHover}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const TreeHeader = memo(function TreeHeader({
  isDark,
  count,
  onRefresh,
  loading,
  matchCount,
  hasSearch,
  onExpandAll,
  onCollapseAll,
}: {
  isDark: boolean;
  count: number;
  onRefresh: () => void;
  loading: boolean;
  matchCount: number;
  hasSearch: boolean;
  onExpandAll: () => void;
  onCollapseAll: () => void;
}) {
  return (
    <div
      className="flex items-center justify-between px-3 py-2 flex-shrink-0"
      style={{
        background: isDark ? '#18181b' : '#e5e5e5',
        borderBottom: isDark ? '3px solid #3f3f46' : '3px solid #1a1a1a',
      }}
    >
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: isDark ? '#71717a' : '#666666' }}>
          View Hierarchy
        </span>
        <span
          className="px-1.5 py-0.5 rounded text-[9px] font-bold font-mono"
          style={{
            background: isDark ? '#1f1f23' : '#ffffff',
            color: isDark ? '#71717a' : '#666666',
            border: isDark ? '2px solid #3f3f46' : '2px solid #cccccc',
          }}
        >
          {count}
        </span>
        {hasSearch && matchCount > 0 && (
          <span
            className="px-1.5 py-0.5 rounded text-[9px] font-bold font-mono"
            style={{
              background: isDark ? 'rgba(253, 224, 71, 0.15)' : 'rgba(180, 83, 9, 0.15)',
              color: isDark ? '#fde047' : '#b45309',
              border: isDark ? '2px solid #fde047' : '2px solid #b45309',
            }}
          >
            {matchCount} match{matchCount !== 1 ? 'es' : ''}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1">
        {/* D1: Expand/Collapse All */}
        <button
          onClick={onExpandAll}
          className="px-2 py-1 rounded text-[9px] font-bold transition-all active:scale-95"
          style={{
            background: isDark ? '#1f1f23' : '#ffffff',
            color: isDark ? '#a1a1aa' : '#4a4a4a',
            border: isDark ? '2px solid #3f3f46' : '2px solid #cccccc',
          }}
          title="Expand All"
        >
          Expand
        </button>
        <button
          onClick={onCollapseAll}
          className="px-2 py-1 rounded text-[9px] font-bold transition-all active:scale-95"
          style={{
            background: isDark ? '#1f1f23' : '#ffffff',
            color: isDark ? '#a1a1aa' : '#4a4a4a',
            border: isDark ? '2px solid #3f3f46' : '2px solid #cccccc',
          }}
          title="Collapse All"
        >
          Collapse
        </button>
        <ActionButton onClick={onRefresh} loading={loading} isDark={isDark}>
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M1 4v6h6M23 20v-6h-6" />
            <path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15" />
          </svg>
        </ActionButton>
      </div>
    </div>
  );
});

function ActionButton({
  children,
  onClick,
  loading,
  isDark,
}: {
  children: React.ReactNode;
  onClick: () => void;
  loading?: boolean;
  isDark: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[10px] font-bold transition-all active:scale-95"
      style={{
        background: isDark ? '#1f1f23' : '#ffffff',
        color: isDark ? '#a1a1aa' : '#4a4a4a',
        border: isDark ? '2px solid #3f3f46' : '2px solid #1a1a1a',
        boxShadow: isDark ? '2px 2px 0 #000' : '2px 2px 0 #1a1a1a',
        opacity: loading ? 0.6 : 1,
      }}
    >
      {loading ? (
        <svg className="w-3 h-3 animate-br-refresh" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
          <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : children}
    </button>
  );
}

interface TreeNodeProps {
  node: UiNode;
  hoveredNode: UiNode | null;
  selectedNode: UiNode | null;
  lockedNode: UiNode | null;
  focusedNode: UiNode | null;
  onHover: (node: UiNode) => void;
  onSelect: (node: UiNode) => void;
  depth: number;
  expandedNodes: Set<string>;
  onToggleExpand: (nodeId: string) => void;
  isDark: boolean;
  searchQuery: string;
  searchFilter: SearchFilter;
  searchResults: { nodeId: string; matchField: string; matchedText: string; node: UiNode }[];
  currentSearchIndex: number;
  matchSet?: Set<string>;  // node IDs to show (matched + ancestors)
}

const TreeNode = memo(function TreeNode({
  node,
  hoveredNode,
  selectedNode,
  lockedNode,
  focusedNode,
  onHover,
  onSelect,
  depth,
  expandedNodes,
  onToggleExpand,
  isDark,
  searchQuery,
  searchFilter,
  searchResults,
  currentSearchIndex,
  matchSet,
}: TreeNodeProps) {
  // When matchSet is active, skip nodes that are outside matched paths entirely
  const isInSearchTree = !matchSet || matchSet.has(node.id);
  if (!isInSearchTree) return null;

  const isMatched = matchSet?.has(node.id) ?? false;

  // Get children - use BE's subtree for matched nodes to show correct hierarchy
  let children: UiNode[] | undefined;
  if (isMatched) {
    const matchedResult = searchResults.find(r => r.nodeId === node.id);
    if (matchedResult?.node?.children) {
      children = matchedResult.node.children;
    }
  }
  if (!children) {
    children = node.children;
  }

  const isHovered = hoveredNode?.id === node.id;
  const isSelected = selectedNode?.id === node.id;
  const isLocked = lockedNode?.id === node.id;
  const hasChildren = children && children.length > 0;
  const isExpanded = expandedNodes.has(node.id);

  const matches = nodeMatchesFilter(node, searchQuery, searchFilter);
  const hasSearch = searchQuery.trim().length > 0;
  // Dim if local filter says no match AND not a direct backend match
  const isSearchMatch = searchResults.some(r => r.nodeId === node.id);
  const isDimmed = hasSearch && !matches && !isSearchMatch;

  // F4: Check if this node is the current index in search results
  const searchResultIndex = searchResults.findIndex(r => r.nodeId === node.id);
  const isCurrentSearchMatch = searchResultIndex === currentSearchIndex;

  const handleClick = () => onSelect(node);

  const iconStyle = getIconStyle(node.className);
  const shortClassName = node.className?.split('.').pop() || 'View';

  const indent = depth * 16 + 8;

  const borderColor = isLocked
    ? '#fbbf24'  // locked: bright yellow
    : isSelected
    ? (isDark ? 'var(--accent-cyan)' : '#1a1a2e')
    : isHovered
    ? (isDark ? '#fee440' : '#e94560')
    : isSearchMatch
    ? (isDark ? 'var(--accent-cyan)' : '#2563eb')
    : 'transparent';

  const bgColor = isLocked
    ? (isDark ? 'rgba(251, 191, 36, 0.18)' : 'rgba(251, 191, 36, 0.15)')
    : isSelected
    ? (isDark ? 'rgba(0, 245, 212, 0.1)' : 'rgba(26, 26, 46, 0.08)')
    : isHovered
    ? (isDark ? 'rgba(254, 228, 64, 0.08)' : 'rgba(233, 69, 96, 0.06)')
    : isCurrentSearchMatch
    ? (isDark ? 'rgba(253, 224, 71, 0.2)' : 'rgba(180, 83, 9, 0.2)')
    : isSearchMatch
    ? (isDark ? 'rgba(253, 224, 71, 0.12)' : 'rgba(180, 83, 9, 0.12)')
    : hasSearch && matches
    ? (isDark ? 'rgba(253, 224, 71, 0.08)' : 'rgba(180, 83, 9, 0.08)')
    : 'transparent';

  return (
    <div style={{ opacity: isDimmed ? 0.4 : 1, transition: 'opacity 0.15s ease-out' }}>
      <div
        className="flex items-center py-1.5 cursor-pointer select-none rounded"
        style={{
          paddingLeft: `${indent}px`,
          background: bgColor,
          borderLeft: `3px solid ${borderColor}`,
          minWidth: '0',
        }}
        onMouseEnter={() => onHover(node)}
        onClick={handleClick}
      >
        <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
          {hasChildren ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand(node.id);
              }}
              className="w-4 h-4 flex items-center justify-center rounded transition-transform duration-150"
              style={{
                background: isDark ? '#1f1f23' : '#ffffff',
                border: isDark ? '1.5px solid #3f3f46' : '1.5px solid #cccccc',
                transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
              }}
            >
              <svg className="w-2.5 h-2.5" style={{ color: isDark ? '#71717a' : '#666666' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <path d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ) : (
            <span className="w-2 h-2" />
          )}
        </div>

        <div
          className="flex-shrink-0 flex items-center justify-center mr-2"
          style={{
            width: 16,
            height: 16,
            background: iconStyle.bg,
            color: iconStyle.color,
            borderRadius: 2,
            fontSize: 8,
            fontWeight: 700,
            border: '1.5px solid rgba(0,0,0,0.2)',
          }}
        >
          {shortClassName[0]}
        </div>

        <div className="flex items-center gap-2 flex-shrink min-w-0">
          <span
            className="text-[10px] font-bold truncate"
            style={{ color: isDark ? '#f0f0f5' : '#1a1a2e' }}
          >
            {shortClassName}
          </span>

          {node.resourceId ? (
            <span className="text-[10px] font-mono truncate" style={{ color: isDark ? 'var(--accent-cyan)' : '#2563eb' }}>
              #{node.resourceId}
            </span>
          ) : node.contentDesc ? (
            <span className="text-[10px] italic font-mono truncate" style={{ color: isDark ? '#f72585' : '#e94560' }}>
              {node.contentDesc}
            </span>
          ) : node.text ? (
            <span className="text-[10px] font-mono truncate" style={{ color: isDark ? '#fee440' : '#d97706' }}>
              "{node.text}"
            </span>
          ) : null}
        </div>

        {node.capabilities && node.capabilities.length > 0 && (
          <div className="flex items-center gap-1 ml-auto flex-shrink-0">
            {node.capabilities
                  .filter((cap: UiCapability) => cap.type !== 'tap' && cap.type !== 'focus')
                  .map((cap: UiCapability) => (
              <span
                key={cap.type}
                title={cap.type}
                className="font-mono text-[8px] font-bold px-1 py-0.5 rounded-sm"
                style={{
                  background: capColor(cap.type),
                  color: '#0a0a0c',
                }}
              >
                {cap.badge}
              </span>
            ))}
          </div>
        )}

        {node.bounds && (
          <span className="text-[9px] ml-2 flex-shrink-0 font-mono" style={{ color: isDark ? '#52525b' : '#999999' }}>
            {node.bounds.width}x{node.bounds.height}
          </span>
        )}
      </div>

      {/* D1: Animated children with CSS grid-template-rows transition */}
      {hasChildren && (
        <div
          className="overflow-hidden"
          style={{
            display: isExpanded ? 'block' : 'none',
            animation: isExpanded ? 'fade-in-up 0.15s ease-out' : undefined,
          }}
        >
          {children!.map((child, index) => (
            <TreeNode
              key={`${child.id || index}`}
              node={child}
              hoveredNode={hoveredNode}
              selectedNode={selectedNode}
              lockedNode={lockedNode}
              focusedNode={focusedNode}
              onHover={onHover}
              onSelect={onSelect}
              depth={depth + 1}
              expandedNodes={expandedNodes}
              onToggleExpand={onToggleExpand}
              isDark={isDark}
              searchQuery={searchQuery}
              searchFilter={searchFilter}
              searchResults={searchResults}
              currentSearchIndex={currentSearchIndex}
              matchSet={matchSet ?? undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
});