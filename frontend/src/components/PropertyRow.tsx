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
        borderLeft: "3px solid var(--border-default)",
        background: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)",
      }}
    >
      <span
        className="text-[10px] uppercase tracking-wider w-24 flex-shrink-0 font-bold"
        style={{ color: "var(--text-label)" }}
      >
        {label}
      </span>
      {children || (
        <span
          className="text-[11px] truncate flex-1 font-code"
          style={{
            color: value
              ? valueColor || "var(--text-primary)"
              : isDark ? "#6b6b78" : "#999999",
            fontStyle: italic ? "italic" : "normal",
          }}
        >
          {value || "—"}
        </span>
      )}
      {copied && (
        <span
          className="text-[9px] font-bold"
          style={{ color: "var(--accent-emerald)" }}
        >
          Copied!
        </span>
      )}
    </div>
  );
}
