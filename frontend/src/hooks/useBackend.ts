import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

interface BackendStatus {
  status: "starting" | "running" | "stopped" | "error";
  url: string;
}

export function useBackendStatus() {
  const [backendStatus, setBackendStatus] = useState<BackendStatus>({
    status: "starting",
    url: "http://127.0.0.1:8001",
  });

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const status = await invoke<BackendStatus>("get_backend_status");
        if (!cancelled) {
          setBackendStatus(status);
        }
      } catch (e) {
        if (!cancelled) {
          setBackendStatus(prev => ({
            ...prev,
            status: "stopped" as const,
          }));
        }
      }
    }

    // Check immediately
    check();

    // Poll every 3 seconds
    const interval = setInterval(check, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return backendStatus;
}

export async function restartBackend() {
  await invoke("restart_backend");
}