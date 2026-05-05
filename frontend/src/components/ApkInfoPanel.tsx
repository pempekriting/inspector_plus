import { useState, useMemo } from "react";
import { useThemeStore } from "../stores/themeStore";
import { useDeviceStore } from "../stores/deviceStore";
import { useInstalledPackages, useAppInfo } from "../services/api";
import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "../services/api";
import { getApiUrl } from "../config/apiConfig";

// SDK version to name map
const SDK_NAMES: Record<number, string> = {
  21: "Android 5.0 (Lollipop)",
  22: "Android 5.1 (Lollipop)",
  23: "Android 6.0 (Marshmallow)",
  24: "Android 7.0 (Nougat)",
  25: "Android 7.1 (Nougat)",
  26: "Android 8.0 (Oreo)",
  27: "Android 8.1 (Oreo)",
  28: "Android 9 (Pie)",
  29: "Android 10",
  30: "Android 11",
  31: "Android 12",
  32: "Android 12L",
  33: "Android 13",
  34: "Android 14",
  35: "Android 15",
  36: "Android 16",
};

function getSdkName(sdk: number): string {
  return SDK_NAMES[sdk] ?? `API ${sdk}`;
}

function PermissionBadge({ group }: { group: string }) {
  const groupColors: Record<string, string> = {
    "📅 Calendar": "#f59e0b",
    "📷 Camera": "#3b82f6",
    "📇 Contacts": "#6366f1",
    "📍 Location": "#10b981",
    "🎤 Microphone": "#ec4899",
    "📞 Phone": "#8b5cf6",
    "🔋 Sensors": "#14b8a6",
    "💬 SMS": "#06b6d4",
    "💾 Storage": "#f97316",
    "📡 Nearby Devices": "#84cc16",
    Other: "#71717a",
  };
  const color = groupColors[group] ?? "#71717a";
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold"
      style={{ background: `${color}22`, color, border: `1px solid ${color}44` }}
    >
      {group}
    </span>
  );
}

export function ApkInfoPanel({ isDark }: { isDark: boolean }) {
  const { theme } = useThemeStore();
  const { devices, selectedDevice } = useDeviceStore();
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [packagesLoaded, setPackagesLoaded] = useState(false);

  const currentDevice = devices.find((d) => d.udid === selectedDevice);
  const platform = currentDevice?.platform ?? "android";
  const isIOS = platform === "ios";

  // Only fetch packages when user clicks Load (lazy load)
  const { data: packages = [], isLoading: loadingPkgs, refetch } = useInstalledPackages(packagesLoaded, selectedDevice);

  const handleLoadPackages = () => {
    setPackagesLoaded(true);
  };
  const { data: appInfo, isLoading: loadingInfo } = useAppInfo(selectedPackage, selectedDevice);

  const launchMutation = useMutation({
    mutationFn: (pkg: string) => {
      const url = selectedDevice
        ? `${getApiUrl()}/commands/execute?udid=${encodeURIComponent(selectedDevice)}`
        : `${getApiUrl()}/commands/execute`;
      return apiFetch<{ success: boolean; output: string }>(
        url,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "launch_app", params: { package: pkg } }),
        }
      );
    },
  });

  // Filter packages by search
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
    <div className="flex flex-1 min-h-0" style={{ background: isDark ? "#111114" : "#ffffff" }}>
      {/* Left: Package List */}
      <div
        className="flex flex-col"
        style={{
          width: "220px",
          borderRight: isDark ? "2px solid #27272a" : "2px solid #e5e5e5",
        }}
      >
        {/* Search */}
        <div
          className="px-2 py-1.5"
          style={{ borderBottom: isDark ? "1px solid #27272a" : "1px solid #e5e5e5" }}
        >
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={isIOS ? "Search apps..." : "Search packages..."}
            className="w-full px-2 py-1 rounded text-[10px] font-mono"
            style={{
              background: isDark ? "#1f1f23" : "#f5f5f5",
              color: isDark ? "#e4e4e7" : "#1a1a1a",
              border: isDark ? "1.5px solid #3f3f46" : "1.5px solid #cccccc",
              outline: "none",
            }}
          />
        </div>

        {/* Package count */}
        <div
          className="px-2 py-1 flex items-center justify-between"
          style={{ borderBottom: isDark ? "1px solid #27272a" : "1px solid #e5e5e5" }}
        >
          <span className="text-[9px] font-bold uppercase" style={{ color: isDark ? "#52525b" : "#999999" }}>
            {loadingPkgs ? "Loading..." : `${filteredPackages.length} ${isIOS ? "apps" : "packages"}`}
          </span>
          {!packagesLoaded && !loadingPkgs && (
            <button
              onClick={handleLoadPackages}
              className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase"
              style={{ background: isDark ? "var(--accent-cyan)" : "#0066cc", color: "#000" }}
            >
              Load
            </button>
          )}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {!packagesLoaded ? (
            <div className="p-3 text-center">
              <span className="text-[10px]" style={{ color: isDark ? "#52525b" : "#999999" }}>
                Click Load to fetch {isIOS ? "apps" : "packages"}
              </span>
            </div>
          ) : loadingPkgs ? (
            <div className="p-3 space-y-1">
              {[...Array(8)].map((_, i) => (
                <div
                  key={i}
                  className="h-6 rounded animate-pulse"
                  style={{ background: isDark ? "#1f1f23" : "#f0f0f0" }}
                />
              ))}
            </div>
          ) : filteredPackages.length === 0 ? (
            <div className="p-3 text-center">
              <span className="text-[10px]" style={{ color: isDark ? "#52525b" : "#999999" }}>
                No {isIOS ? "apps" : "packages"} found
              </span>
            </div>
          ) : (
            filteredPackages.map((pkg) => {
              const isSelected = pkg === selectedPackage;
              return (
                <button
                  key={pkg}
                  onClick={() => setSelectedPackage(pkg)}
                  className="w-full text-left px-2 py-1.5 text-[10px] font-mono truncate transition-all"
                  style={{
                    background: isSelected ? (isDark ? "#1f1f23" : "#f0f0f0") : "transparent",
                    color: isSelected
                      ? (isDark ? "var(--accent-cyan)" : "#0066cc")
                      : (isDark ? "#71717a" : "#666666"),
                    borderLeft: isSelected
                      ? `2px solid ${isDark ? "var(--accent-cyan)" : "#0066cc"}`
                      : "2px solid transparent",
                  }}
                  title={pkg}
                >
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
          <div className="flex items-center justify-center h-full">
            <div className="text-center px-6">
              <div
                className="w-10 h-10 mx-auto mb-3 rounded-lg flex items-center justify-center"
                style={{ background: isDark ? "#1f1f23" : "#f5f5f5", border: isDark ? "2px solid #3f3f46" : "2px solid #e5e5e5" }}
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: isDark ? "#3f3f46" : "#cccccc" }}>
                  <rect x="5" y="2" width="14" height="20" rx="2" />
                  <line x1="12" y1="18" x2="12" y2="18.01" strokeWidth="3" strokeLinecap="round" />
                </svg>
              </div>
              <p className="text-[11px] font-bold mb-1" style={{ color: isDark ? "#52525b" : "#999999" }}>
                No app selected
              </p>
              <p className="text-[10px]" style={{ color: isDark ? "#3f3f46" : "#cccccc" }}>
                Pick an app from the list to see its details
              </p>
            </div>
          </div>
        ) : loadingInfo ? (
          <div className="p-4 space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="space-y-1">
                <div className="h-3 w-20 rounded animate-pulse" style={{ background: isDark ? "#1f1f23" : "#f0f0f0" }} />
                <div className="h-4 w-full rounded animate-pulse" style={{ background: isDark ? "#27272a" : "#e5e5e5" }} />
              </div>
            ))}
          </div>
        ) : appInfo ? (
          <div className="p-4 space-y-4">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-[13px] font-bold truncate" style={{ color: isDark ? "#e4e4e7" : "#1a1a1a" }}>
                    {isIOS ? (appInfo.displayName || appInfo.packageName) : appInfo.packageName}
                  </h3>
                  <span
                    className="flex-shrink-0 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase"
                    style={{
                      background: isDark ? "#1f1f23" : "#f0f0f0",
                      color: isIOS ? (isDark ? "#a78bfa" : "#7c3aed") : (isDark ? "#34d399" : "#059669"),
                      border: `1px solid ${isIOS ? (isDark ? "#a78bfa33" : "#7c3aed33") : (isDark ? "#34d39933" : "#05966933")}`,
                    }}
                  >
                    {isIOS ? "iOS" : "Android"}
                  </span>
                </div>
                <p className="text-[10px] font-mono mt-0.5 truncate" style={{ color: isDark ? "#52525b" : "#999999" }}>
                  {isIOS ? (appInfo.bundleIdentifier || appInfo.packageName) : appInfo.packageName}
                </p>
              </div>
              <button
                onClick={() => launchMutation.mutate(appInfo.packageName)}
                disabled={launchMutation.isPending}
                className="flex-shrink-0 px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider transition-all active:scale-95 disabled:opacity-50"
                style={{
                  background: isDark ? "var(--accent-cyan)" : "#0066cc",
                  color: "#000",
                  border: `1.5px solid ${isDark ? "var(--accent-cyan)" : "#0066cc"}`,
                }}
              >
                {launchMutation.isPending ? "..." : "Launch"}
              </button>
            </div>

            {/* Version cards */}
            <div className="grid grid-cols-2 gap-2">
              {isIOS
                ? [
                    { label: "Version", value: appInfo.versionName || "Unknown" },
                    ...(appInfo.versionCode ? [{ label: "Build", value: String(appInfo.versionCode) }] : []),
                    ...(appInfo.minimumOSVersion ? [{ label: "Min iOS", value: appInfo.minimumOSVersion }] : []),
                    ...(appInfo.bundleIdentifier ? [{ label: "Bundle ID", value: appInfo.bundleIdentifier }] : []),
                    ...(appInfo.installType ? [{ label: "Install Type", value: appInfo.installType }] : []),
                    ...(appInfo.architectures ? [{ label: "Architecture", value: appInfo.architectures }] : []),
                  ].map(({ label, value }) => (
                    <div
                      key={label}
                      className="rounded p-2"
                      style={{ background: isDark ? "#1f1f23" : "#f5f5f5", border: isDark ? "1.5px solid #3f3f46" : "1.5px solid #e5e5e5" }}
                    >
                      <div className="text-[8px] font-bold uppercase tracking-wider mb-0.5" style={{ color: isDark ? "#52525b" : "#999999" }}>
                        {label}
                      </div>
                      <div className="text-[10px] font-mono font-bold truncate" style={{ color: isDark ? "#e4e4e7" : "#1a1a1a" }}>
                        {value}
                      </div>
                    </div>
                  ))
                : [
                    { label: "Version", value: appInfo.versionName },
                    { label: "Version Code", value: String(appInfo.versionCode) },
                    { label: "Min SDK", value: `${appInfo.minSdk} (${getSdkName(appInfo.minSdk)})` },
                    { label: "Target SDK", value: `${appInfo.targetSdk} (${getSdkName(appInfo.targetSdk)})` },
                  ].map(({ label, value }) => (
                <div
                  key={label}
                  className="rounded p-2"
                  style={{ background: isDark ? "#1f1f23" : "#f5f5f5", border: isDark ? "1.5px solid #3f3f46" : "1.5px solid #e5e5e5" }}
                >
                  <div className="text-[8px] font-bold uppercase tracking-wider mb-0.5" style={{ color: isDark ? "#52525b" : "#999999" }}>
                    {label}
                  </div>
                  <div className="text-[10px] font-mono font-bold truncate" style={{ color: isDark ? "#e4e4e7" : "#1a1a1a" }}>
                    {value}
                  </div>
                </div>
              ))}
            </div>

            {/* Timestamps + Installer — Android only */}
            {!isIOS && (
            <div className="space-y-1">
              {[
                { label: "First Installed", value: appInfo.firstInstallTime },
                { label: "Last Updated", value: appInfo.lastUpdateTime },
                { label: "Installed By", value: appInfo.installerPackage },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between py-0.5">
                  <span className="text-[9px] font-bold uppercase" style={{ color: isDark ? "#52525b" : "#999999" }}>
                    {label}
                  </span>
                  <span className="text-[10px] font-mono" style={{ color: isDark ? "#71717a" : "#666666" }}>
                    {value}
                  </span>
                </div>
              ))}
            </div>
            )}

            {/* Permissions */}
            {isIOS ? (
              // iOS: permission descriptions from Info.plist
              appInfo.permissions.length > 0 ? (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] font-bold uppercase" style={{ color: isDark ? "#e4e4e7" : "#1a1a1a" }}>
                      Permission Descriptions
                    </span>
                    <span
                      className="px-1.5 py-0.5 rounded text-[9px] font-bold"
                      style={{ background: isDark ? "#1f1f23" : "#f0f0f0", color: isDark ? "#71717a" : "#666666", border: `1px solid ${isDark ? "#3f3f46" : "#e5e5e5"}` }}
                    >
                      {appInfo.permissions.length}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {appInfo.permissions.map((perm) => (
                      <div
                        key={perm.name}
                        className="rounded p-2"
                        style={{
                          background: isDark ? "#1f1f23" : "#f5f5f5",
                          border: isDark ? "1px solid #27272a" : "1px solid #e5e5e5",
                        }}
                      >
                        <div className="text-[9px] font-bold mb-0.5" style={{ color: isDark ? "#a78bfa" : "#7c3aed" }}>
                          {perm.label}
                        </div>
                        <div className="text-[9px]" style={{ color: isDark ? "#71717a" : "#666666" }}>
                          {perm.description}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div
                  className="rounded p-3 text-center"
                  style={{ background: isDark ? "#1f1f23" : "#f5f5f5", border: isDark ? "1.5px solid #3f3f46" : "1.5px solid #e5e5e5" }}
                >
                  <span className="text-[10px]" style={{ color: isDark ? "#52525b" : "#999999" }}>
                    No permission descriptions available
                  </span>
                </div>
              )
            ) : (
              // Android: permissions with grant status
              appInfo.permissions.length > 0 ? (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase" style={{ color: isDark ? "#e4e4e7" : "#1a1a1a" }}>
                        Permissions
                      </span>
                      <span
                        className="px-1.5 py-0.5 rounded text-[9px] font-bold"
                        style={{ background: isDark ? "#1f1f23" : "#f0f0f0", color: isDark ? "#71717a" : "#666666", border: `1px solid ${isDark ? "#3f3f46" : "#e5e5e5"}` }}
                      >
                        {appInfo.grantedCount}/{appInfo.permissionCount}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {Object.entries(groupedPermissions).map(([group, perms]) => (
                      <div key={group}>
                        <div className="flex items-center gap-1.5 mb-1">
                          <PermissionBadge group={group} />
                          <span className="text-[8px]" style={{ color: isDark ? "#3f3f46" : "#cccccc" }}>
                            {perms.length}
                          </span>
                        </div>
                        <div className="space-y-0.5 ml-1">
                          {perms.map((perm) => (
                            <div
                              key={perm.name}
                              className="flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[9px]"
                              style={{
                                background: isDark ? "#1f1f23" : "#f5f5f5",
                                border: isDark ? "1px solid #27272a" : "1px solid #e5e5e5",
                              }}
                            >
                              <div
                                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                style={{ background: perm.granted ? "#10b981" : "#52525b" }}
                              />
                              <span
                                className="flex-1 truncate font-mono"
                                style={{ color: perm.granted ? (isDark ? "#10b981" : "#047857") : (isDark ? "#71717a" : "#999999") }}
                                title={perm.name}
                              >
                                {perm.label}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div
                  className="rounded p-3 text-center"
                  style={{ background: isDark ? "#1f1f23" : "#f5f5f5", border: isDark ? "1.5px solid #3f3f46" : "1.5px solid #e5e5e5" }}
                >
                  <span className="text-[10px]" style={{ color: isDark ? "#52525b" : "#999999" }}>
                    No permissions requested
                  </span>
                </div>
              )
            )}
          </div>
        ) : (
          <div className="p-4">
            <div
              className="rounded p-3 text-center"
              style={{
                background: isDark ? "#1f1f23" : "#f5f5f5",
                border: `1.5px solid ${isDark ? "#fb7185" : "#dc2626"}`,
                color: isDark ? "#fb7185" : "#dc2626",
              }}
            >
              <span className="text-[10px] font-bold">{isIOS ? "App not found" : "Package not found"}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
