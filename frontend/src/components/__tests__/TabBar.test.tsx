import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { TabBar } from "../TabBar";

vi.mock("@/stores/themeStore", () => ({
  useThemeStore: vi.fn(() => ({ theme: "dark" })),
}));

describe("TabBar", () => {
  it("renders tab labels", () => {
    render(<TabBar activeTab="inspector" onTabChange={vi.fn()} />);
    expect(screen.getAllByText(/Inspector|Commands/).length).toBeGreaterThanOrEqual(2);
  });

  it("renders without crashing", () => {
    const { container } = render(<TabBar activeTab="commands" onTabChange={vi.fn()} />);
    expect(container).toBeDefined();
  });
});