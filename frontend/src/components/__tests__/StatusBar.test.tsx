import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { StatusBar } from "../StatusBar";

const mockUseThemeStore = vi.fn(() => ({ theme: "dark" }));
vi.mock("@/stores/themeStore", () => ({
  useThemeStore: () => mockUseThemeStore(),
}));

describe("StatusBar", () => {
  it("renders version label", () => {
    render(<StatusBar />);
    expect(screen.getByText("v1.1.0")).toBeInTheDocument();
  });

  it("renders without crashing", () => {
    const { container } = render(<StatusBar />);
    expect(container).toBeDefined();
  });
});