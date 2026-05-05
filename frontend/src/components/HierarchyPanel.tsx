import { useEffect, useRef } from "react";
import { HierarchyTree } from "./HierarchyTree";
import { PropertiesPanel } from "./PropertiesPanel";
import { DeviceActionsBar } from "./DeviceActionsBar";
import { useHierarchyStore } from "../stores/hierarchyStore";
import { useDeviceStore } from "../stores/deviceStore";
import { useHierarchyAndScreenshot } from "../services/api";

export function HierarchyPanel() {
  const { selectedDevice } = useDeviceStore();
  const { triggerHierarchyRefresh, setUiTree, setCombinedScreenshotUrl, expandAll } = useHierarchyStore();

  const { data, isLoading, refetch } = useHierarchyAndScreenshot(selectedDevice || undefined);
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;

  useEffect(() => {
    useHierarchyStore.setState({ refetchFn: refetchRef });
  }, []);

  useEffect(() => {
    if (data) {
      setUiTree(data.hierarchy);
      setCombinedScreenshotUrl(data.screenshotUrl);
      useHierarchyStore.setState({ isRefreshing: false });
      // Auto-expand all nodes when hierarchy loads
      expandAll(data.hierarchy);
    }
  }, [data, setUiTree, setCombinedScreenshotUrl, expandAll]);

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