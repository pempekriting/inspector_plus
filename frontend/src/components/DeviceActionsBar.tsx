import { useQueryClient } from '@tanstack/react-query';
import { useState, memo } from 'react';

import { getApiUrl } from '../config/apiConfig';
import { apiFetch, inputDeviceText } from '../services/api';
import { useDeviceStore } from '../stores/deviceStore';
import { useHierarchyStore } from '../stores/hierarchyStore';
import { useThemeStore } from '../stores/themeStore';

import { LayoutChips } from './StylePanel';

// NOTE: these use apiFetch (not raw fetch) so the X-API-Key header configured in
// Settings is attached — a bare `fetch()` here would silently fail auth when a key
// is set, while every other request in the app keeps working.
async function pressKey(key: string, udid?: string): Promise<void> {
  const url = udid
    ? `${getApiUrl()}/device/press-key?udid=${encodeURIComponent(udid)}`
    : `${getApiUrl()}/device/press-key`;
  await apiFetch<void>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key }),
  });
}

async function swipeDevice(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  duration?: number,
  udid?: string
): Promise<void> {
  const url = udid
    ? `${getApiUrl()}/device/swipe?udid=${encodeURIComponent(udid)}`
    : `${getApiUrl()}/device/swipe`;
  await apiFetch<void>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ startX, startY, endX, endY, duration: duration ?? 300 }),
  });
}

async function dragDevice(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  duration?: number,
  udid?: string
): Promise<void> {
  const url = udid
    ? `${getApiUrl()}/device/drag?udid=${encodeURIComponent(udid)}`
    : `${getApiUrl()}/device/drag`;
  await apiFetch<void>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ startX, startY, endX, endY, duration: duration ?? 500 }),
  });
}

async function pinchDevice(x: number, y: number, scale: number, udid?: string): Promise<void> {
  const url = udid
    ? `${getApiUrl()}/device/pinch?udid=${encodeURIComponent(udid)}`
    : `${getApiUrl()}/device/pinch`;
  await apiFetch<void>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ x, y, scale }),
  });
}

async function tapDevice(x: number, y: number, udid?: string): Promise<void> {
  const url = udid ? `${getApiUrl()}/tap?udid=${encodeURIComponent(udid)}` : `${getApiUrl()}/tap`;
  await apiFetch<void>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ x, y }),
  });
}

interface ActionPillProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  isDark: boolean;
  variant?: 'default' | 'primary' | 'danger';
}

const ActionPill = memo(function ActionPill({
  label,
  onClick,
  disabled,
  isDark,
  variant = 'default',
}: ActionPillProps) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (disabled || loading) return;
    setLoading(true);
    try {
      await onClick();
    } finally {
      setLoading(false);
    }
  };

  const bgColor =
    variant === 'primary'
      ? isDark
        ? 'var(--accent-cyan)'
        : '#0066cc'
      : variant === 'danger'
        ? isDark
          ? 'rgba(248, 113, 113, 0.15)'
          : 'rgba(220, 38, 38, 0.1)'
        : isDark
          ? '#1f1f23'
          : '#f0f0f0';

  const fgColor =
    variant === 'primary'
      ? isDark
        ? '#0a0a0c'
        : '#ffffff'
      : variant === 'danger'
        ? isDark
          ? '#f87171'
          : '#dc2626'
        : isDark
          ? '#a1a1aa'
          : '#666666';

  const borderColor =
    variant === 'primary'
      ? 'transparent'
      : variant === 'danger'
        ? isDark
          ? '#f87171'
          : '#dc2626'
        : isDark
          ? '#3f3f46'
          : '#cccccc';

  return (
    <button
      onClick={handleClick}
      disabled={disabled || loading}
      className="px-2.5 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
      style={{
        background: bgColor,
        color: fgColor,
        border: `1.5px solid ${borderColor}`,
        boxShadow:
          variant === 'primary' ? (isDark ? '2px 2px 0 #000' : '2px 2px 0 #1a1a1a') : 'none',
      }}
    >
      {loading ? '...' : label}
    </button>
  );
});

export const DeviceActionsBar = memo(function DeviceActionsBar() {
  const { hoveredNode, selectedNode, lockedNode } = useHierarchyStore();
  const { theme } = useThemeStore();
  const { selectedDevice, devices } = useDeviceStore();
  const [inputText, setInputText] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const isDark = theme === 'dark';

  // Get platform from selected device
  const selectedDeviceInfo = devices.find((d) => d.udid === selectedDevice);
  const platform = selectedDeviceInfo?.platform ?? 'android';
  const isIOS = platform === 'ios';

  const queryClient = useQueryClient();

  const triggerRefresh = () => {
    useHierarchyStore.setState({ isRefreshing: true });
    queryClient.invalidateQueries({ queryKey: ['hierarchy-and-screenshot'] });
    queryClient.invalidateQueries({ queryKey: ['hierarchy'] });
  };

  const displayNode = lockedNode || selectedNode || hoveredNode;
  const hasNode = !!displayNode;
  const hasEditText =
    displayNode?.className?.includes('EditText') ||
    displayNode?.className?.includes('TextField') ||
    displayNode?.className?.includes('TextView') ||
    displayNode?.className?.includes('SearchField');

  const nodeBounds = displayNode?.bounds;
  const centerX = nodeBounds ? nodeBounds.x + Math.floor(nodeBounds.width / 2) : 0;
  const centerY = nodeBounds ? nodeBounds.y + Math.floor(nodeBounds.height / 2) : 0;

  const handleSendText = async () => {
    if (!inputText.trim()) return;
    setErrorMsg(null);
    try {
      if (nodeBounds) {
        await tapDevice(centerX, centerY, selectedDevice ?? undefined);
      }
      await inputDeviceText(inputText, selectedDevice ?? undefined);
      setInputText('');
      triggerRefresh();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Failed to send text');
    }
  };

  // Shared shape for the tap/swipe/drag/pinch/press-key action pills below:
  // optionally require node bounds, clear the error, run the device call,
  // reset the current selection, refresh the hierarchy, and surface failures.
  const runDeviceAction = async (
    action: () => Promise<void>,
    fallbackMessage: string,
    { requireBounds = false }: { requireBounds?: boolean } = {}
  ) => {
    if (requireBounds && !nodeBounds) return;
    setErrorMsg(null);
    try {
      await action();
      const store = useHierarchyStore.getState();
      store.lockSelection(null);
      store.setSelectedNode(null);
      store.setHoveredNode(null, undefined);
      triggerRefresh();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : fallbackMessage);
    }
  };

  const handleTap = () =>
    runDeviceAction(() => tapDevice(centerX, centerY, selectedDevice ?? undefined), 'Failed to tap');
  const handleLongPress = () =>
    runDeviceAction(
      () => dragDevice(centerX, centerY, centerX, centerY, 1000, selectedDevice ?? undefined),
      'Long press failed',
      { requireBounds: true }
    );
  const handleSwipe = () =>
    runDeviceAction(
      () =>
        swipeDevice(
          centerX,
          centerY,
          centerX,
          Math.max(0, centerY - 300),
          undefined,
          selectedDevice ?? undefined
        ),
      'Failed to swipe',
      { requireBounds: true }
    );
  const handleDrag = () =>
    runDeviceAction(
      () => dragDevice(centerX, centerY, centerX, centerY + 200, undefined, selectedDevice ?? undefined),
      'Drag not supported on iOS',
      { requireBounds: true }
    );
  const handleZoom = () =>
    runDeviceAction(
      () => pinchDevice(centerX, centerY, 1.5, selectedDevice ?? undefined),
      'Zoom not supported on iOS'
    );
  const handlePinch = () =>
    runDeviceAction(
      () => pinchDevice(centerX, centerY, 0.6, selectedDevice ?? undefined),
      'Pinch not supported on iOS'
    );
  const handleHome = () =>
    runDeviceAction(() => pressKey('home', selectedDevice ?? undefined), 'Failed to press home');
  const handleBack = () =>
    runDeviceAction(() => pressKey('back', selectedDevice ?? undefined), 'Back not supported on iOS');
  const handleRecent = () =>
    runDeviceAction(() => pressKey('recent', selectedDevice ?? undefined), 'Recent not supported on iOS');

  const styles = displayNode?.styles;

  return (
    <div
      className="px-3 py-2 space-y-2 flex-shrink-0"
      style={{
        background: 'var(--bg-tertiary)',
        borderBottom: '2px solid var(--border-subtle)',
      }}
    >
      {/* Row 1: Input Text */}
      <div className="flex items-center gap-2">
        <span
          className="text-[9px] font-bold uppercase tracking-wider flex-shrink-0"
          style={{ color: 'var(--text-tertiary)' }}
        >
          Input
        </span>
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSendText()}
          placeholder={hasEditText ? 'Enter text...' : 'Select EditText'}
          disabled={!hasEditText}
          className="flex-1 px-2 py-1 rounded text-[10px] font-mono disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            background: 'var(--bg-elevated)',
            color: 'var(--text-primary)',
            border: '2px solid var(--border-default)',
          }}
        />
        <ActionPill
          label="Send"
          onClick={handleSendText}
          disabled={!inputText.trim() || !hasEditText}
          isDark={isDark}
          variant="primary"
        />
        <LayoutChips styles={styles} />
      </div>

      {/* Error message display */}
      {errorMsg && (
        <div
          className="px-2 py-1 rounded text-[9px] font-medium"
          style={{
            background: isDark ? 'rgba(248,113,113,0.15)' : 'rgba(220,38,38,0.1)',
            color: isDark ? 'var(--accent-rose)' : '#dc2626',
          }}
        >
          {errorMsg}
        </div>
      )}

      {/* Row 2: Action Pills */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <ActionPill
          label="Tap"
          onClick={handleTap}
          disabled={!hasNode}
          isDark={isDark}
          variant="primary"
        />
        <ActionPill
          label="Long Press"
          onClick={handleLongPress}
          disabled={!hasNode || isIOS}
          isDark={isDark}
        />
        <ActionPill label="Swipe" onClick={handleSwipe} disabled={!hasNode} isDark={isDark} />
        <ActionPill
          label="Drag"
          onClick={handleDrag}
          disabled={!hasNode || isIOS}
          isDark={isDark}
        />
        <ActionPill
          label="Zoom"
          onClick={handleZoom}
          disabled={!hasNode || isIOS}
          isDark={isDark}
        />
        <ActionPill
          label="Pinch"
          onClick={handlePinch}
          disabled={!hasNode || isIOS}
          isDark={isDark}
        />
        <ActionPill label="Home" onClick={handleHome} disabled={false} isDark={isDark} />
        <ActionPill label="Back" onClick={handleBack} disabled={isIOS} isDark={isDark} />
        <ActionPill label="Recent" onClick={handleRecent} disabled={isIOS} isDark={isDark} />
      </div>
    </div>
  );
});
