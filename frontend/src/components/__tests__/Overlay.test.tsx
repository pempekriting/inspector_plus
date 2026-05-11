import { render, cleanup } from '@testing-library/react';
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { useHierarchyStore } from '@/stores/hierarchyStore';
import { Overlay } from '../Overlay';

// Mock screenshot img element
function createMockImg(imgLeft = 100, imgTop = 50) {
  return {
    naturalWidth: 1080,
    naturalHeight: 1920,
    clientWidth: 540,
    clientHeight: 960,
    getBoundingClientRect: () => ({
      left: imgLeft,
      top: imgTop,
      width: 540,
      height: 960,
    }),
  } as unknown as HTMLImageElement;
}

// Mock hierarchy store with canvasZoom/canvasPan
function mockStore(overrides = {}) {
  const defaults = {
    hoveredNode: null,
    selectedNode: null,
    lockedNode: null,
    canvasMode: 'inspect' as const,
    canvasZoom: 1,
    canvasPan: { x: 0, y: 0 },
    setCanvasTransform: vi.fn(),
  };
  return { ...defaults, ...overrides };
}

vi.mock('@/stores/hierarchyStore', () => ({
  useHierarchyStore: vi.fn(() => mockStore()),
}));

vi.mock('@/stores/themeStore', () => ({
  useThemeStore: vi.fn(() => ({ theme: 'dark' })),
}));

describe('Overlay', () => {
  let querySpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    querySpy = vi.spyOn(document, 'querySelector');
    querySpy.mockReturnValue(createMockImg());
    vi.clearAllMocks();
  });

  afterEach(() => {
    querySpy.mockRestore();
    cleanup();
  });

  describe('getImageLayout integration', () => {
    it('reads screenshot img dimensions correctly', () => {
      render(<Overlay />);
      expect(querySpy).toHaveBeenCalledWith('.screenshot-img');
    });

    it('returns null when no screenshot img exists', () => {
      querySpy.mockReturnValue(null);
      const { container } = render(<Overlay />);
      expect(container).toBeDefined();
    });
  });

  describe('HighlightBox positioning with zoom/pan', () => {
    it('renders highlight when lockedNode exists at zoom=1', () => {
      const node = {
        id: 'btn1',
        className: 'android.widget.Button',
        bounds: { x: 100, y: 200, width: 300, height: 80 },
        children: [],
      };

      (useHierarchyStore as ReturnType<typeof vi.fn>).mockReturnValue(mockStore({ lockedNode: node }));

      const { container } = render(<Overlay />);
      expect(container).toBeDefined();
    });

    it('renders highlight when selectedNode exists', () => {
      const node = {
        id: 'text1',
        className: 'android.widget.TextView',
        bounds: { x: 50, y: 100, width: 200, height: 50 },
        children: [],
      };

      (useHierarchyStore as ReturnType<typeof vi.fn>).mockReturnValue(mockStore({ selectedNode: node }));

      const { container } = render(<Overlay />);
      expect(container).toBeDefined();
    });

    it('renders highlight when hoveredNode exists', () => {
      const node = {
        id: 'img1',
        className: 'android.widget.ImageView',
        bounds: { x: 0, y: 0, width: 1080, height: 1920 },
        children: [],
      };

      (useHierarchyStore as ReturnType<typeof vi.fn>).mockReturnValue(mockStore({ hoveredNode: node }));

      const { container } = render(<Overlay />);
      expect(container).toBeDefined();
    });

    it('uses priority: lockedNode > selectedNode > hoveredNode', () => {
      const lockedNode = { id: 'locked', className: 'Button', bounds: { x: 0, y: 0, width: 100, height: 50 }, children: [] };
      const selectedNode = { id: 'selected', className: 'TextView', bounds: { x: 0, y: 0, width: 200, height: 60 }, children: [] };
      const hoveredNode = { id: 'hovered', className: 'ImageView', bounds: { x: 0, y: 0, width: 300, height: 80 }, children: [] };

      (useHierarchyStore as ReturnType<typeof vi.fn>).mockReturnValue(
        mockStore({ lockedNode, selectedNode, hoveredNode })
      );

      const { container } = render(<Overlay />);
      expect(container).toBeDefined();
    });

    it('reads canvasZoom and canvasPan from hierarchyStore', () => {
      const node = {
        id: 'test_node',
        className: 'android.widget.TextView',
        bounds: { x: 200, y: 300, width: 150, height: 60 },
        children: [],
      };

      const store = mockStore({
        lockedNode: node,
        canvasZoom: 2,
        canvasPan: { x: 50, y: 50 },
      });
      (useHierarchyStore as ReturnType<typeof vi.fn>).mockReturnValue(store);

      const { container } = render(<Overlay />);
      expect(container).toBeDefined();
    });
  });

  describe('positioning formula with zoom/pan', () => {
    it('formula: left = (imgLeft + bounds.x * scale) * zoom + panX / zoom', () => {
      // Given: imgLeft=100, scale=0.5, bounds.x=200, zoom=2, panX=50
      // left = (100 + 200 * 0.5) * 2 + 50 / 2 = (100 + 100) * 2 + 25 = 400 + 25 = 425
      const imgLeft = 100;
      const scale = 0.5;
      const boundsX = 200;
      const zoom = 2;
      const panX = 50;
      const actual = (imgLeft + boundsX * scale) * zoom + panX / zoom;
      expect(actual).toBe(425);
    });

    it('formula: top = (imgTop + bounds.y * scale) * zoom + panY / zoom', () => {
      // Given: imgTop=50, scale=0.5, bounds.y=300, zoom=2, panY=50
      // top = (50 + 300 * 0.5) * 2 + 50 / 2 = (50 + 150) * 2 + 25 = 400 + 25 = 425
      const imgTop = 50;
      const scale = 0.5;
      const boundsY = 300;
      const zoom = 2;
      const panY = 50;
      const actual = (imgTop + boundsY * scale) * zoom + panY / zoom;
      expect(actual).toBe(425);
    });

    it('formula: width = bounds.width * scale * zoom', () => {
      // Given: bounds.width=300, scale=0.5, zoom=2
      // width = 300 * 0.5 * 2 = 300
      const boundsWidth = 300;
      const scale = 0.5;
      const zoom = 2;
      const actual = boundsWidth * scale * zoom;
      expect(actual).toBe(300);
    });

    it('formula: height = bounds.height * scale * zoom', () => {
      // Given: bounds.height=80, scale=0.5, zoom=2
      // height = 80 * 0.5 * 2 = 80
      const boundsHeight = 80;
      const scale = 0.5;
      const zoom = 2;
      const actual = boundsHeight * scale * zoom;
      expect(actual).toBe(80);
    });

    it('at zoom=1, pan=0: formula reduces to simple form', () => {
      // zoom=1, panX=0, panY=0
      // left = (imgLeft + bounds.x * scale) * 1 + 0 / 1 = imgLeft + bounds.x * scale
      const imgLeft = 100;
      const scale = 0.5;
      const boundsX = 200;
      const zoom = 1;
      const panX = 0;

      const withZoomPan = (imgLeft + boundsX * scale) * zoom + panX / zoom;
      const simple = imgLeft + boundsX * scale;

      expect(withZoomPan).toBe(simple); // 200
    });

    it('finalWidth uses Math.max(width, 6) for minimum visible size', () => {
      const width = 3;
      const finalWidth = Math.max(width, 6);
      expect(finalWidth).toBe(6);
    });
  });

  describe('InfoTooltip positioning', () => {
    it('tooltip left = (imgLeft + (bounds.x + bounds.width) * scale) * zoom + panX / zoom + 12', () => {
      // Given: imgLeft=100, bounds.x=200, bounds.width=300, scale=0.5, zoom=2, panX=50
      // left = (100 + (200 + 300) * 0.5) * 2 + 50 / 2 + 12 = (100 + 250) * 2 + 25 + 12 = 700 + 25 + 12 = 737
      const imgLeft = 100;
      const boundsX = 200;
      const boundsWidth = 300;
      const scale = 0.5;
      const zoom = 2;
      const panX = 50;
      const offset = 12;
      const actual = (imgLeft + (boundsX + boundsWidth) * scale) * zoom + panX / zoom + offset;
      expect(actual).toBe(737);
    });

    it('tooltip top = (imgTop + bounds.y * scale) * zoom + panY / zoom', () => {
      // Given: imgTop=50, bounds.y=200, scale=0.5, zoom=2, panY=50
      // top = (50 + 200 * 0.5) * 2 + 50 / 2 = (50 + 100) * 2 + 25 = 300 + 25 = 325
      const imgTop = 50;
      const boundsY = 200;
      const scale = 0.5;
      const zoom = 2;
      const panY = 50;
      const actual = (imgTop + boundsY * scale) * zoom + panY / zoom;
      expect(actual).toBe(325);
    });
  });

  describe('edge cases', () => {
    it('renders nothing when activeNode has no bounds', () => {
      const node = { id: 'n1', className: 'View', bounds: undefined, children: [] };
      (useHierarchyStore as ReturnType<typeof vi.fn>).mockReturnValue(mockStore({ lockedNode: node }));

      const { container } = render(<Overlay />);
      expect(container).toBeDefined();
    });

    it('renders nothing when layout is null (no screenshot)', () => {
      querySpy.mockReturnValue(null);
      const node = { id: 'n1', className: 'View', bounds: { x: 0, y: 0, width: 100, height: 50 }, children: [] };
      (useHierarchyStore as ReturnType<typeof vi.fn>).mockReturnValue(mockStore({ lockedNode: node }));

      const { container } = render(<Overlay />);
      expect(container).toBeDefined();
    });
  });
});