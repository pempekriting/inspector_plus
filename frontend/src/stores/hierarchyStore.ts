import { create } from 'zustand';

import type { Bounds, SearchFilter, UiNode } from '../types/shared';

export type { SearchFilter };
export type { Bounds, UiNode };

export interface SearchResult {
  nodeId: string;
  matchField: string;
  matchedText: string;
  node: UiNode;
}

interface HierarchyState {
  uiTree: UiNode | null;
  hoveredNode: UiNode | null;
  selectedNode: UiNode | null;
  hoveredCanvasPos: { x: number; y: number } | null;
  isLoadingScreenshot: boolean;
  isLoadingHierarchy: boolean;
  refreshCounter: number;
  screenshotRefreshCounter: number;
  searchQuery: string;
  searchFilter: SearchFilter;
  canvasMode: 'inspect' | 'coordinate' | 'layout';
  // F4: Element search state
  searchResults: SearchResult[];
  searchResultsCount: number;
  currentSearchIndex: number;
  isSearchActive: boolean;
  // D1: expanded nodes
  expandedNodes: Set<string>;
  // F3: WebView context
  currentContext: string;
  // F2: Locked/selected element (persistent highlight until user unlocks)
  lockedNode: UiNode | null;
  lockSelection: (node: UiNode | null) => void;
  // Screenshot from combined /hierarchy-and-screenshot endpoint
  combinedScreenshotUrl: string | null;
  // Refreshing state for refresh button
  isRefreshing: boolean;
  // Canvas zoom/pan for Overlay positioning
  canvasZoom: number;
  canvasPan: { x: number; y: number };
  setCanvasTransform: (zoom: number, pan: { x: number; y: number }) => void;
  setUiTree: (tree: UiNode | null) => void;
  setHoveredNode: (node: UiNode | null, canvasPos?: { x: number; y: number }) => void;
  setSelectedNode: (node: UiNode | null) => void;
  setLoadingScreenshot: (v: boolean) => void;
  setLoadingHierarchy: (v: boolean) => void;
  setCombinedScreenshotUrl: (url: string | null) => void;
  triggerHierarchyRefresh: () => void;
  triggerScreenshotRefresh: () => void;
  setSearchQuery: (query: string) => void;
  setSearchFilter: (filter: SearchFilter) => void;
  setCanvasMode: (mode: 'inspect' | 'coordinate' | 'layout') => void;
  // F4: search actions
  setSearchResults: (results: SearchResult[], count: number) => void;
  setCurrentSearchIndex: (index: number) => void;
  clearSearch: () => void;
  // D1: expand/collapse
  toggleExpanded: (nodeId: string) => void;
  expandAll: (node: UiNode) => void;
  expandToDepth: (node: UiNode, depth: number) => void;
  collapseAll: () => void;
  setContext: (contextId: string) => void;
}

export const useHierarchyStore = create<HierarchyState>((set, get) => ({
  uiTree: null,
  hoveredNode: null,
  selectedNode: null,
  hoveredCanvasPos: null,
  isLoadingScreenshot: false,
  isLoadingHierarchy: false,
  refreshCounter: 0,
  screenshotRefreshCounter: 0,
  combinedScreenshotUrl: null,
  isRefreshing: false,
  canvasZoom: 1,
  canvasPan: { x: 0, y: 0 },
  setCanvasTransform: (zoom: number, pan: { x: number; y: number }) =>
    set({ canvasZoom: zoom, canvasPan: pan }),
  searchQuery: '',
  searchFilter: 'xpath',
  canvasMode: 'inspect',
  // F4: element search
  searchResults: [],
  searchResultsCount: 0,
  currentSearchIndex: -1,
  isSearchActive: false,
  // D1: expanded nodes
  expandedNodes: new Set<string>(),
  setUiTree: (tree) => set({ uiTree: tree }),
  setHoveredNode: (node, canvasPos) =>
    set({ hoveredNode: node, hoveredCanvasPos: canvasPos || null }),
  setSelectedNode: (node) => set({ selectedNode: node }),
  setLoadingScreenshot: (v) => set({ isLoadingScreenshot: v }),
  setLoadingHierarchy: (v) => set({ isLoadingHierarchy: v }),
  setCombinedScreenshotUrl: (url) => set({ combinedScreenshotUrl: url }),
  triggerHierarchyRefresh: () => set((state) => ({ refreshCounter: state.refreshCounter + 1 })),
  triggerScreenshotRefresh: () =>
    set((state) => ({ screenshotRefreshCounter: state.screenshotRefreshCounter + 1 })),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setSearchFilter: (filter) => set({ searchFilter: filter }),
  setCanvasMode: (mode) =>
    set({
      canvasMode: mode,
      lockedNode: mode === 'inspect' ? get().lockedNode : null,
    }),
  // F4: search actions
  setSearchResults: (results, count) =>
    set({ searchResults: results, searchResultsCount: count, isSearchActive: results.length > 0 }),
  setCurrentSearchIndex: (index) => set({ currentSearchIndex: index }),
  clearSearch: () =>
    set({
      searchQuery: '',
      searchResults: [],
      searchResultsCount: 0,
      currentSearchIndex: -1,
      isSearchActive: false,
    }),
  // D1: expand/collapse
  toggleExpanded: (nodeId) =>
    set((state) => {
      const next = new Set(state.expandedNodes);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return { expandedNodes: next };
    }),
  expandAll: (node) => {
    const expanded = new Set<string>();
    const traverse = (n: UiNode) => {
      if (n.id) expanded.add(n.id);
      if (n.children) n.children.forEach(traverse);
    };
    traverse(node);
    set({ expandedNodes: expanded });
  },
  expandToDepth: (node: UiNode, depth: number) => {
    const expanded = new Set<string>();
    const traverse = (n: UiNode, currentDepth: number) => {
      if (n.id && currentDepth < depth) {
        expanded.add(n.id);
      }
      if (n.children) n.children.forEach((child) => traverse(child, currentDepth + 1));
    };
    traverse(node, 0);
    set({ expandedNodes: expanded });
  },
  collapseAll: () => set({ expandedNodes: new Set() }),
  currentContext: 'NATIVE_APP',
  setContext: (contextId) => set({ currentContext: contextId }),
  lockedNode: null,
  lockSelection: (node) => set({ lockedNode: node }),
}));
