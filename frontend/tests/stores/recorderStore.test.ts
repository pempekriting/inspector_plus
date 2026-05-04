import { describe, it, expect, vi, beforeEach } from "vitest";
import { useRecorderStore } from "../../src/stores/recorderStore";

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

  describe("step types", () => {
    it("records click step", () => {
      const step = {
        action: "click" as const,
        nodeId: "btn_submit",
        locator: { strategy: "id", value: "btn_submit" },
        code: 'find_element(By.id("btn_submit")).click()',
      };
      useRecorderStore.getState().addStep(step);
      expect(useRecorderStore.getState().steps[0].action).toBe("click");
    });

    it("records fill step", () => {
      const step = {
        action: "fill" as const,
        nodeId: "input_username",
        locator: { strategy: "accessibility-id", value: "username" },
        code: 'find_element(By.accessibility_id("username")).send_keys("testuser")',
        value: "testuser",
      };
      useRecorderStore.getState().addStep(step);
      expect(useRecorderStore.getState().steps[0].value).toBe("testuser");
    });

    it("records swipe step", () => {
      const step = {
        action: "swipe" as const,
        nodeId: "gesture_1",
        locator: { strategy: "class", value: "RecyclerView" },
        code: 'driver.execute_script("mobile: swipe", {...})',
        value: { startX: 100, startY: 500, endX: 100, endY: 100 },
      };
      useRecorderStore.getState().addStep(step);
      expect(useRecorderStore.getState().steps[0].action).toBe("swipe");
      expect(useRecorderStore.getState().steps[0].value).toEqual({ startX: 100, startY: 500, endX: 100, endY: 100 });
    });

    it("records wait step", () => {
      const step = {
        action: "wait" as const,
        nodeId: "",
        locator: {},
        code: 'time.sleep(2)',
        value: 2,
      };
      useRecorderStore.getState().addStep(step);
      expect(useRecorderStore.getState().steps[0].action).toBe("wait");
    });
  });

  describe("setRecording interaction", () => {
    it("starting new recording resets session", () => {
      useRecorderStore.setState({
        sessionId: "session_old",
        steps: [{ action: "click", nodeId: "btn", locator: { strategy: "id", value: "btn" }, code: "" }],
      });
      useRecorderStore.getState().setRecording(true);
      expect(useRecorderStore.getState().sessionId).not.toBe("session_old");
    });

    it("steps are isolated per recording session", () => {
      useRecorderStore.setState({ isRecording: true });
      useRecorderStore.getState().addStep({
        action: "click",
        nodeId: "btn1",
        locator: { strategy: "id", value: "btn1" },
        code: "",
      });
      expect(useRecorderStore.getState().steps).toHaveLength(1);

      // Stop recording
      useRecorderStore.getState().setRecording(false);

      // Start new recording - should have fresh session
      useRecorderStore.getState().setRecording(true);
      expect(useRecorderStore.getState().steps).toHaveLength(0);
    });
  });
});
