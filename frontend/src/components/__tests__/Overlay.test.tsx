import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import { Overlay } from "../Overlay";

vi.mock("@/stores/hierarchyStore", () => ({
  useHierarchyStore: vi.fn(() => ({
    hoveredNode: null,
    selectedNode: null,
    canvasMode: "inspect",
  })),
}));

vi.mock("@/stores/themeStore", () => ({
  useThemeStore: vi.fn(() => ({ theme: "dark" })),
}));

describe("Overlay", () => {
  it("renders without crashing", () => {
    const { container } = render(<Overlay />);
    expect(container).toBeDefined();
  });
});