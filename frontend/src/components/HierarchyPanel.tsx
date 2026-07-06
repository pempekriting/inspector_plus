import { useEffect } from 'react';

import { useHierarchyAndScreenshot } from '../services/api';
import { useDeviceStore } from '../stores/deviceStore';
import { useHierarchyStore } from '../stores/hierarchyStore';
import { useThemeStore } from '../stores/themeStore';

import { DeviceActionsBar } from './DeviceActionsBar';
import { HierarchyTree } from './HierarchyTree';
import { PropertiesPanel } from './PropertiesPanel';

export function HierarchyPanel() {
  const { selectedDevice } = useDeviceStore();
  const { theme } = useThemeStore();
  const { triggerHierarchyRefresh, setUiTree, setCombinedScreenshotUrl, expandToDepth } =
    useHierarchyStore();

  const { data, isLoading, isError, error } = useHierarchyAndScreenshot(
    selectedDevice || undefined
  );

  useEffect(() => {
    if (data) {
      // Guard against malformed hierarchy (e.g. backend returning error dict instead of tree)
      const isValidTree =
        data.hierarchy &&
        typeof data.hierarchy.id === 'string' &&
        (data.hierarchy.children === undefined || Array.isArray(data.hierarchy.children));

      if (isValidTree) {
        setUiTree(data.hierarchy);
        expandToDepth(data.hierarchy, 2);
      } else {
        // Create a fallback empty tree so the panel renders instead of blocking
        setUiTree({ id: 'root', className: 'Device', children: [] });
      }

      setCombinedScreenshotUrl(data.screenshotUrl);
      useHierarchyStore.setState({ isRefreshing: false });
    }
  }, [data, setUiTree, setCombinedScreenshotUrl, expandToDepth]);

  // Reset loading state when query resolves (success or error)
  useEffect(() => {
    if (!isLoading) {
      useHierarchyStore.setState({ isRefreshing: false, isLoadingScreenshot: false });
    }
  }, [isLoading]);

  // Immediately show loading state when device changes
  useEffect(() => {
    if (selectedDevice) {
      setUiTree(null);
      useHierarchyStore.setState({
        isRefreshing: true,
        isLoadingScreenshot: true,
        combinedScreenshotUrl: null,
        lockedNode: null,
        selectedNode: null,
        hoveredNode: null,
      });
    }
  }, [selectedDevice, setUiTree]);

  const isDark = theme === 'dark';

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      <DeviceActionsBar />
      {isError && (
        <div
          className="mx-3 mt-2 px-3 py-2 rounded-lg text-[10px] font-medium flex items-center gap-2"
          style={{
            background: isDark ? 'rgba(248, 113, 113, 0.12)' : 'rgba(220, 38, 38, 0.08)',
            border: `1.5px solid ${isDark ? '#f87171' : '#dc2626'}`,
            color: isDark ? '#fca5a5' : '#991b1b',
          }}
        >
          <svg
            className="w-3.5 h-3.5 flex-shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span className="flex-1 truncate">
            {error instanceof Error ? error.message : 'Failed to load device hierarchy'}
          </span>
        </div>
      )}
      <HierarchyTree refreshKey={selectedDevice} />
      <PropertiesPanel />
    </div>
  );
}
