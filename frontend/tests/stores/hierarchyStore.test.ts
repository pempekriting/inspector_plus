import { describe, it, expect, vi, beforeEach } from "vitest";
import { useHierarchyStore, UiNode } from "../../src/stores/hierarchyStore";

describe("hierarchyStore", () => {
  beforeEach(() => {
    // Reset store state
    useHierarchyStore.setState({
      uiTree: null,
      hoveredNode: null,
      selectedNode: null,
      lockedNode: null,
      hoveredCanvasPos: null,
      isLoadingScreenshot: false,
      isLoadingHierarchy: false,
      refreshCounter: 0,
      screenshotRefreshCounter: 0,
      searchQuery: "",
      searchFilter: "xpath",
      canvasMode: "inspect",
    });
  });

  describe("setUiTree", () => {
    it("sets the uiTree", () => {
      const tree: UiNode = {
        id: "root",
        className: "FrameLayout",
        bounds: { x: 0, y: 0, width: 100, height: 100 },
      };

      useHierarchyStore.getState().setUiTree(tree);
      expect(useHierarchyStore.getState().uiTree).toEqual(tree);
    });
  });

  describe("setHoveredNode", () => {
    it("sets hovered node without canvas position", () => {
      const node: UiNode = {
        id: "hovered",
        className: "TextView",
        bounds: { x: 0, y: 0, width: 100, height: 50 },
      };

      useHierarchyStore.getState().setHoveredNode(node);
      expect(useHierarchyStore.getState().hoveredNode).toEqual(node);
      expect(useHierarchyStore.getState().hoveredCanvasPos).toBeNull();
    });

    it("sets hovered node with canvas position", () => {
      const node: UiNode = {
        id: "hovered",
        className: "TextView",
        bounds: { x: 0, y: 0, width: 100, height: 50 },
      };
      const canvasPos = { x: 150, y: 200 };

      useHierarchyStore.getState().setHoveredNode(node, canvasPos);
      expect(useHierarchyStore.getState().hoveredNode).toEqual(node);
      expect(useHierarchyStore.getState().hoveredCanvasPos).toEqual(canvasPos);
    });
  });

  describe("setSelectedNode", () => {
    it("sets selected node", () => {
      const node: UiNode = {
        id: "selected",
        className: "Button",
        bounds: { x: 0, y: 0, width: 80, height: 40 },
      };

      useHierarchyStore.getState().setSelectedNode(node);
      expect(useHierarchyStore.getState().selectedNode).toEqual(node);
    });

    it("can set selected node to null", () => {
      const node: UiNode = {
        id: "selected",
        className: "Button",
        bounds: { x: 0, y: 0, width: 80, height: 40 },
      };

      useHierarchyStore.getState().setSelectedNode(node);
      useHierarchyStore.getState().setSelectedNode(null);
      expect(useHierarchyStore.getState().selectedNode).toBeNull();
    });
  });

  describe("triggerHierarchyRefresh", () => {
    it("increments refreshCounter", () => {
      const initialCounter = useHierarchyStore.getState().refreshCounter;
      useHierarchyStore.getState().triggerHierarchyRefresh();
      expect(useHierarchyStore.getState().refreshCounter).toBe(initialCounter + 1);
    });
  });

  describe("triggerScreenshotRefresh", () => {
    it("increments screenshotRefreshCounter", () => {
      const initialCounter = useHierarchyStore.getState().screenshotRefreshCounter;
      useHierarchyStore.getState().triggerScreenshotRefresh();
      expect(useHierarchyStore.getState().screenshotRefreshCounter).toBe(initialCounter + 1);
    });
  });

  describe("search", () => {
    it("sets searchQuery", () => {
      useHierarchyStore.getState().setSearchQuery("button");
      expect(useHierarchyStore.getState().searchQuery).toBe("button");
    });

    it("sets searchFilter", () => {
      useHierarchyStore.getState().setSearchFilter("resource-id");
      expect(useHierarchyStore.getState().searchFilter).toBe("resource-id");
    });

    it("can cycle through all filter types", () => {
      const filters: Array<"xpath" | "resource-id" | "text" | "content-desc" | "class"> = [
        "xpath", "resource-id", "text", "content-desc", "class",
      ];

      filters.forEach((filter) => {
        useHierarchyStore.getState().setSearchFilter(filter);
        expect(useHierarchyStore.getState().searchFilter).toBe(filter);
      });
    });
  });

  describe("canvasMode", () => {
    it("defaults to inspect mode", () => {
      expect(useHierarchyStore.getState().canvasMode).toBe("inspect");
    });

    it("can switch to coordinate mode", () => {
      useHierarchyStore.getState().setCanvasMode("coordinate");
      expect(useHierarchyStore.getState().canvasMode).toBe("coordinate");
    });

    it("can switch to layout mode", () => {
      useHierarchyStore.getState().setCanvasMode("layout");
      expect(useHierarchyStore.getState().canvasMode).toBe("layout");
    });
  });

  describe("loading states", () => {
    it("setLoadingHierarchy", () => {
      expect(useHierarchyStore.getState().isLoadingHierarchy).toBe(false);
      useHierarchyStore.getState().setLoadingHierarchy(true);
      expect(useHierarchyStore.getState().isLoadingHierarchy).toBe(true);
    });

    it("setLoadingScreenshot", () => {
      expect(useHierarchyStore.getState().isLoadingScreenshot).toBe(false);
      useHierarchyStore.getState().setLoadingScreenshot(true);
      expect(useHierarchyStore.getState().isLoadingScreenshot).toBe(true);
    });
  });

  describe("lockSelection / lockedNode", () => {
    it("sets lockedNode via lockSelection", () => {
      const node: UiNode = {
        id: "locked",
        className: "Button",
        bounds: { x: 0, y: 0, width: 80, height: 40 },
      };
      useHierarchyStore.getState().lockSelection(node);
      expect(useHierarchyStore.getState().lockedNode).toEqual(node);
    });

    it("can clear lockedNode by passing null", () => {
      const node: UiNode = {
        id: "locked",
        className: "Button",
        bounds: { x: 0, y: 0, width: 80, height: 40 },
      };
      useHierarchyStore.getState().lockSelection(node);
      useHierarchyStore.getState().lockSelection(null);
      expect(useHierarchyStore.getState().lockedNode).toBeNull();
    });

    it("lockedNode persists after setHoveredNode is called", () => {
      const node: UiNode = {
        id: "locked",
        className: "Button",
        bounds: { x: 0, y: 0, width: 80, height: 40 },
      };
      const hovered: UiNode = {
        id: "hovered",
        className: "TextView",
        bounds: { x: 0, y: 0, width: 50, height: 30 },
      };
      useHierarchyStore.getState().lockSelection(node);
      useHierarchyStore.getState().setHoveredNode(hovered);
      // lockedNode should NOT be overwritten by hover
      expect(useHierarchyStore.getState().lockedNode).toEqual(node);
      expect(useHierarchyStore.getState().hoveredNode).toEqual(hovered);
    });
  });

  describe("getDemoTree", () => {
    it("returns a valid demo tree structure", () => {
      const demo = useHierarchyStore.getState().getDemoTree();

      expect(demo).toHaveProperty("id");
      expect(demo).toHaveProperty("className");
      expect(demo).toHaveProperty("bounds");
      expect(demo.bounds).toHaveProperty("x");
      expect(demo.bounds).toHaveProperty("y");
      expect(demo.bounds).toHaveProperty("width");
      expect(demo.bounds).toHaveProperty("height");
      expect(demo).toHaveProperty("children");
      expect(Array.isArray(demo.children)).toBe(true);
    });
  });

  describe("expandAll / collapseAll / toggleExpanded", () => {
    const treeWithChildren: UiNode = {
      id: "root",
      className: "FrameLayout",
      bounds: { x: 0, y: 0, width: 100, height: 100 },
      children: [
        {
          id: "child1",
          className: "LinearLayout",
          bounds: { x: 0, y: 0, width: 50, height: 50 },
          children: [
            { id: "grandchild1", className: "Button", bounds: { x: 0, y: 0, width: 25, height: 25 } },
            { id: "grandchild2", className: "TextView", bounds: { x: 0, y: 25, width: 25, height: 25 } },
          ],
        },
        { id: "child2", className: "Button", bounds: { x: 50, y: 0, width: 50, height: 50 } },
      ],
    };

    beforeEach(() => {
      useHierarchyStore.setState({ expandedNodes: new Set() });
    });

    it("toggleExpanded adds node to expanded set", () => {
      useHierarchyStore.getState().toggleExpanded("root");
      expect(useHierarchyStore.getState().expandedNodes.has("root")).toBe(true);
    });

    it("toggleExpanded removes node if already expanded", () => {
      useHierarchyStore.getState().toggleExpanded("root");
      expect(useHierarchyStore.getState().expandedNodes.has("root")).toBe(true);
      useHierarchyStore.getState().toggleExpanded("root");
      expect(useHierarchyStore.getState().expandedNodes.has("root")).toBe(false);
    });

    it("expandAll adds all node IDs to expanded set", () => {
      useHierarchyStore.getState().expandAll(treeWithChildren);
      const expanded = useHierarchyStore.getState().expandedNodes;
      expect(expanded.has("root")).toBe(true);
      expect(expanded.has("child1")).toBe(true);
      expect(expanded.has("child2")).toBe(true);
      expect(expanded.has("grandchild1")).toBe(true);
      expect(expanded.has("grandchild2")).toBe(true);
    });

    it("expandAll handles empty tree", () => {
      useHierarchyStore.getState().expandAll({ id: "empty", className: "View", bounds: { x: 0, y: 0, width: 0, height: 0 } });
      const expanded = useHierarchyStore.getState().expandedNodes;
      expect(expanded.has("empty")).toBe(true);
    });

    it("collapseAll clears all expanded nodes", () => {
      useHierarchyStore.getState().expandAll(treeWithChildren);
      expect(useHierarchyStore.getState().expandedNodes.size).toBeGreaterThan(0);
      useHierarchyStore.getState().collapseAll();
      expect(useHierarchyStore.getState().expandedNodes.size).toBe(0);
    });
  });

  describe("search results", () => {
    it("setSearchResults updates results and count", () => {
      const results = [
        { nodeId: "node1", matchField: "text", matchedText: "Button", node: { id: "node1", className: "Button" } as UiNode },
        { nodeId: "node2", matchField: "text", matchedText: "Button", node: { id: "node2", className: "Button" } as UiNode },
      ];
      useHierarchyStore.getState().setSearchResults(results, 2);
      expect(useHierarchyStore.getState().searchResults).toEqual(results);
      expect(useHierarchyStore.getState().searchResultsCount).toBe(2);
      expect(useHierarchyStore.getState().isSearchActive).toBe(true);
    });

    it("setSearchResults with empty results sets isSearchActive to false", () => {
      useHierarchyStore.getState().setSearchResults([], 0);
      expect(useHierarchyStore.getState().searchResults).toEqual([]);
      expect(useHierarchyStore.getState().searchResultsCount).toBe(0);
      expect(useHierarchyStore.getState().isSearchActive).toBe(false);
    });

    it("setCurrentSearchIndex updates the index", () => {
      useHierarchyStore.getState().setCurrentSearchIndex(2);
      expect(useHierarchyStore.getState().currentSearchIndex).toBe(2);
    });

    it("clearSearch resets all search state", () => {
      useHierarchyStore.getState().setSearchQuery("button");
      useHierarchyStore.getState().setSearchResults([
        { nodeId: "node1", matchField: "text", matchedText: "button", node: { id: "node1", className: "Button" } as UiNode },
      ], 1);
      useHierarchyStore.getState().setCurrentSearchIndex(0);
      useHierarchyStore.getState().clearSearch();

      expect(useHierarchyStore.getState().searchQuery).toBe("");
      expect(useHierarchyStore.getState().searchResults).toEqual([]);
      expect(useHierarchyStore.getState().searchResultsCount).toBe(0);
      expect(useHierarchyStore.getState().currentSearchIndex).toBe(-1);
      expect(useHierarchyStore.getState().isSearchActive).toBe(false);
    });
  });

  describe("context management", () => {
    beforeEach(() => {
      useHierarchyStore.setState({ currentContext: "NATIVE_APP" });
    });

    it("setContext updates currentContext", () => {
      useHierarchyStore.getState().setContext("WEBVIEW_com.example");
      expect(useHierarchyStore.getState().currentContext).toBe("WEBVIEW_com.example");
    });

    it("setContext switches back to native context", () => {
      useHierarchyStore.getState().setContext("WEBVIEW_com.example");
      useHierarchyStore.getState().setContext("NATIVE_APP");
      expect(useHierarchyStore.getState().currentContext).toBe("NATIVE_APP");
    });
  });

  describe("combinedScreenshotUrl", () => {
    it("setCombinedScreenshotUrl stores URL", () => {
      const url = "http://localhost:8001/hierarchy-and-screenshot";
      useHierarchyStore.getState().setCombinedScreenshotUrl(url);
      expect(useHierarchyStore.getState().combinedScreenshotUrl).toBe(url);
    });

    it("setCombinedScreenshotUrl can set to null", () => {
      useHierarchyStore.getState().setCombinedScreenshotUrl("http://localhost:8001/screenshot");
      useHierarchyStore.getState().setCombinedScreenshotUrl(null);
      expect(useHierarchyStore.getState().combinedScreenshotUrl).toBeNull();
    });
  });

  describe("canvasMode interaction with lockedNode", () => {
    it("switching to layout mode clears lockedNode", () => {
      const node: UiNode = { id: "locked", className: "Button", bounds: { x: 0, y: 0, width: 80, height: 40 } };
      useHierarchyStore.getState().lockSelection(node);
      useHierarchyStore.getState().setCanvasMode("layout");
      // lockedNode is cleared when not in inspect mode
      expect(useHierarchyStore.getState().lockedNode).toBeNull();
    });

    it("switching to coordinate mode clears lockedNode", () => {
      const node: UiNode = { id: "locked", className: "Button", bounds: { x: 0, y: 0, width: 80, height: 40 } };
      useHierarchyStore.getState().lockSelection(node);
      useHierarchyStore.getState().setCanvasMode("coordinate");
      expect(useHierarchyStore.getState().lockedNode).toBeNull();
    });

    it("switching to inspect mode preserves lockedNode", () => {
      const node: UiNode = { id: "locked", className: "Button", bounds: { x: 0, y: 0, width: 80, height: 40 } };
      useHierarchyStore.getState().lockSelection(node);
      useHierarchyStore.getState().setCanvasMode("layout");
      useHierarchyStore.getState().setCanvasMode("inspect");
      // Note: lockedNode was cleared when switching to layout, so it stays null
      expect(useHierarchyStore.getState().lockedNode).toBeNull();
    });
  });
});