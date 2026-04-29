import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { ErrorState } from "../ErrorState";

describe("ErrorState", () => {
  it("renders title and description", () => {
    render(<ErrorState title="Connection Failed" description="Unable to reach device" isDark={true} />);
    expect(screen.getByText("Connection Failed")).toBeInTheDocument();
    expect(screen.getByText("Unable to reach device")).toBeInTheDocument();
  });

  it("renders retry button when onRetry provided", () => {
    const onRetry = vi.fn();
    render(<ErrorState title="Error" description="Something went wrong" onRetry={onRetry} isDark={true} />);
    expect(screen.getByText("Retry")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Retry"));
    expect(onRetry).toHaveBeenCalled();
  });

  it("renders copy details button when onCopyDetails provided", () => {
    render(<ErrorState title="Error" description="Something went wrong" onCopyDetails={vi.fn()} isDark={false} />);
    expect(screen.getByText("Copy Details")).toBeInTheDocument();
  });

  it("renders without crashing in light mode", () => {
    const { container } = render(<ErrorState title="Load Failed" description="Could not load" isDark={false} />);
    expect(container).toBeDefined();
  });
});