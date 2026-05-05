import { useState, useRef, useEffect } from "react";
import { useDeviceStore } from "../stores/deviceStore";
import { useThemeStore } from "../stores/themeStore";
import { selectDevice } from "../hooks/useDevice";
import { useDeviceStatus } from "../services/api";

interface DevicePanelProps {
  onDeviceChange?: () => void;
}

export function DevicePanel({ onDeviceChange }: DevicePanelProps) {
  const { devices, selectedDevice, setDevices, setSelectedDevice, setConnected } = useDeviceStore();
  const { data: status } = useDeviceStatus();
  const { theme } = useThemeStore();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isDark = theme === 'dark';

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

  // Sync status data to deviceStore
  useEffect(() => {
    if (!status) return;
    const devices = status.devices || [];
    setDevices(devices);

    const anyConnected = devices.some(d => d.state === "device" || d.state === "connected" || d.state === "unknown");
    setConnected(anyConnected);

    if (devices.length === 0 || !anyConnected) {
      setSelectedDevice(null);
    } else if (!selectedDevice) {
      const firstConnected = devices.find(d => d.state === "device" || d.state === "connected" || d.state === "unknown");
      if (firstConnected) {
        setSelectedDevice(firstConnected.udid || firstConnected.serial || null);
      }
    } else {
      const stillConnected = devices.some(d => (d.udid || d.serial) === selectedDevice);
      if (!stillConnected) {
        setSelectedDevice(null);
      }
    }
  }, [status, setDevices, setSelectedDevice, setConnected, selectedDevice]);

  return (
    <div className="relative" ref={dropdownRef} style={{ maxWidth: '100%' }}>
      <button
        onClick={() => setDropdownOpen(!dropdownOpen)}
        className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-[10px] font-bold transition-all duration-150"
        style={{
          background: "var(--bg-elevated)",
          color: "var(--text-secondary)",
          border: "2px solid var(--border-default)",
          boxShadow: "2px 2px 0 var(--border-default)",
        }}
      >
        <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <rect x="5" y="2" width="14" height="20" rx="2" />
          <line x1="12" y1="18" x2="12" y2="18.01" strokeWidth="3" strokeLinecap="round" />
        </svg>
        <span className="truncate max-w-[140px]">
          {currentDevice ? (currentDevice.name || currentDevice.model || currentDevice.udid || currentDevice.serial) : 'Select'}
        </span>
        <svg className={`w-3 h-3 flex-shrink-0 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {dropdownOpen && (
        <div
          className="absolute left-0 top-full mt-2 z-50 rounded-lg overflow-hidden"
          style={{
            background: "var(--bg-secondary)",
            border: "var(--nb-border)",
            boxShadow: isDark ? "var(--nb-shadow-dark)" : "var(--nb-shadow-light)",
            minWidth: "280px",
            maxWidth: "360px",
          }}
        >
          <div
            className="px-3 py-2 font-bold text-[9px] uppercase tracking-wider"
            style={{
              background: "var(--bg-tertiary)",
              color: "var(--text-tertiary)",
              borderBottom: "2px solid var(--border-subtle)",
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
                  ? "var(--accent-cyan)"
                  : "var(--text-secondary)",
                background: selectedDevice === deviceKey
                  ? "var(--bg-tertiary)"
                  : "transparent",
                borderBottom: "1px solid var(--border-subtle)",
              }}
            >
              <span
                className="w-3 h-3 rounded-sm flex-shrink-0"
                style={{
                  background: (device.state === 'device' || device.state === 'connected' || device.state === 'unknown' || device.state === 'Booted')
                    ? "var(--accent-emerald)"
                    : "var(--accent-amber)",
                }}
              />
              <div className="flex flex-col min-w-0 flex-1 gap-0.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="truncate font-bold flex-1 min-w-0">{device.name || device.model || 'Unknown'}</span>
                  {device.platform === 'ios' && device.os_version && (
                    <span
                      className="text-[9px] px-1.5 py-0.5 rounded font-mono flex-shrink-0"
                      style={{
                        background: "var(--bg-tertiary)",
                        color: "var(--text-tertiary)",
                      }}
                    >
                      iOS {device.os_version}
                    </span>
                  )}
                  {device.platform !== 'ios' && device.android_version && (
                    <span
                      className="text-[9px] px-1.5 py-0.5 rounded font-mono flex-shrink-0"
                      style={{
                        background: "var(--bg-tertiary)",
                        color: "var(--text-tertiary)",
                      }}
                    >
                      API {device.android_version}
                    </span>
                  )}
                  {device.platform && (
                    <span
                      className="text-[9px] px-1.5 py-0.5 rounded font-mono flex-shrink-0"
                      style={{
                        background: "var(--bg-tertiary)",
                        color: "var(--accent-violet)",
                      }}
                    >
                      {device.platform.toUpperCase()}
                    </span>
                  )}
                </div>
                <span className="text-[9px] font-mono truncate" style={{ color: "var(--text-tertiary)" }}>
                  {deviceKey}
                </span>
              </div>
            </button>
            );
          })}
          {devices.length === 0 && (
            <div className="px-3 py-6 text-center">
              <div className="text-[11px] font-bold mb-1" style={{ color: "var(--accent-amber)" }}>
                No devices found
              </div>
              <div className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                Start emulator or connect via USB
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}