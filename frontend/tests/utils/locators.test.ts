import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateLocators, bestLocator, type Locator } from "../locators";
import type { UiNode } from "../../types/shared";

describe("locators", () => {
  describe("generateLocators", () => {
    it("returns empty array for node with no identifiable fields", () => {
      const node: UiNode = { id: "node1" };
      const result = generateLocators(node);
      expect(result).toEqual([]);
    });

    it("generates locators for resourceId with stability 5 and 4", () => {
      const node: UiNode = { id: "node1", resourceId: "com.example:id/btn" };
      const locators = generateLocators(node);
      expect(locators.length).toBeGreaterThanOrEqual(2);
      const idLocator = locators.find((l) => l.strategy === "id");
      expect(idLocator).toBeDefined();
      expect(idLocator?.stability).toBe(5);
      expect(idLocator?.value).toBe("#com.example:id/btn");
    });

    it("generates locators for contentDesc with stability 4", () => {
      const node: UiNode = { id: "node1", contentDesc: "Submit button" };
      const locators = generateLocators(node);
      const cdLocator = locators.find((l) => l.strategy === "content-desc");
      expect(cdLocator).toBeDefined();
      expect(cdLocator?.stability).toBe(4);
      expect(cdLocator?.value).toBe('"Submit button"');
    });

    it("generates text locators with stability 3", () => {
      const node: UiNode = { id: "node1", text: "Hello World" };
      const locators = generateLocators(node);
      const textLocator = locators.find((l) => l.strategy === "text");
      expect(textLocator).toBeDefined();
      expect(textLocator?.stability).toBe(3);
      expect(textLocator?.value).toBe('"Hello World"');
    });

    it("generates textContains with lower stability", () => {
      const node: UiNode = { id: "node1", text: "Hello" };
      const locators = generateLocators(node);
      const containsLocator = locators.find((l) => l.value.includes("textContains"));
      expect(containsLocator).toBeDefined();
      expect(containsLocator?.stability).toBe(2);
    });

    it("generates class_index fallback locator with stability 1", () => {
      const node: UiNode = { id: "node1", className: "android.widget.Button" };
      const locators = generateLocators(node);
      const classIndexLocator = locators.find((l) => l.strategy === "class_index");
      expect(classIndexLocator).toBeDefined();
      expect(classIndexLocator?.stability).toBe(1);
      expect(classIndexLocator?.value).toBe("Button[0]");
    });

    it("shortens class name by dropping package", () => {
      const node: UiNode = { id: "node1", className: "android.widget.TextView" };
      const locators = generateLocators(node);
      const classIndexLocator = locators.find((l) => l.strategy === "class_index");
      expect(classIndexLocator?.value).toBe("TextView[0]");
    });

    it("sorts locators by stability descending", () => {
      const node: UiNode = {
        id: "node1",
        resourceId: "com.example:id/btn",
        contentDesc: "button",
        text: "Click",
        className: "android.widget.Button",
      };
      const locators = generateLocators(node);
      // stability should be descending: 5, 4, 4, 3, 3, 2, 1, 1
      for (let i = 1; i < locators.length; i++) {
        expect(locators[i - 1].stability).toBeGreaterThanOrEqual(locators[i].stability);
      }
    });

    it("uses siblingIndex in class_index", () => {
      const node: UiNode = { id: "node1", className: "android.widget.Button" };
      const locators = generateLocators(node, 3);
      const classIndexLocator = locators.find((l) => l.strategy === "class_index");
      expect(classIndexLocator?.value).toBe("Button[3]");
    });

    it("includes android_uiautomator variants", () => {
      const node: UiNode = { id: "node1", resourceId: "com.example:id/btn" };
      const locators = generateLocators(node);
      const uiAutomatorLocators = locators.filter((l) => l.strategy === "android_uiautomator");
      expect(uiAutomatorLocators.length).toBeGreaterThan(0);
    });
  });

  describe("bestLocator", () => {
    it("returns null for empty array", () => {
      expect(bestLocator([])).toBeNull();
    });

    it("returns the locator with highest stability", () => {
      const locators: Locator[] = [
        { strategy: "class_index", value: "Button[0]", expression: "Button[0]", stability: 1 },
        { strategy: "id", value: "#btn", expression: "#btn", stability: 5 },
        { strategy: "text", value: '"Click"', expression: '"Click"', stability: 3 },
      ];
      const result = bestLocator(locators);
      expect(result?.strategy).toBe("id");
      expect(result?.stability).toBe(5);
    });

    it("returns first among equals stability", () => {
      const locators: Locator[] = [
        { strategy: "text", value: '"Click"', expression: '"Click"', stability: 3 },
        { strategy: "content-desc", value: '"Click"', expression: '"Click"', stability: 3 },
      ];
      const result = bestLocator(locators);
      expect(result?.strategy).toBe("text");
    });

    it("returns single item correctly", () => {
      const locators: Locator[] = [
        { strategy: "id", value: "#btn", expression: "#btn", stability: 5 },
      ];
      expect(bestLocator(locators)).toEqual(locators[0]);
    });
  });
});
