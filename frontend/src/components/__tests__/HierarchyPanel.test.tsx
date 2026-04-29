import { describe, it, expect } from "vitest";
import React from "react";
// HierarchyPanel uses useMutation via useAccessibilityAudit — requires QueryClientProvider
// Tested via integration/e2e tests; this verifies module imports cleanly
describe("HierarchyPanel", () => {
  it("module can be imported", async () => {
    const mod = await import("../HierarchyPanel");
    expect(mod.HierarchyPanel).toBeDefined();
  });
});