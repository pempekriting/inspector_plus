import { useState, useRef, useEffect } from "react";
import { useDeviceStore } from "../stores/deviceStore";
import { useThemeStore } from "../stores/themeStore";
import { checkDeviceStatus, selectDevice } from "../hooks/useDevice";
import { useDeviceStatus } from "../services/api";

interface DevicePanelProps {
  onDeviceChange?: () => void;
}

export function DevicePanel({ onDeviceChange }: DevicePanelProps) {
  const { devices, selectedDevice, setDevices, setSelectedDevice, setConnected } = useDeviceStore();
  const { data: status } = useDeviceStatus();
  const connected = status?.connected ?? false;

  // Sync status data to deviceStore
  useEffect(() => {
    if (!status) return;
    const devices = status.devices || [];
    setDevices(devices);

    const anyConnected = devices.some(d => d.state === "device" || d.state === "connected" || d.state === "unknown");
    setConnected(anyConnected);

    if (devices.length === 0 || !anyConnected) {
      // No devices or none connected — clear selection so HierarchyTree/ScreenshotCanvas show empty state
      setSelectedDevice(null);
    } else if (!selectedDevice) {
      // Devices came back but no device selected — auto-select first connected device
      const firstConnected = devices.find(d => d.state === "device" || d.state === "connected" || d.state === "unknown");
      if (firstConnected) {
        setSelectedDevice(firstConnected.udid || firstConnected.serial || null);
      }
    } else {
      // Keep existing selectedDevice if it's still in the list
      const stillConnected = devices.some(d => (d.udid || d.serial) === selectedDevice);
      if (!stillConnected) {
        setSelectedDevice(null);
      }
    }
  }, [status, setDevices, setSelectedDevice, setConnected]);
  const { theme, toggleTheme } = useThemeStore();
  const [dropdownOpen, setDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleDeviceSelect = async (serial: string | null) => {
    if (serial === selectedDevice) {
      setDropdownOpen(false);
      return;
    }
    setDropdownOpen(false);
    try {
      await selectDevice(serial);
      setSelectedDevice(serial);
      onDeviceChange?.();
    } catch {
      // silently fail
    }
  };

  const currentDevice = devices.find(d => d.udid === selectedDevice || d.serial === selectedDevice);
  const isDark = theme === 'dark';

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={toggleTheme}
        className="w-8 h-8 flex items-center justify-center rounded-lg transition-transform active:scale-95"
        style={{
          background: isDark ? '#1f1f23' : '#ffffff',
          border: isDark ? '2px solid #3f3f46' : '2px solid #1a1a1a',
          boxShadow: isDark ? '3px 3px 0 #000' : '3px 3px 0 #1a1a1a',
          color: isDark ? '#e4e4e7' : '#1a1a1a',
        }}
      >
        {isDark ? (
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="5" />
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
          </svg>
        ) : (
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
          </svg>
        )}
      </button>

      <div
        className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider"
        style={{
          background: connected
            ? (isDark ? 'rgba(52, 211, 153, 0.2)' : 'rgba(0, 102, 204, 0.15)')
            : (isDark ? 'rgba(251, 113, 133, 0.2)' : 'rgba(220, 38, 38, 0.15)'),
          color: connected
            ? (isDark ? '#10b981' : '#047857')
            : (isDark ? '#fb7185' : '#dc2626'),
          border: connected
            ? (isDark ? '2px solid #10b981' : '2px solid #047857')
            : (isDark ? '2px solid #fb7185' : '2px solid #dc2626'),
        }}
      >
        <span className="w-2 h-2 rounded-full" style={{ background: connected ? '#10b981' : '#fb7185' }} />
        {connected ? 'Online' : 'Offline'}
      </div>

      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-bold transition-all duration-150"
          style={{
            background: isDark ? '#1f1f23' : '#ffffff',
            color: isDark ? '#a1a1aa' : '#4a4a4a',
            border: isDark ? '2px solid #3f3f46' : '2px solid #1a1a1a',
            boxShadow: isDark ? '3px 3px 0 #000' : '3px 3px 0 #1a1a1a',
          }}
        >
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <rect x="5" y="2" width="14" height="20" rx="2" />
            <line x1="12" y1="18" x2="12" y2="18.01" strokeWidth="3" strokeLinecap="round" />
          </svg>
          <span className="max-w-[100px] truncate">
            {currentDevice ? (currentDevice.name || currentDevice.model || currentDevice.udid || currentDevice.serial) : 'Select'}
          </span>
          <svg className={`w-3 h-3 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>

        {dropdownOpen && (
          <div
            className="absolute right-0 top-full mt-2 z-50 rounded-lg overflow-hidden"
            style={{
              background: isDark ? '#18181b' : '#ffffff',
              border: isDark ? '3px solid #3f3f46' : '3px solid #1a1a1a',
              boxShadow: '6px 6px 0 #000',
              minWidth: '220px',
            }}
          >
            <div
              className="px-3 py-2 font-bold text-[9px] uppercase tracking-wider"
              style={{
                background: isDark ? '#1f1f23' : '#e5e5e5',
                color: isDark ? '#71717a' : '#666666',
                borderBottom: isDark ? '2px solid #3f3f46' : '2px solid #1a1a1a',
              }}
            >
              Select Device
            </div>
            {devices.map((device) => {
              const deviceKey = device.udid || device.serial || '';
              return (
              <button
                key={deviceKey}
                onClick={() => handleDeviceSelect(deviceKey)}
                className="w-full px-3 py-2.5 text-left text-[11px] font-medium transition-colors flex items-center gap-3"
                style={{
                  color: selectedDevice === deviceKey
                    ? (isDark ? 'var(--accent-cyan)' : '#0066cc')
                    : (isDark ? '#a1a1aa' : '#4a4a4a'),
                  background: selectedDevice === deviceKey
                    ? (isDark ? '#1f1f23' : '#f0f0f0')
                    : 'transparent',
                  borderBottom: isDark ? '1px solid #27272a' : '1px solid #e5e5e5',
                }}
              >
                <span
                  className="w-3 h-3 rounded-sm flex-shrink-0"
                  style={{
                    background: (device.state === 'device' || device.state === 'connected' || device.state === 'unknown' || device.state === 'Booted')
                      ? (isDark ? '#10b981' : '#047857')
                      : (isDark ? '#fbbf24' : '#f59e0b'),
                  }}
                />
                <div className="flex flex-col min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-bold">{device.name || device.model || 'Unknown'}</span>
                    {device.platform === 'ios' && device.os_version && (
                      <span
                        className="text-[9px] px-1.5 py-0.5 rounded font-mono flex-shrink-0"
                        style={{
                          background: isDark ? '#1f1f23' : '#e5e5e5',
                          color: isDark ? '#71717a' : '#666666',
                        }}
                      >
                        iOS {device.os_version}
                      </span>
                    )}
                    {device.platform !== 'ios' && device.android_version && (
                      <span
                        className="text-[9px] px-1.5 py-0.5 rounded font-mono flex-shrink-0"
                        style={{
                          background: isDark ? '#1f1f23' : '#e5e5e5',
                          color: isDark ? '#71717a' : '#666666',
                        }}
                      >
                        API {device.android_version}
                      </span>
                    )}
                    {device.platform && (
                      <span
                        className="text-[9px] px-1.5 py-0.5 rounded font-mono flex-shrink-0"
                        style={{
                          background: isDark ? '#1f1f23' : '#e5e5e5',
                          color: isDark ? '#a78bfa' : '#7c3aed',
                        }}
                      >
                        {device.platform.toUpperCase()}
                      </span>
                    )}
                  </div>
                  <span className="text-[9px] font-mono" style={{ color: isDark ? '#52525b' : '#999999' }}>
                    {deviceKey}
                  </span>
                </div>
              </button>
              );
            })}
            {devices.length === 0 && (
              <div className="px-3 py-6 text-center">
                <div className="text-[11px] font-bold mb-1" style={{ color: isDark ? '#fbbf24' : '#f59e0b' }}>
                  No devices found
                </div>
                <div className="text-[10px]" style={{ color: isDark ? '#71717a' : '#666666' }}>
                  Start emulator or connect via USB
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
