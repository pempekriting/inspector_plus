/**
 * Shared TypeScript types for InspectorPlus.
 * These types must stay in sync with the Python bridge dicts in:
 *   - backend/device/android_bridge.py  (_parse_xml_to_json, _lxml_node_to_json)
 *   - backend/device/ios_bridge.py       (iOS hierarchy JSON structure)
 */

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface UiCapability {
  type: 'tap' | 'scroll' | 'input' | 'long' | 'link' | 'focus';
  badge: string;    // text label: "TAP", "SCROLL", etc.
  color: string;   // badge background hex
}

export interface UiStyles {
  backgroundColor?: string;   // hex: "#FF5722"
  textColor?: string;         // hex: "#212121"
  fontSize?: string;           // e.g., "16sp" / "14pt"
  fontWeight?: string;         // e.g., "400", "Bold"
  fontFamily?: string;        // e.g., "Roboto"
  padding?: { left: number; top: number; right: number; bottom: number; };
  elevation?: string;         // e.g., "4dp"
}

export interface UiNode {
  id: string;
  className?: string;
  package?: string;
  text?: string;
  resourceId?: string;
  contentDesc?: string;
  bounds?: Bounds;
  children?: UiNode[];
  // Boolean accessibility / interaction attributes
  checkable?: boolean;
  checked?: boolean;
  clickable?: boolean;
  enabled?: boolean;
  focusable?: boolean;
  focused?: boolean;
  longClickable?: boolean;
  scrollable?: boolean;
  selected?: boolean;
  password?: boolean;
  visibleToUser?: boolean;
  // v1.1: interaction hints
  capabilities?: UiCapability[];
  styles?: UiStyles;
  // iOS-specific fields (WDA accessibility hierarchy)
  label?: string;
  value?: string;
  name?: string;
  // WDA properties
  elementId?: string;
  role?: string;
  subrole?: string;
  roleDescription?: string;
  title?: string;
  help?: string;
  customActions?: string[];
  contentRequired?: boolean;
}

export interface DeviceInfo {
  udid: string;
  serial?: string;
  state: string;
  model: string;
  name?: string;
  manufacturer?: string;
  brand?: string;
  android_version?: string;
  sdk?: string;
  platform?: "android" | "ios";
  os_version?: string;
  architecture?: string;
  device_type?: string;
}

export interface DeviceStatus {
  connected: boolean;
  devices: DeviceInfo[];
  selected: string | null;
}

export type SearchFilter = "xpath" | "resource-id" | "text" | "content-desc" | "class";

export interface RecordingStep {
  action: string;
  nodeId: string;
  locator: { strategy: string; value: string; expression?: string };
  value?: string;
  code: string;
}
