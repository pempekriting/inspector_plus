import { memo } from "react";
import { useThemeStore } from "../stores/themeStore";
import type { UiStyles } from "../types/shared";

interface LayoutChipsProps {
  styles: UiStyles | undefined;
  compact?: boolean;
}

const emptyStateIcon = (
  <svg className="w-5 h-5 opacity-40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M3 9h18M9 21V9" />
  </svg>
);

function Chip({
  label,
  value,
  isDark,
  isColor,
  colorHex,
}: {
  label: string;
  value: string | undefined | null;
  isDark: boolean;
  isColor?: boolean;
  colorHex?: string;
}) {
  if (!value) return null;

  return (
    <div
      className="flex items-center gap-1 px-2 py-1 rounded"
      style={{
        background: isDark ? "#1f1f23" : "#f0f0f0",
        border: isDark ? "1.5px solid #3f3f46" : "1.5px solid #cccccc",
      }}
    >
      {isColor && colorHex && (
        <div
          className="w-3 h-3 rounded-sm flex-shrink-0"
          style={{
            background: colorHex,
            border: isDark ? "1px solid #52525b" : "1px solid #999999",
          }}
        />
      )}
      <span
        className="text-[9px] font-bold uppercase tracking-wider"
        style={{ color: isDark ? "#52525b" : "#999999" }}
      >
        {label}
      </span>
      <span
        className="text-[10px] font-mono"
        style={{ color: isDark ? "#a1a1aa" : "#4a4a4a" }}
      >
        {value}
      </span>
    </div>
  );
}

export const LayoutChips = memo(function LayoutChips({ styles, compact = true }: LayoutChipsProps) {
  const { theme } = useThemeStore();
  const isDark = theme === "dark";

  if (!styles) {
    return (
      <div className="flex items-center gap-1">
        <span
          className="text-[9px] font-bold uppercase tracking-wider"
          style={{ color: isDark ? "#52525b" : "#999999" }}
        >
          Layout
        </span>
        <span
          className="text-[10px]"
          style={{ color: isDark ? "#3f3f46" : "#cccccc" }}
        >
          —
        </span>
      </div>
    );
  }

  const hasAnyStyle = styles.backgroundColor || styles.textColor || styles.padding || styles.elevation;

  if (!hasAnyStyle) {
    return (
      <div className="flex items-center gap-1">
        <span
          className="text-[9px] font-bold uppercase tracking-wider"
          style={{ color: isDark ? "#52525b" : "#999999" }}
        >
          Layout
        </span>
        <span
          className="text-[10px]"
          style={{ color: isDark ? "#3f3f46" : "#cccccc" }}
        >
          —
        </span>
      </div>
    );
  }

  const paddingValue = styles.padding
    ? `${styles.padding.left}|${styles.padding.top}|${styles.padding.right}|${styles.padding.bottom}`
    : undefined;

  return (
    <div className="flex items-center gap-1 flex-wrap">
      <span
        className="text-[9px] font-bold uppercase tracking-wider mr-1"
        style={{ color: isDark ? "#52525b" : "#999999" }}
      >
        Layout
      </span>
      <Chip
        label="bg"
        value={styles.backgroundColor}
        isDark={isDark}
        isColor
        colorHex={styles.backgroundColor}
      />
      <Chip
        label="text"
        value={styles.textColor}
        isDark={isDark}
        isColor
        colorHex={styles.textColor}
      />
      {paddingValue && (
        <Chip
          label="pad"
          value={paddingValue}
          isDark={isDark}
        />
      )}
      {styles.elevation && (
        <Chip
          label="elev"
          value={styles.elevation}
          isDark={isDark}
        />
      )}
    </div>
  );
});

/* Legacy full StylePanel kept for PropertiesPanel compatibility */
export const StylePanel = memo(function StylePanel({ styles }: { styles: UiStyles | undefined }) {
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
            Layout
          </span>
        </div>
        <div
          className="flex flex-col items-center justify-center py-6"
          style={{ color: isDark ? "#52525b" : "#999999" }}
        >
          {emptyStateIcon}
          <span className="text-[11px]">No layout info available</span>
        </div>
      </div>
    );
  }

  const hasAnyStyle =
    styles.backgroundColor ||
    styles.textColor ||
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
            Layout
          </span>
        </div>
        <div
          className="flex flex-col items-center justify-center py-6"
          style={{ color: isDark ? "#52525b" : "#999999" }}
        >
          {emptyStateIcon}
          <span className="text-[11px]">No layout info available</span>
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
          Layout
        </span>
      </div>

      <div className="space-y-0.5">
        {styles.backgroundColor && (
          <div className="flex items-center gap-2 py-1 px-2 -mx-2 rounded" style={{ borderLeft: isDark ? "3px solid #3f3f46" : "3px solid #1a1a1a" }}>
            <span className="text-[10px] uppercase tracking-wider w-24 flex-shrink-0 font-bold" style={{ color: isDark ? "#7a7a85" : "#666666" }}>Background</span>
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="w-3 h-3 rounded-sm" style={{ background: styles.backgroundColor, border: isDark ? "1px solid #3f3f46" : "1px solid #cccccc" }} />
              <span className="text-[11px] font-mono" style={{ color: isDark ? "#e4e4e7" : "#1a1a1a" }}>{styles.backgroundColor}</span>
            </div>
          </div>
        )}
        {styles.textColor && (
          <div className="flex items-center gap-2 py-1 px-2 -mx-2 rounded" style={{ borderLeft: isDark ? "3px solid #3f3f46" : "3px solid #1a1a1a" }}>
            <span className="text-[10px] uppercase tracking-wider w-24 flex-shrink-0 font-bold" style={{ color: isDark ? "#7a7a85" : "#666666" }}>Text</span>
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="w-3 h-3 rounded-sm" style={{ background: styles.textColor, border: isDark ? "1px solid #3f3f46" : "1px solid #cccccc" }} />
              <span className="text-[11px] font-mono" style={{ color: isDark ? "#e4e4e7" : "#1a1a1a" }}>{styles.textColor}</span>
            </div>
          </div>
        )}
        {paddingValue && (
          <div className="flex items-center gap-2 py-1 px-2 -mx-2 rounded" style={{ borderLeft: isDark ? "3px solid #3f3f46" : "3px solid #1a1a1a" }}>
            <span className="text-[10px] uppercase tracking-wider w-24 flex-shrink-0 font-bold" style={{ color: isDark ? "#7a7a85" : "#666666" }}>Padding</span>
            <span className="text-[11px] font-mono" style={{ color: isDark ? "#e4e4e7" : "#1a1a1a" }}>{paddingValue}</span>
          </div>
        )}
        {styles.elevation && (
          <div className="flex items-center gap-2 py-1 px-2 -mx-2 rounded" style={{ borderLeft: isDark ? "3px solid #3f3f46" : "3px solid #1a1a1a" }}>
            <span className="text-[10px] uppercase tracking-wider w-24 flex-shrink-0 font-bold" style={{ color: isDark ? "#7a7a85" : "#666666" }}>Elevation</span>
            <span className="text-[11px] font-mono" style={{ color: isDark ? "#e4e4e7" : "#1a1a1a" }}>{styles.elevation}</span>
          </div>
        )}
      </div>
    </div>
  );
});
