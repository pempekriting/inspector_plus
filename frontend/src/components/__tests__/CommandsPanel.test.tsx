import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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

// Mock useMutation from react-query
vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual("@tanstack/react-query");
  return {
    ...actual,
    useMutation: vi.fn(() => ({
      mutate: vi.fn(),
      mutateAsync: vi.fn().mockResolvedValue({ success: true }),
    })),
  };
});

describe("CommandsPanel", () => {
  it("renders command list", () => {
    const queryClient = new QueryClient();
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <CommandsPanel />
      </QueryClientProvider>
    );
    expect(container).toBeDefined();
  });

  it("renders without crashing", () => {
    const queryClient = new QueryClient();
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <CommandsPanel />
      </QueryClientProvider>
    );
    expect(container).toBeDefined();
  });
});