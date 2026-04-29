import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ErrorBoundary } from "react-error-boundary";
import React from "react";

vi.mock("@/stores/themeStore", () => ({
  useThemeStore: () => ({ theme: "dark" }),
}));

function ThrowError({ message }: { message: string }) {
  throw new Error(message);
}

describe("ErrorBoundary", () => {
  it("renders error message when child throws", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary FallbackComponent={({ error }) => <div data-testid="error-msg">{error.message}</div>}>
        <ThrowError message="Test error" />
      </ErrorBoundary>
    );

    expect(screen.getByTestId("error-msg")).toHaveTextContent("Test error");
    consoleSpy.mockRestore();
  });
});

describe("AppErrorBoundary", () => {
  it("renders children when no error", () => {
    const { container } = render(
      <ErrorBoundary FallbackComponent={({ error }) => <div>{error.message}</div>}>
        <div data-testid="child">Child content</div>
      </ErrorBoundary>
    );

    expect(screen.getByTestId("child")).toHaveTextContent("Child content");
  });
});