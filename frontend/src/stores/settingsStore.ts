import { create } from 'zustand';

import {
  getApiUrl,
  setApiUrl as persistApiUrl,
  resetApiUrl,
  getMcpUrl,
  setMcpUrl as persistMcpUrl,
  resetMcpUrl,
} from '../config/apiConfig';

const API_KEY_STORAGE_KEY = 'inspector-plus-api-key';

interface SettingsState {
  backendUrl: string;
  mcpUrl: string;
  apiKey: string;
  setBackendUrl: (url: string) => void;
  setMcpUrl: (url: string) => void;
  setApiKey: (key: string) => void;
  resetSettings: () => void;
}

function loadApiKey(): string {
  try {
    return localStorage.getItem(API_KEY_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

export const useSettingsStore = create<SettingsState>((set) => ({
  backendUrl: getApiUrl(),
  mcpUrl: getMcpUrl(),
  apiKey: loadApiKey(),

  setBackendUrl: (url) => {
    persistApiUrl(url);
    set({ backendUrl: url });
  },

  setMcpUrl: (url) => {
    persistMcpUrl(url);
    set({ mcpUrl: url });
  },

  setApiKey: (key) => {
    try {
      if (key) {
        localStorage.setItem(API_KEY_STORAGE_KEY, key);
      } else {
        localStorage.removeItem(API_KEY_STORAGE_KEY);
      }
    } catch {}
    set({ apiKey: key });
  },

  resetSettings: () => {
    resetApiUrl();
    resetMcpUrl();
    try {
      localStorage.removeItem(API_KEY_STORAGE_KEY);
    } catch {}
    set({
      backendUrl: 'http://localhost:8001',
      mcpUrl: 'http://localhost:8002',
      apiKey: '',
    });
  },
}));
