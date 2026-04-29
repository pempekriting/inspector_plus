import { useEffect, useRef } from "react";
import { HierarchyTree } from "./HierarchyTree";
import { AccessibilityPanel } from "./AccessibilityPanel";
import { useHierarchyStore } from "../stores/hierarchyStore";
import { useDeviceStore } from "../stores/deviceStore";
import { useHierarchyAndScreenshot } from "../services/api";

export function HierarchyPanel() {
  const { selectedDevice } = useDeviceStore();
  const { triggerHierarchyRefresh, setUiTree, setCombinedScreenshotUrl } = useHierarchyStore();

  const { data, isLoading, refetch } = useHierarchyAndScreenshot(selectedDevice || undefined);
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;

  // Expose refetch for HierarchyTree refresh button via store
  useEffect(() => {
    useHierarchyStore.setState({ refetchFn: refetchRef });
  }, []);

  // When combined fetch completes, update both uiTree and screenshotUrl
  useEffect(() => {
    if (data) {
      setUiTree(data.hierarchy);
      setCombinedScreenshotUrl(data.screenshotUrl);
      useHierarchyStore.setState({ isRefreshing: false });
    }
  }, [data, setUiTree, setCombinedScreenshotUrl]);

  // Clear refreshing state on error
  useEffect(() => {
    if (isLoading === false && data === undefined) {
      useHierarchyStore.setState({ isRefreshing: false });
    }
  }, [isLoading, data]);

  // Still trigger hierarchy refresh on device change (for non-combined path)
  useEffect(() => {
    triggerHierarchyRefresh();
  }, [selectedDevice, triggerHierarchyRefresh]);

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      <HierarchyTree refreshKey={selectedDevice} />
      <AccessibilityPanel />
    </div>
  );
}