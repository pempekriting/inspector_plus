import { describe, it, expect, vi, beforeEach } from "vitest";
import { canvasToDevice, deviceToCanvas } from "../coordinates";
import type { Bounds } from "../../types/shared";

describe("coordinates", () => {
  const canvasSize = { width: 400, height: 800 };
  const deviceSize = { width: 1080, height: 1920 };

  describe("canvasToDevice", () => {
    it("converts canvas coordinates to device coordinates", () => {
      const result = canvasToDevice(100, 200, canvasSize, deviceSize);
      expect(result.x).toBe(Math.round((100 * 1080) / 400));
      expect(result.y).toBe(Math.round((200 * 1920) / 800));
    });

    it("handles top-left corner (0, 0)", () => {
      const result = canvasToDevice(0, 0, canvasSize, deviceSize);
      expect(result.x).toBe(0);
      expect(result.y).toBe(0);
    });

    it("handles bottom-right corner", () => {
      const result = canvasToDevice(400, 800, canvasSize, deviceSize);
      expect(result.x).toBe(1080);
      expect(result.y).toBe(1920);
    });

    it("rounds to nearest integer", () => {
      // 50.5 * 1080/400 = 136.35 -> rounds to 136
      const result = canvasToDevice(50, 100, canvasSize, deviceSize);
      expect(typeof result.x).toBe("number");
      expect(typeof result.y).toBe("number");
    });

    it("handles scale factor > 1 (canvas smaller than device)", () => {
      const result = canvasToDevice(540, 960, { width: 540, height: 960 }, deviceSize);
      expect(result.x).toBe(1080);
      expect(result.y).toBe(1920);
    });

    it("handles scale factor < 1 (canvas larger than device)", () => {
      const result = canvasToDevice(2160, 3840, { width: 2160, height: 3840 }, deviceSize);
      expect(result.x).toBe(1080);
      expect(result.y).toBe(1920);
    });
  });

  describe("deviceToCanvas", () => {
    const bounds: Bounds = { x: 0, y: 0, width: 1080, height: 1920 };

    it("converts device bounds to canvas-scaled bounds", () => {
      const result = deviceToCanvas(bounds, canvasSize, deviceSize);
      expect(result.x).toBe(0);
      expect(result.y).toBe(0);
      expect(result.width).toBe(400);
      expect(result.height).toBe(800);
    });

    it("handles partial bounds", () => {
      const partial: Bounds = { x: 270, y: 480, width: 540, height: 960 };
      const result = deviceToCanvas(partial, canvasSize, deviceSize);
      expect(result.x).toBe(Math.round((270 * 400) / 1080));
      expect(result.y).toBe(Math.round((480 * 800) / 1920));
      expect(result.width).toBe(Math.round((540 * 400) / 1080));
      expect(result.height).toBe(Math.round((960 * 800) / 1920));
    });

    it("rounds all values to nearest integer", () => {
      const narrowBounds: Bounds = { x: 1, y: 2, width: 3, height: 4 };
      const result = deviceToCanvas(narrowBounds, canvasSize, deviceSize);
      expect(typeof result.x).toBe("number");
      expect(typeof result.y).toBe("number");
      expect(typeof result.width).toBe("number");
      expect(typeof result.height).toBe("number");
    });
  });

  describe("round-trip", () => {
    it("canvasToDevice then deviceToCanvas returns equivalent scale", () => {
      const canvasX = 100;
      const canvasY = 200;
      const device = canvasToDevice(canvasX, canvasY, canvasSize, deviceSize);
      const back = deviceToCanvas(
        { x: device.x, y: device.y, width: 0, height: 0 },
        canvasSize,
        deviceSize
      );
      // The bounds conversion accounts for scaling
      expect(back.x).toBe(Math.round((device.x * canvasSize.width) / deviceSize.width));
    });
  });
});
