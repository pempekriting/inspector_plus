import { useState, useRef, useCallback } from "react";
import { useThemeStore } from "../stores/themeStore";
import { useCommands, CommandResult } from "../hooks/useCommands";
import { useAdbCommand } from "../services/api";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8001";

// ADB Shell Section
function AdbSection() {
  const { theme } = useThemeStore();
  const { mutateAsync: executeAdb, isPending: isExecuting } = useAdbCommand();
  const isDark = theme === "dark";

  const [command, setCommand] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [output, setOutput] = useState<{ text: string; isError: boolean }[]>([]);
  const [hasRun, setHasRun] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const outputBottomRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !isExecuting) {
      handleExecute();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (history.length === 0) return;
      const newIndex = historyIndex < history.length - 1 ? historyIndex + 1 : historyIndex;
      setHistoryIndex(newIndex);
      setCommand(history[history.length - 1 - newIndex] || "");
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const newIndex = historyIndex > 0 ? historyIndex - 1 : -1;
      setHistoryIndex(newIndex);
      setCommand(newIndex === -1 ? "" : history[history.length - 1 - newIndex] || "");
    }
  }, [history, historyIndex, isExecuting]);

  const handleExecute = async () => {
    const trimmed = command.trim();
    if (!trimmed || isExecuting) return;
    const newHistory = [trimmed, ...history.filter(h => h !== trimmed)].slice(0, 20);
    setHistory(newHistory);
    setHistoryIndex(-1);
    setCommand("");
    setHasRun(true);
    setOutput(prev => [...prev, { text: `> ${trimmed}`, isError: false }]);
    try {
      const result = await executeAdb({ command: trimmed });
      setOutput(prev => [...prev, {
        text: result.error || (result.output || "OK"),
        isError: !!result.error || result.exitCode !== 0,
      }]);
    } catch (err) {
      setOutput(prev => [...prev, {
        text: err instanceof Error ? err.message : "Command failed",
        isError: true,
      }]);
    }
  };

  return (
    <div className="flex flex-col" style={{ minHeight: "160px" }}>
      <div className="flex items-center gap-2 px-3 py-1.5"
        style={{ borderBottom: isDark ? "1px solid #27272a" : "1px solid #e5e5e5" }}>
        <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          style={{ color: isDark ? "#71717a" : "#666666" }}>
          <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
        </svg>
        <span className="text-[10px] font-bold uppercase tracking-wider"
          style={{ color: isDark ? "#71717a" : "#666666" }}>ADB Shell</span>
      </div>
      <div className="flex items-center gap-1.5 px-3 py-2">
        <span className="text-[11px] font-mono flex-shrink-0"
          style={{ color: isDark ? "#00e5cc" : "#0066cc" }}>shell&gt;</span>
        <input
          ref={inputRef}
          type="text"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="e.g. input tap 500 800"
          disabled={isExecuting}
          className="flex-1 px-2 py-1 rounded text-[11px] font-mono disabled:opacity-50"
          style={{
            background: isDark ? "#1f1f23" : "#ffffff",
            color: isDark ? "#e4e4e7" : "#1a1a1a",
            border: isDark ? "1.5px solid #3f3f46" : "1.5px solid #cccccc",
            outline: "none",
          }}
        />
        <button
          onClick={handleExecute}
          disabled={!command.trim() || isExecuting}
          className="px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-all active:scale-95 disabled:opacity-50"
          style={{
            background: (command.trim() && !isExecuting)
              ? (isDark ? "#00e5cc" : "#0066cc")
              : (isDark ? "#3f3f46" : "#e5e5e5"),
            color: (command.trim() && !isExecuting)
              ? (isDark ? "#0a0a0c" : "#ffffff")
              : (isDark ? "#71717a" : "#999999"),
            border: `1.5px solid ${(command.trim() && !isExecuting) ? (isDark ? "#00e5cc" : "#0066cc") : (isDark ? "#3f3f46" : "#e5e5e5")}`,
          }}
        >
          {isExecuting ? "..." : "Run"}
        </button>
        <button onClick={() => { setOutput([]); setHasRun(false); }}
          className="px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-all active:scale-95"
          style={{ background: isDark ? "#1f1f23" : "#f0f0f0", color: isDark ? "#52525b" : "#999999", border: `1.5px solid ${isDark ? "#3f3f46" : "#cccccc"}` }}>
          Clear
        </button>
      </div>
      <div className="flex-1 mx-3 mb-2 rounded p-1.5 overflow-auto"
        style={{ background: isDark ? "#0a0a0c" : "#f5f5f5", border: isDark ? "1px solid #27272a" : "1px solid #e5e5e5", minHeight: "80px", maxHeight: "120px" }}>
        {!hasRun ? (
          <div className="flex items-center justify-center h-full">
            <span className="text-[10px] font-mono" style={{ color: isDark ? "#52525b" : "#cccccc" }}>{'>'}_ Ready</span>
          </div>
        ) : (
          <div className="space-y-0.5">
            {output.map((line, i) => (
              <div key={i} className="text-[10px] font-mono whitespace-pre-wrap break-all"
                style={{ color: line.isError ? (isDark ? "#fb7185" : "#dc2626") : (isDark ? "#e4e4e7" : "#1a1a1a") }}>
                {line.text}
              </div>
            ))}
            <div ref={outputBottomRef} />
          </div>
        )}
      </div>
    </div>
  );
}

// App Commands Section
function AppCommandsSection() {
  const { theme } = useThemeStore();
  const isDark = theme === 'dark';
  const { executeCommand, isExecuting } = useCommands();

  const [packageName, setPackageName] = useState("");
  const [apkFile, setApkFile] = useState<File | null>(null);
  const [result, setResult] = useState<CommandResult | null>(null);

  const handleExecute = async (type: string, params?: Record<string, unknown>) => {
    setResult(null);
    const res = await executeCommand(type, params);
    setResult(res);
  };

  const cmds = [
    { id: "list_apps", name: "List", type: "list_apps", params: {} },
    { id: "check_app", name: "Check", type: "check_app", params: { package: packageName } },
    { id: "launch_app", name: "Launch", type: "launch_app", params: { package: packageName } },
    { id: "uninstall_app", name: "Uninstall", type: "uninstall_app", params: { package: packageName } },
    { id: "install_app", name: "Install", type: "install_app", params: { apk_path: apkFile?.name || "" } },
  ];

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 px-3 py-1.5"
        style={{ borderBottom: isDark ? "1px solid #27272a" : "1px solid #e5e5e5" }}>
        <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          style={{ color: isDark ? "#71717a" : "#666666" }}>
          <rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12" y2="18.01" strokeWidth="3" strokeLinecap="round"/>
        </svg>
        <span className="text-[10px] font-bold uppercase tracking-wider"
          style={{ color: isDark ? "#71717a" : "#666666" }}>App Commands</span>
      </div>

      <div className="flex items-center gap-2 px-3 py-1.5" style={{ borderBottom: isDark ? "1px solid #27272a" : "1px solid #e5e5e5" }}>
        <input
          type="text"
          value={packageName}
          onChange={(e) => setPackageName(e.target.value)}
          placeholder="com.example.app"
          className="flex-1 px-2 py-1 rounded text-[10px] font-mono"
          style={{ background: isDark ? '#1f1f23' : '#ffffff', color: isDark ? '#e4e4e7' : '#1a1a1a', border: isDark ? '1.5px solid #3f3f46' : '1.5px solid #cccccc', outline: 'none' }}
        />
      </div>

      <div className="flex items-center gap-1 px-3 py-1.5 flex-wrap">
        {cmds.map((cmd) => (
          <button
            key={cmd.id}
            onClick={() => handleExecute(cmd.type, cmd.params)}
            disabled={isExecuting || (cmd.type !== "list_apps" && !packageName.trim())}
            className="px-2 py-1 rounded text-[9px] font-bold uppercase tracking-wider transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: isExecuting ? (isDark ? '#3f3f46' : '#e5e5e5') : (isDark ? '#22d3ee' : '#0066cc'),
              color: isExecuting ? (isDark ? '#71717a' : '#999999') : (isDark ? '#0a0a0c' : '#ffffff'),
              border: `1.5px solid ${isExecuting ? (isDark ? '#3f3f46' : '#e5e5e5') : (isDark ? '#22d3ee' : '#0066cc')}`,
            }}
          >
            {cmd.name}
          </button>
        ))}
        <label className="px-2 py-1 rounded text-[9px] font-bold uppercase tracking-wider transition-all cursor-pointer"
          style={{ background: isDark ? '#1f1f23' : '#f0f0f0', color: isDark ? '#a1a1aa' : '#666666', border: `1.5px solid ${isDark ? '#3f3f46' : '#cccccc'}` }}>
          APK
          <input type="file" accept=".apk" onChange={(e) => setApkFile(e.target.files?.[0] || null)} className="hidden" />
        </label>
      </div>

      {result && (
        <div className="mx-3 mb-2 p-2 rounded text-[10px] font-mono whitespace-pre-wrap overflow-auto"
          style={{
            background: isDark ? '#0a0a0c' : '#f5f5f5',
            color: result.success ? (isDark ? '#10b981' : '#047857') : (isDark ? '#fb7185' : '#dc2626'),
            border: `1.5px solid ${result.success ? (isDark ? '#10b981' : '#047857') : (isDark ? '#fb7185' : '#dc2626')}`,
            maxHeight: "80px",
          }}>
          {result.success ? result.output : result.error}
        </div>
      )}
    </div>
  );
}

// Unified Commands Drawer - replaces BottomDrawer tabs
export function CommandsDrawer({ isDark }: { isDark: boolean }) {
  return (
    <div
      className="flex flex-col flex-1 min-h-0 select-none"
      style={{
        background: isDark ? "#111114" : "#ffffff",
        borderTop: isDark ? "3px solid #3f3f46" : "3px solid #1a1a1a",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center px-4 py-2 flex-shrink-0"
        style={{
          background: isDark ? "#18181b" : "#e5e5e5",
          borderBottom: isDark ? "2px solid #27272a" : "2px solid #d4d4d4",
        }}
      >
        <svg className="w-3.5 h-3.5 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          style={{ color: isDark ? "#00e5cc" : "#0066cc" }}>
          <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
        </svg>
        <span className="text-[10px] font-bold uppercase tracking-wider"
          style={{ color: isDark ? "#e4e4e7" : "#1a1a1a" }}>Commands</span>
      </div>

      {/* Unified sections — scrollable */}
      <div className="flex-1 overflow-auto">
        <AdbSection />
        <div style={{ borderTop: isDark ? "1px solid #27272a" : "1px solid #e5e5e5" }} />
        <AppCommandsSection />
      </div>
    </div>
  );
}
