import { useBackendStatus } from "../hooks/useBackend";
import { useThemeStore } from "../stores/themeStore";

function BackendStatusBadge() {
  const { status } = useBackendStatus();

  const statusConfig = {
    starting: { label: "Starting...", color: "#f59e0b" },
    running: { label: "Running", color: "#22c55e" },
    stopped: { label: "Stopped", color: "#ef4444" },
    error: { label: "Error", color: "#ef4444" },
  };

  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.stopped;

  return (
    <div className="flex items-center gap-1">
      <div
        className="w-2 h-2 rounded-full animate-pulse"
        style={{ backgroundColor: config.color }}
      />
      <span style={{ color: config.color }}>{config.label}</span>
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
        <span>v0.0.1</span>
      </div>
    </div>
  );
}