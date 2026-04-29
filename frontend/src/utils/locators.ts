/**
 * Pure frontend locator generation.
 * All data needed is already in the UiNode — no backend call required.
 */
import type { UiNode } from "../types/shared";

export interface Locator {
  strategy: string;
  value: string;
  expression: string;
  stability: number;
}

const STRATEGY_LABELS: Record<string, string> = {
  id: "Resource ID",
  text: "Text",
  "content-desc": "Content Desc",
  android_uiautomator: "UiSelector",
  class_index: "Class + Index",
};

// Stability: 5 = most stable, 1 = fragile
function make(id: string, value: string, stability: number): Locator {
  const label = STRATEGY_LABELS[id] ?? id;
  let expression: string;

  switch (id) {
    case "id":
      expression = value; // already `#resourceId`
      break;
    case "text":
      expression = value; // already quoted `"text"`
      break;
    case "content-desc":
      expression = value; // already quoted `"contentDesc"`
      break;
    case "android_uiautomator":
      expression = value; // already UiSelector string
      break;
    case "class_index":
      expression = value;
      break;
    default:
      expression = value;
  }

  return { strategy: id, value, expression, stability };
}

function findIndex(node: UiNode, targetId: string, nodes: UiNode[]): number {
  return nodes.findIndex((n) => n.id === targetId);
}

/**
 * Generate locator strategies for a UiNode.
 * Best strategy bubbles to top.
 */
export function generateLocators(
  node: UiNode,
  siblingIndex: number = 0
): Locator[] {
  const locators: Locator[] = [];

  // 1. resource-id — stability 5 (best)
  if (node.resourceId) {
    locators.push(make("id", `#${node.resourceId}`, 5));
    // UiSelector by resource-id — stability 4
    locators.push(
      make(
        "android_uiautomator",
        `UiSelector().resourceId("${node.resourceId}")`,
        4
      )
    );
  }

  // 2. content-desc — stability 4
  if (node.contentDesc) {
    locators.push(make("content-desc", `"${node.contentDesc}"`, 4));
    locators.push(
      make(
        "android_uiautomator",
        `UiSelector().description("${node.contentDesc}")`,
        4
      )
    );
  }

  // 3. text — stability 3
  if (node.text) {
    locators.push(make("text", `"${node.text}"`, 3));
    locators.push(
      make("android_uiautomator", `UiSelector().text("${node.text}")`, 3)
    );
    locators.push(
      make(
        "android_uiautomator",
        `UiSelector().textContains("${node.text}")`,
        2
      )
    );
  }

  // 4. class + index fallback — stability 1 (fragile)
  if (node.className) {
    const classShort = node.className.split(".").pop() ?? node.className;
    locators.push(make("class_index", `${classShort}[${siblingIndex}]`, 1));
    locators.push(
      make(
        "android_uiautomator",
        `UiSelector().className("${node.className}").index(${siblingIndex})`,
        1
      )
    );
  }

  // Sort by stability descending, preserve order within same stability
  locators.sort((a, b) => b.stability - a.stability);

  return locators;
}

/** Pick the best (highest stability) locator from a list */
export function bestLocator(locators: Locator[]): Locator | null {
  if (locators.length === 0) return null;
  return locators.reduce((best, curr) =>
    curr.stability > best.stability ? curr : best
  );
}
