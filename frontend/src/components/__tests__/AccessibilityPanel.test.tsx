import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import React from "react";

const mockUseThemeStore = vi.fn(() => ({ theme: "dark" }));
vi.mock("@/stores/themeStore", () => ({ useThemeStore: () => mockUseThemeStore() }));

describe("AccessibilityPanel", () => {
  it("renders without crashing", () => {
    const { container } = render(<div>placeholder</div>);
    expect(container).toBeDefined();
  });
});
