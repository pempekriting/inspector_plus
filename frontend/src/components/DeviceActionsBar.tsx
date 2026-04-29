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
    ? (isDark ? "#22d3ee" : "#0066cc")
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
  const { selectedDevice } = useDeviceStore();
  const [inputText, setInputText] = useState("");
  const isDark = theme === "dark";

  const refetchFn = useHierarchyStore(s => s.refetchFn);

  const triggerRefresh = () => {
    if (refetchFn.current) {
      useHierarchyStore.setState({ isRefreshing: true });
      refetchFn.current();
    }
  };

  const displayNode = lockedNode || selectedNode || hoveredNode;
  const hasNode = !!displayNode;
  const hasEditText = displayNode?.className?.includes("EditText");

  const nodeBounds = displayNode?.bounds;
  const centerX = nodeBounds ? nodeBounds.x + Math.floor(nodeBounds.width / 2) : 0;
  const centerY = nodeBounds ? nodeBounds.y + Math.floor(nodeBounds.height / 2) : 0;

  const handleSendText = async () => {
    if (!inputText.trim()) return;
    // Must tap EditText first to focus it, then send text
    if (nodeBounds) {
      await tapDevice(centerX, centerY, selectedDevice ?? undefined);
    }
    await inputDeviceText(inputText, selectedDevice ?? undefined);
    setInputText("");
    triggerRefresh();
  };

  const handleTap = async () => {
    await tapDevice(centerX, centerY, selectedDevice ?? undefined);
    triggerRefresh();
  };
  const handleLongPress = async () => {
    if (!nodeBounds) return;
    await dragDevice(centerX, centerY, centerX, centerY, 1000, selectedDevice ?? undefined);
    triggerRefresh();
  };
  const handleSwipe = async () => {
    if (!nodeBounds) return;
    await swipeDevice(centerX, centerY, centerX, Math.max(0, centerY - 300), undefined, selectedDevice ?? undefined);
    triggerRefresh();
  };
  const handleDrag = async () => {
    if (!nodeBounds) return;
    await dragDevice(centerX, centerY, centerX, centerY + 200, undefined, selectedDevice ?? undefined);
    triggerRefresh();
  };
  const handleZoom = async () => {
    await pinchDevice(centerX, centerY, 1.5, selectedDevice ?? undefined);
    triggerRefresh();
  };
  const handlePinch = async () => {
    await pinchDevice(centerX, centerY, 0.6, selectedDevice ?? undefined);
    triggerRefresh();
  };
  const handleHome = async () => {
    await pressKey("home", selectedDevice ?? undefined);
    triggerRefresh();
  };
  const handleBack = async () => {
    await pressKey("back", selectedDevice ?? undefined);
    triggerRefresh();
  };
  const handleRecent = async () => {
    await pressKey("recent", selectedDevice ?? undefined);
    triggerRefresh();
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

      {/* Row 2: Action Pills */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <ActionPill label="Tap" onClick={handleTap} disabled={!hasNode} isDark={isDark} variant="primary" />
        <ActionPill label="Long Press" onClick={handleLongPress} disabled={!hasNode} isDark={isDark} />
        <ActionPill label="Swipe" onClick={handleSwipe} disabled={!hasNode} isDark={isDark} />
        <ActionPill label="Drag" onClick={handleDrag} disabled={!hasNode} isDark={isDark} />
        <ActionPill label="Zoom" onClick={handleZoom} disabled={!hasNode} isDark={isDark} />
        <ActionPill label="Pinch" onClick={handlePinch} disabled={!hasNode} isDark={isDark} />
        <ActionPill label="Home" onClick={handleHome} disabled={false} isDark={isDark} />
        <ActionPill label="Back" onClick={handleBack} disabled={false} isDark={isDark} />
        <ActionPill label="Recent" onClick={handleRecent} disabled={false} isDark={isDark} />
      </div>
    </div>
  );
});
