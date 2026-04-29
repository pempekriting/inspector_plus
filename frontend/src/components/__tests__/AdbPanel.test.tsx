import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import { AdbPanel } from "../AdbPanel";

vi.mock("@/stores/themeStore", () => ({
  useThemeStore: vi.fn(() => ({ theme: "dark" })),
}));

vi.mock("@/services/api", () => ({
  useAdbCommand: vi.fn(() => ({
    mutateAsync: vi.fn().mockResolvedValue({ output: "test" }),
    isPending: false,
  })),
}));

describe("AdbPanel", () => {
  it("renders without crashing", () => {
    const { container } = render(<AdbPanel />);
    expect(container).toBeDefined();
  });
});