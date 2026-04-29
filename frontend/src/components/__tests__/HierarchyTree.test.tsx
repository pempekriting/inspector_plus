import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { HierarchyTree } from "../HierarchyTree";
import { useHierarchyStore } from "@/stores/hierarchyStore";

const mockTree = {
  id: "root",
  className: "android.widget.FrameLayout",
  bounds: { x: 0, y: 0, width: 1080, height: 1920 },
  children: [
    {
      id: "child1",
      className: "android.widget.TextView",
      bounds: { x: 0, y: 0, width: 200, height: 50 },
      children: [],
    },
  ],
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
  canvasMode: "inspect" as const,
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

vi.mock("@/stores/deviceStore", () => ({
  useDeviceStore: vi.fn(() => ({ selectedDevice: null, setSelectedDevice: vi.fn() })),
}));

vi.mock("@/hooks/useDevice", () => ({
  fetchHierarchy: vi.fn().mockResolvedValue(null),
  searchHierarchy: vi.fn().mockResolvedValue({ matches: [], count: 0 }),
}));

describe("HierarchyTree", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useHierarchyStore as ReturnType<typeof vi.fn>).mockClear();
  });

  it("renders without crashing when no uiTree", () => {
    (useHierarchyStore as ReturnType<typeof vi.fn>).mockReturnValue(createMockStore());
    const { container } = render(<HierarchyTree />);
    expect(container).toBeDefined();
  });

  it("shows node count in header when uiTree loaded", () => {
    (useHierarchyStore as ReturnType<typeof vi.fn>).mockReturnValue(
      createMockStore({ uiTree: mockTree, expandedNodes: new Set(["root"]) })
    );
    render(<HierarchyTree />);
    // Count = 2 (root + child)
    expect(screen.getByText("2")).toBeInTheDocument();
  });
});