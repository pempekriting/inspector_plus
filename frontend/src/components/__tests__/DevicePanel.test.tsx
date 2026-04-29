import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import { DevicePanel } from "../DevicePanel";

// Module-scoped mocks so they're initialized before vi.mock factory runs
const mockSetDevices = vi.fn();
const mockSetSelectedDevice = vi.fn();
const mockSetConnected = vi.fn();
const mockUseDeviceStore = vi.fn(() => ({
  devices: [],
  selectedDevice: null,
  setDevices: mockSetDevices,
  setSelectedDevice: mockSetSelectedDevice,
  setConnected: mockSetConnected,
}));

vi.mock("@/stores/deviceStore", () => ({
  useDeviceStore: () => mockUseDeviceStore(),
}));

vi.mock("@/services/api", () => ({
  useDeviceStatus: vi.fn(() => ({ data: null })),
}));

vi.mock("@/hooks/useDevice", () => ({
  useDevice: vi.fn(() => ({
    fetchDevices: vi.fn().mockResolvedValue(undefined),
    connectAdb: vi.fn().mockResolvedValue(undefined),
  })),
}));

describe("DevicePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseDeviceStore.mockReturnValue({
      devices: [], selectedDevice: null,
      setDevices: mockSetDevices, setSelectedDevice: mockSetSelectedDevice, setConnected: mockSetConnected,
    });
  });

  it("renders without crashing when no devices", () => {
    const { container } = render(<DevicePanel />);
    expect(container).toBeDefined();
  });

  it("renders without crashing when devices are available", () => {
    mockUseDeviceStore.mockReturnValue({
      devices: [
        { id: "device1", udid: "ABC123", serial: "ABC123", name: "Pixel 7", manufacturer: "Google", state: "device", os: "13" },
      ],
      selectedDevice: "ABC123",
      setDevices: mockSetDevices, setSelectedDevice: mockSetSelectedDevice, setConnected: mockSetConnected,
    });
    const { container } = render(<DevicePanel />);
    expect(container).toBeDefined();
  });
});