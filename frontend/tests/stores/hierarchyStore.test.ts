import { describe, it, expect, vi, beforeEach } from "vitest";
import { useHierarchyStore, UiNode } from "../hierarchyStore";

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
});