import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import React from "react";
import { ScreenshotCanvas } from "../ScreenshotCanvas";

// Spy on fetch to verify ScreenshotCanvas no longer calls /screenshot directly
let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
});

describe("ScreenshotCanvas", () => {
  it("does NOT call /screenshot directly — screenshot comes from combinedScreenshotUrl in store", async () => {
    vi.mock("@/stores/hierarchyStore", () => ({
      useHierarchyStore: vi.fn(() => ({
        canvasMode: "inspect",
        setCanvasMode: vi.fn(),
        setSelectedNode: vi.fn(),
        hoveredNode: null,
        selectedNode: null,
        lockSelection: vi.fn(),
        uiTree: null,
        isLoadingScreenshot: false,
        isLoadingHierarchy: false,
        setLoadingScreenshot: vi.fn(),
        combinedScreenshotUrl: null,  // null = no screenshot yet, no fetch should happen
      })),
    }));

    vi.mock("@/stores/deviceStore", () => ({
      useDeviceStore: vi.fn(() => ({
        selectedDevice: "emulator-5554",
        devices: [],
        setSelectedDevice: vi.fn(),
        setDeviceResolution: vi.fn(),
      })),
    }));

    vi.mock("@/stores/themeStore", () => ({
      useThemeStore: vi.fn(() => ({ theme: "dark" })),
    }));

    render(<ScreenshotCanvas />);
    await act(async () => { await new Promise(r => setTimeout(r, 50)); });

    // ScreenshotCanvas should NOT call /screenshot directly
    const screenshotCalls = fetchSpy.mock.calls.filter(([url]) => String(url).includes("/screenshot"));
    expect(screenshotCalls.length).toBe(0);
  });

  it("renders without crashing when combinedScreenshotUrl is null", async () => {
    vi.mock("@/stores/hierarchyStore", () => ({
      useHierarchyStore: vi.fn(() => ({
        canvasMode: "inspect",
        setCanvasMode: vi.fn(),
        setSelectedNode: vi.fn(),
        hoveredNode: null,
        selectedNode: null,
        lockSelection: vi.fn(),
        uiTree: null,
        isLoadingScreenshot: false,
        isLoadingHierarchy: false,
        setLoadingScreenshot: vi.fn(),
        combinedScreenshotUrl: null,
      })),
    }));

    vi.mock("@/stores/deviceStore", () => ({
      useDeviceStore: vi.fn(() => ({
        selectedDevice: "emulator-5554",
        devices: [],
        setSelectedDevice: vi.fn(),
        setDeviceResolution: vi.fn(),
      })),
    }));

    vi.mock("@/stores/themeStore", () => ({
      useThemeStore: vi.fn(() => ({ theme: "dark" })),
    }));

    // Should not throw
    expect(() => {
      render(<ScreenshotCanvas />);
    }).not.toThrow();
  });
});