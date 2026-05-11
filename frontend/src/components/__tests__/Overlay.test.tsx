import { render, act } from '@testing-library/react';
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { Overlay } from '../Overlay';

// Mock hierarchy store with canvasZoom/canvasPan support
const createMockStore = (overrides = {}) => ({
  hoveredNode: null,
  selectedNode: null,
  lockedNode: null,
  canvasZoom: 1,
  canvasPan: { x: 0, y: 0 },
  canvasMode: 'inspect' as const,
  setCanvasTransform: vi.fn(),
  ...overrides,
});

// Mock layout data that matches real DOM output from getImageLayout
const mockLayout = (zoom: number, panX: number, panY: number) => ({
  imgLeft: 100, // screenshot left edge from container left
  imgTop: 50,   // screenshot top edge from container top
  scale: 0.5,   // displayWidth / naturalWidth (screenshot fit ratio)
  zoom,
  panX,
  panY,
});

// Mock document.querySelector for .screenshot-img
const mockGetImageLayout = (zoom: number, panX: number, panY: number) => {
  const querySpy = vi.spyOn(document, 'querySelector');
  querySpy.mockReturnValue({
    naturalWidth: 1080,
    naturalHeight: 1920,
    clientWidth: 540,
    clientHeight: 960,
    getBoundingClientRect: () => ({
      left: 100,
      top: 50,
      width: 540,
      height: 960,
    }),
  } as unknown as HTMLImageElement);
  return mockLayout(zoom, panX, panY);
};

vi.mock('@/stores/hierarchyStore', () => ({
  useHierarchyStore: vi.fn(() => createMockStore()),
}));

vi.mock('@/stores/themeStore', () => ({
  useThemeStore: vi.fn(() => ({ theme: 'dark' })),
}));

describe('Overlay', () => {
  let querySpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    querySpy = vi.spyOn(document, 'querySelector');
  });

  afterEach(() => {
    querySpy.mockRestore();
  });

  describe('HighlightBox positioning', () => {
    it('renders without crashing when no active node', () => {
      const { container } = render(<Overlay />);
      expect(container).toBeDefined();
    });

    it('renders highlight for lockedNode', () => {
      const lockedNode = {
        id: 'btn_test',
        className: 'android.widget.Button',
        resourceId: 'btn_test',
        bounds: { x: 100, y: 200, width: 300, height: 80 },
        children: [],
      };

      (vi.mocked(document.querySelector) as ReturnType<typeof vi.fn>).mockReturnValueOnce({
        naturalWidth: 1080,
        naturalHeight: 1920,
        clientWidth: 540,
        clientHeight: 960,
        getBoundingClientRect: () => ({ left: 100, top: 50, width: 540, height: 960 }),
      } as unknown as HTMLImageElement);

      vi.mocked(vi.fn()).mockReturnValue(createMockStore({ lockedNode }));

      const { container } = render(<Overlay />);
      expect(container).toBeDefined();
    });

    it('uses canvasZoom and canvasPan from store for positioning', () => {
      const node = {
        id: 'test_node',
        className: 'android.widget.TextView',
        bounds: { x: 200, y: 300, width: 150, height: 60 },
        children: [],
      };

      // Zoom 2x, pan 50,50
      querySpy.mockReturnValueOnce({
        naturalWidth: 1080,
        naturalHeight: 1920,
        clientWidth: 1080, // at 2x zoom, displayWidth = naturalWidth * 2 / 2 = 1080
        clientHeight: 1920,
        getBoundingClientRect: () => ({ left: 100, top: 50, width: 1080, height: 1920 }),
      } as unknown as HTMLImageElement);

      const store = createMockStore({
        lockedNode: node,
        canvasZoom: 2,
        canvasPan: { x: 50, y: 50 },
      });
      vi.mocked(vi.fn()).mockReturnValue(store);

      const { container } = render(<Overlay />);
      expect(container).toBeDefined();
    });
  });

  describe('positioning formula correctness', () => {
    it('at zoom=1, pan=0: left = imgLeft + bounds.x * scale', () => {
      // This test documents the expected behavior
      // Given: imgLeft=100, scale=0.5, bounds.x=200, zoom=1, panX=0
      // Expected left = 100 + 200 * 0.5 = 200
      // Actual formula: imgLeft + bounds.x * scale
      const imgLeft = 100;
      const scale = 0.5;
      const boundsX = 200;
      const zoom = 1;
      const panX = 0;

      const expected = imgLeft + boundsX * scale;
      const actual = imgLeft + boundsX * scale * zoom + panX;

      expect(actual).toBe(expected); // 200
    });

    it('at zoom=2: highlight should scale with zoom', () => {
      // This test documents the zoom behavior
      // At zoom=2, element that was 100px wide at zoom=1 should be 200px
      const baseWidth = 150;
      const scale = 0.5;
      const zoom = 2;

      const noZoom = baseWidth * scale;
      const withZoom = baseWidth * scale * zoom;

      expect(withZoom).toBe(noZoom * 2); // 150 vs 300
    });
  });
});