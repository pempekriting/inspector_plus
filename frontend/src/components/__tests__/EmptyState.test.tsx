import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { EmptyState } from "../EmptyState";

describe("EmptyState", () => {
  it("renders icon, title and description", () => {
    render(<EmptyState icon="device" title="No Device" description="Connect a device to get started" isDark={true} />);
    expect(screen.getByText("No Device")).toBeInTheDocument();
    expect(screen.getByText("Connect a device to get started")).toBeInTheDocument();
  });

  it("renders action button when provided", () => {
    const onClick = vi.fn();
    render(<EmptyState icon="device" title="No Device" description="Connect a device" action={{ label: "Retry", onClick }} isDark={true} />);
    expect(screen.getByText("Retry")).toBeInTheDocument();
  });

  it("renders in light mode", () => {
    render(<EmptyState icon="element" title="No Element" description="Select an element" isDark={false} />);
    expect(screen.getByText("No Element")).toBeInTheDocument();
  });
});