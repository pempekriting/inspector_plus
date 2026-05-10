import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import { getApiUrl } from '../config/apiConfig';
import type { Bounds, DeviceInfo, DeviceStatus, UiNode } from '../types/shared';
import type { NetworkFlow } from '../types/network';

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
  platform: z.enum(['android', 'ios']).optional(),
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

export const HierarchyAndScreenshotSchema = z.object({
  hierarchy: UiNodeSchema,
  screenshot: z.string(),
});

export const NetworkFlowSchema: z.ZodType<NetworkFlow> = z.object({
  id: z.string(),
  timestamp: z.number(),
  request: z.object({
    method: z.string(),
    url: z.string(),
    host: z.string(),
    path: z.string(),
    headers: z.record(z.string(), z.string()),
    body: z.string().optional(),
  }),
  response: z
    .object({
      status_code: z.number(),
      reason: z.string(),
      headers: z.record(z.string(), z.string()),
      body: z.string().optional(),
    })
    .optional(),
  duration_ms: z.number(),
  websocket: z.boolean(),
  error: z.string().optional(),
});

export const NetworkInfoSchema = z.object({
  ip_addresses: z.array(z.object({ iface: z.string(), address: z.string(), family: z.string() })),
  connections: z.array(z.string()),
  dns: z.array(z.string()),
});

// API key getter (reads from localStorage, set via settings store)
function getApiKey(): string | null {
  try {
    return localStorage.getItem('inspector-plus-api-key');
  } catch {
    return null;
  }
}

// API fetch wrapper with error handling and optional Zod validation
export async function apiFetch<T>(url: string, options?: RequestInit, schema?: z.ZodType<T>): Promise<T> {
  const headers: Record<string, string> = {
    ...(options?.headers as Record<string, string>),
  };
  const apiKey = getApiKey();
  if (apiKey) {
    headers['X-API-Key'] = apiKey;
  }
  const response = await fetch(url, { ...options, headers });
  if (!response.ok) {
    let message = `API Error: ${response.status} ${response.statusText}`;
    try {
      const err = await response.json();
      message = err.detail || err.error || message;
    } catch {
      // response body isn't JSON, use status text
    }
    throw new Error(message);
  }
  const data = await response.json();
  return schema ? schema.parse(data) : (data as T);
}

// Device status
export function useDeviceStatus() {
  return useQuery({
    queryKey: ['device-status'],
    queryFn: () => apiFetch<z.infer<typeof DeviceStatusSchema>>(`${getApiUrl()}/device/status`, undefined, DeviceStatusSchema),
    refetchInterval: 10000,
    retry: 2,
    staleTime: 3000,
    gcTime: 30000,
  });
}

// Devices list
export function useDevices() {
  return useQuery({
    queryKey: ['devices'],
    queryFn: () =>
      apiFetch<z.infer<typeof DeviceStatusSchema>>(`${getApiUrl()}/device/status`, undefined, DeviceStatusSchema).then(
        (data) => data.devices
      ),
    retry: 2,
    staleTime: 10000,
    gcTime: 60000,
  });
}

// Hierarchy
export function useHierarchy(udid?: string) {
  return useQuery({
    queryKey: ['hierarchy', udid],
    queryFn: () =>
      apiFetch<z.infer<typeof HierarchyResponseSchema>>(
        udid
          ? `${getApiUrl()}/hierarchy?udid=${encodeURIComponent(udid)}`
          : `${getApiUrl()}/hierarchy`,
        undefined,
        HierarchyResponseSchema
      ).then((data) => data.tree),
    staleTime: 1000,
    gcTime: 30000,
    retry: 2,
  });
}

// Combined hierarchy + screenshot (single request, base64 encoded)
export function useHierarchyAndScreenshot(udid?: string) {
  return useQuery({
    queryKey: ['hierarchy-and-screenshot', udid],
    queryFn: async () => {
      const url = udid
        ? `${getApiUrl()}/hierarchy-and-screenshot?udid=${encodeURIComponent(udid)}`
        : `${getApiUrl()}/hierarchy-and-screenshot`;
      const data = await apiFetch<z.infer<typeof HierarchyAndScreenshotSchema>>(
        url,
        undefined,
        HierarchyAndScreenshotSchema
      );
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
        udid ? `${getApiUrl()}/tap?udid=${encodeURIComponent(udid)}` : `${getApiUrl()}/tap`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ x, y }),
        }
      ),
    onError: (error) => {
      console.error('Tap command failed:', error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hierarchy-and-screenshot'] });
      queryClient.invalidateQueries({ queryKey: ['hierarchy'] });
    },
  });
}

// Command execution
export function useExecuteCommand() {
  return useMutation({
    mutationFn: ({
      type,
      params,
      udid,
    }: {
      type: string;
      params?: Record<string, unknown>;
      udid?: string;
    }) =>
      apiFetch<{ success: boolean; output: string; error?: string }>(
        udid
          ? `${getApiUrl()}/commands/execute?udid=${encodeURIComponent(udid)}`
          : `${getApiUrl()}/commands/execute`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type, params }),
        }
      ),
    onError: (error) => {
      console.error('Command execution failed:', error);
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

export const LocatorSchema: z.ZodType<Locator> = z.object({
  strategy: z.string(),
  value: z.string(),
  expression: z.string(),
  stability: z.number(),
});

export interface LocatorResult {
  nodeId: string;
  locators: Locator[];
  best?: string;
}

export const LocatorResultSchema: z.ZodType<LocatorResult> = z.object({
  nodeId: z.string(),
  locators: z.array(LocatorSchema),
  best: z.string().optional(),
});

// Fetch locators for a node
export function useLocators(nodeId: string | null) {
  return useQuery({
    queryKey: ['locators', nodeId],
    queryFn: () =>
      apiFetch<z.infer<typeof LocatorResultSchema>>(
        `${getApiUrl()}/hierarchy/locators?nodeId=${encodeURIComponent(nodeId || '')}`,
        undefined,
        LocatorResultSchema
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
          ? `${getApiUrl()}/device/adb?udid=${encodeURIComponent(udid)}`
          : `${getApiUrl()}/device/adb`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command }),
        }
      ),
    onError: (error) => {
      console.error('ADB command failed:', error);
    },
  });
}

// Execute multi-pointer gesture
export function useGestureExecute() {
  return useMutation({
    mutationFn: ({
      actions,
      coordinateMode,
      udid,
    }: {
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
          ? `${getApiUrl()}/gesture/execute?udid=${encodeURIComponent(udid)}`
          : `${getApiUrl()}/gesture/execute`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ actions, coordinateMode }),
        }
      ),
    onError: (error) => {
      console.error('Gesture execution failed:', error);
    },
  });
}

// Input text to device
export function useInputText() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ text, udid }: { text: string; udid?: string }) =>
      apiFetch<{ success: boolean }>(
        udid
          ? `${getApiUrl()}/input/text?udid=${encodeURIComponent(udid)}`
          : `${getApiUrl()}/input/text`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        }
      ),
    onError: (error) => {
      console.error('Input text failed:', error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hierarchy-and-screenshot'] });
      queryClient.invalidateQueries({ queryKey: ['hierarchy'] });
    },
  });
}

// Execute arbitrary script/command
export function useExecuteScript() {
  return useMutation({
    mutationFn: ({
      script,
      platform,
      udid,
    }: {
      script: string;
      platform?: string;
      udid?: string;
    }) =>
      apiFetch<{ success: boolean; output: string; error?: string | null; exitCode: number }>(
        udid ? `${getApiUrl()}/execute?udid=${encodeURIComponent(udid)}` : `${getApiUrl()}/execute`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ script, platform }),
        }
      ),
    onError: (error) => {
      console.error('Script execution failed:', error);
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
      apiFetch<AuditResult>(`${getApiUrl()}/hierarchy/audit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
  });
}

// F3: Context (WebView support)
export interface ContextInfo {
  id: string;
  type: 'native' | 'webview';
  description: string;
}

export const ContextInfoSchema = z.object({
  id: z.string(),
  type: z.enum(['native', 'webview']),
  description: z.string(),
});

export const DeviceContextsResponseSchema = z.object({
  contexts: z.array(ContextInfoSchema),
});

export function useDeviceContexts(udid?: string) {
  return useQuery({
    queryKey: ['device-contexts', udid],
    queryFn: () =>
      apiFetch<z.infer<typeof DeviceContextsResponseSchema>>(
        udid
          ? `${getApiUrl()}/device/contexts?udid=${encodeURIComponent(udid)}`
          : `${getApiUrl()}/device/contexts`,
        undefined,
        DeviceContextsResponseSchema
      ).then((data) => data.contexts),
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
          ? `${getApiUrl()}/device/switch-context?udid=${encodeURIComponent(udid)}`
          : `${getApiUrl()}/device/switch-context`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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
  platform: 'android' | 'ios';
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
    queryKey: ['installed-packages', udid],
    queryFn: () => {
      const url = udid
        ? `${getApiUrl()}/commands/execute?udid=${encodeURIComponent(udid)}`
        : `${getApiUrl()}/commands/execute`;
      return apiFetch<{ success: boolean; output: string }>(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'list_apps', params: {} }),
      }).then((data) => {
        if (!data.success) throw new Error(data.output);
        return data.output.split('\n').filter(Boolean).sort();
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
    queryKey: ['app-info', packageName, udid],
    queryFn: () => {
      let url = `${getApiUrl()}/app/commands/info?package=${encodeURIComponent(packageName || '')}`;
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
      ? `${getApiUrl()}/recorder/record?udid=${encodeURIComponent(data.udid)}`
      : `${getApiUrl()}/recorder/record`;
    return apiFetch<{ stepCount: number }>(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
      ? `${getApiUrl()}/recorder/export?sessionId=${params.sessionId}&lang=${params.lang}&platform=${params.platform}&udid=${encodeURIComponent(params.udid)}`
      : `${getApiUrl()}/recorder/export?sessionId=${params.sessionId}&lang=${params.lang}&platform=${params.platform}`;
    return apiFetch<{ script: string; filename: string; stepCount: number }>(url);
  };

  const clearRecording = (params: { sessionId: string; udid?: string }) => {
    const url = params.udid
      ? `${getApiUrl()}/recorder/clear?sessionId=${params.sessionId}&udid=${encodeURIComponent(params.udid)}`
      : `${getApiUrl()}/recorder/clear?sessionId=${params.sessionId}`;
    return apiFetch<{ cleared: boolean }>(url, { method: 'POST' });
  };

  return { addStep, exportRecording, clearRecording };
}

// Network Debug hooks
export function useProxyStatus() {
  return useQuery({
    queryKey: ['proxy-status'],
    queryFn: () =>
      apiFetch<{ running: boolean; port: number; flow_file: string | null; flows_count: number }>(
        `${getApiUrl()}/network/proxy/status`
      ),
    refetchInterval: 5000,
    staleTime: 1000,
  });
}

export function useStartProxy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ port, udid }: { port?: number; udid?: string }) =>
      apiFetch<{ success: boolean; running: boolean; port: number; error?: string }>(
        `${getApiUrl()}/network/proxy/start`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ port: port || 8080, udid }),
        }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proxy-status'] });
    },
  });
}

export function useStopProxy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ success: boolean; running: boolean }>(`${getApiUrl()}/network/proxy/stop`, {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proxy-status'] });
    },
  });
}

export function useNetworkTraffic(since: number = 0, enabled: boolean = true) {
  return useQuery({
    queryKey: ['network-traffic', since, enabled],
    queryFn: async () => {
      if (!enabled) return { flows: [], count: 0 };
      return apiFetch<{ flows: NetworkFlow[]; count: number }>(
        `${getApiUrl()}/network/traffic?since=${since}`,
        undefined,
        z.object({ flows: z.array(NetworkFlowSchema), count: z.number() })
      );
    },
    enabled,
    refetchInterval: enabled ? 12000 : false,
    staleTime: 500,
  });
}

export function useNetworkInfo(udid?: string) {
  return useQuery({
    queryKey: ['network-info', udid],
    queryFn: () => {
      const url = udid
        ? `${getApiUrl()}/network/info?udid=${encodeURIComponent(udid)}`
        : `${getApiUrl()}/network/info`;
      return apiFetch<z.infer<typeof NetworkInfoSchema>>(url, undefined, NetworkInfoSchema);
    },
    staleTime: 10000,
  });
}

export function useInstallCert() {
  return useMutation({
    mutationFn: ({ udid }: { udid?: string }) =>
      apiFetch<{
        success: boolean;
        cert_path?: string;
        installed?: boolean;
        note?: string;
        manual_steps?: string[];
        instructions?: string[];
        error?: string;
      }>(`${getApiUrl()}/network/cert/install`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ udid }),
      }),
  });
}

export function useVpnStatus(udid?: string) {
  return useQuery({
    queryKey: ['vpn-status', udid],
    queryFn: () => {
      const url = udid
        ? `${getApiUrl()}/network/proxy/vpn/status?udid=${encodeURIComponent(udid)}`
        : `${getApiUrl()}/network/proxy/vpn/status`;
      return apiFetch<{ running: boolean; error?: string }>(url);
    },
    refetchInterval: 5000,
    staleTime: 1000,
  });
}

export function useStartVpn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ port, udid }: { port?: number; udid?: string }) =>
      apiFetch<{ success: boolean; vpn_mode?: string; tunnel?: string; error?: string }>(
        `${getApiUrl()}/network/proxy/vpn/start`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ port: port || 8080, udid }),
        }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vpn-status'] });
    },
  });
}

export function useStopVpn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ udid }: { udid?: string }) => {
      const params = udid ? `?udid=${encodeURIComponent(udid)}` : '';
      return apiFetch<{ success: boolean; error?: string }>(
        `${getApiUrl()}/network/proxy/vpn/stop${params}`,
        { method: 'POST' }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vpn-status'] });
    },
  });
}

// --- Standalone API functions (for components that don't use TanStack Query) ---

export async function searchHierarchy(
  query: string,
  filter: 'xpath' | 'resource-id' | 'text' | 'content-desc' | 'class',
  udid?: string
): Promise<{ matches: unknown[]; count: number }> {
  const params = new URLSearchParams({ query, filter });
  if (udid) params.set('udid', udid);
  return apiFetch(`${getApiUrl()}/hierarchy/search?${params.toString()}`);
}

export async function inputDeviceText(text: string, udid?: string): Promise<void> {
  await apiFetch<{ success: boolean }>(
    udid ? `${getApiUrl()}/input/text?udid=${encodeURIComponent(udid)}` : `${getApiUrl()}/input/text`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    }
  );
}
