import { describe, it, expect, vi, beforeEach } from 'vitest';

import { getImageLayout } from '../../src/utils/layoutGeometry';

function removeAllElements() {
  while (document.body.firstChild) {
    document.body.removeChild(document.body.firstChild);
  }
}

describe('layoutGeometry', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    removeAllElements();
  });

  describe('getImageLayout', () => {
    it('returns null when no canvas container exists', () => {
      expect(getImageLayout()).toBeNull();
    });

    it('returns null when no screenshot image exists', () => {
      const container = document.createElement('div');
      container.className = 'canvas-container';
      document.body.appendChild(container);
      expect(getImageLayout()).toBeNull();
    });

    it('returns null when image has zero naturalWidth', () => {
      const container = document.createElement('div');
      container.className = 'canvas-container';
      document.body.appendChild(container);

      const img = document.createElement('img');
      img.className = 'screenshot-img';
      // Use defineProperty to override readonly naturalWidth
      Object.defineProperty(img, 'naturalWidth', { value: 0, writable: true });
      Object.defineProperty(img, 'naturalHeight', { value: 0, writable: true });
      Object.defineProperty(img, 'clientWidth', { value: 0, writable: true });
      Object.defineProperty(img, 'clientHeight', { value: 0, writable: true });
      container.appendChild(img);

      expect(getImageLayout()).toBeNull();
    });

    it('returns correct scale and offsets for a centered image', () => {
      const container = document.createElement('div');
      container.className = 'canvas-container';
      document.body.appendChild(container);

      const img = document.createElement('img');
      img.className = 'screenshot-img';
      // Override readonly properties to simulate CSS-computed values
      Object.defineProperty(img, 'naturalWidth', { value: 1080, writable: true });
      Object.defineProperty(img, 'naturalHeight', { value: 1920, writable: true });
      Object.defineProperty(img, 'clientWidth', { value: 270, writable: true });
      Object.defineProperty(img, 'clientHeight', { value: 480, writable: true });
      Object.defineProperty(container, 'clientWidth', { value: 800, writable: true });
      Object.defineProperty(container, 'clientHeight', { value: 600, writable: true });
      container.appendChild(img);

      const layout = getImageLayout();

      expect(layout).not.toBeNull();
      expect(layout!.scale).toBe(0.25);
      expect(layout!.displayWidth).toBe(270);
      expect(layout!.displayHeight).toBe(480);
      expect(layout!.imgLeft).toBe(265); // (800 - 270) / 2
      expect(layout!.imgTop).toBe(60);   // (600 - 480) / 2
    });

    it('returns zero offset when image fills container', () => {
      const container = document.createElement('div');
      container.className = 'canvas-container';
      document.body.appendChild(container);

      const img = document.createElement('img');
      img.className = 'screenshot-img';
      Object.defineProperty(img, 'naturalWidth', { value: 800, writable: true });
      Object.defineProperty(img, 'naturalHeight', { value: 600, writable: true });
      Object.defineProperty(img, 'clientWidth', { value: 800, writable: true });
      Object.defineProperty(img, 'clientHeight', { value: 600, writable: true });
      Object.defineProperty(container, 'clientWidth', { value: 800, writable: true });
      Object.defineProperty(container, 'clientHeight', { value: 600, writable: true });
      container.appendChild(img);

      const layout = getImageLayout();

      expect(layout).not.toBeNull();
      expect(layout!.scale).toBe(1);
      expect(layout!.imgLeft).toBe(0);
      expect(layout!.imgTop).toBe(0);
    });

    it('handles portrait image in landscape container', () => {
      const container = document.createElement('div');
      container.className = 'canvas-container';
      document.body.appendChild(container);

      const img = document.createElement('img');
      img.className = 'screenshot-img';
      Object.defineProperty(img, 'naturalWidth', { value: 1080, writable: true });
      Object.defineProperty(img, 'naturalHeight', { value: 1920, writable: true });
      Object.defineProperty(img, 'clientWidth', { value: 300, writable: true });
      Object.defineProperty(img, 'clientHeight', { value: 533, writable: true });
      Object.defineProperty(container, 'clientWidth', { value: 800, writable: true });
      Object.defineProperty(container, 'clientHeight', { value: 600, writable: true });
      container.appendChild(img);

      const layout = getImageLayout();

      expect(layout).not.toBeNull();
      expect(layout!.scale).toBeCloseTo(0.2778, 3);
      expect(layout!.imgLeft).toBe(250); // (800 - 300) / 2
      expect(layout!.imgTop).toBe(33.5); // (600 - 533) / 2
    });
  });
});
