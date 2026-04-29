import { useThemeStore } from "../stores/themeStore";

export function StatusBar() {
  const { theme } = useThemeStore();
  const isDark = theme === 'dark';

  return (
    <div
      className="px-4 py-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider"
      style={{
        background: isDark ? '#18181b' : '#e5e5e5',
        borderTop: isDark ? '3px solid #3f3f46' : '3px solid #1a1a1a',
        color: isDark ? '#71717a' : '#666666',
      }}
    >
      <div className="flex items-center gap-4">
        <span>v1.1.0</span>
      </div>
    </div>
  );
}
