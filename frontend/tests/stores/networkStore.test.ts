import { describe, it, expect, vi, beforeEach } from 'vitest';

import { useNetworkStore } from '../../src/stores/networkStore';
import type { NetworkFlow } from '../../src/types/network';

const createFlow = (id: string, timestamp: number): NetworkFlow => ({
  id,
  timestamp,
  request: {
    method: 'GET',
    url: `https://example.com/${id}`,
    host: 'example.com',
    path: `/${id}`,
    headers: {},
  },
  response: {
    status_code: 200,
    reason: 'OK',
    headers: {},
    body: 'ok',
  },
  duration_ms: 100,
  websocket: false,
});

describe('networkStore', () => {
  beforeEach(() => {
    useNetworkStore.setState({
      trafficFlows: [],
      proxyStatus: { running: false, port: 8080, flow_count: 0 },
      wsConnected: false,
      wsDisconnectedAt: null,
      selectedFlowId: null,
      lastTimestamp: 0,
    });
  });

  describe('initial state', () => {
    it('defaults to empty traffic flows', () => {
      expect(useNetworkStore.getState().trafficFlows).toEqual([]);
    });

    it('defaults to proxy not running on port 8080', () => {
      const { proxyStatus } = useNetworkStore.getState();
      expect(proxyStatus.running).toBe(false);
      expect(proxyStatus.port).toBe(8080);
      expect(proxyStatus.flow_count).toBe(0);
    });

    it('defaults to ws disconnected with null disconnectedAt', () => {
      const { wsConnected, wsDisconnectedAt } = useNetworkStore.getState();
      expect(wsConnected).toBe(false);
      expect(wsDisconnectedAt).toBeNull();
    });
  });

  describe('addFlow', () => {
    it('appends flow to trafficFlows', () => {
      const flow1 = createFlow('flow1', 1000);
      const flow2 = createFlow('flow2', 2000);
      useNetworkStore.getState().addFlow(flow1);
      useNetworkStore.getState().addFlow(flow2);
      const { trafficFlows } = useNetworkStore.getState();
      expect(trafficFlows.length).toBe(2);
      expect(trafficFlows[0].id).toBe('flow1');
      expect(trafficFlows[1].id).toBe('flow2');
    });

    it('keeps only last 1000 flows (slice -999)', () => {
      // Add 1005 flows
      const flows = Array.from({ length: 1005 }, (_, i) =>
        createFlow(`flow${i}`, i)
      );
      flows.forEach(f => useNetworkStore.getState().addFlow(f));
      const { trafficFlows } = useNetworkStore.getState();
      expect(trafficFlows.length).toBe(1000);
      expect(trafficFlows[0].id).toBe('flow5'); // first 5 were dropped
      expect(trafficFlows[999].id).toBe('flow1004'); // last one
    });
  });

  describe('setTrafficFlows', () => {
    it('replaces all traffic flows', () => {
      const flows = [createFlow('a', 1), createFlow('b', 2)];
      useNetworkStore.getState().setTrafficFlows(flows);
      expect(useNetworkStore.getState().trafficFlows).toEqual(flows);
    });

    it('can set empty array', () => {
      useNetworkStore.setState({ trafficFlows: [createFlow('x', 1)] });
      useNetworkStore.getState().setTrafficFlows([]);
      expect(useNetworkStore.getState().trafficFlows).toEqual([]);
    });
  });

  describe('clearTraffic', () => {
    it('resets trafficFlows, selectedFlowId, lastTimestamp, wsDisconnectedAt', () => {
      useNetworkStore.setState({
        trafficFlows: [createFlow('a', 1)],
        selectedFlowId: 'a',
        lastTimestamp: 999,
        wsDisconnectedAt: 123456,
      });
      useNetworkStore.getState().clearTraffic();
      const state = useNetworkStore.getState();
      expect(state.trafficFlows).toEqual([]);
      expect(state.selectedFlowId).toBeNull();
      expect(state.lastTimestamp).toBe(0);
      expect(state.wsDisconnectedAt).toBeNull();
    });
  });

  describe('setProxyStatus', () => {
    it('partially updates proxyStatus', () => {
      useNetworkStore.getState().setProxyStatus({ running: true, port: 9090 });
      const { proxyStatus } = useNetworkStore.getState();
      expect(proxyStatus.running).toBe(true);
      expect(proxyStatus.port).toBe(9090);
      expect(proxyStatus.flow_count).toBe(0); // unchanged
    });

    it('updates flow_count', () => {
      useNetworkStore.getState().setProxyStatus({ flow_count: 42 });
      expect(useNetworkStore.getState().proxyStatus.flow_count).toBe(42);
    });
  });

  describe('setWsConnected', () => {
    it('sets connected true and clears wsDisconnectedAt', () => {
      useNetworkStore.setState({ wsDisconnectedAt: 123456 });
      useNetworkStore.getState().setWsConnected(true);
      const { wsConnected, wsDisconnectedAt } = useNetworkStore.getState();
      expect(wsConnected).toBe(true);
      expect(wsDisconnectedAt).toBeNull();
    });

    it('sets connected false and records timestamp', () => {
      useNetworkStore.getState().setWsConnected(false);
      const { wsConnected, wsDisconnectedAt } = useNetworkStore.getState();
      expect(wsConnected).toBe(false);
      expect(wsDisconnectedAt).not.toBeNull();
    });

    it('does not overwrite existing wsDisconnectedAt when disconnecting again', () => {
      useNetworkStore.setState({ wsDisconnectedAt: 1000 });
      useNetworkStore.getState().setWsConnected(false);
      const first = useNetworkStore.getState().wsDisconnectedAt;
      useNetworkStore.getState().setWsConnected(false);
      const second = useNetworkStore.getState().wsDisconnectedAt;
      // should keep existing wsDisconnectedAt (since it was already set)
      expect(useNetworkStore.getState().wsDisconnectedAt).toBe(first);
    });
  });

  describe('setWsDisconnectedAt', () => {
    it('sets wsDisconnectedAt to a timestamp', () => {
      useNetworkStore.getState().setWsDisconnectedAt(999999);
      expect(useNetworkStore.getState().wsDisconnectedAt).toBe(999999);
    });

    it('sets wsDisconnectedAt to null', () => {
      useNetworkStore.setState({ wsDisconnectedAt: 123 });
      useNetworkStore.getState().setWsDisconnectedAt(null);
      expect(useNetworkStore.getState().wsDisconnectedAt).toBeNull();
    });
  });

  describe('setSelectedFlowId', () => {
    it('sets selectedFlowId', () => {
      useNetworkStore.getState().setSelectedFlowId('flow-42');
      expect(useNetworkStore.getState().selectedFlowId).toBe('flow-42');
    });

    it('sets selectedFlowId to null', () => {
      useNetworkStore.setState({ selectedFlowId: 'flow-1' });
      useNetworkStore.getState().setSelectedFlowId(null);
      expect(useNetworkStore.getState().selectedFlowId).toBeNull();
    });
  });

  describe('setLastTimestamp', () => {
    it('accepts a number', () => {
      useNetworkStore.getState().setLastTimestamp(12345);
      expect(useNetworkStore.getState().lastTimestamp).toBe(12345);
    });

    it('accepts an updater function', () => {
      useNetworkStore.setState({ lastTimestamp: 100 });
      useNetworkStore.getState().setLastTimestamp((prev) => prev + 50);
      expect(useNetworkStore.getState().lastTimestamp).toBe(150);
    });
  });
});
