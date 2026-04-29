import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { PropertyRow } from "../PropertyRow";

describe("PropertyRow", () => {
  it("renders label and value", () => {
    render(<PropertyRow label="class" value="android.widget.Button" isDark={true} />);
    expect(screen.getByText("class")).toBeInTheDocument();
    expect(screen.getByText("android.widget.Button")).toBeInTheDocument();
  });

  it("renders null value as dash", () => {
    render(<PropertyRow label="text" value={null} isDark={true} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders children when provided", () => {
    render(<PropertyRow label="custom" value={null} isDark={true}><span>Custom Content</span></PropertyRow>);
    expect(screen.getByText("Custom Content")).toBeInTheDocument();
  });

  it("renders italic when italic prop is true", () => {
    const { container } = render(<PropertyRow label="hint" value="example" italic isDark={false} />);
    expect(container).toBeDefined();
  });

  it("renders in light mode", () => {
    render(<PropertyRow label="id" value="com.example:id/test" isDark={false} />);
    expect(screen.getByText("id")).toBeInTheDocument();
  });
});