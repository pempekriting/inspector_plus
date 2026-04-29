import { Bounds } from "../stores/hierarchyStore";

export interface CanvasSize {
  width: number;
  height: number;
}

export interface DeviceSize {
  width: number;
  height: number;
}

/**
 * Map canvas (display) coordinates to device coordinates.
 * This handles the case where canvas is scaled to fit viewport
 * but we need to tap actual device pixels.
 */
export function canvasToDevice(
  canvasX: number,
  canvasY: number,
  canvasSize: CanvasSize,
  deviceSize: DeviceSize
): { x: number; y: number } {
  const scaleX = deviceSize.width / canvasSize.width;
  const scaleY = deviceSize.height / canvasSize.height;

  return {
    x: Math.round(canvasX * scaleX),
    y: Math.round(canvasY * scaleY),
  };
}

/**
 * Convert device bounds to canvas-scaled bounds for overlay drawing.
 */
export function deviceToCanvas(
  bounds: Bounds,
  canvasSize: CanvasSize,
  deviceSize: DeviceSize
): Bounds {
  const scaleX = canvasSize.width / deviceSize.width;
  const scaleY = canvasSize.height / deviceSize.height;

  return {
    x: Math.round(bounds.x * scaleX),
    y: Math.round(bounds.y * scaleY),
    width: Math.round(bounds.width * scaleX),
    height: Math.round(bounds.height * scaleY),
  };
}
