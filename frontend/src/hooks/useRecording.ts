import { useCallback } from "react";
import { useRecorderStore } from "../stores/recorderStore";
import { useRecorder } from "../services/api";
import { useDeviceStore } from "../stores/deviceStore";
import type { RecordingStep } from "../types/shared";

type Lang = "python" | "java" | "javascript";

export function useRecording(lang: Lang = "python") {
  const store = useRecorderStore();
  const { addStep: apiAddStep, clearRecording: apiClearRecording } = useRecorder();
  const { selectedDevice } = useDeviceStore();

  const recordStep = useCallback(
    (step: Omit<RecordingStep, "code">) => {
      const { sessionId } = useRecorderStore.getState();

      // Generate code for display based on selected lang
      const code = stepToCode(step, lang);

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

function stepToCode(step: Omit<RecordingStep, "code">, lang: Lang): string {
  const { action, locator, value } = step;
  const locStr = `${locator.strategy}("${locator.value}")`;

  if (lang === "python") {
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
  } else if (lang === "java") {
    const by = locator.strategy === "id" ? "By.id" : "By.xpath";
    switch (action) {
      case "click":
        return `WebElement el = driver.findElement(${by}("${locator.value}")); el.click();`;
      case "fill":
        return `WebElement el = driver.findElement(${by}("${locator.value}")); el.sendKeys("${value || ""}");`;
      case "swipe":
        return `// swipe from ${value}`;
      case "wait":
        return `Thread.sleep(${(Number(value) || 1) * 1000});`;
      default:
        return `driver.findElement(${by}("${locator.value}"))`;
    }
  } else {
    // javascript
    const by = locator.strategy === "id"
      ? `using: "id", value: "${locator.value}"`
      : `using: "xpath", value: "${locator.value}"`;
    switch (action) {
      case "click":
        return `await driver.$({{{by}}}).click()`;
      case "fill":
        return `await driver.$({{{by}}}).setValue("${value || ""}")`;
      case "swipe":
        return `// swipe`;
      case "wait":
        return `await driver.pause(${(Number(value) || 1000)})`;
      default:
        return `await driver.$(${by})`;
    }
  }
}
