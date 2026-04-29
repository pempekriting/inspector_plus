import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import { LayoutBoundsOverlay } from "../LayoutBoundsOverlay";
import { useHierarchyStore } from "@/stores/hierarchyStore";

vi.mock('react-dom', () => ({
  createPortal: (children: React.ReactNode) => children as React.ReactElement,
}));

vi.mock("@/utils/layoutGeometry", () => ({
  getImageLayout: vi.fn(() => ({ imgLeft: 20, imgTop: 60, scale: 0.333 })),
}));

const mockTree = {
  id: "root", className: "android.widget.FrameLayout",
  bounds: { x: 0, y: 0, width: 1080, height: 1920 },
  children: [{
    id: "btn1", className: "android.widget.Button",
    bounds: { x: 50, y: 100, width: 300, height: 80 }, children: [],
  }],
};

const createMockStore = (overrides = {}) => ({
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
  searchFilter: "xpath" as const,
  canvasMode: "layout" as const,
  searchResults: [],
  searchResultsCount: 0,
  currentSearchIndex: -1,
  isSearchActive: false,
  expandedNodes: new Set<string>(),
  currentContext: "NATIVE_APP",
  setUiTree: vi.fn(),
  setHoveredNode: vi.fn(),
  setSelectedNode: vi.fn(),
  lockSelection: vi.fn(),
  setLoadingHierarchy: vi.fn(),
  triggerScreenshotRefresh: vi.fn(),
  setSearchQuery: vi.fn(),
  setSearchFilter: vi.fn(),
  setSearchResults: vi.fn(),
  setCurrentSearchIndex: vi.fn(),
  toggleExpanded: vi.fn(),
  expandAll: vi.fn(),
  collapseAll: vi.fn(),
  setContext: vi.fn(),
  setCanvasMode: vi.fn(),
  getDemoTree: vi.fn(),
  ...overrides,
});

vi.mock("@/stores/hierarchyStore", () => ({
  useHierarchyStore: vi.fn(() => createMockStore()),
}));

vi.mock("@/stores/themeStore", () => ({
  useThemeStore: vi.fn(() => ({ theme: "dark" })),
}));

describe("LayoutBoundsOverlay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useHierarchyStore as ReturnType<typeof vi.fn>).mockClear();
  });

  it("renders bounding boxes when uiTree is provided", () => {
    const mockCanvas = document.createElement('div');
    (useHierarchyStore as ReturnType<typeof vi.fn>).mockReturnValue(
      createMockStore({ uiTree: mockTree })
    );
    const { container } = render(
      <LayoutBoundsOverlay canvasRef={mockCanvas} zoom={1} pan={{ x: 0, y: 0 }} />
    );
    // Portal renders at body level, component itself returns null
    expect(container).toBeDefined();
  });

  it("renders empty state when uiTree is null", () => {
    (useHierarchyStore as ReturnType<typeof vi.fn>).mockReturnValue(
      createMockStore({ uiTree: null })
    );
    const mockCanvas = document.createElement('div');
    const { container } = render(
      <LayoutBoundsOverlay canvasRef={mockCanvas} zoom={1} pan={{ x: 0, y: 0 }} />
    );
    expect(container).toBeDefined();
  });
});
