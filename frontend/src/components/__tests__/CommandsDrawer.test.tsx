import { describe, it, expect } from "vitest";
import React from "react";
// Components with QueryClient dependencies — import only to verify module is valid
// Full render tests require QueryClientProvider wrapper; covered at integration level
describe("CommandsDrawer", () => {
  it("module can be imported", async () => {
    const mod = await import("../CommandsDrawer");
    expect(mod.CommandsDrawer).toBeDefined();
  });
});

describe("HierarchyPanel", () => {
  it("module can be imported", async () => {
    const mod = await import("../HierarchyPanel");
    expect(mod.HierarchyPanel).toBeDefined();
  });
});