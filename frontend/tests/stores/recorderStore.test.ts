import { describe, it, expect, vi, beforeEach } from "vitest";
import { useRecorderStore } from "../recorderStore";

describe("recorderStore", () => {
  beforeEach(() => {
    useRecorderStore.setState({
      isRecording: false,
      sessionId: "session_0",
      steps: [],
    });
  });

  describe("initial state", () => {
    it("defaults isRecording to false", () => {
      expect(useRecorderStore.getState().isRecording).toBe(false);
    });

    it("defaults steps to empty array", () => {
      expect(useRecorderStore.getState().steps).toEqual([]);
    });

    it("initializes with a sessionId", () => {
      const state = useRecorderStore.getState();
      expect(state.sessionId).toMatch(/^session_\d+$/);
    });
  });

  describe("setRecording", () => {
    it("sets isRecording to true and resets steps and sessionId", () => {
      useRecorderStore.setState({
        steps: [{ action: "click", nodeId: "btn", locator: { strategy: "id", value: "btn" }, code: "code" }],
      });
      useRecorderStore.getState().setRecording(true);
      const state = useRecorderStore.getState();
      expect(state.isRecording).toBe(true);
      expect(state.steps).toEqual([]);
      expect(state.sessionId).toMatch(/^session_\d+$/);
    });

    it("sets isRecording to false without resetting session", () => {
      useRecorderStore.setState({ isRecording: true });
      const oldSessionId = useRecorderStore.getState().sessionId;
      useRecorderStore.getState().setRecording(false);
      const state = useRecorderStore.getState();
      expect(state.isRecording).toBe(false);
      // steps and sessionId should persist when stopping
      expect(state.steps).toEqual([]);
      expect(state.sessionId).toBe(oldSessionId);
    });
  });

  describe("addStep", () => {
    it("appends a step to the steps array", () => {
      const step = {
        action: "click",
        nodeId: "btn1",
        locator: { strategy: "id", value: "btn1" },
        code: "code1",
      };
      useRecorderStore.getState().addStep(step as any);
      expect(useRecorderStore.getState().steps).toHaveLength(1);
      expect(useRecorderStore.getState().steps[0]).toEqual(step);
    });

    it("accumulates multiple steps", () => {
      const step1 = { action: "click", nodeId: "btn1", locator: { strategy: "id", value: "btn1" }, code: "code1" };
      const step2 = { action: "fill", nodeId: "input1", locator: { strategy: "text", value: "hello" }, code: "code2" };
      useRecorderStore.getState().addStep(step1 as any);
      useRecorderStore.getState().addStep(step2 as any);
      expect(useRecorderStore.getState().steps).toHaveLength(2);
    });
  });

  describe("clearSteps", () => {
    it("removes all steps", () => {
      useRecorderStore.setState({
        steps: [
          { action: "click", nodeId: "btn", locator: { strategy: "id", value: "btn" }, code: "code" },
        ],
      });
      useRecorderStore.getState().clearSteps();
      expect(useRecorderStore.getState().steps).toEqual([]);
    });
  });

  describe("setSessionId", () => {
    it("updates the sessionId", () => {
      useRecorderStore.getState().setSessionId("custom-session");
      expect(useRecorderStore.getState().sessionId).toBe("custom-session");
    });
  });
});
