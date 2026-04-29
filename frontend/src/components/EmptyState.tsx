import { memo } from "react";

export type EmptyStateIcon = "device" | "element" | "search" | "terminal" | "loading" | "error";

interface EmptyStateProps {
  icon: EmptyStateIcon;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
  isDark: boolean;
}

const ICONS: Record<EmptyStateIcon, React.ReactNode> = {
  device: (
    <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="2" width="14" height="20" rx="2" />
      <line x1="12" y1="18" x2="12" y2="18.01" strokeWidth="3" strokeLinecap="round" />
    </svg>
  ),
  element: (
    <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M9 9h6M9 13h6M9 17h4" />
    </svg>
  ),
  search: (
    <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  ),
  terminal: (
    <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  ),
  loading: (
    <svg className="w-8 h-8 animate-br-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  ),
  error: (
    <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  ),
};

export const EmptyState = memo(function EmptyState({ icon, title, description, action, isDark }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-8 px-4">
      <div
        className="w-16 h-16 flex items-center justify-center mb-4"
        style={{
          background: isDark ? "#18181b" : "#ffffff",
          border: isDark ? "3px solid #3f3f46" : "3px solid #1a1a1a",
          boxShadow: isDark ? "4px 4px 0 #000" : "4px 4px 0 #1a1a1a",
          color: isDark ? "#71717a" : "#666666",
        }}
      >
        {ICONS[icon]}
      </div>
      <p
        className="text-sm font-bold mb-1 text-center"
        style={{ color: isDark ? "#a1a1aa" : "#4a4a4a" }}
      >
        {title}
      </p>
      <p
        className="text-[11px] text-center"
        style={{ color: isDark ? "#71717a" : "#666666" }}
      >
        {description}
      </p>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-4 px-4 py-2 rounded text-[11px] font-bold uppercase tracking-wider transition-all active:scale-95"
          style={{
            background: isDark ? "#1f1f23" : "#ffffff",
            color: isDark ? "#e4e4e7" : "#1a1a1a",
            border: isDark ? "2px solid #3f3f46" : "2px solid #1a1a1a",
            boxShadow: isDark ? "3px 3px 0 #000" : "3px 3px 0 #1a1a1a",
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
});