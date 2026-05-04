import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import type { Bounds, DeviceInfo, DeviceStatus, UiNode } from "../types/shared";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8001";

// Re-export shared types
export type { Bounds, DeviceInfo, DeviceStatus, UiNode };

// Zod schemas — validated at runtime, derived from shared TypeScript types
export const BoundsSchema: z.ZodType<Bounds> = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

export const UiNodeSchema: z.ZodType<UiNode> = z.lazy(() =>
  z.object({
    id: z.string(),
    className: z.string().optional(),
    package: z.string().optional(),
    text: z.string().optional(),
    resourceId: z.string().optional(),
    contentDesc: z.string().optional(),
    bounds: BoundsSchema,
    children: z.array(UiNodeSchema).optional(),
  })
);

export const DeviceInfoSchema = z.object({
  udid: z.string(),
  serial: z.string().optional(),
  state: z.string(),
  model: z.string(),
  name: z.string().optional(),
  manufacturer: z.string().optional(),
  brand: z.string().optional(),
  android_version: z.string().optional(),
  sdk: z.string().optional(),
  platform: z.enum(["android", "ios"]).optional(),
  os_version: z.string().optional(),
  architecture: z.string().optional(),
  device_type: z.string().optional(),
});

export const DeviceStatusSchema = z.object({
  connected: z.boolean(),
  devices: z.array(DeviceInfoSchema),
});

export const HierarchyResponseSchema = z.object({
  tree: UiNodeSchema,
});

// API fetch wrapper with error handling
export async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

// Device status
export function useDeviceStatus() {
  return useQuery({
    queryKey: ["device-status"],
    queryFn: () =>
      apiFetch<z.infer<typeof DeviceStatusSchema>>(`${API_BASE}/device/status`),
    refetchInterval: 10000,
    retry: 2,
    staleTime: 3000,
    gcTime: 30000,
  });
}

// Devices list
export function useDevices() {
  return useQuery({
    queryKey: ["devices"],
    queryFn: () =>
      apiFetch<{ devices: z.infer<typeof DeviceInfoSchema>[] }>(
        `${API_BASE}/devices`
      ).then((data) => data.devices),
    retry: 2,
    staleTime: 10000,
    gcTime: 60000,
  });
}

// Select device
export function useSelectDevice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (udid: string | null) =>
      apiFetch<{ udid: string; platform: string }>(
        `${API_BASE}/device/select`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ udid }),
        }
      ),
    onError: (error) => {
      console.error("Failed to select device:", error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["device-status"] });
      queryClient.invalidateQueries({ queryKey: ["hierarchy"] });
      queryClient.invalidateQueries({ queryKey: ["hierarchy-and-screenshot"] });
    },
  });
}

// Hierarchy
export function useHierarchy(udid?: string) {
  return useQuery({
    queryKey: ["hierarchy", udid],
    queryFn: () =>
      apiFetch<{ tree: z.infer<typeof UiNodeSchema> }>(
        udid
          ? `${API_BASE}/hierarchy?udid=${encodeURIComponent(udid)}`
          : `${API_BASE}/hierarchy`
      ),
    staleTime: 1000,
    gcTime: 30000,
    retry: 2,
  });
}

// Combined hierarchy + screenshot (single request, base64 encoded)
export function useHierarchyAndScreenshot(udid?: string) {
  return useQuery({
    queryKey: ["hierarchy-and-screenshot", udid],
    queryFn: async () => {
      const url = udid
        ? `${API_BASE}/hierarchy-and-screenshot?udid=${encodeURIComponent(udid)}`
        : `${API_BASE}/hierarchy-and-screenshot`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch hierarchy and screenshot");
      const data = await res.json() as { hierarchy: z.infer<typeof UiNodeSchema>; screenshot: string };
      return {
        hierarchy: data.hierarchy,
        screenshotUrl: `data:image/png;base64,${data.screenshot}`,
      };
    },
    staleTime: 2000,
    gcTime: 10000,
    retry: 1,
  });
}

// Tap device
export function useTapDevice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ x, y, udid }: { x: number; y: number; udid?: string }) =>
      apiFetch<void>(
        udid
          ? `${API_BASE}/tap?udid=${encodeURIComponent(udid)}`
          : `${API_BASE}/tap`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ x, y }),
        }
      ),
    onError: (error) => {
      console.error("Tap command failed:", error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hierarchy-and-screenshot"] });
      queryClient.invalidateQueries({ queryKey: ["hierarchy"] });
    },
  });
}

// Command execution
export function useExecuteCommand() {
  return useMutation({
    mutationFn: ({ type, params, udid }: { type: string; params?: Record<string, unknown>; udid?: string }) =>
      apiFetch<{ success: boolean; output: string; error?: string }>(
        udid
          ? `${API_BASE}/commands/execute?udid=${encodeURIComponent(udid)}`
          : `${API_BASE}/commands/execute`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type, params }),
        }
      ),
    onError: (error) => {
      console.error("Command execution failed:", error);
    },
  });
}

// Locator result types
export interface Locator {
  strategy: string;
  value: string;
  expression: string;
  stability: number;
}

export interface LocatorResult {
  nodeId: string;
  locators: Locator[];
  best: string;
}

// Fetch locators for a node
export function useLocators(nodeId: string | null) {
  return useQuery({
    queryKey: ["locators", nodeId],
    queryFn: () =>
      apiFetch<LocatorResult>(
        `${API_BASE}/hierarchy/locators?nodeId=${encodeURIComponent(nodeId || "")}`
      ),
    enabled: !!nodeId,
    staleTime: 30000,
    gcTime: 60000,
    retry: 1,
  });
}

// Execute ADB command
export function useAdbCommand() {
  return useMutation({
    mutationFn: ({ command, udid }: { command: string; udid?: string }) =>
      apiFetch<{ output: string; error: string | null; exitCode: number }>(
        udid
          ? `${API_BASE}/device/adb?udid=${encodeURIComponent(udid)}`
          : `${API_BASE}/device/adb`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ command }),
        }
      ),
    onError: (error) => {
      console.error("ADB command failed:", error);
    },
  });
}

// Execute multi-pointer gesture
export function useGestureExecute() {
  return useMutation({
    mutationFn: ({ actions, coordinateMode, udid }: {
      actions: Array<{
        type: string;
        x?: number;
        y?: number;
        duration?: number;
        pointer?: number;
        button?: string;
      }>;
      coordinateMode: string;
      udid?: string;
    }) =>
      apiFetch<{ success: boolean; message?: string }>(
        udid
          ? `${API_BASE}/gesture/execute?udid=${encodeURIComponent(udid)}`
          : `${API_BASE}/gesture/execute`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ actions, coordinateMode }),
        }
      ),
    onError: (error) => {
      console.error("Gesture execution failed:", error);
    },
  });
}

// Execute arbitrary script/command
export function useExecuteScript() {
  return useMutation({
    mutationFn: ({ script, platform, udid }: {
      script: string;
      platform?: string;
      udid?: string;
    }) =>
      apiFetch<{ success: boolean; output: string; error?: string | null; exitCode: number }>(
        udid
          ? `${API_BASE}/execute?udid=${encodeURIComponent(udid)}`
          : `${API_BASE}/execute`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ script, platform }),
        }
      ),
    onError: (error) => {
      console.error("Script execution failed:", error);
    },
  });
}

// Accessibility Audit
export interface AccessibilityIssue {
  nodeId: string;
  check: string;
  severity: 'high' | 'medium' | 'low';
  description: string;
  element: Record<string, unknown>;
}

export interface AuditResult {
  timestamp: string;
  totalNodes: number;
  issues: AccessibilityIssue[];
  summary: { high: number; medium: number; low: number };
}

export function useAccessibilityAudit() {
  return useMutation({
    mutationFn: () =>
      apiFetch<AuditResult>(`${API_BASE}/hierarchy/audit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
  });
}

// F3: Context (WebView support)
export interface ContextInfo {
  id: string;
  type: "native" | "webview";
  description: string;
}

export function useDeviceContexts(udid?: string) {
  return useQuery({
    queryKey: ["device-contexts", udid],
    queryFn: () =>
      apiFetch<{ contexts: ContextInfo[] }>(
        udid ? `${API_BASE}/device/contexts?udid=${encodeURIComponent(udid)}` : `${API_BASE}/device/contexts`
      ),
    staleTime: 15000,
    gcTime: 30000,
    retry: 1,
  });
}

export function useSwitchContext() {
  return useMutation({
    mutationFn: ({ contextId, udid }: { contextId: string; udid?: string }) =>
      apiFetch<{ success: boolean }>(
        udid
          ? `${API_BASE}/device/switch-context?udid=${encodeURIComponent(udid)}`
          : `${API_BASE}/device/switch-context`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contextId }),
        }
      ),
  });
}

// F2: Test Recorder
// App Info

export interface AppInfo {
  packageName: string;
  versionName: string;
  versionCode: number;
  platform: "android" | "ios";
  minSdk: number;
  targetSdk: number;
  minimumOSVersion?: string;
  firstInstallTime: string;
  lastUpdateTime: string;
  installerPackage: string;
  displayName?: string;
  bundleIdentifier?: string;
  installType?: string;
  architectures?: string;
  permissions: Array<{
    name: string;
    label: string;
    granted?: boolean;
    group?: string;
    description?: string;
  }>;
  permissionCount: number;
  grantedCount: number;
}

// List installed packages (returns raw package list as newline-separated string)
// Deferred: only fetch when selectedPackage is set (user selected an app)
export function useInstalledPackages(enabled: boolean = false, udid?: string | null) {
  return useQuery({
    queryKey: ["installed-packages", udid],
    queryFn: () => {
      const url = udid
        ? `${API_BASE}/commands/execute?udid=${encodeURIComponent(udid)}`
        : `${API_BASE}/commands/execute`;
      return apiFetch<{ success: boolean; output: string }>(
        url,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "list_apps", params: {} }),
        }
      ).then((data) => {
        if (!data.success) throw new Error(data.output);
        return data.output.split("\n").filter(Boolean).sort();
      });
    },
    enabled,
    staleTime: 30000,
    gcTime: 60000,
    retry: 2,
  });
}

// Get detailed app info for a specific package
export function useAppInfo(packageName: string | null, udid?: string | null) {
  return useQuery({
    queryKey: ["app-info", packageName, udid],
    queryFn: () => {
      let url = `${API_BASE}/app/commands/info?package=${encodeURIComponent(packageName || "")}`;
      if (udid) url += `&udid=${encodeURIComponent(udid)}`;
      return apiFetch<AppInfo>(url);
    },
    enabled: !!packageName,
    staleTime: 30000,
    gcTime: 60000,
    retry: 2,
  });
}

export function useRecorder() {
  const addStep = (data: {
    sessionId: string;
    action: string;
    nodeId: string;
    locator: { strategy: string; value: string; expression?: string };
    value?: string;
    udid?: string;
  }) => {
    const url = data.udid
      ? `${API_BASE}/recorder/record?udid=${encodeURIComponent(data.udid)}`
      : `${API_BASE}/recorder/record`;
    return apiFetch<{ stepCount: number }>(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: data.sessionId,
        action: data.action,
        nodeId: data.nodeId,
        locator: data.locator,
        value: data.value,
      }),
    });
  };

  const exportRecording = async (params: {
    sessionId: string;
    lang: string;
    platform: string;
    udid?: string;
  }) => {
    const url = params.udid
      ? `${API_BASE}/recorder/export?sessionId=${params.sessionId}&lang=${params.lang}&platform=${params.platform}&udid=${encodeURIComponent(params.udid)}`
      : `${API_BASE}/recorder/export?sessionId=${params.sessionId}&lang=${params.lang}&platform=${params.platform}`;
    return apiFetch<{ script: string; filename: string; stepCount: number }>(url);
  };

  const clearRecording = (params: { sessionId: string; udid?: string }) => {
    const url = params.udid
      ? `${API_BASE}/recorder/clear?sessionId=${params.sessionId}&udid=${encodeURIComponent(params.udid)}`
      : `${API_BASE}/recorder/clear?sessionId=${params.sessionId}`;
    return apiFetch<{ cleared: boolean }>(url, { method: "POST" });
  };

  return { addStep, exportRecording, clearRecording };
}
