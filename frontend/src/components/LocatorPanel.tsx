import { memo, useState, useMemo } from "react";
import { useThemeStore } from "../stores/themeStore";
import { useHierarchyStore } from "../stores/hierarchyStore";
import { generateLocators, bestLocator, type Locator } from "../utils/locators";

interface CopyButtonProps {
  value: string;
  isDark: boolean;
}

const CopyButton = memo(function CopyButton({ value, isDark }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // clipboard unavailable
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="ml-2 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider transition-all active:scale-95 flex items-center gap-1 flex-shrink-0"
      style={{
        background: copied
          ? isDark ? "rgba(52, 211, 153, 0.2)" : "rgba(4, 120, 87, 0.15)"
          : isDark ? "#1f1f23" : "#f0f0f0",
        color: copied
          ? isDark ? "#34d399" : "#047857"
          : isDark ? "#71717a" : "#666666",
        border: copied
          ? isDark ? "2px solid #34d399" : "2px solid #047857"
          : isDark ? "2px solid #3f3f46" : "2px solid #cccccc",
        cursor: "pointer",
        minWidth: "52px",
      }}
    >
      {copied ? (
        <>
          <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          <span>Copied!</span>
        </>
      ) : (
        <span>Copy</span>
      )}
    </button>
  );
});

const STRATEGY_LABELS: Record<string, string> = {
  id: "Resource ID",
  text: "Text",
  "content-desc": "Content Desc",
  android_uiautomator: "UiSelector",
  class_index: "Class + Index",
};

const STABILITY_COLORS: Record<number, { bg_dark: string; bg_light: string; border: string; text: string }> = {
  5: { bg_dark: "rgba(52, 211, 153, 0.15)", bg_light: "rgba(4, 120, 87, 0.12)", border: "#10b981", text: "#10b981" },
  4: { bg_dark: "rgba(59, 130, 246, 0.15)", bg_light: "rgba(29, 78, 216, 0.12)", border: "#3b82f6", text: "#3b82f6" },
  3: { bg_dark: "rgba(250, 204, 21, 0.15)", bg_light: "rgba(180, 83, 9, 0.12)", border: "#facc15", text: "#facc15" },
  2: { bg_dark: "rgba(249, 115, 22, 0.15)", bg_light: "rgba(194, 65, 12, 0.12)", border: "#f97316", text: "#f97316" },
  1: { bg_dark: "rgba(248, 113, 113, 0.15)", bg_light: "rgba(220, 38, 38, 0.12)", border: "#f87171", text: "#f87171" },
};

function getStabilityColor(stability: number, isDark: boolean) {
  const colors = STABILITY_COLORS[stability] || STABILITY_COLORS[1];
  return {
    bg: isDark ? colors.bg_dark : colors.bg_light,
    border: colors.border,
    text: colors.text,
  };
}

const LocatorRow = memo(function LocatorRow({
  locator,
  isDark,
}: {
  locator: Locator;
  isDark: boolean;
}) {
  const { strategy, value, expression, stability } = locator;
  const label = STRATEGY_LABELS[strategy] || strategy;
  const color = getStabilityColor(stability, isDark);

  return (
    <div
      className="flex items-start gap-2 py-2 px-2 -mx-2 rounded cursor-default hover:bg-white/[0.04] transition-colors"
    >
      <div
        className="w-2 h-2 rounded-full flex-shrink-0 mt-1"
        style={{ background: color.border }}
      />
      <div className="flex flex-col flex-1 min-w-0 gap-0.5">
        <div className="flex items-center justify-between gap-1">
          <span
            className="text-[10px] font-bold uppercase tracking-wider"
            style={{ color: isDark ? "#71717a" : "#666666" }}
          >
            {label}
          </span>
          <span
            className="text-[9px] font-bold px-1 rounded"
            style={{ background: color.bg, color: color.text, border: `1.5px solid ${color.border}` }}
          >
            {stability}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span
            className="text-[10px] font-mono truncate"
            style={{ color: isDark ? "#e4e4e7" : "#1a1a1a" }}
          >
            {expression}
          </span>
          <CopyButton value={expression} isDark={isDark} />
        </div>
      </div>
    </div>
  );
});

const emptyStateIcon = (
  <svg className="w-6 h-6 mb-2 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/>
    <path d="M21 21l-4.35-4.35"/>
  </svg>
);

/** LocatorPanel — pure frontend generation, no API call */
export const LocatorPanel = memo(function LocatorPanel() {
  const { theme } = useThemeStore();
  const { selectedNode } = useHierarchyStore();
  const isDark = theme === "dark";

  // Generate locators instantly from the selected node's data
  const locators = useMemo(
    () => (selectedNode ? generateLocators(selectedNode) : []),
    [selectedNode]
  );

  const best = bestLocator(locators);

  const handleCopyBest = async () => {
    if (!best) return;
    try {
      await navigator.clipboard.writeText(best.expression);
    } catch {
      // clipboard unavailable
    }
  };

  if (!selectedNode) {
    return (
      <div
        className="px-4 py-3 overflow-y-auto"
        style={{
          background: isDark ? "#111114" : "#ffffff",
          borderBottom: isDark ? "3px solid #3f3f46" : "3px solid #1a1a1a",
          maxHeight: "320px",
          minHeight: "120px",
        }}
      >
        <div className="flex items-center gap-2 mb-3">
          <span
            className="text-[10px] font-bold uppercase tracking-wider"
            style={{ color: isDark ? "#71717a" : "#666666" }}
          >
            Locators
          </span>
        </div>
        <div
          className="flex flex-col items-center justify-center py-8"
          style={{ color: isDark ? "#52525b" : "#999999" }}
        >
          {emptyStateIcon}
          <span className="text-[11px]">Select an element to generate locators</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="px-4 py-3 overflow-y-auto"
      style={{
        background: isDark ? "#111114" : "#ffffff",
        borderBottom: isDark ? "3px solid #3f3f46" : "3px solid #1a1a1a",
        maxHeight: "320px",
        minHeight: "120px",
      }}
    >
      <div className="flex items-center justify-between gap-2 mb-3">
        <span
          className="text-[10px] font-bold uppercase tracking-wider"
          style={{ color: isDark ? "#71717a" : "#666666" }}
        >
          Locators
        </span>
        {best && (
          <button
            onClick={handleCopyBest}
            className="px-2.5 py-1 rounded text-[9px] font-bold uppercase tracking-wider transition-all active:scale-95"
            style={{
              background: isDark ? "#00e5cc" : "#0066cc",
              color: isDark ? "#0a0a0c" : "#ffffff",
              border: `2px solid ${isDark ? "#00e5cc" : "#0066cc"}`,
            }}
          >
            Copy Best
          </button>
        )}
      </div>

      {locators.length === 0 && (
        <div
          className="flex flex-col items-center justify-center py-6"
          style={{ color: isDark ? "#52525b" : "#999999" }}
        >
          <span className="text-[11px]">No locators available for this element</span>
        </div>
      )}

      {locators.length > 0 && (
        <div className="space-y-0.5">
          {locators.map((locator, index) => (
            <LocatorRow key={`${locator.strategy}-${index}`} locator={locator} isDark={isDark} />
          ))}
        </div>
      )}
    </div>
  );
});
