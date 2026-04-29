import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import { PropertiesPanel } from "../PropertiesPanel";

// Declare mocks at module scope before vi.mock so they're available when factory runs
const mockSetSelectedNode = vi.fn();
const mockUseHierarchyStore = vi.fn(() => ({
  selectedNode: null,
  lockedNode: null,
  hoveredNode: null,
  setSelectedNode: mockSetSelectedNode,
}));

vi.mock("@/stores/hierarchyStore", () => ({
  useHierarchyStore: () => mockUseHierarchyStore(),
}));

describe("PropertiesPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseHierarchyStore.mockReturnValue({
      selectedNode: null, lockedNode: null, hoveredNode: null, setSelectedNode: mockSetSelectedNode,
    });
  });

  it("renders without crashing when no node selected", () => {
    const { container } = render(<PropertiesPanel />);
    expect(container).toBeDefined();
  });

  it("renders without crashing when a node is selected", () => {
    const node = {
      id: "node1", className: "android.widget.Button", text: "Submit",
      bounds: { x: 0, y: 100, width: 200, height: 50 }, children: [],
    };
    mockUseHierarchyStore.mockReturnValue({
      selectedNode: node, lockedNode: null, hoveredNode: null, setSelectedNode: mockSetSelectedNode,
    });
    const { container } = render(<PropertiesPanel />);
    expect(container).toBeDefined();
  });

  it("renders without crashing when a node is locked", () => {
    const node = {
      id: "node2", className: "android.widget.EditText", text: "Enter name",
      bounds: { x: 10, y: 20, width: 300, height: 60 }, children: [],
    };
    mockUseHierarchyStore.mockReturnValue({
      selectedNode: null, lockedNode: node, hoveredNode: null, setSelectedNode: mockSetSelectedNode,
    });
    const { container } = render(<PropertiesPanel />);
    expect(container).toBeDefined();
  });
});