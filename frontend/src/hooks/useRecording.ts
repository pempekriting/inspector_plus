import { useCallback } from "react";
import { useRecorderStore } from "../stores/recorderStore";
import { useRecorder } from "../services/api";
import { useDeviceStore } from "../stores/deviceStore";
import type { RecordingStep } from "../types/shared";

export function useRecording() {
  const store = useRecorderStore();
  const { addStep: apiAddStep, clearRecording: apiClearRecording } = useRecorder();
  const { selectedDevice } = useDeviceStore();

  const recordStep = useCallback(
    (step: Omit<RecordingStep, "code">) => {
      const { sessionId, steps } = useRecorderStore.getState();

      // Generate code for display (this mirrors backend code generation logic)
      const code = stepToCode(step);

      // Create full step with code
      const fullStep: RecordingStep = { ...step, code };

      // Update local store immediately for responsive UI
      useRecorderStore.getState().addStep(fullStep);

      // Sync to backend
      apiAddStep({
        sessionId,
        action: step.action,
        nodeId: step.nodeId,
        locator: step.locator,
        value: step.value,
        udid: selectedDevice || undefined,
      });
    },
    [apiAddStep, selectedDevice]
  );

  const toggleRecording = useCallback(() => {
    const { isRecording, sessionId, clearSteps } = useRecorderStore.getState();

    if (!isRecording) {
      // Starting to record - clear previous session
      apiClearRecording({ sessionId, udid: selectedDevice || undefined });
      clearSteps();
    }

    store.setRecording(!isRecording);
  }, [store, apiClearRecording, selectedDevice]);

  const clearAllSteps = useCallback(() => {
    const { sessionId } = useRecorderStore.getState();
    apiClearRecording({ sessionId, udid: selectedDevice || undefined });
    store.clearSteps();
  }, [store, apiClearRecording, selectedDevice]);

  return {
    ...store,
    recordStep,
    toggleRecording,
    clearAllSteps,
  };
}

function stepToCode(step: Omit<RecordingStep, "code">): string {
  const { action, locator, value } = step;
  const locStr = `${locator.strategy}("${locator.value}")`;

  switch (action) {
    case "click":
      return `self.driver.find_element(AppiumBy.${locStr}).click()`;
    case "fill":
      return `self.driver.find_element(AppiumBy.${locStr}).send_keys("${value || ""}")`;
    case "swipe":
      if (value && typeof value === "string") {
        try {
          const { startX, startY, endX, endY } = JSON.parse(value);
          return `self.driver.execute_script("mobile: swipe", ${JSON.stringify({ startX, startY, endX, endY, speed: 5000 })})`;
        } catch {
          return `self.driver.execute_script("mobile: swipe", ${value})`;
        }
      }
      return `self.driver.execute_script("mobile: swipe", {...})`;
    case "wait":
      return `time.sleep(${value || 1})`;
    default:
      return `self.driver.find_element(AppiumBy.${locStr})`;
  }
}
