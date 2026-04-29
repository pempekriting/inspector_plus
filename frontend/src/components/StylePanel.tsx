import { memo, useState } from "react";
import { useThemeStore } from "../stores/themeStore";
import type { UiStyles } from "../types/shared";

interface StylePanelProps {
  styles: UiStyles | undefined;
}

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
      className="ml-2 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider transition-all active:scale-95 flex items-center gap-1"
      style={{
        background: copied
          ? (isDark ? "rgba(52, 211, 153, 0.2)" : "rgba(4, 120, 87, 0.15)")
          : (isDark ? "#1f1f23" : "#f0f0f0"),
        color: copied
          ? (isDark ? "#34d399" : "#047857")
          : (isDark ? "#71717a" : "#666666"),
        border: copied
          ? (isDark ? "2px solid #34d399" : "2px solid #047857")
          : (isDark ? "2px solid #3f3f46" : "2px solid #cccccc"),
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

interface StyleRowProps {
  label: string;
  value: string | undefined | null;
  isDark: boolean;
  isColor?: boolean;
  colorHex?: string;
}

const StyleRow = memo(function StyleRow({
  label,
  value,
  isDark,
  isColor = false,
  colorHex,
}: StyleRowProps) {
  if (value === undefined || value === null) return null;

  return (
    <div className="flex items-center py-1 px-2 -mx-2 rounded cursor-default hover:bg-white/[0.04] transition-colors">
      <span
        className="text-[10px] uppercase tracking-wider w-24 flex-shrink-0 font-bold"
        style={{ color: isDark ? "#71717a" : "#666666" }}
      >
        {label}
      </span>
      <div className="flex items-center flex-1 min-w-0">
        {isColor && colorHex && (
          <div
            className="w-3 h-3 rounded-sm flex-shrink-0 mr-2 border"
            style={{
              background: colorHex,
              borderColor: isDark ? "#3f3f46" : "#cccccc",
            }}
          />
        )}
        <span
          className="text-[11px] font-mono truncate"
          style={{ color: isDark ? "#e4e4e7" : "#1a1a1a" }}
        >
          {value}
        </span>
        <CopyButton value={value} isDark={isDark} />
      </div>
    </div>
  );
});

const emptyStateIcon = (
  <svg className="w-6 h-6 mb-2 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <path d="M8 12h8M12 8v8"/>
  </svg>
);

export const StylePanel = memo(function StylePanel({ styles }: StylePanelProps) {
  const { theme } = useThemeStore();
  const isDark = theme === "dark";

  if (!styles) {
    return (
      <div
        className="px-4 py-3"
        style={{
          background: isDark ? "#111114" : "#ffffff",
          borderBottom: isDark ? "3px solid #3f3f46" : "3px solid #1a1a1a",
        }}
      >
        <div className="flex items-center gap-2 mb-3">
          <span
            className="text-[10px] font-bold uppercase tracking-wider"
            style={{ color: isDark ? "#71717a" : "#666666" }}
          >
            Styles
          </span>
        </div>
        <div
          className="flex flex-col items-center justify-center py-6"
          style={{ color: isDark ? "#52525b" : "#999999" }}
        >
          {emptyStateIcon}
          <span className="text-[11px]">No styles available</span>
        </div>
      </div>
    );
  }

  const hasAnyStyle =
    styles.backgroundColor ||
    styles.textColor ||
    styles.fontSize ||
    styles.fontWeight ||
    styles.fontFamily ||
    styles.padding ||
    styles.elevation;

  if (!hasAnyStyle) {
    return (
      <div
        className="px-4 py-3"
        style={{
          background: isDark ? "#111114" : "#ffffff",
          borderBottom: isDark ? "3px solid #3f3f46" : "3px solid #1a1a1a",
        }}
      >
        <div className="flex items-center gap-2 mb-3">
          <span
            className="text-[10px] font-bold uppercase tracking-wider"
            style={{ color: isDark ? "#71717a" : "#666666" }}
          >
            Styles
          </span>
        </div>
        <div
          className="flex flex-col items-center justify-center py-6"
          style={{ color: isDark ? "#52525b" : "#999999" }}
        >
          {emptyStateIcon}
          <span className="text-[11px]">No styles available</span>
        </div>
      </div>
    );
  }

  const paddingValue = styles.padding
    ? `${styles.padding.left}dp ${styles.padding.top}dp ${styles.padding.right}dp ${styles.padding.bottom}dp`
    : undefined;

  return (
    <div
      className="px-4 py-3"
      style={{
        background: isDark ? "#111114" : "#ffffff",
        borderBottom: isDark ? "3px solid #3f3f46" : "3px solid #1a1a1a",
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        <span
          className="text-[10px] font-bold uppercase tracking-wider"
          style={{ color: isDark ? "#71717a" : "#666666" }}
        >
          Styles
        </span>
      </div>

      <div className="space-y-0.5">
        <StyleRow
          label="Background"
          value={styles.backgroundColor}
          isDark={isDark}
          isColor
          colorHex={styles.backgroundColor}
        />
        <StyleRow
          label="Text"
          value={styles.textColor}
          isDark={isDark}
          isColor
          colorHex={styles.textColor}
        />
        <StyleRow label="Font size" value={styles.fontSize} isDark={isDark} />
        <StyleRow label="Font weight" value={styles.fontWeight} isDark={isDark} />
        <StyleRow label="Font family" value={styles.fontFamily} isDark={isDark} />
        <StyleRow label="Padding" value={paddingValue} isDark={isDark} />
        <StyleRow label="Elevation" value={styles.elevation} isDark={isDark} />
      </div>
    </div>
  );
});
