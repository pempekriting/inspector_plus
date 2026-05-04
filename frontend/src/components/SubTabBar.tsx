import { memo } from "react";
import type { InspectorSubTab } from "../App";

const SUB_TAB_ICONS: Record<InspectorSubTab, React.ReactNode> = {
  hierarchy: (
    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
  accessibility: (
    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="4" r="2" />
      <path d="M12 6v6m-5 8l5-10 5 10m-4-4h2" />
    </svg>
  ),
  recorder: (
    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3" fill="currentColor" />
    </svg>
  ),
};

const SUB_TAB_CONFIG: Record<InspectorSubTab, { label: string }> = {
  hierarchy: { label: 'Hierarchy' },
  accessibility: { label: 'Accessibility' },
  recorder: { label: 'Recorder' },
};

interface SubTabBarProps {
  activeTab: InspectorSubTab;
  onTabChange: (tab: InspectorSubTab) => void;
  isDark: boolean;
}

export const SubTabBar = memo(function SubTabBar({ activeTab, onTabChange, isDark }: SubTabBarProps) {
  return (
    <div
      className="flex items-center px-3 py-2 gap-1"
      style={{
        background: isDark ? '#18181b' : '#e5e5e5',
        borderBottom: isDark ? '2px solid #3f3f46' : '2px solid #1a1a1a',
      }}
    >
      {(Object.keys(SUB_TAB_CONFIG) as InspectorSubTab[]).map((tabId) => {
        const isActive = activeTab === tabId;
        const config = SUB_TAB_CONFIG[tabId];

        return (
          <button
            key={tabId}
            onClick={() => onTabChange(tabId)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all duration-200"
            style={{
              background: isActive
                ? (isDark ? 'var(--accent-cyan)' : '#0066cc')
                : 'transparent',
              color: isActive
                ? (isDark ? '#0a0a0c' : '#ffffff')
                : (isDark ? '#71717a' : '#666666'),
              boxShadow: isActive
                ? (isDark ? '2px 2px 0 #000' : '2px 2px 0 #1a1a1a')
                : 'none',
              transform: isActive ? 'translateY(1px)' : 'translateY(0)',
              border: isActive
                ? 'none'
                : (isDark ? '2px solid #3f3f46' : '2px solid #cccccc'),
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                const el = e.currentTarget as HTMLButtonElement;
                el.style.background = isDark ? '#27272a' : '#f0f0f0';
                el.style.color = isDark ? '#e4e4e7' : '#1a1a1a';
                el.style.transform = 'translateY(-1px)';
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                const el = e.currentTarget as HTMLButtonElement;
                el.style.background = 'transparent';
                el.style.color = isDark ? '#71717a' : '#666666';
                el.style.transform = 'translateY(0)';
              }
            }}
          >
            <span style={{ color: 'inherit' }}>{SUB_TAB_ICONS[tabId]}</span>
            {config.label}
          </button>
        );
      })}
    </div>
  );
});
