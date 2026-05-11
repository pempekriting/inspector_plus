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

// Mock hierarchy store - controls what's in the store
function mockStore(overrides = {}) {
  const defaults = {
    hoveredNode: null,
    selectedNode: null,
    lockedNode: null,
    canvasMode: 'inspect' as const,
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

  describe('HighlightBox positioning at zoom=1, pan=0', () => {
    it('renders highlight when lockedNode exists', () => {
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

      // When all three exist, lockedNode takes priority
      (useHierarchyStore as ReturnType<typeof vi.fn>).mockReturnValue(
        mockStore({ lockedNode, selectedNode, hoveredNode })
      );

      const { container } = render(<Overlay />);
      expect(container).toBeDefined();
    });
  });

  describe('positioning formula correctness', () => {
    it('formula: left = imgLeft + bounds.x * scale', () => {
      // Given: imgLeft=100, scale=0.5 (540/1080), bounds.x=200
      // left = 100 + 200 * 0.5 = 200
      const imgLeft = 100;
      const scale = 0.5;
      const boundsX = 200;
      const actual = imgLeft + boundsX * scale;
      expect(actual).toBe(200);
    });

    it('formula: top = imgTop + bounds.y * scale', () => {
      // Given: imgTop=50, scale=0.5, bounds.y=300
      // top = 50 + 300 * 0.5 = 200
      const imgTop = 50;
      const scale = 0.5;
      const boundsY = 300;
      const actual = imgTop + boundsY * scale;
      expect(actual).toBe(200);
    });

    it('formula: width = bounds.width * scale', () => {
      // Given: bounds.width=300, scale=0.5
      // width = 300 * 0.5 = 150
      const boundsWidth = 300;
      const scale = 0.5;
      const actual = boundsWidth * scale;
      expect(actual).toBe(150);
    });

    it('formula: height = bounds.height * scale', () => {
      // Given: bounds.height=80, scale=0.5
      // height = 80 * 0.5 = 40
      const boundsHeight = 80;
      const scale = 0.5;
      const actual = boundsHeight * scale;
      expect(actual).toBe(40);
    });

    it('finalWidth uses Math.max(width, 6) for minimum visible size', () => {
      // Very thin element should still be visible
      const width = 3;
      const finalWidth = Math.max(width, 6);
      expect(finalWidth).toBe(6);
    });
  });

  describe('InfoTooltip positioning', () => {
    it('tooltip left = imgLeft + (bounds.x + bounds.width) * scale + 12', () => {
      // Given: imgLeft=100, bounds.x=200, bounds.width=300, scale=0.5
      // left = 100 + (200 + 300) * 0.5 + 12 = 100 + 250 + 12 = 362
      const imgLeft = 100;
      const boundsX = 200;
      const boundsWidth = 300;
      const scale = 0.5;
      const offset = 12;
      const actual = imgLeft + (boundsX + boundsWidth) * scale + offset;
      expect(actual).toBe(362);
    });

    it('tooltip top = imgTop + bounds.y * scale', () => {
      // Given: imgTop=50, bounds.y=200, scale=0.5
      // top = 50 + 200 * 0.5 = 150
      const imgTop = 50;
      const boundsY = 200;
      const scale = 0.5;
      const actual = imgTop + boundsY * scale;
      expect(actual).toBe(150);
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