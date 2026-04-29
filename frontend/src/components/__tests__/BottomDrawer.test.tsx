import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import { BottomDrawer } from "../BottomDrawer";

describe("BottomDrawer", () => {
  it("renders children", () => {
    const { container } = render(
      <BottomDrawer isDark={true}>
        <div>Drawer content</div>
      </BottomDrawer>
    );
    expect(container).toBeDefined();
    expect(container.textContent).toBe("Drawer content");
  });

  it("renders with custom height", () => {
    const { container } = render(
      <BottomDrawer isDark={false} defaultHeight={300} minHeight={100} maxHeight={500}>
        <span>Content</span>
      </BottomDrawer>
    );
    expect(container).toBeDefined();
  });
});