import { useThemeStore } from "../stores/themeStore";

type TabType = 'inspector' | 'commands' | 'apk-info';

interface TabBarProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

export function TabBar({ activeTab, onTabChange }: TabBarProps) {
  const { theme } = useThemeStore();
  const isDark = theme === 'dark';

  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    {
      id: 'inspector',
      label: 'Inspector',
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M9 9h6M9 13h6M9 17h4" />
        </svg>
      ),
    },
    {
      id: 'commands',
      label: 'Commands',
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 17l6-6-6-6M12 19h8" />
        </svg>
      ),
    },
    {
      id: 'apk-info',
      label: 'Apk Info',
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="5" y="2" width="14" height="20" rx="2" />
          <line x1="12" y1="18" x2="12" y2="18.01" strokeWidth="3" strokeLinecap="round" />
        </svg>
      ),
    },
  ];

  return (
    <div
      className="flex border-b"
      style={{
        background: isDark ? '#18181b' : '#e5e5e5',
        borderColor: isDark ? '#3f3f46' : '#1a1a1a',
      }}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className="flex-1 flex items-center justify-center gap-2 py-3 px-4 text-sm font-bold transition-all relative"
            style={{
              background: isActive ? (isDark ? '#111114' : '#ffffff') : 'transparent',
              color: isActive ? (isDark ? '#e4e4e7' : '#1a1a1a') : (isDark ? '#71717a' : '#666666'),
              borderBottom: isActive
                ? (isDark ? '3px solid #22d3ee' : '3px solid #0066cc')
                : '3px solid transparent',
            }}
          >
            {tab.icon}
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
