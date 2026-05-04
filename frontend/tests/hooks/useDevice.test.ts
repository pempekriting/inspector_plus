import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useDevicePolling, fetchHierarchy, searchHierarchy, tapDevice, checkDeviceStatus, listDevices, selectDevice, getScreenshot, inputDeviceText } from "../useDevice";

const fetchSpy = vi.fn();
vi.stubGlobal("fetch", fetchSpy);

describe("useDevice hooks and functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchSpy.mockReset();
  });

  describe("fetchHierarchy", () => {
    it("fetches hierarchy with udid parameter", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ tree: { id: "root" } }),
      } as Response);

      const result = await fetchHierarchy("device-123");
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining("/hierarchy?udid=device-123")
      );
      expect(result).toEqual({ tree: { id: "root" } });
    });

    it("fetches hierarchy without udid", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ tree: { id: "root" } }),
      } as Response);

      await fetchHierarchy();
      expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining("/hierarchy"));
      expect(fetchSpy.mock.calls[0][0]).not.toContain("udid");
    });

    it("throws on non-ok response", async () => {
      fetchSpy.mockResolvedValueOnce({ ok: false, status: 500 } as Response);
      await expect(fetchHierarchy()).rejects.toThrow("Failed to fetch hierarchy");
    });
  });

  describe("searchHierarchy", () => {
    it("searches with query and filter", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ matches: [], count: 0 }),
      } as Response);

      await searchHierarchy("button", "text");
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining("/hierarchy/search?query=button&filter=text")
      );
    });

    it("includes udid when provided", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ matches: [], count: 0 }),
      } as Response);

      await searchHierarchy("btn", "resource-id", "device-123");
      const url = fetchSpy.mock.calls[0][0];
      expect(url).toContain("udid=device-123");
    });

    it("throws on non-ok response", async () => {
      fetchSpy.mockResolvedValueOnce({ ok: false } as Response);
      await expect(searchHierarchy("btn", "text")).rejects.toThrow("Failed to search hierarchy");
    });
  });

  describe("tapDevice", () => {
    it("posts tap coordinates", async () => {
      fetchSpy.mockResolvedValueOnce({ ok: true } as Response);
      await tapDevice(100, 200);
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining("/tap"),
        expect.objectContaining({ method: "POST" })
      );
    });

    it("includes udid when provided", async () => {
      fetchSpy.mockResolvedValueOnce({ ok: true } as Response);
      await tapDevice(100, 200, "device-123");
      const url = fetchSpy.mock.calls[0][0];
      expect(url).toContain("udid=device-123");
    });

    it("throws on non-ok response", async () => {
      fetchSpy.mockResolvedValueOnce({ ok: false } as Response);
      await expect(tapDevice(100, 200)).rejects.toThrow("Failed to tap device");
    });
  });

  describe("checkDeviceStatus", () => {
    it("returns connected false on non-ok response", async () => {
      fetchSpy.mockResolvedValueOnce({ ok: false, status: 500 } as Response);
      const result = await checkDeviceStatus();
      expect(result).toEqual({ connected: false, devices: [], selected: null });
    });

    it("returns parsed status on ok response", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ connected: true, devices: [], selected: null }),
      } as Response);
      const result = await checkDeviceStatus();
      expect(result).toEqual({ connected: true, devices: [], selected: null });
    });
  });

  describe("listDevices", () => {
    it("returns devices array", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ devices: [{ udid: "abc", state: "device", model: "Pixel" }] }),
      } as Response);
      const result = await listDevices();
      expect(result).toHaveLength(1);
    });

    it("throws on non-ok response", async () => {
      fetchSpy.mockResolvedValueOnce({ ok: false } as Response);
      await expect(listDevices()).rejects.toThrow("Failed to list devices");
    });
  });

  describe("selectDevice", () => {
    it("posts device udid and returns result", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ udid: "device-123", platform: "android" }),
      } as Response);
      const result = await selectDevice("device-123");
      expect(result).toEqual({ udid: "device-123", platform: "android" });
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining("/device/select"),
        expect.objectContaining({ method: "POST" })
      );
    });

    it("throws on non-ok response", async () => {
      fetchSpy.mockResolvedValueOnce({ ok: false } as Response);
      await expect(selectDevice("device-123")).rejects.toThrow("Failed to select device");
    });
  });

  describe("getScreenshot", () => {
    it("returns object URL from blob", async () => {
      const blob = new Blob(["data"], { type: "image/png" });
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(blob),
      } as unknown as Response);
      const url = await getScreenshot();
      expect(url).toMatch(/^blob:/);
    });

    it("throws on non-ok response", async () => {
      fetchSpy.mockResolvedValueOnce({ ok: false } as Response);
      await expect(getScreenshot()).rejects.toThrow("Failed to get screenshot");
    });
  });

  describe("inputDeviceText", () => {
    it("posts text to input endpoint", async () => {
      fetchSpy.mockResolvedValueOnce({ ok: true } as Response);
      await inputDeviceText("hello world");
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining("/input/text"),
        expect.objectContaining({ method: "POST" })
      );
    });

    it("throws on non-ok response", async () => {
      fetchSpy.mockResolvedValueOnce({ ok: false } as Response);
      await expect(inputDeviceText("hello")).rejects.toThrow("Failed to input text");
    });
  });

  describe("useDevicePolling", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("polls at the specified interval", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ connected: true, devices: [], selected: null }),
      } as Response);

      const { result } = renderHook(() => useDevicePolling(5000));
      expect(result.current.isLoading).toBe(true);

      // Wait for initial poll
      await act(async () => {
        vi.advanceTimersByTime(100);
      });

      // Let the polling happen
      await act(async () => {
        vi.advanceTimersByTime(5000);
      });

      expect(result.current.isLoading).toBe(false);
    });

    it("cleans up interval on unmount", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ connected: true, devices: [], selected: null }),
      } as Response);

      const { unmount } = renderHook(() => useDevicePolling(5000));
      unmount();

      // If no error about timers, cleanup worked
      await act(async () => {
        vi.advanceTimersByTime(10000);
      });
    });
  });
});
