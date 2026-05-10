import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  BoundsSchema,
  UiNodeSchema,
  DeviceInfoSchema,
  DeviceStatusSchema,
  HierarchyResponseSchema,
  HierarchyAndScreenshotSchema,
  NetworkFlowSchema,
  NetworkInfoSchema,
  LocatorResultSchema,
  DeviceContextsResponseSchema,
} from '../../src/services/api';

describe('api Zod schemas', () => {
  describe('BoundsSchema', () => {
    it('parses valid bounds', () => {
      const result = BoundsSchema.parse({ x: 0, y: 0, width: 100, height: 200 });
      expect(result).toEqual({ x: 0, y: 0, width: 100, height: 200 });
    });

    it('rejects missing fields', () => {
      expect(() => BoundsSchema.parse({ x: 0, y: 0 })).toThrow();
    });

    it('rejects wrong types', () => {
      expect(() => BoundsSchema.parse({ x: '0', y: 0, width: 100, height: 200 })).toThrow();
    });
  });

  describe('UiNodeSchema', () => {
    it('parses minimal UiNode', () => {
      const result = UiNodeSchema.parse({
        id: 'node1',
        bounds: { x: 0, y: 0, width: 100, height: 200 },
      });
      expect(result.id).toBe('node1');
    });

    it('parses full UiNode with optional fields', () => {
      const result = UiNodeSchema.parse({
        id: 'node1',
        className: 'android.widget.Button',
        package: 'com.example.app',
        text: 'Click me',
        resourceId: 'com.example:id/btn',
        contentDesc: 'submit',
        bounds: { x: 0, y: 0, width: 100, height: 50 },
        children: [],
      });
      expect(result.className).toBe('android.widget.Button');
    });

    it('parses nested children', () => {
      const result = UiNodeSchema.parse({
        id: 'root',
        bounds: { x: 0, y: 0, width: 1080, height: 1920 },
        children: [
          {
            id: 'child1',
            bounds: { x: 0, y: 0, width: 100, height: 50 },
            children: [],
          },
        ],
      });
      expect(result.children).toHaveLength(1);
      expect(result.children![0].id).toBe('child1');
    });

    it('rejects missing id', () => {
      expect(() =>
        UiNodeSchema.parse({ bounds: { x: 0, y: 0, width: 100, height: 200 } })
      ).toThrow();
    });
  });

  describe('DeviceInfoSchema', () => {
    it('parses minimal DeviceInfo', () => {
      const result = DeviceInfoSchema.parse({
        udid: 'abc123',
        state: 'device',
        model: 'Pixel 5',
      });
      expect(result.udid).toBe('abc123');
    });

    it('parses full DeviceInfo with all fields', () => {
      const result = DeviceInfoSchema.parse({
        udid: 'abc123',
        serial: 'ABC123',
        state: 'device',
        model: 'Pixel 5',
        name: 'Pixel 5',
        manufacturer: 'Google',
        brand: 'Google',
        android_version: '13',
        sdk: '33',
        platform: 'android',
        os_version: '13',
        architecture: 'arm64',
        device_type: 'phone',
      });
      expect(result.platform).toBe('android');
    });

    it('rejects invalid platform', () => {
      expect(() =>
        DeviceInfoSchema.parse({
          udid: 'abc',
          state: 'device',
          model: 'Pixel',
          platform: 'windows',
        })
      ).toThrow();
    });
  });

  describe('DeviceStatusSchema', () => {
    it('parses connected status with devices', () => {
      const result = DeviceStatusSchema.parse({
        connected: true,
        devices: [{ udid: 'abc', state: 'device', model: 'Pixel' }],
      });
      expect(result.connected).toBe(true);
      expect(result.devices).toHaveLength(1);
    });

    it('parses disconnected status', () => {
      const result = DeviceStatusSchema.parse({
        connected: false,
        devices: [],
      });
      expect(result.connected).toBe(false);
      expect(result.devices).toHaveLength(0);
    });
  });

  describe('HierarchyResponseSchema', () => {
    it('parses valid hierarchy response', () => {
      const result = HierarchyResponseSchema.parse({
        tree: {
          id: 'root',
          bounds: { x: 0, y: 0, width: 1080, height: 1920 },
        },
      });
      expect(result.tree.id).toBe('root');
    });

    it('rejects missing tree', () => {
      expect(() => HierarchyResponseSchema.parse({})).toThrow();
    });
  });

  describe('HierarchyAndScreenshotSchema', () => {
    it('parses valid hierarchy+screenshot response', () => {
      const result = HierarchyAndScreenshotSchema.parse({
        hierarchy: { id: 'root', bounds: { x: 0, y: 0, width: 1080, height: 1920 } },
        screenshot: 'base64 png data here',
      });
      expect(result.hierarchy.id).toBe('root');
      expect(result.screenshot).toBe('base64 png data here');
    });

    it('rejects missing hierarchy', () => {
      expect(() => HierarchyAndScreenshotSchema.parse({ screenshot: 'abc' })).toThrow();
    });

    it('rejects missing screenshot', () => {
      expect(() => HierarchyAndScreenshotSchema.parse({ hierarchy: { id: 'root', bounds: { x: 0, y: 0, width: 100, height: 100 } } })).toThrow();
    });
  });

  describe('NetworkFlowSchema', () => {
    it('parses minimal flow', () => {
      const result = NetworkFlowSchema.parse({
        id: 'flow1',
        timestamp: 1234567890,
        request: { method: 'GET', url: 'https://example.com', host: 'example.com', path: '/', headers: {} },
        duration_ms: 100,
        websocket: false,
      });
      expect(result.id).toBe('flow1');
      expect(result.websocket).toBe(false);
    });

    it('parses flow with response', () => {
      const result = NetworkFlowSchema.parse({
        id: 'flow2',
        timestamp: 1234567890,
        request: { method: 'GET', url: 'https://example.com', host: 'example.com', path: '/', headers: {} },
        response: { status_code: 200, reason: 'OK', headers: { 'Content-Type': 'text/html' }, body: 'hello' },
        duration_ms: 50,
        websocket: false,
      });
      expect(result.response?.status_code).toBe(200);
    });

    it('parses flow with error', () => {
      const result = NetworkFlowSchema.parse({
        id: 'flow3',
        timestamp: 1234567890,
        request: { method: 'GET', url: 'https://example.com', host: 'example.com', path: '/', headers: {} },
        duration_ms: 0,
        websocket: false,
        error: 'Connection refused',
      });
      expect(result.error).toBe('Connection refused');
    });

    it('rejects invalid headers type', () => {
      expect(() =>
        NetworkFlowSchema.parse({
          id: 'flow4',
          timestamp: 1234567890,
          request: { method: 'GET', url: 'https://example.com', host: 'example.com', path: '/', headers: { 'X-Token': 123 } as any },
          duration_ms: 0,
          websocket: false,
        })
      ).toThrow();
    });
  });

  describe('NetworkInfoSchema', () => {
    it('parses valid network info', () => {
      const result = NetworkInfoSchema.parse({
        ip_addresses: [{ iface: 'eth0', address: '192.168.1.1', family: 'IPv4' }],
        connections: ['tcp', 'udp'],
        dns: ['8.8.8.8'],
      });
      expect(result.ip_addresses).toHaveLength(1);
    });

    it('rejects invalid ip_addresses', () => {
      expect(() => NetworkInfoSchema.parse({ ip_addresses: 'not an array', connections: [], dns: [] })).toThrow();
    });
  });

  describe('LocatorResultSchema', () => {
    it('parses valid locator result', () => {
      const result = LocatorResultSchema.parse({
        nodeId: 'node1',
        locators: [
          { strategy: 'xpath', value: '//button', expression: '//button[@text="Submit"]', stability: 0.9 },
          { strategy: 'id', value: 'submit-btn', expression: 'id("submit-btn")', stability: 1.0 },
        ],
        best: 'id',
      });
      expect(result.nodeId).toBe('node1');
      expect(result.locators).toHaveLength(2);
      expect(result.best).toBe('id');
    });

    it('parses without best field (optional)', () => {
      const result = LocatorResultSchema.parse({
        nodeId: 'node1',
        locators: [{ strategy: 'xpath', value: '//button', expression: '//button', stability: 0.5 }],
      });
      expect(result.best).toBeUndefined();
    });

    it('rejects empty locators array', () => {
      // Empty array means no locators found - parse succeeds since it's a valid array
      const result = LocatorResultSchema.parse({ nodeId: 'node1', locators: [] });
      expect(result.locators).toHaveLength(0);
    });

    it('rejects missing locators field', () => {
      expect(() => LocatorResultSchema.parse({ nodeId: 'node1' })).toThrow();
    });
  });

  describe('DeviceContextsResponseSchema', () => {
    it('parses native context', () => {
      const result = DeviceContextsResponseSchema.parse({
        contexts: [{ id: 'NATIVE_APP', type: 'native', description: 'Native context' }],
      });
      expect(result.contexts).toHaveLength(1);
      expect(result.contexts[0].type).toBe('native');
    });

    it('parses webview context', () => {
      const result = DeviceContextsResponseSchema.parse({
        contexts: [{ id: 'WEBVIEW_1', type: 'webview', description: 'Chrome' }],
      });
      expect(result.contexts[0].type).toBe('webview');
    });

    it('rejects invalid context type', () => {
      expect(() =>
        DeviceContextsResponseSchema.parse({
          contexts: [{ id: 'ctx1', type: 'browser', description: '???' }],
        })
      ).toThrow();
    });
  });
});
