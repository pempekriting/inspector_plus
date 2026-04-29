import { useState } from "react";

export function PropertyRow({
  label,
  value,
  valueColor,
  children,
  italic = false,
  isDark = true,
}: {
  label: string;
  value: string | null;
  valueColor?: string;
  children?: React.ReactNode;
  italic?: boolean;
  isDark?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      onClick={handleCopy}
      className="flex items-center gap-2 py-1 px-2 -mx-2 rounded"
      style={{
        cursor: value ? "pointer" : "default",
        borderLeft: isDark ? "3px solid #3f3f46" : "3px solid #1a1a1a",
        background: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)",
      }}
    >
      <span
        className="text-[10px] uppercase tracking-wider w-24 flex-shrink-0 font-bold"
        style={{ color: isDark ? "#7a7a85" : "#666666" }}
      >
        {label}
      </span>
      {children || (
        <span
          className="text-[11px] truncate flex-1"
          style={{
            color: value
              ? valueColor || (isDark ? "#e4e4e7" : "#1a1a1a")
              : isDark ? "#6b6b78" : "#999999",
            fontStyle: italic ? "italic" : "normal",
            fontFamily: value ? '"JetBrains Mono", monospace' : "inherit",
          }}
        >
          {value || "—"}
        </span>
      )}
      {copied && (
        <span
          className="text-[9px] font-bold"
          style={{ color: isDark ? "#10b981" : "#047857" }}
        >
          Copied!
        </span>
      )}
    </div>
  );
}
