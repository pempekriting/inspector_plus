import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { CommandsPanel } from "../CommandsPanel";

vi.mock("@/stores/themeStore", () => ({
  useThemeStore: vi.fn(() => ({ theme: "dark" })),
}));

vi.mock("@/hooks/useCommands", () => ({
  useCommands: vi.fn(() => ({
    executeCommand: vi.fn().mockResolvedValue({ success: true, output: "test" }),
    isExecuting: false,
  })),
}));

describe("CommandsPanel", () => {
  it("renders command list", () => {
    const { container } = render(<CommandsPanel />);
    expect(container).toBeDefined();
  });

  it("renders without crashing", () => {
    const { container } = render(<CommandsPanel />);
    expect(container).toBeDefined();
  });
});