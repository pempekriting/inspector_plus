import { describe, it, expect, vi, beforeEach } from "vitest";
import { useDeviceStore } from "../deviceStore";

const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

Object.defineProperty(window, "localStorage", {
  value: localStorageMock,
});

describe("deviceStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue(null);
    useDeviceStore.setState({
      connected: false,
      deviceWidth: 1080,
      deviceHeight: 1920,
      devices: [],
      selectedDevice: null,
    });
  });

  describe("initial state", () => {
    it("defaults connected to false", () => {
      expect(useDeviceStore.getState().connected).toBe(false);
    });

    it("defaults device resolution to 1080x1920", () => {
      expect(useDeviceStore.getState().deviceWidth).toBe(1080);
      expect(useDeviceStore.getState().deviceHeight).toBe(1920);
    });

    it("defaults devices to empty array", () => {
      expect(useDeviceStore.getState().devices).toEqual([]);
    });

    it("defaults selectedDevice to null", () => {
      expect(useDeviceStore.getState().selectedDevice).toBeNull();
    });

    it("loads stored device from localStorage", () => {
      localStorageMock.getItem.mockReturnValue("emulator-5554");
      useDeviceStore.setState({ selectedDevice: "emulator-5554" });
      expect(useDeviceStore.getState().selectedDevice).toBe("emulator-5554");
    });
  });

  describe("setConnected", () => {
    it("sets connected to true", () => {
      useDeviceStore.getState().setConnected(true);
      expect(useDeviceStore.getState().connected).toBe(true);
    });

    it("sets connected to false", () => {
      useDeviceStore.setState({ connected: true });
      useDeviceStore.getState().setConnected(false);
      expect(useDeviceStore.getState().connected).toBe(false);
    });
  });

  describe("setDeviceResolution", () => {
    it("sets width and height", () => {
      useDeviceStore.getState().setDeviceResolution(720, 1280);
      expect(useDeviceStore.getState().deviceWidth).toBe(720);
      expect(useDeviceStore.getState().deviceHeight).toBe(1280);
    });
  });

  describe("setDevices", () => {
    it("sets devices array", () => {
      const devices = [
        { udid: "abc", state: "device", model: "Pixel 5" },
        { udid: "def", state: "device", model: "Pixel 6" },
      ];
      useDeviceStore.getState().setDevices(devices as any);
      expect(useDeviceStore.getState().devices).toEqual(devices);
    });
  });

  describe("setSelectedDevice", () => {
    it("sets selectedDevice and persists to localStorage", () => {
      useDeviceStore.getState().setSelectedDevice("emulator-5554");
      expect(useDeviceStore.getState().selectedDevice).toBe("emulator-5554");
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        "inspector-plus-selected-device",
        "emulator-5554"
      );
    });

    it("clears localStorage when setting null", () => {
      useDeviceStore.setState({ selectedDevice: "emulator-5554" });
      useDeviceStore.getState().setSelectedDevice(null);
      expect(useDeviceStore.getState().selectedDevice).toBeNull();
      expect(localStorageMock.removeItem).toHaveBeenCalledWith("inspector-plus-selected-device");
    });

    it("handles localStorage error gracefully when setting device", () => {
      localStorageMock.setItem.mockImplementation(() => {
        throw new Error("Quota exceeded");
      });
      // Should not throw
      expect(() => useDeviceStore.getState().setSelectedDevice("emulator-5554")).not.toThrow();
      expect(useDeviceStore.getState().selectedDevice).toBe("emulator-5554");
    });

    it("handles localStorage error gracefully when clearing", () => {
      localStorageMock.removeItem.mockImplementation(() => {
        throw new Error("Quota exceeded");
      });
      // Should not throw
      expect(() => useDeviceStore.getState().setSelectedDevice(null)).not.toThrow();
      expect(useDeviceStore.getState().selectedDevice).toBeNull();
    });
  });
});
