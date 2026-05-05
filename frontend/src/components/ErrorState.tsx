import { memo, useCallback } from "react";

interface ErrorStateProps {
  title: string;
  description: string;
  onRetry?: () => void;
  onCopyDetails?: () => void;
  isDark: boolean;
}

export const ErrorState = memo(function ErrorState({
  title,
  description,
  onRetry,
  onCopyDetails,
  isDark,
}: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-8 px-4">
      <div
        className="w-16 h-16 flex items-center justify-center mb-4"
        style={{
          background: isDark ? "rgba(251, 113, 133, 0.1)" : "rgba(220, 38, 38, 0.08)",
          border: isDark ? "3px solid var(--accent-rose)" : "3px solid #dc2626",
          boxShadow: isDark ? "var(--nb-shadow-dark)" : "6px 6px 0 rgba(220, 38, 38, 0.2)",
          color: isDark ? "#fb7185" : "#dc2626",
        }}
      >
        <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <p
        className="text-sm font-bold mb-1 text-center"
        style={{ color: isDark ? "#fb7185" : "#dc2626" }}
      >
        {title}
      </p>
      <p
        className="text-[11px] text-center max-w-[250px]"
        style={{ color: isDark ? "#71717a" : "#666666" }}
      >
        {description}
      </p>
      <div className="flex items-center gap-2 mt-4">
        {onRetry && (
          <button
            onClick={onRetry}
            className="px-4 py-2 rounded text-[11px] font-bold uppercase tracking-wider transition-all active:scale-95"
            style={{
              background: "var(--bg-elevated)",
              color: isDark ? "#fb7185" : "#dc2626",
              border: isDark ? "2px solid var(--accent-rose)" : "2px solid #dc2626",
              boxShadow: isDark ? "var(--nb-shadow-dark)" : "6px 6px 0 rgba(220, 38, 38, 0.2)",
            }}
          >
            Retry
          </button>
        )}
        {onCopyDetails && (
          <button
            onClick={onCopyDetails}
            className="px-4 py-2 rounded text-[11px] font-bold uppercase tracking-wider transition-all active:scale-95"
            style={{
              background: "var(--bg-elevated)",
              color: isDark ? "#a1a1aa" : "#4a4a4a",
              border: "2px solid var(--border-default)",
            }}
          >
            Copy Details
          </button>
        )}
      </div>
    </div>
  );
});