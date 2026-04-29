import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import { StylePanel } from "../StylePanel";

vi.mock("@/stores/themeStore", () => ({
  useThemeStore: vi.fn(() => ({ theme: "dark" })),
}));

describe("StylePanel", () => {
  it("renders without crashing when styles is undefined", () => {
    const { container } = render(<StylePanel styles={undefined} />);
    expect(container).toBeDefined();
  });

  it("renders without crashing when styles is provided", () => {
    const styles = {
      backgroundColor: "#ffffff",
      padding: "8px",
      margin: "4px",
    };
    const { container } = render(<StylePanel styles={styles} />);
    expect(container).toBeDefined();
  });
});