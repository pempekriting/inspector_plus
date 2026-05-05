import { create } from "zustand";
import { getApiUrl, setApiUrl as persistApiUrl, resetApiUrl, getMcpUrl, setMcpUrl as persistMcpUrl, resetMcpUrl } from "../config/apiConfig";

interface SettingsState {
  backendUrl: string;
  mcpUrl: string;
  setBackendUrl: (url: string) => void;
  setMcpUrl: (url: string) => void;
  loadSettings: () => void;
  resetSettings: () => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  backendUrl: getApiUrl(),
  mcpUrl: getMcpUrl(),

  setBackendUrl: (url) => {
    persistApiUrl(url);
    set({ backendUrl: url });
  },

  setMcpUrl: (url) => {
    persistMcpUrl(url);
    set({ mcpUrl: url });
  },

  loadSettings: () => {
    set({
      backendUrl: getApiUrl(),
      mcpUrl: getMcpUrl(),
    });
  },

  resetSettings: () => {
    resetApiUrl();
    resetMcpUrl();
    set({
      backendUrl: "http://localhost:8001",
      mcpUrl: "http://localhost:8002",
    });
  },
}));
