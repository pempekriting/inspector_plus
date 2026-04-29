import { create } from "zustand";
import { DeviceInfo } from "../hooks/useDevice";

interface DeviceState {
  connected: boolean;
  deviceWidth: number;
  deviceHeight: number;
  devices: DeviceInfo[];
  selectedDevice: string | null;
  setConnected: (connected: boolean) => void;
  setDeviceResolution: (width: number, height: number) => void;
  setDevices: (devices: DeviceInfo[]) => void;
  setSelectedDevice: (udid: string | null) => void;
}

const STORAGE_KEY = "inspector-plus-selected-device";

function loadStoredDevice(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export const useDeviceStore = create<DeviceState>((set) => ({
  connected: false,
  deviceWidth: 1080,
  deviceHeight: 1920,
  devices: [],
  selectedDevice: loadStoredDevice(),
  setConnected: (connected) => set({ connected }),
  setDeviceResolution: (width, height) =>
    set({ deviceWidth: width, deviceHeight: height }),
  setDevices: (devices) => set({ devices }),
  setSelectedDevice: (udid) => {
    try {
      if (udid) {
        localStorage.setItem(STORAGE_KEY, udid);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {}
    set({ selectedDevice: udid });
  },
}));