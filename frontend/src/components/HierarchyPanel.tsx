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

  useEffect(() => {
    triggerHierarchyRefresh();
  }, [selectedDevice, triggerHierarchyRefresh]);

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      <DeviceActionsBar />
      <HierarchyTree refreshKey={selectedDevice} />
      <PropertiesPanel />
    </div>
  );
}