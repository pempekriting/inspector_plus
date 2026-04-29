import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import { LocatorPanel } from "../LocatorPanel";

const mockUseHierarchyStore = vi.fn(() => ({
  selectedNode: null,
  lockedNode: null,
}));

vi.mock("@/stores/hierarchyStore", () => ({
  useHierarchyStore: () => mockUseHierarchyStore(),
}));

vi.mock("@/stores/themeStore", () => ({
  useThemeStore: vi.fn(() => ({ theme: "dark" })),
}));

describe("LocatorPanel", () => {
  it("renders without crashing when no node selected", () => {
    const { container } = render(<LocatorPanel />);
    expect(container).toBeDefined();
  });

  it("renders without crashing when a node is selected", () => {
    const node = {
      id: "node1", className: "android.widget.Button", text: "Submit",
      resourceId: "com.example:id/btn_submit", contentDesc: "Submit button",
      bounds: { x: 0, y: 100, width: 200, height: 50 }, children: [],
    };
    mockUseHierarchyStore.mockReturnValue({ selectedNode: node, lockedNode: null });
    const { container } = render(<LocatorPanel />);
    expect(container).toBeDefined();
  });

  it("renders without crashing when a node is locked", () => {
    const node = {
      id: "node2", className: "android.widget.EditText", text: "Enter name",
      resourceId: "com.example:id/input", contentDesc: "",
      bounds: { x: 10, y: 20, width: 300, height: 60 }, children: [],
    };
    mockUseHierarchyStore.mockReturnValue({ selectedNode: null, lockedNode: node });
    const { container } = render(<LocatorPanel />);
    expect(container).toBeDefined();
  });
});