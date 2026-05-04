import React, { useState, useMemo } from "react";
import { useThemeStore } from "../stores/themeStore";
import { useDeviceStore } from "../stores/deviceStore";
import { useCommands, CommandResult } from "../hooks/useCommands";
import { useGestureExecute, useExecuteScript } from "../services/api";

type Platform = "android" | "ios" | "both";

interface CommandItem {
  id: string;
  name: string;
  description: string;
  type: string;
  params: Record<string, unknown>;
  input?: React.ReactNode;
  platform: Platform;
}

interface GestureAction {
  type: 'move' | 'pointerDown' | 'pointerUp' | 'pause';
  x?: number;
  y?: number;
  duration?: number;
  pointer?: number;
  button?: string;
}

export function CommandsPanel() {
  const { theme } = useThemeStore();
  const isDark = theme === 'dark';
  const { executeCommand, isExecuting } = useCommands();
  const executeGesture = useGestureExecute();
  const executeScript = useExecuteScript();
  const { selectedDevice, devices } = useDeviceStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [packageName, setPackageName] = useState("");
  const [apkFile, setApkFile] = useState<File | null>(null);
  const [commandResult, setCommandResult] = useState<CommandResult | null>(null);
  const [showAppCommands, setShowAppCommands] = useState(true);
  const [showPlatformControls, setShowPlatformControls] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [viewMode, setViewMode] = useState<'raw' | 'table'>('raw');
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [filterText, setFilterText] = useState("");

  // Gesture builder state
  const [gestureActions, setGestureActions] = useState<GestureAction[]>([]);
  const [coordinateMode, setCoordinateMode] = useState<'absolute' | 'relative'>('absolute');
  const [showGestureBuilder, setShowGestureBuilder] = useState(false);

  // Script executor state
  const [scriptText, setScriptText] = useState("");
  const [showScriptPanel, setShowScriptPanel] = useState(false);

  const handleExecute = async (type: string, params?: Record<string, unknown>) => {
    setCommandResult(null);
    setShowResult(false);
    setViewMode('raw');
    setSortColumn(null);
    setSortDirection('asc');
    setFilterText("");

    if (type === 'gesture_builder') {
      setShowGestureBuilder(true);
      return;
    }

    if (type === 'execute_script') {
      setShowScriptPanel(true);
      return;
    }

    const result = await executeCommand(type, params);
    setCommandResult(result);
    setShowResult(true);
  };

  const handleGestureExecute = async () => {
    if (gestureActions.length === 0) return;
    setCommandResult(null);
    setShowResult(true);
    setViewMode('raw');

    try {
      const result = await executeGesture.mutateAsync({
        actions: gestureActions,
        coordinateMode,
        udid: selectedDevice || undefined,
      });
      setCommandResult({
        success: true,
        output: result.message || 'Gesture executed successfully',
      });
    } catch (err) {
      setCommandResult({
        success: false,
        output: '',
        error: err instanceof Error ? err.message : 'Gesture execution failed',
      });
    }
  };

  const addGestureAction = (actionType: GestureAction['type']) => {
    const newAction: GestureAction = { type: actionType };
    if (actionType === 'move' || actionType === 'pointerDown') {
      newAction.x = 0;
      newAction.y = 0;
      newAction.pointer = 0;
    }
    if (actionType === 'move') {
      newAction.duration = 100;
    }
    if (actionType === 'pointerDown' || actionType === 'pointerUp') {
      newAction.button = 'left';
    }
    if (actionType === 'pause') {
      newAction.duration = 100;
    }
    setGestureActions([...gestureActions, newAction]);
  };

  const removeGestureAction = (index: number) => {
    setGestureActions(gestureActions.filter((_, i) => i !== index));
  };

  const updateGestureAction = (index: number, updates: Partial<GestureAction>) => {
    setGestureActions(gestureActions.map((action, i) => i === index ? { ...action, ...updates } : action));
  };

  const androidAppCommands: CommandItem[] = [
    {
      id: "list_apps",
      name: "List Installed Apps",
      description: "Get list of all installed packages on the device",
      type: "list_apps",
      params: {},
      platform: "android",
    },
    {
      id: "check_app",
      name: "Check App Installed",
      description: "Check if a specific app is installed",
      type: "check_app",
      params: { package: packageName },
      platform: "android",
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
      platform: "android",
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
      platform: "android",
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
      name: "Install App (APK)",
      description: "Install an APK file",
      type: "install_app",
      params: { apk_path: apkFile?.name || "" },
      platform: "android",
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

  const iosAppCommands: CommandItem[] = [
    {
      id: "list_apps_ios",
      name: "List Installed Apps",
      description: "Get list of all installed bundle IDs",
      type: "list_apps",
      params: {},
      platform: "ios",
    },
    {
      id: "check_app_ios",
      name: "Check App Installed",
      description: "Check if a specific app is installed",
      type: "check_app",
      params: { bundle_id: packageName },
      platform: "ios",
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
      id: "launch_app_ios",
      name: "Launch App",
      description: "Launch an app by bundle ID",
      type: "launch_app",
      params: { bundle_id: packageName },
      platform: "ios",
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
      id: "uninstall_app_ios",
      name: "Uninstall App",
      description: "Uninstall an app by bundle ID",
      type: "uninstall_app",
      params: { bundle_id: packageName },
      platform: "ios",
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
      id: "install_app_ios",
      name: "Install App (IPA)",
      description: "Install an IPA file",
      type: "install_app",
      params: { ipa_path: apkFile?.name || "" },
      platform: "ios",
      input: (
        <div className="flex-1 flex items-center gap-2">
          <input
            type="file"
            accept=".ipa"
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
    {
      id: "open_url_ios",
      name: "Open URL",
      description: "Open a URL in Safari",
      type: "open_url",
      params: { url: packageName },
      platform: "ios",
      input: (
        <input
          type="text"
          value={packageName}
          onChange={(e) => setPackageName(e.target.value)}
          placeholder="https://example.com"
          className="flex-1 px-2 py-1.5 rounded text-[11px] font-mono"
          style={{
            background: isDark ? '#1f1f23' : '#ffffff',
            color: isDark ? '#e4e4e7' : '#1a1a1a',
            border: isDark ? '2px solid #3f3f46' : '2px solid #cccccc',
          }}
        />
      ),
    },
  ];

  const platformControlsAndroid: CommandItem[] = [
    {
      id: "press_keycode",
      name: "Press Home",
      description: "Send home key event",
      type: "press_keycode",
      params: { keycode: 3 },
      platform: "android",
    },
    {
      id: "open_notifications",
      name: "Open Notifications",
      description: "Pull down notification shade",
      type: "open_notifications",
      params: {},
      platform: "android",
    },
    {
      id: "toggle_airplane",
      name: "Toggle Airplane Mode",
      description: "Toggle airplane mode on/off",
      type: "toggle_airplane",
      params: {},
      platform: "android",
    },
    {
      id: "toggle_wifi",
      name: "Toggle WiFi",
      description: "Toggle WiFi on/off",
      type: "toggle_wifi",
      params: {},
      platform: "android",
    },
    {
      id: "toggle_mobile_data",
      name: "Toggle Mobile Data",
      description: "Toggle mobile data on/off",
      type: "toggle_mobile_data",
      params: {},
      platform: "android",
    },
  ];

  const platformControlsIos: CommandItem[] = [
    {
      id: "touch_id",
      name: "Simulate Touch ID",
      description: "Simulate Touch ID (iOS Simulator)",
      type: "touch_id",
      params: {},
      platform: "ios",
    },
    {
      id: "open_url_ios_control",
      name: "Open URL",
      description: "Open URL in Safari",
      type: "open_url",
      params: { url: packageName },
      platform: "ios",
      input: (
        <input
          type="text"
          value={packageName}
          onChange={(e) => setPackageName(e.target.value)}
          placeholder="https://example.com"
          className="flex-1 px-2 py-1.5 rounded text-[11px] font-mono"
          style={{
            background: isDark ? '#1f1f23' : '#ffffff',
            color: isDark ? '#e4e4e7' : '#1a1a1a',
            border: isDark ? '2px solid #3f3f46' : '2px solid #cccccc',
          }}
        />
      ),
    },
  ];

  const advancedCommands: CommandItem[] = [
    {
      id: "screen_record",
      name: "Screen Recording",
      description: "Start/stop screen recording",
      type: "screen_record",
      params: {},
      platform: "both",
    },
    {
      id: "get_device_info",
      name: "Get Device Info",
      description: "Get orientation, size, density",
      type: "get_device_info",
      params: {},
      platform: "both",
    },
    {
      id: "gesture_builder",
      name: "Gesture Builder",
      description: "Build and execute multi-pointer gesture sequences",
      type: "gesture_builder",
      params: {},
      platform: "both",
    },
    {
      id: "execute_script",
      name: "Execute Script",
      description: "Run arbitrary shell command on device",
      type: "execute_script",
      params: {},
      platform: "both",
    },
  ];

  const selectedDev = devices.find(d => d.udid === selectedDevice);
  const platform = selectedDev?.platform ?? 'android';

  const appCommands = platform === 'ios' ? iosAppCommands : androidAppCommands;
  const platformControls = platform === 'ios' ? platformControlsIos : platformControlsAndroid;

  const filteredAppCommands = useMemo(() =>
    appCommands.filter(cmd =>
      cmd.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cmd.description.toLowerCase().includes(searchQuery.toLowerCase())
    ),
    [appCommands, searchQuery]
  );

  const filteredPlatformControls = useMemo(() =>
    platformControls.filter(cmd =>
      cmd.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cmd.description.toLowerCase().includes(searchQuery.toLowerCase())
    ),
    [platformControls, searchQuery]
  );

  const filteredAdvanced = useMemo(() =>
    advancedCommands.filter(cmd =>
      cmd.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cmd.description.toLowerCase().includes(searchQuery.toLowerCase())
    ),
    [advancedCommands, searchQuery]
  );

  const renderPlatformBadge = (cmdPlatform: Platform) => {
    if (cmdPlatform === 'both') {
      return (
        <span className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase" style={{
          background: isDark ? '#3f3f46' : '#e5e5e5',
          color: isDark ? '#a1a1aa' : '#666666',
        }}>
          Both
        </span>
      );
    }
    return (
      <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${cmdPlatform === 'ios' ? 'bg-gray-100 text-gray-800' : 'bg-cyan-900 text-cyan-300'}`} style={
        cmdPlatform === 'ios'
          ? { background: '#f5f5f5', color: '#1a1a1a' }
          : { background: '#1f1f23', color: 'var(--accent-cyan, #00e5cc)' }
      }>
        {cmdPlatform === 'ios' ? 'iOS' : 'Android'}
      </span>
    );
  };

  const renderSection = (title: string, commands: CommandItem[], isOpen: boolean, onToggle: () => void) => (
    <div>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-2 text-[10px] font-bold uppercase tracking-wider"
        style={{
          background: isDark ? '#18181b' : '#e5e5e5',
          color: isDark ? '#e4e4e7' : '#1a1a1a',
          borderBottom: isDark ? '2px solid #3f3f46' : '2px solid #1a1a1a',
        }}
      >
        <span>{title}</span>
        <svg
          className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {isOpen && (
        <div className="grid gap-3 p-4">
          {commands.length === 0 ? (
            <p className="text-[10px] text-center py-2" style={{ color: isDark ? '#71717a' : '#666666' }}>
              No commands match your search
            </p>
          ) : commands.map((cmd) => (
            <div
              key={cmd.id}
              className="rounded-lg p-3"
              style={{
                background: isDark ? '#18181b' : '#ffffff',
                border: isDark ? '2px solid #3f3f46' : '2px solid #e5e5e5',
              }}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-[12px] font-bold" style={{ color: isDark ? '#e4e4e7' : '#1a1a1a' }}>
                    {cmd.name}
                  </h3>
                  {renderPlatformBadge(cmd.platform)}
                </div>
              </div>
              <p className="text-[10px] mb-2" style={{ color: isDark ? '#71717a' : '#666666' }}>
                {cmd.description}
              </p>

              <div className="flex items-center gap-2 mb-2">
                {cmd.input}
                <button
                  onClick={() => handleExecute(cmd.type, cmd.params)}
                  disabled={isExecuting}
                  className="px-2 py-1.5 rounded text-[9px] font-bold uppercase tracking-wider transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    background: isExecuting ? (isDark ? '#3f3f46' : '#e5e5e5') : (isDark ? 'var(--accent-cyan)' : 'var(--accent-blue, #1d4ed8)'),
                    color: isExecuting ? (isDark ? '#71717a' : '#999999') : (isDark ? '#0a0a0c' : '#ffffff'),
                    border: `2px solid ${isExecuting ? (isDark ? '#3f3f46' : '#e5e5e5') : (isDark ? 'var(--accent-cyan)' : 'var(--accent-blue, #1d4ed8)')}`,
                  }}
                >
                  {isExecuting ? "..." : "Execute"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Platform Badge and Search Header */}
      <div
        className="px-4 py-2 flex items-center gap-2"
        style={{ borderBottom: isDark ? '1px solid #3f3f46' : '1px solid #e5e5e5' }}
      >
        <span
          className="px-2 py-0.5 rounded text-[9px] font-bold uppercase"
          style={{
            background: platform === 'ios' ? '#f5f5f5' : '#1f1f23',
            color: platform === 'ios' ? '#1a1a1a' : 'var(--accent-cyan, #00e5cc)',
            border: platform === 'ios' ? '1px solid #cccccc' : '1px solid #3f3f46',
          }}
        >
          {platform === 'ios' ? 'iOS' : 'Android'}
        </span>
        <span className="text-[10px]" style={{ color: isDark ? '#71717a' : '#666666' }}>
          {selectedDevice ? `Connected: ${selectedDevice.slice(0, 8)}...` : 'No device selected'}
        </span>
      </div>

      {/* Search Bar */}
      <div className="px-4 py-3" style={{ borderBottom: isDark ? '1px solid #3f3f46' : '1px solid #e5e5e5' }}>
        <div className="relative">
          <svg
            className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
            style={{ color: isDark ? '#71717a' : '#666666' }}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search commands..."
            className="w-full pl-8 pr-3 py-1.5 rounded text-[11px]"
            style={{
              background: isDark ? '#1f1f23' : '#ffffff',
              color: isDark ? '#e4e4e7' : '#1a1a1a',
              border: isDark ? '2px solid #3f3f46' : '2px solid #cccccc',
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] hover:opacity-70"
              style={{ color: isDark ? '#71717a' : '#666666' }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Core App Commands */}
      {renderSection(`App Commands (${filteredAppCommands.length})`, filteredAppCommands, showAppCommands, () => setShowAppCommands(!showAppCommands))}

      {/* Platform Controls */}
      {renderSection(`Platform Controls (${filteredPlatformControls.length})`, filteredPlatformControls, showPlatformControls, () => setShowPlatformControls(!showPlatformControls))}

      {/* Advanced Features */}
      {renderSection(`Advanced (${filteredAdvanced.length})`, filteredAdvanced, showAdvanced, () => setShowAdvanced(!showAdvanced))}

      {/* Command Result Panel */}
      {commandResult && (
        <div
          className="mx-4 mb-4 rounded-lg overflow-hidden"
          style={{
            background: isDark ? '#18181b' : '#ffffff',
            border: isDark ? '2px solid #3f3f46' : '2px solid #e5e5e5',
          }}
        >
          {/* Result Header */}
          <div
            className="flex items-center justify-between px-3 py-2"
            style={{
              background: isDark ? '#0f0f12' : '#f5f5f5',
              borderBottom: isDark ? '1px solid #3f3f46' : '1px solid #e5e5e5',
            }}
          >
            <button
              onClick={() => setShowResult(!showResult)}
              className="flex items-center gap-2 text-[10px] font-bold uppercase"
              style={{ color: isDark ? '#e4e4e7' : '#1a1a1a' }}
            >
              <svg
                className={`w-3 h-3 transition-transform ${showResult ? 'rotate-90' : ''}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
              <span
                className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase"
                style={{
                  background: commandResult.success ? (isDark ? '#10b981' : '#047857') : (isDark ? '#fb7185' : '#dc2626'),
                  color: '#ffffff',
                }}
              >
                {commandResult.success ? 'Success' : 'Error'}
              </span>
              Result
              {commandResult.output && (
                <span style={{ color: isDark ? '#71717a' : '#666666' }}>
                  ({commandResult.output.split('\n').length} lines)
                </span>
              )}
            </button>
            <div className="flex items-center gap-2">
              {/* View mode toggle */}
              {commandResult.output && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setViewMode('raw')}
                    className="px-2 py-0.5 rounded text-[9px] font-bold uppercase transition-all"
                    style={{
                      background: viewMode === 'raw' ? (isDark ? 'var(--accent-cyan)' : 'var(--accent-blue, #1d4ed8)') : 'transparent',
                      color: viewMode === 'raw' ? '#0a0a0c' : (isDark ? '#71717a' : '#666666'),
                      border: `1px solid ${viewMode === 'raw' ? (isDark ? 'var(--accent-cyan)' : 'var(--accent-blue, #1d4ed8)') : (isDark ? '#3f3f46' : '#cccccc')}`,
                    }}
                  >
                    Raw
                  </button>
                  <button
                    onClick={() => setViewMode('table')}
                    className="px-2 py-0.5 rounded text-[9px] font-bold uppercase transition-all"
                    style={{
                      background: viewMode === 'table' ? (isDark ? 'var(--accent-cyan)' : 'var(--accent-blue, #1d4ed8)') : 'transparent',
                      color: viewMode === 'table' ? '#0a0a0c' : (isDark ? '#71717a' : '#666666'),
                      border: `1px solid ${viewMode === 'table' ? (isDark ? 'var(--accent-cyan)' : 'var(--accent-blue, #1d4ed8)') : (isDark ? '#3f3f46' : '#cccccc')}`,
                    }}
                  >
                    Table
                  </button>
                </div>
              )}
              {/* Copy button */}
              <button
                onClick={() => {
                  const text = commandResult.success ? commandResult.output : commandResult.error;
                  navigator.clipboard.writeText(text || '');
                }}
                className="px-2 py-0.5 rounded text-[9px] font-bold uppercase transition-all hover:opacity-80"
                style={{
                  background: 'transparent',
                  color: isDark ? '#71717a' : '#666666',
                  border: `1px solid ${isDark ? '#3f3f46' : '#cccccc'}`,
                }}
              >
                Copy
              </button>
            </div>
          </div>

          {/* Result Content */}
          {showResult && (
            <div className="max-h-[300px] overflow-auto">
              {!commandResult.success && (
                <div
                  className="p-3 text-[11px] font-mono"
                  style={{
                    background: isDark ? '#0a0a0c' : '#fef2f2',
                    color: isDark ? '#fb7185' : '#dc2626',
                  }}
                >
                  {commandResult.error}
                </div>
              )}

              {commandResult.success && commandResult.output && viewMode === 'raw' && (
                <div className="p-3">
                  <pre
                    className="text-[11px] font-mono whitespace-pre-wrap"
                    style={{ color: isDark ? '#e4e4e7' : '#1a1a1a' }}
                  >
                    {commandResult.output}
                  </pre>
                </div>
              )}

              {commandResult.success && commandResult.output && viewMode === 'table' && (
                <TableView
                  data={commandResult.output}
                  filterText={filterText}
                  setFilterText={setFilterText}
                  sortColumn={sortColumn}
                  sortDirection={sortDirection}
                  setSortColumn={setSortColumn}
                  setSortDirection={setSortDirection}
                  isDark={isDark}
                />
              )}
            </div>
          )}
        </div>
      )}

      {/* Gesture Builder Panel */}
      {showGestureBuilder && (
        <div
          className="mx-4 mb-4 rounded-lg overflow-hidden"
          style={{
            background: isDark ? '#18181b' : '#ffffff',
            border: isDark ? '2px solid #3f3f46' : '2px solid #e5e5e5',
          }}
        >
          {/* Gesture Builder Header */}
          <div
            className="flex items-center justify-between px-3 py-2"
            style={{
              background: isDark ? '#0f0f12' : '#f5f5f5',
              borderBottom: isDark ? '1px solid #3f3f46' : '1px solid #e5e5e5',
            }}
          >
            <span className="text-[10px] font-bold uppercase" style={{ color: isDark ? '#e4e4e7' : '#1a1a1a' }}>
              Gesture Builder
            </span>
            <button
              onClick={() => {
                setShowGestureBuilder(false);
                setGestureActions([]);
              }}
              className="px-2 py-0.5 rounded text-[9px] font-bold uppercase transition-all hover:opacity-80"
              style={{
                background: 'transparent',
                color: isDark ? '#71717a' : '#666666',
                border: `1px solid ${isDark ? '#3f3f46' : '#cccccc'}`,
              }}
            >
              Close
            </button>
          </div>

          {/* Gesture Builder Content */}
          <div className="p-3">
            {/* Coordinate Mode Toggle */}
            <div className="flex items-center gap-3 mb-3">
              <span className="text-[10px] font-bold uppercase" style={{ color: isDark ? '#71717a' : '#666666' }}>
                Coordinate Mode:
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCoordinateMode('absolute')}
                  className="px-2 py-0.5 rounded text-[9px] font-bold uppercase transition-all"
                  style={{
                    background: coordinateMode === 'absolute' ? (isDark ? 'var(--accent-cyan)' : 'var(--accent-blue, #1d4ed8)') : 'transparent',
                    color: coordinateMode === 'absolute' ? '#0a0a0c' : (isDark ? '#71717a' : '#666666'),
                    border: `1px solid ${coordinateMode === 'absolute' ? (isDark ? 'var(--accent-cyan)' : 'var(--accent-blue, #1d4ed8)') : (isDark ? '#3f3f46' : '#cccccc')}`,
                  }}
                >
                  Absolute (px)
                </button>
                <button
                  onClick={() => setCoordinateMode('relative')}
                  className="px-2 py-0.5 rounded text-[9px] font-bold uppercase transition-all"
                  style={{
                    background: coordinateMode === 'relative' ? (isDark ? 'var(--accent-cyan)' : 'var(--accent-blue, #1d4ed8)') : 'transparent',
                    color: coordinateMode === 'relative' ? '#0a0a0c' : (isDark ? '#71717a' : '#666666'),
                    border: `1px solid ${coordinateMode === 'relative' ? (isDark ? 'var(--accent-cyan)' : 'var(--accent-blue, #1d4ed8)') : (isDark ? '#3f3f46' : '#cccccc')}`,
                  }}
                >
                  Relative (%)
                </button>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="text-[10px] font-bold uppercase mr-1" style={{ color: isDark ? '#71717a' : '#666666' }}>
                Add Action:
              </span>
              {(['move', 'pointerDown', 'pointerUp', 'pause'] as const).map((actionType) => (
                <button
                  key={actionType}
                  onClick={() => addGestureAction(actionType)}
                  className="px-2 py-1 rounded text-[9px] font-bold uppercase transition-all hover:opacity-80"
                  style={{
                    background: isDark ? '#1f1f23' : '#ffffff',
                    color: isDark ? '#e4e4e7' : '#1a1a1a',
                    border: `1px solid ${isDark ? '#3f3f46' : '#cccccc'}`,
                  }}
                >
                  + {actionType}
                </button>
              ))}
            </div>

            {/* Actions List */}
            <div className="space-y-2 mb-3">
              {gestureActions.length === 0 ? (
                <p className="text-[10px] text-center py-2" style={{ color: isDark ? '#71717a' : '#666666' }}>
                  No actions added. Click buttons above to add gesture actions.
                </p>
              ) : gestureActions.map((action, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 p-2 rounded"
                  style={{
                    background: isDark ? '#0f0f12' : '#f5f5f5',
                    border: isDark ? '1px solid #3f3f46' : '1px solid #e5e5e5',
                  }}
                >
                  <span className="text-[9px] font-bold uppercase w-16" style={{ color: isDark ? '#71717a' : '#666666' }}>
                    #{index + 1} {action.type}
                  </span>

                  {(action.type === 'move' || action.type === 'pointerDown') && (
                    <>
                      <input
                        type="number"
                        value={action.x ?? 0}
                        onChange={(e) => updateGestureAction(index, { x: parseInt(e.target.value) || 0 })}
                        placeholder="X"
                        className="w-16 px-1 py-0.5 rounded text-[10px] font-mono"
                        style={{
                          background: isDark ? '#1f1f23' : '#ffffff',
                          color: isDark ? '#e4e4e7' : '#1a1a1a',
                          border: `1px solid ${isDark ? '#3f3f46' : '#cccccc'}`,
                        }}
                      />
                      <input
                        type="number"
                        value={action.y ?? 0}
                        onChange={(e) => updateGestureAction(index, { y: parseInt(e.target.value) || 0 })}
                        placeholder="Y"
                        className="w-16 px-1 py-0.5 rounded text-[10px] font-mono"
                        style={{
                          background: isDark ? '#1f1f23' : '#ffffff',
                          color: isDark ? '#e4e4e7' : '#1a1a1a',
                          border: `1px solid ${isDark ? '#3f3f46' : '#cccccc'}`,
                        }}
                      />
                    </>
                  )}

                  {action.type === 'move' && (
                    <>
                      <span className="text-[9px]" style={{ color: isDark ? '#71717a' : '#666666' }}>Duration:</span>
                      <input
                        type="number"
                        value={action.duration ?? 100}
                        onChange={(e) => updateGestureAction(index, { duration: parseInt(e.target.value) || 0 })}
                        className="w-16 px-1 py-0.5 rounded text-[10px] font-mono"
                        style={{
                          background: isDark ? '#1f1f23' : '#ffffff',
                          color: isDark ? '#e4e4e7' : '#1a1a1a',
                          border: `1px solid ${isDark ? '#3f3f46' : '#cccccc'}`,
                        }}
                      />
                      <span className="text-[9px]" style={{ color: isDark ? '#71717a' : '#666666' }}>ms</span>
                    </>
                  )}

                  {action.type === 'pause' && (
                    <>
                      <span className="text-[9px]" style={{ color: isDark ? '#71717a' : '#666666' }}>Duration:</span>
                      <input
                        type="number"
                        value={action.duration ?? 100}
                        onChange={(e) => updateGestureAction(index, { duration: parseInt(e.target.value) || 0 })}
                        className="w-16 px-1 py-0.5 rounded text-[10px] font-mono"
                        style={{
                          background: isDark ? '#1f1f23' : '#ffffff',
                          color: isDark ? '#e4e4e7' : '#1a1a1a',
                          border: `1px solid ${isDark ? '#3f3f46' : '#cccccc'}`,
                        }}
                      />
                      <span className="text-[9px]" style={{ color: isDark ? '#71717a' : '#666666' }}>ms</span>
                    </>
                  )}

                  <button
                    onClick={() => removeGestureAction(index)}
                    className="ml-auto px-2 py-0.5 rounded text-[9px] font-bold uppercase hover:opacity-80"
                    style={{
                      background: 'transparent',
                      color: isDark ? '#fb7185' : '#dc2626',
                      border: `1px solid ${isDark ? '#fb7185' : '#dc2626'}`,
                    }}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>

            {/* Execute Button */}
            <button
              onClick={handleGestureExecute}
              disabled={gestureActions.length === 0 || executeGesture.isPending}
              className="w-full px-3 py-2 rounded text-[10px] font-bold uppercase tracking-wider transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: gestureActions.length === 0 ? (isDark ? '#3f3f46' : '#e5e5e5') : (isDark ? 'var(--accent-cyan)' : 'var(--accent-blue, #1d4ed8)'),
                color: gestureActions.length === 0 ? (isDark ? '#71717a' : '#999999') : (isDark ? '#0a0a0c' : '#ffffff'),
                border: `2px solid ${gestureActions.length === 0 ? (isDark ? '#3f3f46' : '#e5e5e5') : (isDark ? 'var(--accent-cyan)' : 'var(--accent-blue, #1d4ed8)')}`,
              }}
            >
              {executeGesture.isPending ? 'Executing...' : 'Execute Gesture Sequence'}
            </button>
          </div>
        </div>
      )}

      {/* Script Executor Panel */}
      {showScriptPanel && (
        <div
          className="mx-4 mb-4 rounded-lg overflow-hidden"
          style={{
            background: isDark ? '#18181b' : '#ffffff',
            border: isDark ? '2px solid #3f3f46' : '2px solid #e5e5e5',
          }}
        >
          {/* Script Panel Header */}
          <div
            className="flex items-center justify-between px-3 py-2"
            style={{
              background: isDark ? '#0f0f12' : '#f5f5f5',
              borderBottom: isDark ? '1px solid #3f3f46' : '1px solid #e5e5e5',
            }}
          >
            <span className="text-[10px] font-bold uppercase" style={{ color: isDark ? '#e4e4e7' : '#1a1a1a' }}>
              Execute Script
            </span>
            <button
              onClick={() => {
                setShowScriptPanel(false);
                setScriptText('');
              }}
              className="px-2 py-0.5 rounded text-[9px] font-bold uppercase transition-all hover:opacity-80"
              style={{
                background: 'transparent',
                color: isDark ? '#71717a' : '#666666',
                border: `1px solid ${isDark ? '#3f3f46' : '#cccccc'}`,
              }}
            >
              Close
            </button>
          </div>

          {/* Script Panel Content */}
          <div className="p-3">
            <p className="text-[9px] mb-2" style={{ color: isDark ? '#71717a' : '#666666' }}>
              Enter a shell command to execute on the device. Commands are validated against an allowlist for safety.
            </p>

            {/* Script Input */}
            <textarea
              value={scriptText}
              onChange={(e) => setScriptText(e.target.value)}
              placeholder={'e.g., "pm list packages" or "input tap 500 500"'}
              className="w-full px-2 py-1.5 rounded text-[11px] font-mono resize-y min-h-[80px]"
              style={{
                background: isDark ? '#1f1f23' : '#ffffff',
                color: isDark ? '#e4e4e7' : '#1a1a1a',
                border: isDark ? '2px solid #3f3f46' : '2px solid #cccccc',
              }}
            />

            {/* Execute Button */}
            <button
              onClick={async () => {
                if (!scriptText.trim()) return;
                setCommandResult(null);
                setShowResult(true);
                setViewMode('raw');

                try {
                  const result = await executeScript.mutateAsync({
                    script: scriptText,
                    platform: platform,
                    udid: selectedDevice || undefined,
                  });
                  setCommandResult({
                    success: result.success,
                    output: result.output,
                    error: result.error || undefined,
                  });
                } catch (err) {
                  setCommandResult({
                    success: false,
                    output: '',
                    error: err instanceof Error ? err.message : 'Script execution failed',
                  });
                }
              }}
              disabled={!scriptText.trim() || executeScript.isPending}
              className="w-full mt-3 px-3 py-2 rounded text-[10px] font-bold uppercase tracking-wider transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: !scriptText.trim() ? (isDark ? '#3f3f46' : '#e5e5e5') : (isDark ? 'var(--accent-cyan)' : 'var(--accent-blue, #1d4ed8)'),
                color: !scriptText.trim() ? (isDark ? '#71717a' : '#999999') : (isDark ? '#0a0a0c' : '#ffffff'),
                border: `2px solid ${!scriptText.trim() ? (isDark ? '#3f3f46' : '#e5e5e5') : (isDark ? 'var(--accent-cyan)' : 'var(--accent-blue, #1d4ed8)')}`,
              }}
            >
              {executeScript.isPending ? 'Executing...' : 'Execute Script'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Table View Component for Array/Object data
interface TableViewProps {
  data: string;
  filterText: string;
  setFilterText: (text: string) => void;
  sortColumn: string | null;
  sortDirection: 'asc' | 'desc';
  setSortColumn: (col: string) => void;
  setSortDirection: (dir: 'asc' | 'desc') => void;
  isDark: boolean;
}

function TableView({ data, filterText, setFilterText, sortColumn, sortDirection, setSortColumn, setSortDirection, isDark }: TableViewProps) {
  const parsed = useMemo(() => {
    try {
      const json = JSON.parse(data);
      if (Array.isArray(json)) return json;
      if (typeof json === 'object' && json !== null) return [json];
      return null;
    } catch {
      return null;
    }
  }, [data]);

  if (!parsed) {
    return (
      <div className="p-3">
        <pre className="text-[11px] font-mono whitespace-pre-wrap" style={{ color: isDark ? '#e4e4e7' : '#1a1a1a' }}>
          {data}
        </pre>
      </div>
    );
  }

  const columns = parsed.length > 0 ? Object.keys(parsed[0]) : [];

  const filteredData = useMemo(() => {
    if (!filterText) return parsed;
    return parsed.filter(row =>
      columns.some(col => String(row[col]).toLowerCase().includes(filterText.toLowerCase()))
    );
  }, [parsed, filterText, columns]);

  const sortedData = useMemo(() => {
    if (!sortColumn) return filteredData;
    return [...filteredData].sort((a, b) => {
      const aVal = String(a[sortColumn] ?? '');
      const bVal = String(b[sortColumn] ?? '');
      const cmp = aVal.localeCompare(bVal, undefined, { numeric: true });
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [filteredData, sortColumn, sortDirection]);

  const handleSort = (col: string) => {
    if (sortColumn === col) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(col);
      setSortDirection('asc');
    }
  };

  return (
    <div className="p-3">
      {/* Filter input */}
      <div className="mb-3">
        <input
          type="text"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          placeholder="Filter rows..."
          className="w-full px-2 py-1 rounded text-[10px]"
          style={{
            background: isDark ? '#1f1f23' : '#ffffff',
            color: isDark ? '#e4e4e7' : '#1a1a1a',
            border: isDark ? '2px solid #3f3f46' : '2px solid #cccccc',
          }}
        />
        <span className="text-[9px] mt-1 block" style={{ color: isDark ? '#71717a' : '#666666' }}>
          {sortedData.length} of {parsed.length} rows
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-[10px]">
          <thead>
            <tr style={{ background: isDark ? '#0f0f12' : '#f5f5f5' }}>
              {columns.map(col => (
                <th
                  key={col}
                  onClick={() => handleSort(col)}
                  className="px-2 py-1.5 text-left font-bold cursor-pointer select-none"
                  style={{
                    color: isDark ? '#e4e4e7' : '#1a1a1a',
                    borderBottom: isDark ? '1px solid #3f3f46' : '1px solid #e5e5e5',
                  }}
                >
                  <div className="flex items-center gap-1">
                    <span>{col}</span>
                    {sortColumn === col && (
                      <svg className={`w-2.5 h-2.5 ${sortDirection === 'desc' ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="18 15 12 9 6 15" />
                      </svg>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-2 py-3 text-center" style={{ color: isDark ? '#71717a' : '#666666' }}>
                  No matching rows
                </td>
              </tr>
            ) : sortedData.map((row, idx) => (
              <tr
                key={idx}
                style={{
                  background: idx % 2 === 0 ? 'transparent' : (isDark ? '#0f0f12' : '#f5f5f5'),
                  borderBottom: isDark ? '1px solid #3f3f46' : '1px solid #e5e5e5',
                }}
              >
                {columns.map(col => (
                  <td
                    key={col}
                    className="px-2 py-1.5 font-mono truncate max-w-[200px]"
                    style={{ color: isDark ? '#e4e4e7' : '#1a1a1a' }}
                    title={String(row[col] ?? '')}
                  >
                    {row[col] === null ? (
                      <span style={{ color: isDark ? '#71717a' : '#999999' }}>null</span>
                    ) : row[col] === undefined ? (
                      <span style={{ color: isDark ? '#71717a' : '#999999' }}>undefined</span>
                    ) : typeof row[col] === 'object' ? (
                      <span style={{ color: isDark ? '#a78bfa' : '#7c3aed' }}>
                        {JSON.stringify(row[col])}
                      </span>
                    ) : (
                      String(row[col])
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}