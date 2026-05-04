import { useState, useCallback, useMemo } from "react";
import { useThemeStore } from "../stores/themeStore";
import { useCommands, CommandResult } from "../hooks/useCommands";
import { useAdbCommand, useGestureExecute, useExecuteScript, useInstalledPackages, useAppInfo } from "../services/api";
import { useDeviceStore } from "../stores/deviceStore";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8001";

type Platform = "android" | "ios" | "both";

interface GestureAction {
  type: 'move' | 'pointerDown' | 'pointerUp' | 'pause';
  x?: number;
  y?: number;
  duration?: number;
  pointer?: number;
  button?: string;
}

// Quick Action Button Component
function QuickAction({ icon, label, onClick, disabled, active, color }: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  color?: string;
}) {
  const { theme } = useThemeStore();
  const isDark = theme === 'dark';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center justify-center gap-1 p-2.5 rounded-xl transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed min-w-[72px]"
      style={{
        background: active
          ? (isDark ? 'rgba(0,229,204,0.15)' : 'rgba(0,102,204,0.1)')
          : (isDark ? '#1f1f23' : '#ffffff'),
        border: `1.5px solid ${active
          ? (color || (isDark ? '#00e5cc' : 'var(--accent-blue, #1d4ed8)'))
          : (isDark ? '#3f3f46' : '#e5e5e5')}`,
      }}
    >
      <div style={{ color: color || (isDark ? '#00e5cc' : 'var(--accent-blue, #1d4ed8)') }}>{icon}</div>
      <span className="text-[9px] font-semibold uppercase tracking-wide"
        style={{ color: isDark ? '#a1a1aa' : '#666666' }}>{label}</span>
    </button>
  );
}

// Result Display Component
function ResultDisplay({ result }: { result: CommandResult | null }) {
  const { theme } = useThemeStore();
  const isDark = theme === 'dark';
  const [viewMode, setViewMode] = useState<'raw' | 'table'>('raw');
  const [filterText, setFilterText] = useState("");

  const parsed = useMemo(() => {
    if (!result?.output) return null;
    try {
      const json = JSON.parse(result.output);
      if (Array.isArray(json)) return json;
      if (typeof json === 'object' && json !== null) return [json];
      return null;
    } catch {
      return null;
    }
  }, [result?.output]);

  const columns = parsed && parsed.length > 0 ? Object.keys(parsed[0]) : [];

  const filteredData = useMemo(() => {
    if (!parsed || !filterText) return parsed || [];
    return parsed.filter(row =>
      columns.some(col => String(row[col]).toLowerCase().includes(filterText.toLowerCase()))
    );
  }, [parsed, filterText, columns]);

  if (!result) return null;

  return (
    <div className="rounded-xl overflow-hidden"
      style={{ background: isDark ? '#18181b' : '#ffffff', border: isDark ? '1.5px solid #3f3f46' : '1.5px solid #e5e5e5' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2"
        style={{ background: isDark ? '#0f0f12' : '#f5f5f5', borderBottom: isDark ? '1px solid #27272a' : '1px solid #e5e5e5' }}>
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded-full text-[8px] font-bold uppercase"
            style={{
              background: result.success ? (isDark ? '#10b981' : '#047857') : (isDark ? '#fb7185' : '#dc2626'),
              color: '#ffffff'
            }}>
            {result.success ? 'OK' : 'ERR'}
          </span>
          <span className="text-[10px] font-medium" style={{ color: isDark ? '#71717a' : '#666666' }}>
            {parsed ? `${parsed.length} items` : 'Output'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {parsed && (
            <div className="flex rounded-lg overflow-hidden" style={{ border: isDark ? '1px solid #3f3f46' : '1px solid #e5e5e5' }}>
              <button onClick={() => setViewMode('raw')}
                className="px-2 py-0.5 text-[9px] font-bold uppercase transition-colors"
                style={{
                  background: viewMode === 'raw' ? (isDark ? '#00e5cc' : 'var(--accent-blue, #1d4ed8)') : 'transparent',
                  color: viewMode === 'raw' ? '#0a0a0c' : (isDark ? '#71717a' : '#666666'),
                }}>
                Raw
              </button>
              <button onClick={() => setViewMode('table')}
                className="px-2 py-0.5 text-[9px] font-bold uppercase transition-colors"
                style={{
                  background: viewMode === 'table' ? (isDark ? '#00e5cc' : 'var(--accent-blue, #1d4ed8)') : 'transparent',
                  color: viewMode === 'table' ? '#0a0a0c' : (isDark ? '#71717a' : '#666666'),
                }}>
                Table
              </button>
            </div>
          )}
          <button onClick={() => navigator.clipboard.writeText(result.success ? result.output : result.error || '')}
            className="p-1.5 rounded-lg transition-colors"
            style={{ background: 'transparent', color: isDark ? '#71717a' : '#666666' }}>
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="max-h-[180px] overflow-auto">
        {!result.success ? (
          <div className="p-3 text-[11px] font-mono" style={{ background: isDark ? 'rgba(251,113,133,0.1)' : '#fef2f2', color: isDark ? '#fb7185' : '#dc2626' }}>
            {result.error}
          </div>
        ) : viewMode === 'raw' || !parsed ? (
          <pre className="p-3 text-[11px] font-mono whitespace-pre-wrap" style={{ color: isDark ? '#e4e4e7' : '#1a1a1a' }}>
            {result.output}
          </pre>
        ) : (
          <div className="p-2">
            <input type="text" value={filterText} onChange={(e) => setFilterText(e.target.value)}
              placeholder="Filter..."
              className="w-full px-2 py-1 rounded-lg text-[10px] mb-2"
              style={{ background: isDark ? '#1f1f23' : '#ffffff', color: isDark ? '#e4e4e7' : '#1a1a1a', border: isDark ? '1px solid #3f3f46' : '1px solid #e5e5e5' }} />
            <div className="overflow-x-auto">
              <table className="w-full text-[10px]">
                <thead>
                  <tr style={{ background: isDark ? '#0f0f12' : '#f5f5f5' }}>
                    {columns.map(col => (
                      <th key={col} className="px-2 py-1 text-left font-bold"
                        style={{ color: isDark ? '#e4e4e7' : '#1a1a1a', borderBottom: isDark ? '1px solid #3f3f46' : '1px solid #e5e5e5' }}>
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredData.map((row, idx) => (
                    <tr key={idx}
                      style={{ background: idx % 2 === 0 ? 'transparent' : (isDark ? 'rgba(255,255,255,0.02)' : '#fafafa'), borderBottom: isDark ? '1px solid #27272a' : '1px solid #f0f0f0' }}>
                      {columns.map(col => (
                        <td key={col} className="px-2 py-1 font-mono truncate max-w-[120px]"
                          style={{ color: isDark ? '#a1a1aa' : '#666666' }}
                          title={String(row[col] ?? '')}>
                          {row[col] === null ? <span style={{ color: isDark ? '#52525b' : '#999999' }}>null</span>
                            : typeof row[col] === 'object' ? JSON.stringify(row[col])
                            : String(row[col])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredData.length !== parsed.length && (
              <p className="text-[9px] mt-1" style={{ color: isDark ? '#71717a' : '#666666' }}>
                Showing {filteredData.length} of {parsed.length}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ADB Shell Component
function AdbSection({ onResult }: { onResult: (r: CommandResult | null) => void }) {
  const { theme } = useThemeStore();
  const isDark = theme === 'dark';
  const { mutateAsync: executeAdb, isPending: isExecuting } = useAdbCommand();
  const [command, setCommand] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [output, setOutput] = useState<{ text: string; isError: boolean }[]>([]);
  const [hasRun, setHasRun] = useState(false);

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
      const isError = !!result.error || result.exitCode !== 0;
      setOutput(prev => [...prev, {
        text: result.error || (result.output || "OK"),
        isError,
      }]);
      onResult({ success: !isError, output: result.output || "", error: result.error || undefined });
    } catch (err) {
      setOutput(prev => [...prev, {
        text: err instanceof Error ? err.message : "Command failed",
        isError: true,
      }]);
      onResult({ success: false, output: "", error: err instanceof Error ? err.message : "Command failed" });
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-mono font-bold flex-shrink-0"
          style={{ color: isDark ? "var(--accent-cyan, #00e5cc)" : "var(--accent-blue, #1d4ed8)" }}>shell&gt;</span>
        <input
          type="text"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="e.g. pm list packages"
          disabled={isExecuting}
          className="flex-1 px-3 py-2 rounded-xl text-[11px] font-mono disabled:opacity-50"
          style={{
            background: isDark ? "#1f1f23" : "#ffffff",
            color: isDark ? "#e4e4e7" : "#1a1a1a",
            border: isDark ? "1.5px solid #3f3f46" : "1.5px solid #e5e5e5",
            outline: "none",
          }}
        />
        <button
          onClick={handleExecute}
          disabled={!command.trim() || isExecuting}
          className="px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all active:scale-95 disabled:opacity-50"
          style={{
            background: (command.trim() && !isExecuting)
              ? (isDark ? "var(--accent-cyan, #00e5cc)" : "var(--accent-blue, #1d4ed8)")
              : (isDark ? "#3f3f46" : "#e5e5e5"),
            color: (command.trim() && !isExecuting)
              ? (isDark ? "#0a0a0c" : "#ffffff")
              : (isDark ? "#71717a" : "#999999"),
          }}
        >
          {isExecuting ? "..." : "Run"}
        </button>
      </div>
      <div className="rounded-xl p-3 overflow-auto"
        style={{
          background: isDark ? "#0a0a0c" : "#f8f8f8",
          border: isDark ? "1px solid #27272a" : "1px solid #e5e5e5",
          minHeight: "100px",
          maxHeight: "150px"
        }}>
        {!hasRun ? (
          <div className="flex items-center justify-center h-full">
            <span className="text-[11px] font-mono" style={{ color: isDark ? "#52525b" : "#cccccc" }}>{'>'}_ Type a command above</span>
          </div>
        ) : (
          <div className="space-y-0.5">
            {output.map((line, i) => (
              <div key={i} className="text-[11px] font-mono whitespace-pre-wrap break-all"
                style={{ color: line.isError ? (isDark ? "#fb7185" : "#dc2626") : (isDark ? "#a1a1aa" : "#666666") }}>
                {line.text}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Gesture Builder Component
function GestureBuilder({ onClose }: { onClose: () => void }) {
  const { theme } = useThemeStore();
  const isDark = theme === 'dark';
  const executeGesture = useGestureExecute();
  const { selectedDevice } = useDeviceStore();
  const [gestureActions, setGestureActions] = useState<GestureAction[]>([]);
  const [coordinateMode, setCoordinateMode] = useState<'absolute' | 'relative'>('absolute');
  const [result, setResult] = useState<{ success: boolean; message?: string } | null>(null);

  const addAction = (type: GestureAction['type']) => {
    const action: GestureAction = { type };
    if (type === 'move' || type === 'pointerDown') {
      action.x = 0; action.y = 0; action.pointer = 0;
    }
    if (type === 'move') action.duration = 100;
    if (type === 'pointerDown' || type === 'pointerUp') action.button = 'left';
    if (type === 'pause') action.duration = 100;
    setGestureActions([...gestureActions, action]);
  };

  const updateAction = (index: number, updates: Partial<GestureAction>) => {
    setGestureActions(gestureActions.map((a, i) => i === index ? { ...a, ...updates } : a));
  };

  const handleExecute = async () => {
    if (gestureActions.length === 0) return;
    try {
      const res = await executeGesture.mutateAsync({
        actions: gestureActions,
        coordinateMode,
        udid: selectedDevice || undefined,
      });
      setResult({ success: true, message: res.message || 'Gesture executed successfully' });
    } catch (err) {
      setResult({ success: false, message: err instanceof Error ? err.message : 'Failed' });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            style={{ color: isDark ? "#00e5cc" : "#0066cc" }}>
            <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/>
            <path d="m9 12 2 2 4-4"/>
          </svg>
          <span className="text-[11px] font-bold" style={{ color: isDark ? "#e4e4e7" : "#1a1a1a" }}>
            Multi-Pointer Gesture Builder
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg overflow-hidden" style={{ border: isDark ? '1px solid #3f3f46' : '1px solid #e5e5e5' }}>
            <button onClick={() => setCoordinateMode('absolute')}
              className="px-2 py-0.5 text-[9px] font-bold uppercase"
              style={{
                background: coordinateMode === 'absolute' ? (isDark ? '#00e5cc' : 'var(--accent-blue, #1d4ed8)') : 'transparent',
                color: coordinateMode === 'absolute' ? '#0a0a0c' : (isDark ? '#71717a' : '#666666'),
              }}>
              PX
            </button>
            <button onClick={() => setCoordinateMode('relative')}
              className="px-2 py-0.5 text-[9px] font-bold uppercase"
              style={{
                background: coordinateMode === 'relative' ? (isDark ? '#00e5cc' : 'var(--accent-blue, #1d4ed8)') : 'transparent',
                color: coordinateMode === 'relative' ? '#0a0a0c' : (isDark ? '#71717a' : '#666666'),
              }}>
              %
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(['move', 'pointerDown', 'pointerUp', 'pause'] as const).map(type => (
          <button key={type} onClick={() => addAction(type)}
            className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all hover:opacity-80"
            style={{ background: isDark ? '#1f1f23' : '#ffffff', color: isDark ? '#e4e4e7' : '#1a1a1a', border: `1px solid ${isDark ? '#3f3f46' : '#e5e5e5'}` }}>
            + {type}
          </button>
        ))}
      </div>

      <div className="space-y-1.5 max-h-[120px] overflow-auto">
        {gestureActions.length === 0 ? (
          <p className="text-[10px] text-center py-2" style={{ color: isDark ? '#71717a' : '#666666' }}>
            Add actions to build a gesture sequence
          </p>
        ) : gestureActions.map((action, idx) => (
          <div key={idx} className="flex items-center gap-2 p-2 rounded-lg"
            style={{ background: isDark ? '#0f0f12' : '#f5f5f5', border: isDark ? '1px solid #27272a' : '1px solid #e5e5e5' }}>
            <span className="text-[9px] font-bold uppercase w-20" style={{ color: isDark ? '#00e5cc' : 'var(--accent-blue, #1d4ed8)' }}>
              #{idx + 1} {action.type}
            </span>
            {(action.type === 'move' || action.type === 'pointerDown') && (
              <>
                <span className="text-[9px]" style={{ color: isDark ? '#71717a' : '#666666' }}>X:</span>
                <input type="number" value={action.x ?? 0} onChange={(e) => updateAction(idx, { x: parseInt(e.target.value) || 0 })}
                  className="w-16 px-1.5 py-0.5 rounded text-[10px] font-mono"
                  style={{ background: isDark ? '#1f1f23' : '#ffffff', color: isDark ? '#e4e4e7' : '#1a1a1a', border: `1px solid ${isDark ? '#3f3f46' : '#e5e5e5'}` }} />
                <span className="text-[9px]" style={{ color: isDark ? '#71717a' : '#666666' }}>Y:</span>
                <input type="number" value={action.y ?? 0} onChange={(e) => updateAction(idx, { y: parseInt(e.target.value) || 0 })}
                  className="w-16 px-1.5 py-0.5 rounded text-[10px] font-mono"
                  style={{ background: isDark ? '#1f1f23' : '#ffffff', color: isDark ? '#e4e4e7' : '#1a1a1a', border: `1px solid ${isDark ? '#3f3f46' : '#e5e5e5'}` }} />
              </>
            )}
            {(action.type === 'move' || action.type === 'pause') && (
              <>
                <span className="text-[9px]" style={{ color: isDark ? '#71717a' : '#666666' }}>dur:</span>
                <input type="number" value={action.duration ?? 100} onChange={(e) => updateAction(idx, { duration: parseInt(e.target.value) || 0 })}
                  className="w-14 px-1.5 py-0.5 rounded text-[10px] font-mono"
                  style={{ background: isDark ? '#1f1f23' : '#ffffff', color: isDark ? '#e4e4e7' : '#1a1a1a', border: `1px solid ${isDark ? '#3f3f46' : '#e5e5e5'}` }} />
              </>
            )}
            <button onClick={() => setGestureActions(gestureActions.filter((_, i) => i !== idx))}
              className="ml-auto p-1 rounded"
              style={{ color: isDark ? '#fb7185' : '#dc2626' }}>
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        ))}
      </div>

      <button onClick={handleExecute} disabled={gestureActions.length === 0 || executeGesture.isPending}
        className="w-full py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all active:scale-98 disabled:opacity-50"
        style={{
          background: gestureActions.length === 0 ? (isDark ? '#3f3f46' : '#e5e5e5') : (isDark ? '#00e5cc' : 'var(--accent-blue, #1d4ed8)'),
          color: gestureActions.length === 0 ? (isDark ? '#71717a' : '#999999') : (isDark ? '#0a0a0c' : '#ffffff'),
        }}>
        {executeGesture.isPending ? 'Executing...' : 'Execute Gesture Sequence'}
      </button>
      {result && (
        <div className="p-2 rounded-lg text-[10px] font-medium"
          style={{
            background: result.success ? (isDark ? 'rgba(16,185,129,0.1)' : '#f0fdf4') : (isDark ? 'rgba(251,113,133,0.1)' : '#fef2f2'),
            color: result.success ? (isDark ? '#10b981' : '#047857') : (isDark ? '#fb7185' : '#dc2626'),
            border: `1px solid ${result.success ? (isDark ? '#10b981' : '#047857') : (isDark ? '#fb7185' : '#dc2626')}`
          }}>
          {result.message}
        </div>
      )}
    </div>
  );
}

// Execute Script Component
function ExecuteScript({ onClose, platform }: { onClose: () => void; platform: string }) {
  const { theme } = useThemeStore();
  const isDark = theme === 'dark';
  const executeScript = useExecuteScript();
  const { selectedDevice } = useDeviceStore();
  const [scriptText, setScriptText] = useState("");
  const [result, setResult] = useState<CommandResult | null>(null);

  const handleExecute = async () => {
    if (!scriptText.trim()) return;
    try {
      const res = await executeScript.mutateAsync({
        script: scriptText,
        platform,
        udid: selectedDevice || undefined,
      });
      setResult({ success: res.success, output: res.output, error: res.error || undefined });
    } catch (err) {
      setResult({ success: false, output: '', error: err instanceof Error ? err.message : 'Failed' });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          style={{ color: isDark ? "#00e5cc" : "#0066cc" }}>
          <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
        </svg>
        <span className="text-[11px] font-bold" style={{ color: isDark ? "#e4e4e7" : "#1a1a1a" }}>
          Shell Script Executor
        </span>
      </div>
      <p className="text-[9px]" style={{ color: isDark ? '#71717a' : '#666666' }}>
        Run arbitrary shell commands with allowlist validation
      </p>
      <textarea
        value={scriptText}
        onChange={(e) => setScriptText(e.target.value)}
        placeholder={'e.g., "pm list packages -3" or "input swipe 100 500 400 500"'}
        className="w-full px-3 py-2 rounded-xl text-[11px] font-mono resize-y min-h-[80px]"
        style={{ background: isDark ? '#1f1f23' : '#ffffff', color: isDark ? '#e4e4e7' : '#1a1a1a', border: isDark ? '1.5px solid #3f3f46' : '1.5px solid #e5e5e5', outline: 'none' }}
      />
      <button onClick={handleExecute} disabled={!scriptText.trim() || executeScript.isPending}
        className="w-full py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all active:scale-98 disabled:opacity-50"
        style={{
          background: !scriptText.trim() ? (isDark ? '#3f3f46' : '#e5e5e5') : (isDark ? '#00e5cc' : 'var(--accent-blue, #1d4ed8)'),
          color: !scriptText.trim() ? (isDark ? '#71717a' : '#999999') : (isDark ? '#0a0a0c' : '#ffffff'),
        }}>
        {executeScript.isPending ? 'Executing...' : 'Execute Script'}
      </button>
      {result && (
        <div className="p-2 rounded-lg text-[10px] font-mono whitespace-pre-wrap"
          style={{
            background: result.success ? (isDark ? 'rgba(16,185,129,0.1)' : '#f0fdf4') : (isDark ? 'rgba(251,113,133,0.1)' : '#fef2f2'),
            color: result.success ? (isDark ? '#10b981' : '#047857') : (isDark ? '#fb7185' : '#dc2626'),
            border: `1px solid ${result.success ? (isDark ? '#10b981' : '#047857') : (isDark ? '#fb7185' : '#dc2626')}`
          }}>
          {result.success ? result.output : result.error}
        </div>
      )}
    </div>
  );
}

// Full Apps Section (merged from ApkInfoPanel)
function AppsSection({ isDark }: { isDark: boolean }) {
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [packagesLoaded, setPackagesLoaded] = useState(false);
  const { devices, selectedDevice } = useDeviceStore();
  const currentDevice = devices.find((d) => d.udid === selectedDevice);
  const platform = currentDevice?.platform ?? "android";

  const { data: packages = [], isLoading: loadingPkgs } = useInstalledPackages(packagesLoaded, selectedDevice);
  const { data: appInfo, isLoading: loadingInfo } = useAppInfo(selectedPackage, selectedDevice);

  const filteredPackages = useMemo(() => {
    if (!search.trim()) return packages;
    const q = search.toLowerCase();
    return packages.filter((p) => p.toLowerCase().includes(q));
  }, [packages, search]);

  const groupedPermissions = useMemo(() => {
    if (!appInfo?.permissions) return {};
    const groups: Record<string, typeof appInfo.permissions> = {};
    for (const perm of appInfo.permissions) {
      const group = perm.group ?? "Other";
      if (!groups[group]) groups[group] = [];
      groups[group].push(perm);
    }
    return groups;
  }, [appInfo]);

  return (
    <div className="flex gap-3 h-full min-h-0">
      {/* Left: Package List */}
      <div className="w-48 flex flex-col rounded-xl overflow-hidden"
        style={{ background: isDark ? '#18181b' : '#f5f5f5', border: isDark ? '1.5px solid #3f3f46' : '1.5px solid #e5e5e5' }}>
        <div className="p-2" style={{ borderBottom: isDark ? '1px solid #27272a' : '1px solid #e5e5e5' }}>
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder={platform === 'ios' ? "Search apps..." : "Search packages..."}
            className="w-full px-2 py-1.5 rounded-lg text-[10px] font-mono"
            style={{ background: isDark ? '#1f1f23' : '#ffffff', color: isDark ? '#e4e4e7' : '#1a1a1a', border: isDark ? '1px solid #3f3f46' : '1px solid #e5e5e5', outline: 'none' }} />
        </div>
        <div className="px-2 py-1 flex items-center justify-between" style={{ borderBottom: isDark ? '1px solid #27272a' : '1px solid #e5e5e5' }}>
          <span className="text-[9px] font-bold uppercase" style={{ color: isDark ? "#52525b" : "#999999" }}>
            {loadingPkgs ? "..." : `${filteredPackages.length}`}
          </span>
          {!packagesLoaded && !loadingPkgs && (
            <button onClick={() => setPackagesLoaded(true)}
              className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase"
              style={{ background: isDark ? '#00e5cc' : 'var(--accent-blue, #1d4ed8)', color: '#000' }}>
              Load
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          {!packagesLoaded ? (
            <div className="p-3 text-center">
              <span className="text-[10px]" style={{ color: isDark ? "#52525b" : "#999999" }}>Click Load</span>
            </div>
          ) : loadingPkgs ? (
            <div className="p-2 space-y-1">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-6 rounded animate-pulse" style={{ background: isDark ? "#1f1f23" : "#f0f0f0" }} />
              ))}
            </div>
          ) : filteredPackages.length === 0 ? (
            <div className="p-3 text-center">
              <span className="text-[10px]" style={{ color: isDark ? "#52525b" : "#999999" }}>No results</span>
            </div>
          ) : (
            filteredPackages.map((pkg) => {
              const isSelected = pkg === selectedPackage;
              return (
                <button key={pkg} onClick={() => setSelectedPackage(pkg)}
                  className="w-full text-left px-2 py-1.5 text-[10px] font-mono truncate transition-all"
                  style={{
                    background: isSelected ? (isDark ? "#1f1f23" : "#f0f0f0") : "transparent",
                    color: isSelected ? (isDark ? '#00e5cc' : 'var(--accent-blue, #1d4ed8)') : (isDark ? '#71717a' : '#666666'),
                    borderLeft: `2px solid ${isSelected ? (isDark ? '#00e5cc' : 'var(--accent-blue, #1d4ed8)') : 'transparent'}`,
                  }}
                  title={pkg}>
                  {pkg}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Right: Detail Panel */}
      <div className="flex-1 overflow-y-auto">
        {!selectedPackage ? (
          <div className="flex items-center justify-center h-full rounded-xl"
            style={{ background: isDark ? '#18181b' : '#f5f5f5', border: isDark ? '1.5px solid #3f3f46' : '1.5px solid #e5e5e5' }}>
            <div className="text-center">
              <div className="w-10 h-10 mx-auto mb-2 rounded-lg flex items-center justify-center"
                style={{ background: isDark ? "#1f1f23" : "#f0f0f0", border: isDark ? "2px solid #3f3f46" : "2px solid #e5e5e5" }}>
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: isDark ? "#3f3f46" : "#cccccc" }}>
                  <rect x="5" y="2" width="14" height="20" rx="2" /><line x1="12" y1="18" x2="12" y2="18.01" strokeWidth="3" strokeLinecap="round" />
                </svg>
              </div>
              <p className="text-[11px] font-bold" style={{ color: isDark ? "#52525b" : "#999999" }}>Select an app</p>
            </div>
          </div>
        ) : loadingInfo ? (
          <div className="space-y-2 p-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-12 rounded-lg animate-pulse" style={{ background: isDark ? "#1f1f23" : "#f0f0f0" }} />
            ))}
          </div>
        ) : appInfo ? (
          <div className="space-y-3">
            {/* Header */}
            <div className="flex items-start justify-between gap-3 p-3 rounded-xl"
              style={{ background: isDark ? '#18181b' : '#f5f5f5', border: isDark ? '1.5px solid #3f3f46' : '1.5px solid #e5e5e5' }}>
              <div className="min-w-0">
                <h3 className="text-[12px] font-bold truncate" style={{ color: isDark ? "#e4e4e7" : "#1a1a1a" }}>
                  {platform === 'ios' ? (appInfo.displayName || appInfo.packageName) : appInfo.packageName}
                </h3>
                <p className="text-[9px] font-mono mt-0.5 truncate" style={{ color: isDark ? "#52525b" : "#999999" }}>
                  {appInfo.packageName}
                </p>
              </div>
              <span className="px-2 py-0.5 rounded text-[8px] font-bold uppercase"
                style={{ background: isDark ? '#1f1f23' : '#f0f0f0', color: isDark ? '#00e5cc' : 'var(--accent-blue, #1d4ed8)' }}>
                {platform === 'ios' ? 'iOS' : 'Android'}
              </span>
            </div>

            {/* Info Grid */}
            <div className="grid grid-cols-2 gap-2">
              {(platform === 'ios' ? [
                { label: "Version", value: appInfo.versionName || "—" },
                { label: "Build", value: appInfo.versionCode ? String(appInfo.versionCode) : "—" },
                { label: "Min iOS", value: appInfo.minimumOSVersion || "—" },
                { label: "Bundle ID", value: appInfo.bundleIdentifier || "—" },
              ] : [
                { label: "Version", value: appInfo.versionName },
                { label: "Code", value: String(appInfo.versionCode) },
                { label: "Min SDK", value: String(appInfo.minSdk) },
                { label: "Target SDK", value: String(appInfo.targetSdk) },
              ] as const).map(({ label, value }) => (
                <div key={label} className="p-2 rounded-xl"
                  style={{ background: isDark ? '#18181b' : '#f5f5f5', border: isDark ? '1.5px solid #3f3f46' : '1.5px solid #e5e5e5' }}>
                  <div className="text-[8px] font-bold uppercase tracking-wider mb-0.5" style={{ color: isDark ? "#52525b" : "#999999" }}>{label}</div>
                  <div className="text-[10px] font-mono font-bold truncate" style={{ color: isDark ? "#e4e4e7" : "#1a1a1a" }}>{value}</div>
                </div>
              ))}
            </div>

            {/* Timestamps */}
            {platform !== 'ios' && (
              <div className="space-y-1 p-2 rounded-xl" style={{ background: isDark ? '#18181b' : '#f5f5f5', border: isDark ? '1.5px solid #3f3f46' : '1.5px solid #e5e5e5' }}>
                {[
                  { label: "First Installed", value: appInfo.firstInstallTime },
                  { label: "Last Updated", value: appInfo.lastUpdateTime },
                  { label: "Installer", value: appInfo.installerPackage },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between py-0.5">
                    <span className="text-[9px] font-bold uppercase" style={{ color: isDark ? "#52525b" : "#999999" }}>{label}</span>
                    <span className="text-[10px] font-mono" style={{ color: isDark ? "#71717a" : "#666666" }}>{value}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Permissions */}
            <div className="p-2 rounded-xl" style={{ background: isDark ? '#18181b' : '#f5f5f5', border: isDark ? '1.5px solid #3f3f46' : '1.5px solid #e5e5e5' }}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-bold uppercase" style={{ color: isDark ? "#e4e4e7" : "#1a1a1a" }}>Permissions</span>
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold"
                  style={{ background: isDark ? '#1f1f23' : '#f0f0f0', color: isDark ? '#71717a' : '#666666' }}>
                  {appInfo.grantedCount}/{appInfo.permissionCount}
                </span>
              </div>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {Object.entries(groupedPermissions).map(([group, perms]) => (
                  <div key={group}>
                    <div className="text-[8px] font-bold uppercase mb-1" style={{ color: isDark ? '#71717a' : '#666666' }}>{group}</div>
                    {perms.map((perm) => (
                      <div key={perm.name} className="flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[9px]"
                        style={{ background: isDark ? '#0f0f12' : '#fafafa' }}>
                        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{ background: perm.granted ? "#10b981" : "#52525b" }} />
                        <span className="flex-1 truncate font-mono"
                          style={{ color: perm.granted ? (isDark ? "#10b981" : "#047857") : (isDark ? '#71717a' : '#999999') }}
                          title={perm.name}>
                          {perm.label}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="p-3 rounded-xl text-center"
            style={{ background: isDark ? '#1f1f23' : '#fef2f2', border: isDark ? '1.5px solid #fb7185' : '1.5px solid #dc2626', color: isDark ? '#fb7185' : '#dc2626' }}>
            <span className="text-[10px] font-bold">{platform === 'ios' ? 'App not found' : 'Package not found'}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// Main Commands Drawer Component
export function CommandsDrawer({ isDark }: { isDark: boolean }) {
  const [activeSection, setActiveSection] = useState<'quick' | 'apps' | 'adb' | 'gesture' | 'script'>('quick');
  const [packageName, setPackageName] = useState("");
  const [apkFile, setApkFile] = useState<File | null>(null);
  const [commandResult, setCommandResult] = useState<CommandResult | null>(null);
  const { executeCommand, isExecuting } = useCommands();
  const { devices, selectedDevice } = useDeviceStore();
  const selectedDev = devices.find(d => d.udid === selectedDevice);
  const platform = selectedDev?.platform ?? 'android';

  const handleAppCommand = async (type: string, params?: Record<string, unknown>) => {
    setCommandResult(null);
    const res = await executeCommand(type, params);
    setCommandResult(res);
  };

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
        className="flex items-center px-4 py-2.5 flex-shrink-0"
        style={{
          background: isDark ? "#18181b" : "#f5f5f5",
          borderBottom: isDark ? "2px solid #27272a" : "2px solid #e5e5e5",
        }}
      >
        <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          style={{ color: isDark ? "#00e5cc" : "#0066cc" }}>
          <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
        </svg>
        <span className="text-[11px] font-bold uppercase tracking-wider"
          style={{ color: isDark ? "#e4e4e7" : "#1a1a1a" }}>Commands</span>
      </div>

      {/* Section Tabs */}
      <div className="flex px-4 py-2 gap-1" style={{ borderBottom: isDark ? "1px solid #27272a" : "1px solid #e5e5e5" }}>
        {[
          { id: 'quick', label: 'Quick' },
          { id: 'apps', label: 'App Info' },
          { id: 'adb', label: 'ADB Shell' },
          { id: 'gesture', label: 'Gesture' },
          { id: 'script', label: 'Script' },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveSection(tab.id as typeof activeSection)}
            className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all"
            style={{
              background: activeSection === tab.id
                ? (isDark ? 'rgba(0,229,204,0.15)' : 'rgba(0,102,204,0.1)')
                : 'transparent',
              color: activeSection === tab.id
                ? (isDark ? '#00e5cc' : 'var(--accent-blue, #1d4ed8)')
                : (isDark ? '#71717a' : '#666666'),
              border: `1px solid ${activeSection === tab.id
                ? (isDark ? '#00e5cc' : 'var(--accent-blue, #1d4ed8)')
                : 'transparent'}`,
            }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Quick Actions Section */}
        {activeSection === 'quick' && (
          <div className="space-y-4">
            {/* App Commands */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  style={{ color: isDark ? "#71717a" : "#666666" }}>
                  <rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12" y2="18.01" strokeWidth="3" strokeLinecap="round"/>
                </svg>
                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: isDark ? "#71717a" : "#666666" }}>App Management</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={packageName}
                  onChange={(e) => setPackageName(e.target.value)}
                  placeholder="com.example.app"
                  className="flex-1 px-3 py-2 rounded-xl text-[11px] font-mono"
                  style={{ background: isDark ? '#1f1f23' : '#ffffff', color: isDark ? '#e4e4e7' : '#1a1a1a', border: isDark ? '1.5px solid #3f3f46' : '1.5px solid #e5e5e5', outline: 'none' }}
                />
                <label className="px-3 py-2 rounded-xl text-[10px] font-bold uppercase cursor-pointer"
                  style={{ background: isDark ? '#1f1f23' : '#f0f0f0', color: isDark ? '#a1a1aa' : '#666666', border: `1.5px solid ${isDark ? '#3f3f46' : '#e5e5e5'}` }}>
                  APK
                  <input type="file" accept=".apk" onChange={(e) => setApkFile(e.target.files?.[0] || null)} className="hidden" />
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <QuickAction
                  icon={<svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>}
                  label="List Apps"
                  onClick={() => handleAppCommand('list_apps')}
                  disabled={isExecuting}
                />
                <QuickAction
                  icon={<svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>}
                  label="Check"
                  onClick={() => handleAppCommand('check_app', { package: packageName })}
                  disabled={isExecuting || !packageName.trim()}
                />
                <QuickAction
                  icon={<svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>}
                  label="Launch"
                  onClick={() => handleAppCommand('launch_app', { package: packageName })}
                  disabled={isExecuting || !packageName.trim()}
                />
                <QuickAction
                  icon={<svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 4H8l-7 8 7 8h13a2 2 0 002-2V6a2 2 0 00-2-2z"/><line x1="18" y1="9" x2="12" y2="15"/><line x1="12" y1="9" x2="18" y2="15"/></svg>}
                  label="Uninstall"
                  onClick={() => handleAppCommand('uninstall_app', { package: packageName })}
                  disabled={isExecuting || !packageName.trim()}
                />
                <QuickAction
                  icon={<svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>}
                  label="App Info"
                  onClick={() => handleAppCommand('get_app_info', { package: packageName })}
                  disabled={isExecuting || !packageName.trim()}
                />
                {apkFile && (
                  <QuickAction
                    icon={<svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>}
                    label={apkFile.name.slice(0, 8) + "..."}
                    onClick={() => handleAppCommand('install_app', { apk_path: apkFile.name })}
                    disabled={isExecuting}
                  />
                )}
              </div>
            </div>

            {/* Result Display */}
            <ResultDisplay result={commandResult} />
          </div>
        )}

        {/* App Info Section - Full package browser */}
        {activeSection === 'apps' && (
          <AppsSection isDark={isDark} />
        )}

        {/* ADB Shell Section */}
        {activeSection === 'adb' && (
          <AdbSection onResult={setCommandResult} />
        )}

        {/* Gesture Builder Section */}
        {activeSection === 'gesture' && (
          <GestureBuilder onClose={() => setActiveSection('quick')} />
        )}

        {/* Script Section */}
        {activeSection === 'script' && (
          <ExecuteScript onClose={() => setActiveSection('quick')} platform={platform} />
        )}
      </div>
    </div>
  );
}