import React, { useState } from "react";
import { useThemeStore } from "../stores/themeStore";
import { useDeviceStore } from "../stores/deviceStore";
import { useCommands, CommandResult } from "../hooks/useCommands";

export function CommandsPanel() {
  const { theme } = useThemeStore();
  const isDark = theme === 'dark';
  const { executeCommand, isExecuting } = useCommands();
  const { selectedDevice, devices } = useDeviceStore();

  const selectedDev = devices.find(d => d.udid === selectedDevice);
  const platform = selectedDev?.platform ?? 'android';

  const [packageName, setPackageName] = useState("");
  const [apkFile, setApkFile] = useState<File | null>(null);
  const [commandResult, setCommandResult] = useState<CommandResult | null>(null);
  const [showAndroid, setShowAndroid] = useState(false);
  const [showIos, setShowIos] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleExecute = async (type: string, params?: Record<string, unknown>) => {
    setCommandResult(null);
    const result = await executeCommand(type, params);
    setCommandResult(result);
  };

  const androidCommands = [
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
      name: "Install App (APK)",
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

  const iosCommands = [
    {
      id: "list_apps_ios",
      name: "List Installed Apps",
      description: "Get list of all installed bundle IDs",
      type: "list_apps",
      params: {},
    },
    {
      id: "check_app_ios",
      name: "Check App Installed",
      description: "Check if a specific app is installed",
      type: "check_app",
      params: { bundle_id: packageName },
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

  const platformControlsAndroid = [
    {
      id: "press_keycode",
      name: "Press Keycode",
      description: "Send hardware key event",
      type: "press_keycode",
      params: { keycode: 3 },
    },
    {
      id: "open_notifications",
      name: "Open Notifications",
      description: "Pull down notification shade",
      type: "open_notifications",
      params: {},
    },
    {
      id: "toggle_airplane",
      name: "Toggle Airplane Mode",
      description: "Toggle airplane mode on/off",
      type: "toggle_airplane",
      params: {},
    },
    {
      id: "toggle_wifi",
      name: "Toggle WiFi",
      description: "Toggle WiFi on/off",
      type: "toggle_wifi",
      params: {},
    },
    {
      id: "toggle_mobile_data",
      name: "Toggle Mobile Data",
      description: "Toggle mobile data on/off",
      type: "toggle_mobile_data",
      params: {},
    },
  ];

  const platformControlsIos = [
    {
      id: "touch_id",
      name: "Simulate Touch ID",
      description: "Simulate Touch ID (iOS Simulator)",
      type: "touch_id",
      params: {},
    },
    {
      id: "open_url_ios",
      name: "Open URL",
      description: "Open URL in Safari",
      type: "open_url",
      params: { url: packageName },
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

  const advancedCommands = [
    {
      id: "screen_record",
      name: "Screen Recording",
      description: "Start/stop screen recording",
      type: "screen_record",
      params: {},
    },
    {
      id: "get_device_info",
      name: "Get Device Info",
      description: "Get orientation, size, density",
      type: "get_device_info",
      params: {},
    },
  ];

  type CommandItem = {
    id: string;
    name: string;
    description: string;
    type: string;
    params: Record<string, unknown>;
    input?: React.ReactNode;
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
          {commands.map((cmd) => (
            <div
              key={cmd.id}
              className="rounded-lg p-3"
              style={{
                background: isDark ? '#18181b' : '#ffffff',
                border: isDark ? '2px solid #3f3f46' : '2px solid #e5e5e5',
              }}
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="text-[12px] font-bold" style={{ color: isDark ? '#e4e4e7' : '#1a1a1a' }}>
                    {cmd.name}
                  </h3>
                  <p className="text-[10px] mt-0.5" style={{ color: isDark ? '#71717a' : '#666666' }}>
                    {cmd.description}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 mb-2">
                {cmd.input}
                <button
                  onClick={() => handleExecute(cmd.type, cmd.params)}
                  disabled={isExecuting}
                  className="px-2 py-1.5 rounded text-[9px] font-bold uppercase tracking-wider transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    background: isExecuting ? (isDark ? '#3f3f46' : '#e5e5e5') : (isDark ? 'var(--accent-cyan)' : '#0066cc'),
                    color: isExecuting ? (isDark ? '#71717a' : '#999999') : (isDark ? '#0a0a0c' : '#ffffff'),
                    border: `2px solid ${isExecuting ? (isDark ? '#3f3f46' : '#e5e5e5') : (isDark ? 'var(--accent-cyan)' : '#0066cc')}`,
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

  const commands = platform === 'ios' ? iosCommands : androidCommands;
  const platformControls = platform === 'ios' ? platformControlsIos : platformControlsAndroid;

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Platform Badge */}
      <div
        className="px-4 py-2 flex items-center gap-2"
        style={{ borderBottom: isDark ? '1px solid #3f3f46' : '1px solid #e5e5e5' }}
      >
        <span
          className="px-2 py-0.5 rounded text-[9px] font-bold uppercase"
          style={{
            background: platform === 'ios' ? '#f5f5f5' : '#1f1f23',
            color: platform === 'ios' ? '#1a1a1a' : 'var(--accent-cyan)',
            border: platform === 'ios' ? '1px solid #cccccc' : '1px solid #3f3f46',
          }}
        >
          {platform === 'ios' ? 'iOS' : 'Android'}
        </span>
        <span className="text-[10px]" style={{ color: isDark ? '#71717a' : '#666666' }}>
          {selectedDevice ? `Connected: ${selectedDevice.slice(0, 8)}...` : 'No device selected'}
        </span>
      </div>

      {/* Core App Commands */}
      {renderSection('App Commands', commands, true, () => {})}

      {/* Platform Controls */}
      {renderSection('Platform Controls', platformControls, showAndroid, () => setShowAndroid(!showAndroid))}

      {/* Advanced Features */}
      {renderSection('Advanced', advancedCommands, showAdvanced, () => setShowAdvanced(!showAdvanced))}

      {/* Command Result */}
      {commandResult && (
        <div
          className="mx-4 mb-4 p-3 rounded text-[11px] font-mono whitespace-pre-wrap overflow-auto max-h-[200px]"
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
  );
}