import { describe, it, expect, vi, beforeEach } from 'vitest';

import { useSettingsStore } from '../../src/stores/settingsStore';

// Mock the apiConfig module
vi.mock('../../src/config/apiConfig', () => ({
  getApiUrl: vi.fn(() => 'http://localhost:8001'),
  setApiUrl: vi.fn(),
  resetApiUrl: vi.fn(),
  getMcpUrl: vi.fn(() => 'http://localhost:8002'),
  setMcpUrl: vi.fn(),
  resetMcpUrl: vi.fn(),
}));

describe('settingsStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSettingsStore.setState({
      backendUrl: 'http://localhost:8001',
      mcpUrl: 'http://localhost:8002',
    });
  });

  describe('initial state', () => {
    it('defaults backendUrl from getApiUrl', () => {
      expect(useSettingsStore.getState().backendUrl).toBe('http://localhost:8001');
    });

    it('defaults mcpUrl from getMcpUrl', () => {
      expect(useSettingsStore.getState().mcpUrl).toBe('http://localhost:8002');
    });
  });

  describe('setBackendUrl', () => {
    it('updates state and persists via apiConfig', async () => {
      const { setApiUrl } = await import('../../src/config/apiConfig');
      useSettingsStore.getState().setBackendUrl('http://custom:9000');
      expect(useSettingsStore.getState().backendUrl).toBe('http://custom:9000');
      expect(setApiUrl).toHaveBeenCalledWith('http://custom:9000');
    });
  });

  describe('setMcpUrl', () => {
    it('updates state and persists via apiConfig', async () => {
      const { setMcpUrl } = await import('../../src/config/apiConfig');
      useSettingsStore.getState().setMcpUrl('http://custom-mcp:9001');
      expect(useSettingsStore.getState().mcpUrl).toBe('http://custom-mcp:9001');
      expect(setMcpUrl).toHaveBeenCalledWith('http://custom-mcp:9001');
    });
  });

  describe('loadSettings', () => {
    it('re-reads from apiConfig', async () => {
      const { getApiUrl, getMcpUrl } = await import('../../src/config/apiConfig');
      vi.mocked(getApiUrl).mockReturnValue('http://reloaded:8001');
      vi.mocked(getMcpUrl).mockReturnValue('http://reloaded:8002');

      useSettingsStore.getState().loadSettings();
      expect(useSettingsStore.getState().backendUrl).toBe('http://reloaded:8001');
      expect(useSettingsStore.getState().mcpUrl).toBe('http://reloaded:8002');
    });
  });

  describe('resetSettings', () => {
    it('resets to defaults and calls reset functions', async () => {
      const { resetApiUrl, resetMcpUrl } = await import('../../src/config/apiConfig');

      useSettingsStore.setState({
        backendUrl: 'http://custom:9999',
        mcpUrl: 'http://custom:9998',
      });

      useSettingsStore.getState().resetSettings();

      const { backendUrl, mcpUrl } = useSettingsStore.getState();
      expect(backendUrl).toBe('http://localhost:8001');
      expect(mcpUrl).toBe('http://localhost:8002');
      expect(resetApiUrl).toHaveBeenCalled();
      expect(resetMcpUrl).toHaveBeenCalled();
    });
  });
});
