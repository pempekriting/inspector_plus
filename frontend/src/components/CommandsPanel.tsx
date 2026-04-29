import { useState } from "react";
import { useThemeStore } from "../stores/themeStore";
import { useCommands, CommandResult } from "../hooks/useCommands";

export function CommandsPanel() {
  const { theme } = useThemeStore();
  const isDark = theme === 'dark';
  const { executeCommand, isExecuting } = useCommands();

  const [packageName, setPackageName] = useState("");
  const [apkFile, setApkFile] = useState<File | null>(null);
  const [commandResult, setCommandResult] = useState<CommandResult | null>(null);

  const handleExecute = async (type: string, params?: Record<string, unknown>) => {
    setCommandResult(null);
    const result = await executeCommand(type, params);
    setCommandResult(result);
  };

  const commands = [
    {
      id: "list_apps",
      name: "List Installed Apps",
      description: "Get list of all installed packages on the device",
      type: "list_apps",
      params: {},
    },
    {
      id: "check_app",
      name: "Check App Installed",
      description: "Check if a specific app is installed",
      type: "check_app",
      params: { package: packageName },
      input: (
        <input
          type="text"
          value={packageName}
          onChange={(e) => setPackageName(e.target.value)}
          placeholder="com.example.app"
          className="flex-1 px-2 py-1.5 rounded text-[11px] font-mono"
          style={{
            background: isDark ? '#1f1f23' : '#ffffff',
            color: isDark ? '#e4e4e7' : '#1a1a1a',
            border: isDark ? '2px solid #3f3f46' : '2px solid #cccccc',
          }}
        />
      ),
    },
    {
      id: "launch_app",
      name: "Launch App",
      description: "Launch an app by package name",
      type: "launch_app",
      params: { package: packageName },
      input: (
        <input
          type="text"
          value={packageName}
          onChange={(e) => setPackageName(e.target.value)}
          placeholder="com.example.app"
          className="flex-1 px-2 py-1.5 rounded text-[11px] font-mono"
          style={{
            background: isDark ? '#1f1f23' : '#ffffff',
            color: isDark ? '#e4e4e7' : '#1a1a1a',
            border: isDark ? '2px solid #3f3f46' : '2px solid #cccccc',
          }}
        />
      ),
    },
    {
      id: "uninstall_app",
      name: "Uninstall App",
      description: "Uninstall an app by package name",
      type: "uninstall_app",
      params: { package: packageName },
      input: (
        <input
          type="text"
          value={packageName}
          onChange={(e) => setPackageName(e.target.value)}
          placeholder="com.example.app"
          className="flex-1 px-2 py-1.5 rounded text-[11px] font-mono"
          style={{
            background: isDark ? '#1f1f23' : '#ffffff',
            color: isDark ? '#e4e4e7' : '#1a1a1a',
            border: isDark ? '2px solid #3f3f46' : '2px solid #cccccc',
          }}
        />
      ),
    },
    {
      id: "install_app",
      name: "Install App",
      description: "Install an APK file",
      type: "install_app",
      params: { apk_path: apkFile?.name || "" },
      input: (
        <div className="flex-1 flex items-center gap-2">
          <input
            type="file"
            accept=".apk"
            onChange={(e) => setApkFile(e.target.files?.[0] || null)}
            className="flex-1 text-[11px]"
            style={{ color: isDark ? '#e4e4e7' : '#1a1a1a' }}
          />
          {apkFile && (
            <span className="text-[10px] truncate max-w-[100px]" style={{ color: isDark ? '#71717a' : '#666666' }}>
              {apkFile.name}
            </span>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      <div className="grid gap-4">
        {commands.map((cmd) => (
          <div
            key={cmd.id}
            className="rounded-lg p-4"
            style={{
              background: isDark ? '#18181b' : '#ffffff',
              border: isDark ? '2px solid #3f3f46' : '2px solid #e5e5e5',
            }}
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-sm font-bold" style={{ color: isDark ? '#e4e4e7' : '#1a1a1a' }}>
                  {cmd.name}
                </h3>
                <p className="text-[11px] mt-1" style={{ color: isDark ? '#71717a' : '#666666' }}>
                  {cmd.description}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 mb-3">
              {cmd.input}
              <button
                onClick={() => handleExecute(cmd.type, cmd.params)}
                disabled={isExecuting}
                className="px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: isExecuting ? (isDark ? '#3f3f46' : '#e5e5e5') : (isDark ? '#22d3ee' : '#0066cc'),
                  color: isExecuting ? (isDark ? '#71717a' : '#999999') : (isDark ? '#0a0a0c' : '#ffffff'),
                  border: `2px solid ${isExecuting ? (isDark ? '#3f3f46' : '#e5e5e5') : (isDark ? '#22d3ee' : '#0066cc')}`,
                }}
              >
                {isExecuting ? "Running..." : "Execute"}
              </button>
            </div>

            {commandResult && (
              <div
                className="mt-3 p-3 rounded text-[11px] font-mono whitespace-pre-wrap overflow-auto max-h-[200px]"
                style={{
                  background: isDark ? '#0a0a0c' : '#f5f5f5',
                  color: commandResult.success ? (isDark ? '#10b981' : '#047857') : (isDark ? '#fb7185' : '#dc2626'),
                  border: `2px solid ${commandResult.success ? (isDark ? '#10b981' : '#047857') : (isDark ? '#fb7185' : '#dc2626')}`,
                }}
              >
                {commandResult.success ? commandResult.output : commandResult.error}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
