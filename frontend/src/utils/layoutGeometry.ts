// Shared helper for accessing the displayed screenshot's position within its container.
// Used by Overlay.tsx (inspect mode) and LayoutBoundsOverlay.tsx (layout mode)
// to position highlight boxes and bounding boxes at pixel-accurate positions.

export interface ImageLayout {
  imgLeft: number;    // screenshot left edge offset from container left (px)
  imgTop: number;     // screenshot top edge offset from container top (px)
  scale: number;      // displayWidth / naturalWidth (how screenshot is CSS-fitted)
  displayWidth: number;
  displayHeight: number;
}

/**
 * Finds the screenshot `<img class="screenshot-img">` inside `.canvas-container`
 * and returns its layout metrics relative to the container.
 * Returns null if no screenshot image is currently loaded.
 *
 * Key insight: the container div has `transform: scale(zoom)` applied, which creates
 * a transformed coordinate space. img.offsetLeft/Top are in THAT transformed space,
 * while img.clientWidth/clientHeight are the CSS pixel dimensions (also already
 * transformed by zoom). Natural dimensions are the actual image pixel size.
 *
 * Formula (all in CSS px):
 *   scale      = img.clientWidth  / img.naturalWidth   (display fraction)
 *   imgLeft   = (container_width - img.clientWidth) / 2  (horizontal centering)
 *   imgTop    = (container_height - img.clientHeight) / 2 (vertical centering)
 */
export function getImageLayout(): ImageLayout | null {
  const container = document.querySelector('.canvas-container') as HTMLDivElement | null;
  if (!container) return null;

  const img = container.querySelector('img.screenshot-img') as HTMLImageElement | null;
  if (!img || !img.naturalWidth) return null;

  // container.clientWidth/Height = CSS pixel dimensions of the scrollable container area
  const containerWidth = container.clientWidth;
  const containerHeight = container.clientHeight;

  // img.clientWidth/Height = displayed CSS pixel dimensions (affected by max-width: 100%)
  // img.naturalWidth/Height = actual pixel dimensions of the image file
  const displayWidth = img.clientWidth;
  const displayHeight = img.clientHeight;
  const scale = displayWidth / img.naturalWidth;

  // Centered: remaining space split evenly on both sides
  const imgLeft = (containerWidth - displayWidth) / 2;
  const imgTop = (containerHeight - displayHeight) / 2;

  return {
    imgLeft,
    imgTop,
    scale,
    displayWidth,
    displayHeight,
  };
}
