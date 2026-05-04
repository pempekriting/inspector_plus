import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCommands } from "../useCommands";
import * as api from "../../services/api";

const mockMutation = {
  mutateAsync: vi.fn(),
  isPending: false,
};

vi.mock("../../services/api", () => ({
  useExecuteCommand: vi.fn(() => mockMutation),
}));

vi.mock("../../stores/deviceStore", () => ({
  useDeviceStore: vi.fn(() => ({
    selectedDevice: "emulator-5554",
  })),
}));

describe("useCommands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMutation.mutateAsync.mockReset();
    mockMutation.isPending = false;
  });

  describe("executeCommand", () => {
    it("returns result on success", async () => {
      mockMutation.mutateAsync.mockResolvedValueOnce({ success: true, output: "done" });
      const { result } = renderHook(() => useCommands());
      let commandResult: any;
      await act(async () => {
        commandResult = await result.current.executeCommand("tap", { x: 100, y: 200 });
      });
      expect(commandResult).toEqual({ success: true, output: "done" });
      expect(mockMutation.mutateAsync).toHaveBeenCalledWith({
        type: "tap",
        params: { x: 100, y: 200 },
        udid: "emulator-5554",
      });
    });

    it("returns error on failure", async () => {
      mockMutation.mutateAsync.mockRejectedValueOnce(new Error("Command failed"));
      const { result } = renderHook(() => useCommands());
      let commandResult: any;
      await act(async () => {
        commandResult = await result.current.executeCommand("tap", {});
      });
      expect(commandResult).toEqual({
        success: false,
        output: "",
        error: "Command failed",
      });
    });

    it("passes udid from selected device store", async () => {
      mockMutation.mutateAsync.mockResolvedValueOnce({ success: true, output: "" });
      const { result } = renderHook(() => useCommands());
      await act(async () => {
        await result.current.executeCommand("tap", { x: 0, y: 0 });
      });
      expect(mockMutation.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ udid: "emulator-5554" })
      );
    });
  });

  describe("isExecuting", () => {
    it("returns isPending state as false when not pending", async () => {
      mockMutation.mutateAsync.mockResolvedValueOnce({ success: true, output: "" });
      const { result } = renderHook(() => useCommands());
      expect(result.current.isExecuting).toBe(false);
    });

    it("returns isPending state as true when pending", async () => {
      mockMutation.mutateAsync.mockResolvedValueOnce({ success: true, output: "" });
      mockMutation.isPending = true;
      const { result } = renderHook(() => useCommands());
      expect(result.current.isExecuting).toBe(true);
    });
  });
});
