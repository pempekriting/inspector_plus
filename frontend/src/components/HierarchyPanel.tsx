import { useEffect } from 'react';

import { useHierarchyAndScreenshot } from '../services/api';
import { useDeviceStore } from '../stores/deviceStore';
import { useHierarchyStore } from '../stores/hierarchyStore';

import { DeviceActionsBar } from './DeviceActionsBar';
import { HierarchyTree } from './HierarchyTree';
import { PropertiesPanel } from './PropertiesPanel';

export function HierarchyPanel() {
  const { selectedDevice } = useDeviceStore();
  const { triggerHierarchyRefresh, setUiTree, setCombinedScreenshotUrl, expandToDepth } =
    useHierarchyStore();

  const { data, isLoading } = useHierarchyAndScreenshot(selectedDevice || undefined);

  useEffect(() => {
    if (data) {
      setUiTree(data.hierarchy);
      setCombinedScreenshotUrl(data.screenshotUrl);
      useHierarchyStore.setState({ isRefreshing: false });
      // Expand first 2 levels by default (not all nodes)
      expandToDepth(data.hierarchy, 2);
    }
  }, [data, setUiTree, setCombinedScreenshotUrl, expandToDepth]);

  useEffect(() => {
    if (isLoading === false && data === undefined) {
      useHierarchyStore.setState({ isRefreshing: false });
    }
  }, [isLoading, data]);

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

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      <DeviceActionsBar />
      <HierarchyTree refreshKey={selectedDevice} />
      <PropertiesPanel />
    </div>
  );
}
