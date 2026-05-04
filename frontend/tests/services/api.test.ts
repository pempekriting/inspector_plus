import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  BoundsSchema,
  UiNodeSchema,
  DeviceInfoSchema,
  DeviceStatusSchema,
  HierarchyResponseSchema,
} from "../../src/services/api";

describe("api Zod schemas", () => {
  describe("BoundsSchema", () => {
    it("parses valid bounds", () => {
      const result = BoundsSchema.parse({ x: 0, y: 0, width: 100, height: 200 });
      expect(result).toEqual({ x: 0, y: 0, width: 100, height: 200 });
    });

    it("rejects missing fields", () => {
      expect(() => BoundsSchema.parse({ x: 0, y: 0 })).toThrow();
    });

    it("rejects wrong types", () => {
      expect(() => BoundsSchema.parse({ x: "0", y: 0, width: 100, height: 200 })).toThrow();
    });
  });

  describe("UiNodeSchema", () => {
    it("parses minimal UiNode", () => {
      const result = UiNodeSchema.parse({
        id: "node1",
        bounds: { x: 0, y: 0, width: 100, height: 200 },
      });
      expect(result.id).toBe("node1");
    });

    it("parses full UiNode with optional fields", () => {
      const result = UiNodeSchema.parse({
        id: "node1",
        className: "android.widget.Button",
        package: "com.example.app",
        text: "Click me",
        resourceId: "com.example:id/btn",
        contentDesc: "submit",
        bounds: { x: 0, y: 0, width: 100, height: 50 },
        children: [],
      });
      expect(result.className).toBe("android.widget.Button");
    });

    it("parses nested children", () => {
      const result = UiNodeSchema.parse({
        id: "root",
        bounds: { x: 0, y: 0, width: 1080, height: 1920 },
        children: [
          {
            id: "child1",
            bounds: { x: 0, y: 0, width: 100, height: 50 },
            children: [],
          },
        ],
      });
      expect(result.children).toHaveLength(1);
      expect(result.children![0].id).toBe("child1");
    });

    it("rejects missing id", () => {
      expect(() =>
        UiNodeSchema.parse({ bounds: { x: 0, y: 0, width: 100, height: 200 } })
      ).toThrow();
    });
  });

  describe("DeviceInfoSchema", () => {
    it("parses minimal DeviceInfo", () => {
      const result = DeviceInfoSchema.parse({
        udid: "abc123",
        state: "device",
        model: "Pixel 5",
      });
      expect(result.udid).toBe("abc123");
    });

    it("parses full DeviceInfo with all fields", () => {
      const result = DeviceInfoSchema.parse({
        udid: "abc123",
        serial: "ABC123",
        state: "device",
        model: "Pixel 5",
        name: "Pixel 5",
        manufacturer: "Google",
        brand: "Google",
        android_version: "13",
        sdk: "33",
        platform: "android",
        os_version: "13",
        architecture: "arm64",
        device_type: "phone",
      });
      expect(result.platform).toBe("android");
    });

    it("rejects invalid platform", () => {
      expect(() =>
        DeviceInfoSchema.parse({
          udid: "abc",
          state: "device",
          model: "Pixel",
          platform: "windows",
        })
      ).toThrow();
    });
  });

  describe("DeviceStatusSchema", () => {
    it("parses connected status with devices", () => {
      const result = DeviceStatusSchema.parse({
        connected: true,
        devices: [{ udid: "abc", state: "device", model: "Pixel" }],
      });
      expect(result.connected).toBe(true);
      expect(result.devices).toHaveLength(1);
    });

    it("parses disconnected status", () => {
      const result = DeviceStatusSchema.parse({
        connected: false,
        devices: [],
      });
      expect(result.connected).toBe(false);
      expect(result.devices).toHaveLength(0);
    });
  });

  describe("HierarchyResponseSchema", () => {
    it("parses valid hierarchy response", () => {
      const result = HierarchyResponseSchema.parse({
        tree: {
          id: "root",
          bounds: { x: 0, y: 0, width: 1080, height: 1920 },
        },
      });
      expect(result.tree.id).toBe("root");
    });

    it("rejects missing tree", () => {
      expect(() => HierarchyResponseSchema.parse({})).toThrow();
    });
  });
});
