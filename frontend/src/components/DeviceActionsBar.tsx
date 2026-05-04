import { useState, memo } from "react";
import { useHierarchyStore } from "../stores/hierarchyStore";
import { useDeviceStore } from "../stores/deviceStore";
import { useThemeStore } from "../stores/themeStore";
import { inputDeviceText } from "../hooks/useDevice";
import { LayoutChips } from "./StylePanel";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8001";

async function pressKey(key: string, udid?: string): Promise<void> {
  const url = udid ? `${API_BASE}/device/press-key?udid=${encodeURIComponent(udid)}` : `${API_BASE}/device/press-key`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key }),
  });
  if (!res.ok) throw new Error(`Failed to press ${key}`);
}

async function swipeDevice(startX: number, startY: number, endX: number, endY: number, duration?: number, udid?: string): Promise<void> {
  const url = udid ? `${API_BASE}/device/swipe?udid=${encodeURIComponent(udid)}` : `${API_BASE}/device/swipe`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ startX, startY, endX, endY, duration: duration ?? 300 }),
  });
  if (!res.ok) throw new Error("Failed to swipe");
}

async function dragDevice(startX: number, startY: number, endX: number, endY: number, duration?: number, udid?: string): Promise<void> {
  const url = udid ? `${API_BASE}/device/drag?udid=${encodeURIComponent(udid)}` : `${API_BASE}/device/drag`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ startX, startY, endX, endY, duration: duration ?? 500 }),
  });
  if (!res.ok) throw new Error("Failed to drag");
}

async function pinchDevice(x: number, y: number, scale: number, udid?: string): Promise<void> {
  const url = udid ? `${API_BASE}/device/pinch?udid=${encodeURIComponent(udid)}` : `${API_BASE}/device/pinch`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ x, y, scale }),
  });
  if (!res.ok) throw new Error("Failed to pinch");
}

async function tapDevice(x: number, y: number, udid?: string): Promise<void> {
  const url = udid ? `${API_BASE}/tap?udid=${encodeURIComponent(udid)}` : `${API_BASE}/tap`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ x, y }),
  });
  if (!res.ok) throw new Error("Failed to tap");
}

interface ActionPillProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  isDark: boolean;
  variant?: "default" | "primary" | "danger";
}

const ActionPill = memo(function ActionPill({ label, onClick, disabled, isDark, variant = "default" }: ActionPillProps) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (disabled || loading) return;
    setLoading(true);
    try {
      await onClick();
    } finally {
      setLoading(false);
    }
  };

  const bgColor = variant === "primary"
    ? (isDark ? "var(--accent-cyan)" : "#0066cc")
    : variant === "danger"
    ? (isDark ? "rgba(248, 113, 113, 0.15)" : "rgba(220, 38, 38, 0.1)")
    : (isDark ? "#1f1f23" : "#f0f0f0");

  const fgColor = variant === "primary"
    ? (isDark ? "#0a0a0c" : "#ffffff")
    : variant === "danger"
    ? (isDark ? "#f87171" : "#dc2626")
    : (isDark ? "#a1a1aa" : "#666666");

  const borderColor = variant === "primary"
    ? "transparent"
    : variant === "danger"
    ? (isDark ? "#f87171" : "#dc2626")
    : (isDark ? "#3f3f46" : "#cccccc");

  return (
    <button
      onClick={handleClick}
      disabled={disabled || loading}
      className="px-2.5 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
      style={{
        background: bgColor,
        color: fgColor,
        border: `1.5px solid ${borderColor}`,
        boxShadow: variant === "primary" ? (isDark ? "2px 2px 0 #000" : "2px 2px 0 #1a1a1a") : "none",
      }}
    >
      {loading ? "..." : label}
    </button>
  );
});

export const DeviceActionsBar = memo(function DeviceActionsBar() {
  const { hoveredNode, selectedNode, lockedNode } = useHierarchyStore();
  const { theme } = useThemeStore();
  const { selectedDevice, devices } = useDeviceStore();
  const [inputText, setInputText] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const isDark = theme === "dark";

  // Get platform from selected device
  const selectedDeviceInfo = devices.find(d => d.udid === selectedDevice);
  const platform = selectedDeviceInfo?.platform ?? "android";
  const isIOS = platform === "ios";

  const refetchFn = useHierarchyStore(s => s.refetchFn);

  const triggerRefresh = () => {
    if (refetchFn.current) {
      useHierarchyStore.setState({ isRefreshing: true });
      refetchFn.current();
    }
  };

  const displayNode = lockedNode || selectedNode || hoveredNode;
  const hasNode = !!displayNode;
  const hasEditText = displayNode?.className?.includes("EditText") ||
    displayNode?.className?.includes("TextField") ||
    displayNode?.className?.includes("TextView") ||
    displayNode?.className?.includes("SearchField");

  const nodeBounds = displayNode?.bounds;
  const centerX = nodeBounds ? nodeBounds.x + Math.floor(nodeBounds.width / 2) : 0;
  const centerY = nodeBounds ? nodeBounds.y + Math.floor(nodeBounds.height / 2) : 0;

  const handleSendText = async () => {
    if (!inputText.trim()) return;
    setErrorMsg(null);
    try {
      if (nodeBounds) {
        await tapDevice(centerX, centerY, selectedDevice ?? undefined);
      }
      await inputDeviceText(inputText, selectedDevice ?? undefined);
      setInputText("");
      triggerRefresh();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Failed to send text");
    }
  };

  const handleTap = async () => {
    setErrorMsg(null);
    try {
      await tapDevice(centerX, centerY, selectedDevice ?? undefined);
      const store = useHierarchyStore.getState();
      store.lockSelection(null);
      store.setSelectedNode(null);
      store.setHoveredNode(null, undefined);
      triggerRefresh();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Failed to tap");
    }
  };
  const handleLongPress = async () => {
    if (!nodeBounds) return;
    setErrorMsg(null);
    try {
      await dragDevice(centerX, centerY, centerX, centerY, 1000, selectedDevice ?? undefined);
      const store = useHierarchyStore.getState();
      store.lockSelection(null);
      store.setSelectedNode(null);
      store.setHoveredNode(null, undefined);
      triggerRefresh();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Long press failed");
    }
  };
  const handleSwipe = async () => {
    if (!nodeBounds) return;
    setErrorMsg(null);
    try {
      await swipeDevice(centerX, centerY, centerX, Math.max(0, centerY - 300), undefined, selectedDevice ?? undefined);
      const store = useHierarchyStore.getState();
      store.lockSelection(null);
      store.setSelectedNode(null);
      store.setHoveredNode(null, undefined);
      triggerRefresh();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Failed to swipe");
    }
  };
  const handleDrag = async () => {
    if (!nodeBounds) return;
    setErrorMsg(null);
    try {
      await dragDevice(centerX, centerY, centerX, centerY + 200, undefined, selectedDevice ?? undefined);
      const store = useHierarchyStore.getState();
      store.lockSelection(null);
      store.setSelectedNode(null);
      store.setHoveredNode(null, undefined);
      triggerRefresh();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Drag not supported on iOS");
    }
  };
  const handleZoom = async () => {
    setErrorMsg(null);
    try {
      await pinchDevice(centerX, centerY, 1.5, selectedDevice ?? undefined);
      const store = useHierarchyStore.getState();
      store.lockSelection(null);
      store.setSelectedNode(null);
      store.setHoveredNode(null, undefined);
      triggerRefresh();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Zoom not supported on iOS");
    }
  };
  const handlePinch = async () => {
    setErrorMsg(null);
    try {
      await pinchDevice(centerX, centerY, 0.6, selectedDevice ?? undefined);
      const store = useHierarchyStore.getState();
      store.lockSelection(null);
      store.setSelectedNode(null);
      store.setHoveredNode(null, undefined);
      triggerRefresh();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Pinch not supported on iOS");
    }
  };
  const handleHome = async () => {
    setErrorMsg(null);
    try {
      await pressKey("home", selectedDevice ?? undefined);
      const store = useHierarchyStore.getState();
      store.lockSelection(null);
      store.setSelectedNode(null);
      store.setHoveredNode(null, undefined);
      triggerRefresh();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Failed to press home");
    }
  };
  const handleBack = async () => {
    setErrorMsg(null);
    try {
      await pressKey("back", selectedDevice ?? undefined);
      const store = useHierarchyStore.getState();
      store.lockSelection(null);
      store.setSelectedNode(null);
      store.setHoveredNode(null, undefined);
      triggerRefresh();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Back not supported on iOS");
    }
  };
  const handleRecent = async () => {
    setErrorMsg(null);
    try {
      await pressKey("recent", selectedDevice ?? undefined);
      const store = useHierarchyStore.getState();
      store.lockSelection(null);
      store.setSelectedNode(null);
      store.setHoveredNode(null, undefined);
      triggerRefresh();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Recent not supported on iOS");
    }
  };

  const styles = displayNode?.styles;

  return (
    <div
      className="px-3 py-2 space-y-2 flex-shrink-0"
      style={{
        background: isDark ? "#18181b" : "#e5e5e5",
        borderBottom: isDark ? "2px solid #3f3f46" : "2px solid #1a1a1a",
      }}
    >
      {/* Row 1: Input Text */}
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-bold uppercase tracking-wider flex-shrink-0" style={{ color: isDark ? "#52525b" : "#999999" }}>
          Input
        </span>
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSendText()}
          placeholder={hasEditText ? "Enter text..." : "Select EditText"}
          disabled={!hasEditText}
          className="flex-1 px-2 py-1 rounded text-[10px] font-mono disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            background: isDark ? "#1f1f23" : "#ffffff",
            color: isDark ? "#e4e4e7" : "#1a1a1a",
            border: isDark ? "2px solid #3f3f46" : "2px solid #cccccc",
          }}
        />
        <ActionPill
          label="Send"
          onClick={handleSendText}
          disabled={!inputText.trim() || !hasEditText}
          isDark={isDark}
          variant="primary"
        />
        <LayoutChips styles={styles} />
      </div>

      {/* Error message display */}
      {errorMsg && (
        <div
          className="px-2 py-1 rounded text-[9px] font-medium"
          style={{
            background: isDark ? "rgba(248, 113, 113, 0.15)" : "rgba(220, 38, 38, 0.1)",
            color: isDark ? "#f87171" : "#dc2626",
          }}
        >
          {errorMsg}
        </div>
      )}

      {/* Row 2: Action Pills */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <ActionPill label="Tap" onClick={handleTap} disabled={!hasNode} isDark={isDark} variant="primary" />
        <ActionPill label="Long Press" onClick={handleLongPress} disabled={!hasNode || isIOS} isDark={isDark} />
        <ActionPill label="Swipe" onClick={handleSwipe} disabled={!hasNode} isDark={isDark} />
        <ActionPill label="Drag" onClick={handleDrag} disabled={!hasNode || isIOS} isDark={isDark} />
        <ActionPill label="Zoom" onClick={handleZoom} disabled={!hasNode || isIOS} isDark={isDark} />
        <ActionPill label="Pinch" onClick={handlePinch} disabled={!hasNode || isIOS} isDark={isDark} />
        <ActionPill label="Home" onClick={handleHome} disabled={false} isDark={isDark} />
        <ActionPill label="Back" onClick={handleBack} disabled={isIOS} isDark={isDark} />
        <ActionPill label="Recent" onClick={handleRecent} disabled={isIOS} isDark={isDark} />
      </div>
    </div>
  );
});
