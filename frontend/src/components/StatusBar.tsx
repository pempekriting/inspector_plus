import { useState } from "react";
import { useBackendStatus, restartBackend } from "../hooks/useBackend";
import { useThemeStore } from "../stores/themeStore";

function BackendStatusBadge() {
  const { status } = useBackendStatus();
  const [isRestarting, setIsRestarting] = useState(false);

  const statusConfig = {
    starting: { label: "Starting...", color: "#f59e0b" },
    running: { label: "Running", color: "#22c55e" },
    stopped: { label: "Stopped", color: "#ef4444" },
    error: { label: "Error", color: "#ef4444" },
  };

  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.stopped;

  const handleRestart = async () => {
    setIsRestarting(true);
    try {
      await restartBackend();
    } finally {
      setIsRestarting(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1">
        <div
          className="w-2 h-2 rounded-full animate-pulse"
          style={{ backgroundColor: config.color }}
        />
        <span style={{ color: config.color }}>{config.label}</span>
      </div>
      {(status === "stopped" || status === "error") && (
        <button
          onClick={handleRestart}
          disabled={isRestarting}
          className="px-2 py-1 rounded text-[9px] font-bold uppercase transition-transform active:scale-95 disabled:opacity-50"
          style={{
            background: "#1f1f23",
            border: "1.5px solid #3f3f46",
            color: "#e4e4e7",
          }}
        >
          {isRestarting ? "..." : "Restart"}
        </button>
      )}
    </div>
  );
}

export function StatusBar() {
  const { theme } = useThemeStore();
  const isDark = theme === 'dark';

  return (
    <div
      className="px-4 py-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider"
      style={{
        background: isDark ? '#18181b' : '#e5e5e5',
        borderTop: isDark ? '3px solid #3f3f46' : '3px solid #1a1a1a',
        color: isDark ? '#71717a' : '#666666',
      }}
    >
      <div className="flex items-center gap-4">
        <BackendStatusBadge />
      </div>
      <div className="flex items-center gap-4">
        <span>v1.1.0</span>
      </div>
    </div>
  );
}