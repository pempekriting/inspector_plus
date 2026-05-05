import { useEffect, useState } from "react";
import { getApiUrl } from "../config/apiConfig";

export async function fetchHierarchy(udid?: string): Promise<unknown> {
  const url = udid ? `${getApiUrl()}/hierarchy?udid=${encodeURIComponent(udid)}` : `${getApiUrl()}/hierarchy`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch hierarchy");
  return res.json();
}

export async function searchHierarchy(
  query: string,
  filter: "xpath" | "resource-id" | "text" | "content-desc" | "class",
  udid?: string
): Promise<{ matches: unknown[]; count: number }> {
  const params = new URLSearchParams({ query, filter });
  if (udid) params.set("udid", udid);
  const url = `${getApiUrl()}/hierarchy/search?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to search hierarchy");
  return res.json();
}

export async function tapDevice(x: number, y: number, udid?: string): Promise<void> {
  const url = udid ? `${getApiUrl()}/tap?udid=${encodeURIComponent(udid)}` : `${getApiUrl()}/tap`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ x, y }),
  });
  if (!res.ok) throw new Error("Failed to tap device");
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

export async function checkDeviceStatus(): Promise<DeviceStatus> {
  const res = await fetch(`${getApiUrl()}/device/status`);
  if (!res.ok) return { connected: false, devices: [], selected: null };
  return res.json();
}

export async function listDevices(): Promise<DeviceInfo[]> {
  const res = await fetch(`${getApiUrl()}/devices`);
  if (!res.ok) throw new Error("Failed to list devices");
  const data = await res.json();
  return data.devices;
}

export async function selectDevice(udid: string | null): Promise<{ udid: string; platform: string }> {
  const res = await fetch(`${getApiUrl()}/device/select`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ udid }),
  });
  if (!res.ok) throw new Error("Failed to select device");
  return res.json();
}

export async function getScreenshot(udid?: string): Promise<string> {
  const url = udid ? `${getApiUrl()}/screenshot?udid=${encodeURIComponent(udid)}` : `${getApiUrl()}/screenshot`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to get screenshot");
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export async function inputDeviceText(text: string, udid?: string): Promise<void> {
  const url = udid ? `${getApiUrl()}/input/text?udid=${encodeURIComponent(udid)}` : `${getApiUrl()}/input/text`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error("Failed to input text");
}

/**
 * Polls device status every `intervalMs` ms.
 * Exposes `isLoading` (true during initial fetch) and `error` state.
 */
export function useDevicePolling(intervalMs = 5000) {
  const [status, setStatus] = useState<DeviceStatus>({
    connected: false,
    devices: [],
    selected: null,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);


  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const result = await checkDeviceStatus();
        if (!cancelled) {
          setStatus(result);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Unknown error");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    poll();
    const id = setInterval(poll, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [intervalMs]);

  return { ...status, isLoading, error };
}