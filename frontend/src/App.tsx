import { useState, useEffect } from "react";
import { ScreenshotCanvas } from "./components/ScreenshotCanvas";
import { Overlay } from "./components/Overlay";
import { TabBar } from "./components/TabBar";
import { SubTabBar } from "./components/SubTabBar";
import { DevicePanel } from "./components/DevicePanel";
import { HierarchyPanel } from "./components/HierarchyPanel";
import { AccessibilityPanel } from "./components/AccessibilityPanel";
import { StatusBar } from "./components/StatusBar";
import { CommandsDrawer } from "./components/CommandsDrawer";
import { ApkInfoPanel } from "./components/ApkInfoPanel";
import { RecorderPanel } from "./components/RecorderPanel";
import { OnboardingModal } from "./components/OnboardingModal";
import { useHierarchyStore } from "./stores/hierarchyStore";
import { useThemeStore } from "./stores/themeStore";
import { useDeviceStore } from "./stores/deviceStore";

export type TabType = 'inspector' | 'commands' | 'app-info';
export type InspectorSubTab = 'hierarchy' | 'accessibility' | 'recorder';

function App() {
  const { hoveredNode, lockedNode } = useHierarchyStore();
  const { theme } = useThemeStore();
  const [activeTab, setActiveTab] = useState<TabType>('inspector');
  const [activeInspectorTab, setActiveInspectorTab] = useState<InspectorSubTab>('hierarchy');
  const { isLoadingScreenshot, isLoadingHierarchy } = useHierarchyStore();
  const [transitionPhase, setTransitionPhase] = useState<'idle' | 'switching'>('idle');

  const [showShortcuts, setShowShortcuts] = useState(false);
  const { selectedDevice } = useDeviceStore();
  const { triggerHierarchyRefresh } = useHierarchyStore();

  // D4: Keyboard shortcut overlay
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ? to show shortcuts
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !(e.target instanceof HTMLInputElement)) {
        setShowShortcuts(prev => !prev);
      }
      // Escape to close shortcuts
      if (e.key === 'Escape') {
        setShowShortcuts(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (transitionPhase === 'switching' && !isLoadingScreenshot && !isLoadingHierarchy) {
      setTimeout(() => setTransitionPhase('idle'), 150);
    }
  }, [isLoadingScreenshot, isLoadingHierarchy, transitionPhase]);

  useEffect(() => {
    document.documentElement.classList.remove('theme-dark', 'theme-light');
    document.documentElement.classList.add(theme === 'dark' ? 'theme-dark' : 'theme-light');
  }, [theme]);



  const handleDeviceChange = () => {
    setTransitionPhase('switching');
  };

  const isDark = theme === 'dark';

  return (
    <div
      className="flex flex-col h-screen w-screen overflow-hidden"
      style={{
        background: isDark ? '#0a0a0c' : '#f5f5f5',
        fontFamily: '"Satoshi", sans-serif',
      }}
    >
      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel - Screenshot Canvas */}
        <div className="flex-[3] relative" style={{ padding: '12px', paddingRight: '6px' }}>
          <div
            className="w-full h-full rounded-xl overflow-hidden neo-brutal-border"
            style={{
              background: isDark ? '#111114' : '#ffffff',
              border: isDark ? '3px solid #3f3f46' : '3px solid #1a1a1a',
              boxShadow: isDark
                ? '6px 6px 0 #000'
                : '6px 6px 0 #1a1a1a',
            }}
          >
            <ScreenshotCanvas />
            {(hoveredNode || lockedNode) && <Overlay />}
          </div>
        </div>

        {/* Right Panel - Inspector */}
        <div
          className="flex-[2] min-w-[320px] flex flex-col"
          style={{
            background: isDark ? '#111114' : '#ffffff',
            borderLeft: isDark ? '3px solid #3f3f46' : '3px solid #1a1a1a',
          }}
        >
          {/* Header */}
          <div
            className="px-4 py-3 flex items-center justify-between"
            style={{
              background: isDark ? '#18181b' : '#e5e5e5',
              borderBottom: isDark ? '3px solid #3f3f46' : '3px solid #1a1a1a',
            }}
          >
            <div className="flex items-center gap-2">
              {/* D4: Shortcuts hint */}
              <button
                onClick={() => setShowShortcuts(prev => !prev)}
                className="w-8 h-8 flex items-center justify-center rounded-lg transition-all active:scale-95"
                style={{
                  background: isDark ? '#1f1f23' : '#ffffff',
                  color: isDark ? '#71717a' : '#666666',
                  border: isDark ? '2px solid #3f3f46' : '2px solid #cccccc',
                }}
                title="Keyboard shortcuts (?)"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="17" x2="12.01" y2="17" strokeWidth="3" strokeLinecap="round" />
                </svg>
              </button>
              <DevicePanel onDeviceChange={handleDeviceChange} />
            </div>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-hidden flex flex-col">
            <TabBar activeTab={activeTab} onTabChange={setActiveTab} />

            {/* Inspector Panel */}
            <div
              className="flex-1 overflow-hidden flex flex-col"
              style={{
                display: activeTab === 'inspector' ? 'flex' : 'none',
                background: isDark ? '#0a0a0c' : '#f5f5f5',
              }}
            >
              {/* Inspector sub-tabs */}
              <SubTabBar
                activeTab={activeInspectorTab}
                onTabChange={setActiveInspectorTab}
                isDark={isDark}
              />

              {/* Sub-tab content */}
              <div className="flex-1 overflow-y-auto">
                <div style={{ display: activeInspectorTab === 'hierarchy' ? 'block' : 'none' }}>
                  <HierarchyPanel />
                </div>
                <div style={{ display: activeInspectorTab === 'accessibility' ? 'block' : 'none' }}>
                  <AccessibilityPanel />
                </div>
                <div style={{ display: activeInspectorTab === 'recorder' ? 'block' : 'none', height: '100%' }}>
                  <RecorderPanel />
                </div>
              </div>
            </div>

            {/* Commands Panel */}
            <div
              className="flex-1 flex flex-col min-h-0"
              style={{
                display: activeTab === 'commands' ? 'flex' : 'none',
              }}
            >
              <CommandsDrawer isDark={isDark} />
            </div>

            {/* App Info Panel */}
            <div
              className="flex-1 flex flex-col min-h-0"
              style={{
                display: activeTab === 'app-info' ? 'flex' : 'none',
              }}
            >
              <ApkInfoPanel isDark={isDark} />
            </div>
          </div>

          <StatusBar />
        </div>
      </div>

      {/* D4: Keyboard Shortcuts Overlay */}
      {showShortcuts && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0, 0, 0, 0.7)', backdropFilter: 'blur(4px)' }}
          onClick={() => setShowShortcuts(false)}
        >
          <div
            className="rounded-xl overflow-hidden"
            style={{
              background: isDark ? '#1a1a1f' : '#ffffff',
              border: isDark ? '3px solid #3f3f46' : '3px solid #1a1a1a',
              boxShadow: isDark ? '8px 8px 0 #000' : '8px 8px 0 #1a1a1a',
              minWidth: '320px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="px-4 py-3 font-bold text-sm"
              style={{
                background: isDark ? '#18181b' : '#e5e5e5',
                borderBottom: isDark ? '3px solid #3f3f46' : '3px solid #1a1a1a',
                color: isDark ? '#e4e4e7' : '#1a1a1a',
              }}
            >
              Keyboard Shortcuts
            </div>
            <div className="p-4 space-y-2">
              {[
                { keys: ['?'], desc: 'Show shortcuts' },
                { keys: ['Esc'], desc: 'Clear search / deselect' },
                { keys: ['/', 'Cmd+K'], desc: 'Focus element search' },
                { keys: ['↑', '↓'], desc: 'Navigate hierarchy' },
                { keys: ['→'], desc: 'Expand node' },
                { keys: ['←'], desc: 'Collapse node' },
                { keys: ['Enter'], desc: 'Select focused node' },
                { keys: ['Tab'], desc: 'Move between panels' },
              ].map(({ keys, desc }) => (
                <div key={desc} className="flex items-center justify-between gap-4">
                  <span className="text-[11px]" style={{ color: isDark ? '#71717a' : '#666666' }}>{desc}</span>
                  <div className="flex items-center gap-1">
                    {keys.map((k) => (
                      <kbd
                        key={k}
                        className="px-2 py-1 rounded text-[10px] font-mono font-bold"
                        style={{
                          background: isDark ? '#1f1f23' : '#f0f0f0',
                          color: isDark ? '#e4e4e7' : '#1a1a1a',
                          border: isDark ? '1.5px solid #3f3f46' : '1.5px solid #cccccc',
                        }}
                      >
                        {k}
                      </kbd>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div
              className="px-4 py-2 text-center"
              style={{
                background: isDark ? '#18181b' : '#e5e5e5',
                borderTop: isDark ? '2px solid #3f3f46' : '2px solid #1a1a1a',
              }}
            >
              <span className="text-[10px]" style={{ color: isDark ? '#52525b' : '#999999' }}>Press ? or Esc to close</span>
            </div>
          </div>
        </div>
      )}

      <OnboardingModal />
    </div>
  );
}

export default App;