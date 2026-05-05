import { useState, useEffect } from "react";
import { useSettingsStore } from "../stores/settingsStore";
import { useThemeStore } from "../stores/themeStore";
import { useQueryClient } from "@tanstack/react-query";

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsPanel({ isOpen, onClose }: SettingsPanelProps) {
  const { theme } = useThemeStore();
  const isDark = theme === "dark";
  const { backendUrl, mcpUrl, setBackendUrl, setMcpUrl, resetSettings } = useSettingsStore();
  const queryClient = useQueryClient();

  const [editedBackend, setEditedBackend] = useState(backendUrl);
  const [editedMcp, setEditedMcp] = useState(mcpUrl);
  const [verifyStatus, setVerifyStatus] = useState<{ be: "idle" | "testing" | "ok" | "fail"; mcp: "idle" | "testing" | "ok" | "fail" }>({ be: "idle", mcp: "idle" });
  const [detectedPort, setDetectedPort] = useState<number | null>(null);
  const [scanProgress, setScanProgress] = useState(0);
  const [isRestarting, setIsRestarting] = useState(false);
  const [restartError, setRestartError] = useState<string | null>(null);

  const accentColor = isDark ? "#00e5cc" : "#0066cc";
  const accentBg = isDark ? "rgba(0,229,204,0.12)" : "rgba(0,102,204,0.08)";
  const dangerColor = isDark ? "#fb7185" : "#dc2626";
  const successColor = isDark ? "#10b981" : "#047857";
  const mcpAccent = isDark ? "#a78bfa" : "#7c3aed";

  const bg = isDark ? "#111114" : "#ffffff";
  const bgHeader = isDark ? "#18181b" : "#e5e5e5";
  const bgSubtle = isDark ? "#0f0f12" : "#f5f5f5";
  const border = isDark ? "#3f3f46" : "#1a1a1a";
  const text = isDark ? "#e4e4e7" : "#1a1a1a";
  const textMuted = isDark ? "#71717a" : "#999999";
  const textDim = isDark ? "#52525b" : "#999999";

  useEffect(() => {
    if (isOpen) {
      setEditedBackend(backendUrl);
      setEditedMcp(mcpUrl);
      setVerifyStatus({ be: "idle", mcp: "idle" });
      setDetectedPort(null);
      setScanProgress(0);
      setIsRestarting(false);
      setRestartError(null);
    }
  }, [isOpen, backendUrl, mcpUrl]);

  const extractPort = (url: string): number => {
    const match = url.match(/:(\d+)/);
    return match ? parseInt(match[1], 10) : 8001;
  };

  const isTauriAvailable = () => typeof window !== "undefined" && !!window.__TAURI__;

  const handleSave = async () => {
    const backendPort = extractPort(editedBackend);
    const mcpPort = extractPort(editedMcp);

    if (!isTauriAvailable()) {
      setBackendUrl(editedBackend);
      setMcpUrl(editedMcp);
      queryClient.invalidateQueries();
      onClose();
      return;
    }

    const tauri = window.__TAURI__!;
    setIsRestarting(true);
    setRestartError(null);

    try {
      let backendRunning = false;
      let mcpRunning = false;

      try {
        const backendStatus = await tauri.core.invoke<{ status: string }>("get_backend_status");
        backendRunning = backendStatus.status === "running";
      } catch {}

      try {
        const mcpStatus = await tauri.core.invoke<{ status: string }>("get_mcp_status");
        mcpRunning = mcpStatus.status === "running";
      } catch {}

      if (backendRunning) {
        await tauri.core.invoke("restart_backend", { port: backendPort });
      } else {
        await tauri.core.invoke("start_backend", { port: backendPort });
      }

      if (mcpRunning) {
        await tauri.core.invoke("restart_mcp", { port: mcpPort });
      } else {
        await tauri.core.invoke("start_mcp", { port: mcpPort });
      }

      setBackendUrl(editedBackend);
      setMcpUrl(editedMcp);
      queryClient.invalidateQueries();
      onClose();
    } catch (error) {
      setRestartError(String(error));
    } finally {
      setIsRestarting(false);
    }
  };

  const handleReset = () => {
    resetSettings();
    setEditedBackend("http://localhost:8001");
    setEditedMcp("http://localhost:8002");
    setVerifyStatus({ be: "idle", mcp: "idle" });
    setDetectedPort(null);
    queryClient.invalidateQueries();
  };

  const handleVerifyBoth = async () => {
    setVerifyStatus({ be: "testing", mcp: "testing" });
    setDetectedPort(null);

    try {
      const res = await fetch(`${editedBackend}/health`, {
        method: "GET",
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.version && !data.service) {
          setVerifyStatus(prev => ({ ...prev, be: "ok", detectedPort: data.port ?? null }));
          setDetectedPort(data.port ?? null);
        } else {
          setVerifyStatus(prev => ({ ...prev, be: "fail" }));
        }
      } else {
        setVerifyStatus(prev => ({ ...prev, be: "fail" }));
      }
    } catch {
      setVerifyStatus(prev => ({ ...prev, be: "fail" }));
    }

    try {
      const res = await fetch(`${editedMcp}/health`, {
        method: "GET",
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.service) {
          setVerifyStatus(prev => ({ ...prev, mcp: "ok" }));
        } else {
          setVerifyStatus(prev => ({ ...prev, mcp: "fail" }));
        }
      } else {
        setVerifyStatus(prev => ({ ...prev, mcp: "fail" }));
      }
    } catch {
      setVerifyStatus(prev => ({ ...prev, mcp: "fail" }));
    }
  };

  const handleScanBoth = async () => {
    setVerifyStatus({ be: "testing", mcp: "testing" });
    setDetectedPort(null);
    setScanProgress(0);

    let bePort: number | null = null;
    let mcpPort: number | null = null;

    for (let port = 8001; port < 8100; port++) {
      setScanProgress(((port - 8001) / 99) * 100);
      try {
        const res = await fetch(`http://127.0.0.1:${port}/health`, {
          method: "GET",
          signal: AbortSignal.timeout(150),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.version && !data.service) {
            bePort = data.port ?? port;
            setDetectedPort(data.port ?? port);
            setEditedBackend(`http://localhost:${port}`);
            setVerifyStatus(prev => ({ ...prev, be: "ok" }));
            break;
          }
        }
      } catch {}
    }

    for (let port = 8002; port < 8100; port++) {
      if (port === bePort) continue;
      setScanProgress(((port - 8001) / 99) * 100);
      try {
        const res = await fetch(`http://127.0.0.1:${port}/health`, {
          method: "GET",
          signal: AbortSignal.timeout(150),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.service) {
            mcpPort = port;
            setEditedMcp(`http://localhost:${port}`);
            setVerifyStatus(prev => ({ ...prev, mcp: "ok" }));
            break;
          }
        }
      } catch {}
    }

    if (!bePort) setVerifyStatus(prev => ({ ...prev, be: "fail" }));
    if (!mcpPort) setVerifyStatus(prev => ({ ...prev, mcp: "fail" }));
    setScanProgress(100);
  };

  if (!isOpen) return null;

  const beStatus = verifyStatus.be;
  const mcpStatus = verifyStatus.mcp;
  const isVerifying = beStatus === "testing" || mcpStatus === "testing";
  const isScanning = beStatus === "testing" || mcpStatus === "testing";
  const verifyAllOk = beStatus === "ok" && mcpStatus === "ok";
  const verifyAnyFail = beStatus === "fail" || mcpStatus === "fail";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-[480px] rounded-xl overflow-hidden"
        style={{
          background: bg,
          border: `3px solid ${border}`,
          boxShadow: isDark ? "8px 8px 0 #000, 0 0 40px rgba(0,229,204,0.05)" : "8px 8px 0 #1a1a1a",
          fontFamily: '"Satoshi", sans-serif',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center px-5 py-3"
          style={{
            background: bgHeader,
            borderBottom: `3px solid ${border}`,
          }}
        >
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center"
            style={{
              background: accentBg,
              border: `2px solid ${accentColor}`,
              boxShadow: `3px 3px 0 ${isDark ? "#000" : "#1a1a1a"}`,
            }}
          >
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke={accentColor}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 6h16M4 12h16M4 18h7" />
              <circle cx="17" cy="18" r="3" fill={accentColor} stroke="none" />
              <circle cx="17" cy="18" r="1.5" fill={isDark ? "#111114" : "#ffffff"} stroke="none" />
            </svg>
          </div>
          <div className="ml-3">
            <span className="text-[13px] font-black tracking-tight" style={{ color: text }}>
              Connection Settings
            </span>
            <p className="text-[9px] font-medium leading-none mt-0.5" style={{ color: textMuted }}>
              Configure server endpoints
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-auto w-8 h-8 rounded-lg flex items-center justify-center transition-all active:scale-95"
            style={{
              background: "transparent",
              border: `2px solid ${border}`,
              color: textMuted,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = isDark ? "#27272a" : "#f0f0f0";
              e.currentTarget.style.color = text;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = textMuted;
            }}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5">
          {/* Backend API */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div
                className="w-4 h-4 rounded flex items-center justify-center"
                style={{ background: accentColor }}
              >
                <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="#0a0a0c" strokeWidth="3">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
              </div>
              <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: textMuted }}>
                Backend API
              </span>
              {beStatus === "ok" && detectedPort && (
                <span
                  className="ml-auto px-2 py-px rounded text-[8px] font-black uppercase"
                  style={{
                    background: isDark ? "rgba(16,185,129,0.15)" : "#f0fdf4",
                    color: successColor,
                    border: `1.5px solid ${successColor}`,
                  }}
                >
                  Port {detectedPort}
                </span>
              )}
            </div>
            <input
              type="text"
              value={editedBackend}
              onChange={(e) => setEditedBackend(e.target.value)}
              placeholder="http://localhost:8001"
              className="w-full px-4 py-3 rounded-lg text-[11px] font-mono font-medium"
              style={{
                background: isDark ? "#1f1f23" : "#ffffff",
                color: text,
                border: `2px solid ${beStatus === "ok" ? successColor : border}`,
                outline: "none",
                boxShadow: isDark ? "3px 3px 0 #000" : "3px 3px 0 #e5e5e5",
              }}
            />
          </div>

          {/* MCP Server */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div
                className="w-4 h-4 rounded flex items-center justify-center"
                style={{ background: mcpAccent }}
              >
                <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
              </div>
              <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: textMuted }}>
                MCP Server
              </span>
            </div>
            <input
              type="text"
              value={editedMcp}
              onChange={(e) => setEditedMcp(e.target.value)}
              placeholder="http://localhost:8002"
              className="w-full px-4 py-3 rounded-lg text-[11px] font-mono font-medium"
              style={{
                background: isDark ? "#1f1f23" : "#ffffff",
                color: text,
                border: `2px solid ${mcpStatus === "ok" ? mcpAccent : border}`,
                outline: "none",
                boxShadow: isDark ? "3px 3px 0 #000" : "3px 3px 0 #e5e5e5",
              }}
            />
            <p className="text-[9px] leading-relaxed" style={{ color: textDim }}>
              Used by AI coding tools (Claude Code) to consume the MCP protocol
            </p>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3 -my-1">
            <div className="flex-1 h-px" style={{ background: isDark ? "#27272a" : "#e5e5e5" }} />
            <span className="text-[8px] font-bold uppercase" style={{ color: textDim }}>
              Actions
            </span>
            <div className="flex-1 h-px" style={{ background: isDark ? "#27272a" : "#e5e5e5" }} />
          </div>

          {/* Action buttons */}
          <div
            className="grid grid-cols-2 gap-2"
            style={{ marginTop: (beStatus === "idle" && mcpStatus === "idle") ? "0" : "1.25rem" }}
          >
            <button
              onClick={handleVerifyBoth}
              disabled={isVerifying}
              className="flex items-center justify-center gap-2 px-3 py-3 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all active:scale-[0.98] disabled:opacity-60"
              style={{
                background: verifyAllOk ? successColor : accentColor,
                color: "#0a0a0c",
                border: `2px solid ${verifyAllOk ? successColor : "transparent"}`,
                boxShadow: `3px 3px 0 ${isDark ? "#000" : "#1a1a1a"}`,
              }}
            >
              {isVerifying ? (
                <span className="flex items-center gap-1">
                  <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  ...
                </span>
              ) : verifyAllOk ? (
                "Verified"
              ) : (
                "Verify"
              )}
            </button>
            <button
              onClick={handleScanBoth}
              disabled={isScanning}
              className="flex items-center justify-center gap-2 px-3 py-3 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all active:scale-[0.98] disabled:opacity-60"
              style={{
                background: isDark ? "#1f1f23" : "#ffffff",
                color: verifyAllOk ? successColor : accentColor,
                border: `2px solid ${verifyAllOk ? successColor : accentColor}`,
                boxShadow: `3px 3px 0 ${isDark ? "#000" : "#1a1a1a"}`,
              }}
            >
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
              {isScanning ? "Scanning..." : "Scan"}
            </button>
          </div>

          {/* Scan progress bar */}
          {isScanning && scanProgress > 0 && (
            <div className="relative h-1.5 rounded-full overflow-hidden" style={{ background: isDark ? "#27272a" : "#e5e5e5" }}>
              <div
                className="absolute left-0 top-0 h-full rounded-full transition-all duration-150"
                style={{ width: `${scanProgress}%`, background: accentColor }}
              />
            </div>
          )}

          {/* Error */}
          {verifyAnyFail && (
            <div
              className="flex items-start gap-2 px-3 py-2.5 rounded-lg text-[10px] font-medium"
              style={{
                background: isDark ? "rgba(248,113,113,0.12)" : "#fef2f2",
                color: dangerColor,
                border: `2px solid ${dangerColor}`,
              }}
            >
              <svg className="w-4 h-4 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
              <span>
                {beStatus === "fail" && mcpStatus === "fail"
                  ? "Both servers offline — check if backend and MCP are running"
                  : beStatus === "fail"
                  ? "Backend offline — check if backend is running"
                  : "MCP offline — check if MCP server is running"}
              </span>
            </div>
          )}

          {restartError && (
            <div
              className="flex items-start gap-2 px-3 py-2.5 rounded-lg text-[10px] font-medium"
              style={{
                background: isDark ? "rgba(248,113,113,0.12)" : "#fef2f2",
                color: dangerColor,
                border: `2px solid ${dangerColor}`,
              }}
            >
              <svg className="w-4 h-4 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
              <span>Restart failed: {restartError}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{
            background: bgSubtle,
            borderTop: `3px solid ${border}`,
          }}
        >
          <button
            onClick={handleReset}
            className="px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all active:scale-95"
            style={{
              background: "transparent",
              color: textDim,
              border: `2px solid ${isDark ? "#27272a" : "#e5e5e5"}`,
            }}
          >
            Reset Defaults
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={isRestarting}
              className="px-5 py-2 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all active:scale-95 disabled:opacity-60"
              style={{
                background: isDark ? "#27272a" : "#e5e5e5",
                color: textMuted,
                border: `2px solid ${border}`,
                boxShadow: `2px 2px 0 ${isDark ? "#000" : "#e5e5e5"}`,
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isRestarting}
              className="px-5 py-2 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all active:scale-95 disabled:opacity-60"
              style={{
                background: isRestarting ? (isDark ? "#52525b" : "#999999") : accentColor,
                color: "#0a0a0c",
                border: `2px solid ${isRestarting ? "transparent" : accentColor}`,
                boxShadow: `3px 3px 0 ${isDark ? "#000" : "#1a1a1a"}`,
              }}
            >
              {isRestarting ? (
                <span className="flex items-center gap-1">
                  <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Restarting...
                </span>
              ) : (
                "Apply"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
