import { useState, useRef, useEffect, useCallback } from "react";
import { useThemeStore } from "../stores/themeStore";
import { useAdbCommand } from "../services/api";

interface OutputLine {
  text: string;
  isError: boolean;
}

const MAX_HISTORY = 20;

export function AdbPanel() {
  const { theme } = useThemeStore();
  const { mutateAsync: executeAdb, isPending: isExecuting } = useAdbCommand();
  const isDark = theme === "dark";

  const [command, setCommand] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [output, setOutput] = useState<OutputLine[]>([]);
  const [hasRun, setHasRun] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const outputBottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll output
  useEffect(() => {
    outputBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [output]);

  // Keep input focused
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

    // Add to history
    const newHistory = [trimmed, ...history.filter(h => h !== trimmed)].slice(0, MAX_HISTORY);
    setHistory(newHistory);
    setHistoryIndex(-1);
    setCommand("");
    setHasRun(true);

    // Add command echo
    setOutput(prev => [...prev, { text: `> ${trimmed}`, isError: false }]);

    try {
      const result = await executeAdb({ command: trimmed });
      if (result.error || result.exitCode !== 0) {
        setOutput(prev => [
          ...prev,
          {
            text: result.error || `Exit code: ${result.exitCode}`,
            isError: true,
          },
        ]);
      } else {
        setOutput(prev => [
          ...prev,
          { text: result.output || "OK", isError: false },
        ]);
      }
    } catch (err) {
      setOutput(prev => [
        ...prev,
        {
          text: err instanceof Error ? err.message : "Command failed",
          isError: true,
        },
      ]);
    }
  };

  const handleClear = () => {
    setOutput([]);
    setHistory([]);
    setHistoryIndex(-1);
    setCommand("");
    setHasRun(false);
  };

  return (
    <div
      className="flex flex-col"
      style={{
        background: isDark ? "#111114" : "#ffffff",
        borderBottom: isDark ? "3px solid #3f3f46" : "3px solid #1a1a1a",
        minHeight: "200px",
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2"
        style={{ borderBottom: isDark ? "2px solid #27272a" : "2px solid #e5e5e5" }}>
        <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{ color: isDark ? "#71717a" : "#666666" }}>
          <polyline points="4 17 10 11 4 5"/>
          <line x1="12" y1="19" x2="20" y2="19"/>
        </svg>
        <span
          className="text-[10px] font-bold uppercase tracking-wider"
          style={{ color: isDark ? "#71717a" : "#666666" }}
        >
          ADB Shell
        </span>
      </div>

      {/* Input area */}
      <div className="px-4 py-3 space-y-2">
        <div className="flex items-center gap-2">
          <span
            className="text-[11px] font-mono flex-shrink-0"
            style={{ color: isDark ? "#00e5cc" : "#0066cc" }}
          >
            shell&gt;
          </span>
          <input
            ref={inputRef}
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="e.g. input tap 500 800"
            disabled={isExecuting}
            className="flex-1 px-2 py-1.5 rounded text-[11px] font-mono disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: isDark ? "#1f1f23" : "#ffffff",
              color: isDark ? "#e4e4e7" : "#1a1a1a",
              border: isDark ? "2px solid #3f3f46" : "2px solid #cccccc",
              outline: "none",
            }}
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExecute}
            disabled={!command.trim() || isExecuting}
            className="px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: (command.trim() && !isExecuting)
                ? (isDark ? "#00e5cc" : "#0066cc")
                : (isDark ? "#3f3f46" : "#e5e5e5"),
              color: (command.trim() && !isExecuting)
                ? (isDark ? "#0a0a0c" : "#ffffff")
                : (isDark ? "#71717a" : "#999999"),
              border: `2px solid ${(command.trim() && !isExecuting) ? (isDark ? "#00e5cc" : "#0066cc") : (isDark ? "#3f3f46" : "#e5e5e5")}`,
            }}
          >
            {isExecuting ? "Running..." : "Execute"}
          </button>
          <button
            onClick={handleClear}
            className="px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider transition-all active:scale-95"
            style={{
              background: isDark ? "#1f1f23" : "#f0f0f0",
              color: isDark ? "#71717a" : "#666666",
              border: `2px solid ${isDark ? "#3f3f46" : "#cccccc"}`,
            }}
          >
            Clear
          </button>
        </div>
      </div>

      {/* Output area */}
      <div
        className="flex-1 mx-4 mb-3 rounded p-2 overflow-auto"
        style={{
          background: isDark ? "#0a0a0c" : "#f5f5f5",
          border: isDark ? "2px solid #27272a" : "2px solid #e5e5e5",
          minHeight: "120px",
          maxHeight: "200px",
        }}
      >
        {!hasRun ? (
          <div
            className="flex items-center justify-center h-full"
            style={{ color: isDark ? "#52525b" : "#999999" }}
          >
            <span className="text-[11px] font-mono">&gt;_ Ready</span>
          </div>
        ) : (
          <div className="space-y-0.5">
            {output.map((line, i) => (
              <div
                key={i}
                className="text-[11px] font-mono whitespace-pre-wrap break-all"
                style={{ color: line.isError ? (isDark ? "#fb7185" : "#dc2626") : (isDark ? "#e4e4e7" : "#1a1a1a") }}
              >
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
