import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRecording } from "../useRecording";
import { useRecorderStore } from "../../stores/recorderStore";
import * as api from "../../services/api";

// Mock the api service
vi.mock("../../services/api", () => ({
  useRecorder: vi.fn(() => ({
    addStep: vi.fn().mockResolvedValue({ stepCount: 1 }),
    clearRecording: vi.fn().mockResolvedValue({ cleared: true }),
  })),
}));

// Mock useDeviceStore
vi.mock("../../stores/deviceStore", () => ({
  useDeviceStore: vi.fn(() => ({
    selectedDevice: "emulator-5554",
  })),
}));

describe("useRecording", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useRecorderStore.setState({
      isRecording: false,
      sessionId: "session_0",
      steps: [],
    });
  });

  describe("recordStep", () => {
    it("generates code for click action", () => {
      const { result } = renderHook(() => useRecording());
      act(() => {
        result.current.recordStep({
          action: "click",
          nodeId: "btn1",
          locator: { strategy: "id", value: "btn1" },
        });
      });
      const steps = useRecorderStore.getState().steps;
      expect(steps).toHaveLength(1);
      expect(steps[0].code).toContain("click()");
    });

    it("generates code for fill action", () => {
      const { result } = renderHook(() => useRecording());
      act(() => {
        result.current.recordStep({
          action: "fill",
          nodeId: "input1",
          locator: { strategy: "text", value: "username" },
          value: "john",
        });
      });
      const steps = useRecorderStore.getState().steps;
      expect(steps[0].code).toContain("send_keys");
      expect(steps[0].code).toContain("john");
    });

    it("generates code for swipe action with parsed value", () => {
      const { result } = renderHook(() => useRecording());
      act(() => {
        result.current.recordStep({
          action: "swipe",
          nodeId: "swipe1",
          locator: { strategy: "class_index", value: "RecyclerView[0]" },
          value: '{"startX":100,"startY":200,"endX":300,"endY":400}',
        });
      });
      const steps = useRecorderStore.getState().steps;
      expect(steps[0].code).toContain("mobile: swipe");
      expect(steps[0].code).toContain("startX");
    });

    it("generates code for swipe action with raw value on parse failure", () => {
      const { result } = renderHook(() => useRecording());
      act(() => {
        result.current.recordStep({
          action: "swipe",
          nodeId: "swipe1",
          locator: { strategy: "class_index", value: "RecyclerView[0]" },
          value: '{"bad json',
        });
      });
      const steps = useRecorderStore.getState().steps;
      expect(steps[0].code).toContain("mobile: swipe");
    });

    it("generates code for swipe action without value", () => {
      const { result } = renderHook(() => useRecording());
      act(() => {
        result.current.recordStep({
          action: "swipe",
          nodeId: "swipe1",
          locator: { strategy: "class_index", value: "RecyclerView[0]" },
        });
      });
      const steps = useRecorderStore.getState().steps;
      expect(steps[0].code).toContain("mobile: swipe");
    });

    it("generates code for wait action", () => {
      const { result } = renderHook(() => useRecording());
      act(() => {
        result.current.recordStep({
          action: "wait",
          nodeId: "wait1",
          locator: { strategy: "id", value: "loading" },
          value: "5",
        });
      });
      const steps = useRecorderStore.getState().steps;
      expect(steps[0].code).toContain("time.sleep");
      expect(steps[0].code).toContain("5");
    });

    it("generates default code for unknown action", () => {
      const { result } = renderHook(() => useRecording());
      act(() => {
        result.current.recordStep({
          action: "unknown" as any,
          nodeId: "node1",
          locator: { strategy: "id", value: "node1" },
        });
      });
      const steps = useRecorderStore.getState().steps;
      expect(steps[0].code).toContain("find_element");
    });

    it("adds step to local store", () => {
      const { result } = renderHook(() => useRecording());
      act(() => {
        result.current.recordStep({
          action: "click",
          nodeId: "btn1",
          locator: { strategy: "id", value: "btn1" },
        });
      });
      expect(useRecorderStore.getState().steps).toHaveLength(1);
    });
  });

  describe("toggleRecording", () => {
    it("starts recording - clears session and steps", async () => {
      useRecorderStore.setState({
        isRecording: false,
        steps: [{ action: "click", nodeId: "old", locator: { strategy: "id", value: "old" }, code: "old" }],
      });
      const { result } = renderHook(() => useRecording());
      await act(async () => {
        result.current.toggleRecording();
      });
      expect(useRecorderStore.getState().isRecording).toBe(true);
      expect(useRecorderStore.getState().steps).toEqual([]);
    });

    it("stops recording", async () => {
      useRecorderStore.setState({ isRecording: true });
      const { result } = renderHook(() => useRecording());
      await act(async () => {
        result.current.toggleRecording();
      });
      expect(useRecorderStore.getState().isRecording).toBe(false);
    });
  });

  describe("clearAllSteps", () => {
    it("clears steps in store", async () => {
      useRecorderStore.setState({
        steps: [{ action: "click", nodeId: "btn", locator: { strategy: "id", value: "btn" }, code: "code" }],
      });
      const { result } = renderHook(() => useRecording());
      await act(async () => {
        result.current.clearAllSteps();
      });
      expect(useRecorderStore.getState().steps).toEqual([]);
    });
  });
});
