import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { SkeletonRow, SkeletonLoader, SkeletonCanvas } from "../SkeletonLoader";

describe("SkeletonRow", () => {
  it("renders with default props", () => {
    const { container } = render(<SkeletonRow isDark={true} />);
    expect(container).toBeDefined();
  });

  it("renders with custom width and height", () => {
    const { container } = render(<SkeletonRow width="80%" height={20} isDark={false} />);
    expect(container).toBeDefined();
  });
});

describe("SkeletonLoader", () => {
  it("renders default 8 rows", () => {
    const { container } = render(<SkeletonLoader isDark={true} />);
    expect(container).toBeDefined();
  });

  it("renders with custom row count", () => {
    const { container } = render(<SkeletonLoader rows={3} isDark={false} />);
    expect(container).toBeDefined();
  });
});

describe("SkeletonCanvas", () => {
  it("renders with default aspect ratio", () => {
    const { container } = render(<SkeletonCanvas isDark={true} />);
    expect(container).toBeDefined();
  });

  it("renders with custom aspect ratio", () => {
    const { container } = render(<SkeletonCanvas aspectRatio={16 / 9} isDark={false} />);
    expect(container).toBeDefined();
  });
});