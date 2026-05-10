import { create } from 'zustand';

import type { NetworkFlow, ProxyStatus } from '../types/network';

interface NetworkState {
  trafficFlows: NetworkFlow[];
  proxyStatus: ProxyStatus;
  isCapturing: boolean;
  captureDuration: number;
  wsConnected: boolean;
  wsDisconnectedAt: number | null; // timestamp when WS went down, null when connected
  selectedFlowId: string | null;
  lastTimestamp: number;

  addFlow: (flow: NetworkFlow) => void;
  setTrafficFlows: (flows: NetworkFlow[]) => void;
  clearTraffic: () => void;
  setProxyStatus: (status: Partial<ProxyStatus>) => void;
  setIsCapturing: (capturing: boolean) => void;
  setWsConnected: (connected: boolean) => void;
  setWsDisconnectedAt: (ts: number | null) => void;
  setSelectedFlowId: (id: string | null) => void;
  setLastTimestamp: (ts: number | ((prev: number) => number)) => void;
}

export const useNetworkStore = create<NetworkState>((set) => ({
  trafficFlows: [],
  proxyStatus: { running: false, port: 8080, flow_count: 0 },
  isCapturing: false,
  captureDuration: 0,
  wsConnected: false,
  wsDisconnectedAt: null,
  selectedFlowId: null,
  lastTimestamp: 0,

  addFlow: (flow) =>
    set((state) => {
      const flows = state.trafficFlows;
      if (flows.length >= 1000) {
        // Mutate in place to avoid creating a new array every time
        flows.shift();
      }
      flows.push(flow);
      return { trafficFlows: flows };
    }),
  setTrafficFlows: (flows) => set({ trafficFlows: flows }),
  clearTraffic: () =>
    set({ trafficFlows: [], selectedFlowId: null, lastTimestamp: 0, wsDisconnectedAt: null }),
  setProxyStatus: (status) =>
    set((state) => ({
      proxyStatus: { ...state.proxyStatus, ...status },
    })),
  setIsCapturing: (capturing) => set({ isCapturing: capturing }),
  setWsConnected: (connected) =>
    set((state) => ({
      wsConnected: connected,
      wsDisconnectedAt: connected ? null : (state.wsDisconnectedAt ?? Date.now()),
    })),
  setWsDisconnectedAt: (ts) => set({ wsDisconnectedAt: ts }),
  setSelectedFlowId: (id) => set({ selectedFlowId: id }),
  setLastTimestamp: (ts) =>
    set((state) => ({
      lastTimestamp: typeof ts === 'function' ? ts(state.lastTimestamp) : ts,
    })),
}));
