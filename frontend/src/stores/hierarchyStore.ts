import { create } from "zustand";
import type { Bounds, SearchFilter, UiNode } from "../types/shared";

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
  canvasMode: "inspect" | "coordinate" | "layout";
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
  // Refetch function and refreshing state for refresh button
  refetchFn: { current: (() => void) | null };
  isRefreshing: boolean;
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
  setCanvasMode: (mode: "inspect" | "coordinate" | "layout") => void;
  // F4: search actions
  setSearchResults: (results: SearchResult[], count: number) => void;
  setCurrentSearchIndex: (index: number) => void;
  clearSearch: () => void;
  // D1: expand/collapse
  toggleExpanded: (nodeId: string) => void;
  expandAll: (node: UiNode) => void;
  collapseAll: () => void;
  setContext: (contextId: string) => void;
  getDemoTree: () => UiNode;
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
  refetchFn: { current: null },
  isRefreshing: false,
  searchQuery: "",
  searchFilter: "xpath",
  canvasMode: "inspect",
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
  triggerScreenshotRefresh: () => set((state) => ({ screenshotRefreshCounter: state.screenshotRefreshCounter + 1 })),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setSearchFilter: (filter) => set({ searchFilter: filter }),
  setCanvasMode: (mode) => set({
    canvasMode: mode,
    lockedNode: mode === "inspect" ? get().lockedNode : null,
  }),
  // F4: search actions
  setSearchResults: (results, count) => set({ searchResults: results, searchResultsCount: count, isSearchActive: results.length > 0 }),
  setCurrentSearchIndex: (index) => set({ currentSearchIndex: index }),
  clearSearch: () => set({ searchQuery: "", searchResults: [], searchResultsCount: 0, currentSearchIndex: -1, isSearchActive: false }),
  // D1: expand/collapse
  toggleExpanded: (nodeId) => set((state) => {
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
  collapseAll: () => set({ expandedNodes: new Set() }),
  currentContext: "NATIVE_APP",
  setContext: (contextId) => set({ currentContext: contextId }),
  lockedNode: null,
  lockSelection: (node) => set({ lockedNode: node }),
  getDemoTree: () => {
    const demoTree: UiNode = {
      id: "decor_content",
      className: "android.widget.FrameLayout",
      package: "com.example.settings",
      resourceId: "decor_content",
      bounds: { x: 0, y: 0, width: 1080, height: 1920 },
      children: [
        {
          id: "toolbar",
          className: "android.widget.Toolbar",
          package: "com.example.settings",
          resourceId: "toolbar",
          bounds: { x: 0, y: 0, width: 1080, height: 200 },
          children: [
            {
              id: "title",
              className: "android.widget.TextView",
              package: "com.example.settings",
              resourceId: "title",
              text: "Settings",
              bounds: { x: 40, y: 80, width: 200, height: 60 },
            },
            {
              id: "menu_btn",
              className: "android.widget.ImageButton",
              package: "com.example.settings",
              resourceId: "menu",
              contentDesc: "Open menu",
              bounds: { x: 1000, y: 60, width: 80, height: 80 },
            },
          ],
        },
        {
          id: "content",
          className: "android.widget.FrameLayout",
          package: "com.example.settings",
          resourceId: "content",
          bounds: { x: 0, y: 200, width: 1080, height: 1720 },
          children: [
            {
              id: "list",
              className: "android.widget.ListView",
              package: "com.example.settings",
              resourceId: "list",
              bounds: { x: 0, y: 0, width: 1080, height: 1720 },
              children: [
                {
                  id: "item_1",
                  className: "android.widget.LinearLayout",
                  package: "com.example.settings",
                  resourceId: "item1",
                  text: "Account Settings",
                  bounds: { x: 40, y: 40, width: 1000, height: 120 },
                },
                {
                  id: "item_2",
                  className: "android.widget.LinearLayout",
                  package: "com.example.settings",
                  resourceId: "item2",
                  text: "Notifications",
                  bounds: { x: 40, y: 180, width: 1000, height: 120 },
                },
                {
                  id: "item_3",
                  className: "android.widget.LinearLayout",
                  package: "com.example.settings",
                  resourceId: "item3",
                  text: "Privacy & Security",
                  bounds: { x: 40, y: 320, width: 1000, height: 120 },
                },
              ],
            },
          ],
        },
      ],
    };
    return demoTree;
  },
}));
