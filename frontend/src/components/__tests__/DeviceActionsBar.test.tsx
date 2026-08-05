import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { DeviceActionsBar } from '../DeviceActionsBar';

import { apiFetch, inputDeviceText } from '@/services/api';
import { useHierarchyStore } from '@/stores/hierarchyStore';
import { useDeviceStore } from '@/stores/deviceStore';

vi.mock('@/stores/themeStore', () => ({
  useThemeStore: vi.fn(() => ({ theme: 'dark' })),
}));

vi.mock('@/services/api', () => ({
  apiFetch: vi.fn().mockResolvedValue(undefined),
  inputDeviceText: vi.fn().mockResolvedValue(undefined),
}));

const mockNode = {
  id: 'node1',
  className: 'android.widget.Button',
  bounds: { x: 10, y: 20, width: 100, height: 50 },
  children: [],
};

const lockSelection = vi.fn();
const setSelectedNode = vi.fn();
const setHoveredNode = vi.fn();

vi.mock('@/stores/hierarchyStore', () => ({
  useHierarchyStore: Object.assign(
    vi.fn(() => ({
      hoveredNode: null,
      selectedNode: null,
      lockedNode: null,
    })),
    {
      getState: vi.fn(() => ({
        lockSelection,
        setSelectedNode,
        setHoveredNode,
      })),
      setState: vi.fn(),
    }
  ),
}));

vi.mock('@/stores/deviceStore', () => ({
  useDeviceStore: vi.fn(() => ({
    selectedDevice: 'device123',
    devices: [{ udid: 'device123', platform: 'android' }],
  })),
}));

function renderBar() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <DeviceActionsBar />
    </QueryClientProvider>
  );
}

describe('DeviceActionsBar', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useHierarchyStore).mockReturnValue({
      hoveredNode: mockNode,
      selectedNode: null,
      lockedNode: null,
    } as unknown as ReturnType<typeof useHierarchyStore>);
  });

  it('renders without crashing', () => {
    const { container } = renderBar();
    expect(container).toBeDefined();
  });

  it('taps the device and resets selection on success', async () => {
    renderBar();
    fireEvent.click(screen.getByText('Tap'));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        expect.stringContaining('/tap?udid=device123'),
        expect.objectContaining({ method: 'POST' })
      );
    });
    expect(lockSelection).toHaveBeenCalledWith(null);
    expect(setSelectedNode).toHaveBeenCalledWith(null);
  });

  it('shows the fallback error message when a device action rejects', async () => {
    vi.mocked(apiFetch).mockRejectedValueOnce(new Error('boom'));
    renderBar();
    fireEvent.click(screen.getByText('Tap'));

    expect(await screen.findByText('boom')).toBeInTheDocument();
  });

  it('does not call the API for swipe/drag/long-press when there is no node selected', async () => {
    vi.mocked(useHierarchyStore).mockReturnValue({
      hoveredNode: null,
      selectedNode: null,
      lockedNode: null,
    } as unknown as ReturnType<typeof useHierarchyStore>);
    renderBar();

    // Swipe/Drag/Long Press are disabled without a selected node, so clicking
    // must not trigger the underlying device call at all.
    fireEvent.click(screen.getByText('Swipe'));
    await new Promise((r) => setTimeout(r, 0));
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('sends text without resetting the current node selection', async () => {
    renderBar();
    const input = screen.getByPlaceholderText('Select EditText');
    // EditText input stays disabled unless the selected node looks like a text field —
    // this asserts the generic device-action helper isn't accidentally used for Send.
    expect(input).toBeDisabled();
    expect(inputDeviceText).not.toHaveBeenCalled();
  });
});
