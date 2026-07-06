import { render, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { ScreenshotCanvas } from '../ScreenshotCanvas';

// Spy on fetch to verify ScreenshotCanvas no longer calls /screenshot directly
let fetchSpy: ReturnType<typeof vi.fn>;

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

function Wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

// Stable mock refs to avoid useEffect infinite loops (Zustand returns stable refs)
const mockSetCanvasMode = vi.fn();
const mockSetSelectedNode = vi.fn();
const mockLockSelection = vi.fn();
const mockSetLoadingScreenshot = vi.fn();
const mockSetCanvasTransform = vi.fn();
const mockSetSelectedDevice = vi.fn();
const mockSetDeviceResolution = vi.fn();

vi.mock('@/stores/hierarchyStore', () => ({
  useHierarchyStore: vi.fn(() => ({
    canvasMode: 'inspect',
    setCanvasMode: mockSetCanvasMode,
    setSelectedNode: mockSetSelectedNode,
    hoveredNode: null,
    selectedNode: null,
    lockSelection: mockLockSelection,
    uiTree: null,
    isLoadingScreenshot: false,
    isLoadingHierarchy: false,
    setLoadingScreenshot: mockSetLoadingScreenshot,
    setCanvasTransform: mockSetCanvasTransform,
    combinedScreenshotUrl: null,
  })),
}));

vi.mock('@/stores/deviceStore', () => ({
  useDeviceStore: vi.fn(() => ({
    selectedDevice: 'emulator-5554',
    devices: [],
    setSelectedDevice: mockSetSelectedDevice,
    setDeviceResolution: mockSetDeviceResolution,
  })),
}));

vi.mock('@/stores/themeStore', () => ({
  useThemeStore: vi.fn(() => ({ theme: 'dark' })),
}));

beforeEach(() => {
  fetchSpy = vi.fn();
  vi.stubGlobal('fetch', fetchSpy);
});

describe('ScreenshotCanvas', () => {
  it('does NOT call /screenshot directly — screenshot comes from combinedScreenshotUrl in store', async () => {
    render(<ScreenshotCanvas />, { wrapper: Wrapper });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    // ScreenshotCanvas should NOT call /screenshot directly
    const screenshotCalls = fetchSpy.mock.calls.filter(([url]) =>
      String(url).includes('/screenshot')
    );
    expect(screenshotCalls.length).toBe(0);
  });

  it('renders without crashing when combinedScreenshotUrl is null', async () => {
    // Should not throw
    expect(() => {
      render(<ScreenshotCanvas />, { wrapper: Wrapper });
    }).not.toThrow();
  });
});
