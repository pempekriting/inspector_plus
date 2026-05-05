/**
 * Unit tests for tree-service.ts - service functions with mocked FastAPI
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as treeService from '../services/tree-service';
import { treeCache } from '../cache/tree-cache';

// Mock the cache
vi.mock('../cache/tree-cache', () => ({
  treeCache: {
    get: vi.fn(),
    set: vi.fn(),
    invalidate: vi.fn(),
    invalidatePrefix: vi.fn(),
    clear: vi.fn(),
  },
}));

// Mock fetch for FastAPI calls
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('tree-service', () => {
  beforeEach(() => {
    // Reset ALL mocks completely before each test
    vi.resetAllMocks();
    // Default: cache returns null (cache miss) for all tests unless explicitly set
    treeCache.get.mockReturnValue(null);
    // Clear any existing subscribers
    treeService.getSubscriberCount(); // reset subscriber tracking
  });

  afterEach(() => {
    // Clean up subscribers after each test
  });

  describe('getHierarchy', () => {
    it('should return cached result when available', async () => {
      const cached = {
        tree: { id: 'cached-node', label: 'Cached' },
        stats: { totalNodes: 1, depth: 0, lastRefresh: '2026-01-01T00:00:00Z' },
        _meta: { source: 'android', cached: false },
      };
      treeCache.get.mockReturnValueOnce(cached);

      const result = await treeService.getHierarchy('device-123');

      expect(result._meta.cached).toBe(true);
      expect(result.tree.id).toBe('cached-node');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should fetch from FastAPI on cache miss', async () => {
      const mockResponse = {
        className: 'android.widget.LinearLayout',
        children: [
          { className: 'android.widget.Button', children: [], text: 'Click Me' },
        ],
        source: 'android',
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      treeCache.get.mockReturnValueOnce(null);
      const result = await treeService.getHierarchy('device-123');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8001/hierarchy?udid=device-123',
        expect.any(Object)
      );
      expect(result._meta.cached).toBe(false);
      expect(treeCache.set).toHaveBeenCalled();
    });

    it('should detect ios source', async () => {
      const mockResponse = {
        className: 'UICollectionView',
        children: [],
        source: 'ios',
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      treeCache.get.mockReturnValueOnce(null);
      const result = await treeService.getHierarchy('device-123');

      expect(result._meta.source).toBe('ios');
    });
  });

  describe('getNode', () => {
    it('should find node in hierarchy', async () => {
      const mockHierarchy = {
        className: 'RootLayout',
        children: [
          {
            className: 'ChildView',
            id: 'node_child_1',
            children: [],
          },
        ],
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockHierarchy),
      });

      treeCache.get.mockReturnValueOnce(null);
      const result = await treeService.getNode('node_child_1', 'device-123');

      expect(result.node.id).toBe('node_child_1');
      expect(result.path.length).toBeGreaterThan(0);
    });

    it('should throw error when node not found', async () => {
      const mockHierarchy = {
        className: 'RootLayout',
        children: [],
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockHierarchy),
      });

      treeCache.get.mockReturnValueOnce(null);
      await expect(treeService.getNode('nonexistent', 'device-123')).rejects.toThrow('Node not found');
    });
  });

  describe('getChildren pagination', () => {
    it('should return children with pagination', async () => {
      const parentNode = {
        id: 'parent_1',
        className: 'ParentView',
        children: Array.from({ length: 10 }, (_, i) => ({
          id: `child_${i}`,
          className: 'ChildView',
          children: [],
        })),
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(parentNode),
      });

      treeCache.get.mockReturnValueOnce(null);
      const result = await treeService.getChildren('parent_1', 'device-123', undefined, 3);

      expect(result.data.length).toBe(3);
      expect(result.hasMore).toBe(true);
      expect(result.parentId).toBe('parent_1');
      expect(result.nextCursor).not.toBeNull();
    });

    it('should return empty for node with no children', async () => {
      const leafNode = {
        id: 'leaf_1',
        className: 'LeafView',
        children: [],
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(leafNode),
      });

      treeCache.get.mockReturnValueOnce(null);
      const result = await treeService.getChildren('leaf_1', 'device-123');

      expect(result.data).toEqual([]);
      expect(result.hasMore).toBe(false);
    });
  });

  describe('searchNodes', () => {
    it('should search with text match', async () => {
      const mockResults = {
        results: [
          { node: { className: 'Button', text: 'Submit' } },
          { node: { className: 'TextView', text: 'Submit Form' } },
        ],
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResults),
      });

      const result = await treeService.searchNodes('device-123', 'Submit', 'text');

      expect(result.matches.length).toBe(2);
      expect(result.totalMatches).toBe(2);
    });

    it('should respect limit parameter', async () => {
      const mockResults = {
        results: Array.from({ length: 20 }, (_, i) => ({
          node: { className: 'View', text: `Item ${i}` },
        })),
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResults),
      });

      const result = await treeService.searchNodes('device-123', 'Item', 'text', 5);

      expect(result.matches.length).toBe(5);
      expect(result.totalMatches).toBe(20); // total matches found, before limiting
    });
  });

  describe('subscribeTree and notifyTreeChange', () => {
    it('should notify subscribers on tree change', () => {
      const events: any[] = [];
      const unsubscribe = treeService.subscribeTree('unique-device-456', event => {
        events.push(event);
      });

      treeService.notifyTreeChange('unique-device-456');

      expect(events.length).toBe(1);
      expect(events[0].type).toBe('tree_changed');
      expect(events[0].data.deviceId).toBe('unique-device-456');

      unsubscribe();
    });

    it('should remove subscriber on unsubscribe', () => {
      const callback = vi.fn();
      const unsubscribe = treeService.subscribeTree('unique-device-789', callback);

      unsubscribe();
      treeService.notifyTreeChange('unique-device-789');

      expect(callback).not.toHaveBeenCalled();
    });

    it('should track multiple subscribers', () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();

      treeService.subscribeTree('multi-sub-device', cb1);
      treeService.subscribeTree('multi-sub-device', cb2);

      treeService.notifyTreeChange('multi-sub-device');

      expect(cb1).toHaveBeenCalledTimes(1);
      expect(cb2).toHaveBeenCalledTimes(1);
    });
  });

  describe('getHierarchy error handling', () => {
    it('should throw error when FastAPI returns non-ok status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: () => Promise.resolve('Service unavailable'),
      });

      treeCache.get.mockReturnValueOnce(null);
      await expect(treeService.getHierarchy('device-offline')).rejects.toThrow('FastAPI 503: Service unavailable');
    });

    it('should throw DeviceNotConnectedError when raw response has error field', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ error: 'Device not connected' }),
      });

      treeCache.get.mockReturnValueOnce(null);
      await expect(treeService.getHierarchy('device-offline')).rejects.toThrow('Device not connected: device-offline');
    });

    it('should handle timeout errors', async () => {
      mockFetch.mockRejectedValueOnce(new DOMException('Aborted', 'AbortError'));

      treeCache.get.mockReturnValueOnce(null);
      await expect(treeService.getHierarchy('device-timeout')).rejects.toThrow();
    });
  });

  describe('getChildren edge cases', () => {
    it('should handle cursor with index beyond data length', async () => {
      const parentNode = {
        id: 'parent_1',
        className: 'ParentView',
        children: Array.from({ length: 5 }, (_, i) => ({
          id: `child_${i}`,
          className: 'ChildView',
          children: [],
        })),
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(parentNode),
      });

      treeCache.get.mockReturnValueOnce(null);
      const result = await treeService.getChildren('parent_1', 'device-123', undefined, 10);

      expect(result.data.length).toBe(5);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });

    it('should use default pageSize when not specified', async () => {
      const parentNode = {
        id: 'parent_1',
        className: 'ParentView',
        children: Array.from({ length: 100 }, (_, i) => ({
          id: `child_${i}`,
          className: 'ChildView',
          children: [],
        })),
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(parentNode),
      });

      treeCache.get.mockReturnValueOnce(null);
      const result = await treeService.getChildren('parent_1', 'device-123');

      expect(result.data.length).toBe(50); // DEFAULT_PAGE_SIZE = 50
      expect(result.hasMore).toBe(true);
    });
  });

  describe('getAncestors', () => {
    it('should return ancestors of a node', async () => {
      const mockHierarchy = {
        id: 'root',
        className: 'RootLayout',
        children: [
          {
            id: 'level1_a',
            className: 'Level1',
            children: [
              {
                id: 'level2_a',
                className: 'Level2',
                children: [
                  {
                    id: 'target_node',
                    className: 'Target',
                    children: [],
                  },
                ],
              },
            ],
          },
        ],
      };
      // getAncestors calls getHierarchy twice - once via getNode, once directly
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockHierarchy),
      }).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockHierarchy),
      });

      treeCache.get.mockReturnValue(null);
      const result = await treeService.getAncestors('target_node', 'device-123');

      expect(result.ancestors.length).toBe(3); // root, level1_a, level2_a
      expect(result.ancestors[0].id).toBe('root');
      expect(result.ancestors[1].id).toBe('level1_a');
      expect(result.ancestors[2].id).toBe('level2_a');
      expect(result.node.id).toBe('target_node');
    });

    it('should return empty ancestors for root node', async () => {
      const mockHierarchy = {
        id: 'root',
        className: 'RootLayout',
        children: [],
      };
      // getAncestors calls getHierarchy twice
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockHierarchy),
      }).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockHierarchy),
      });

      treeCache.get.mockReturnValue(null);
      const result = await treeService.getAncestors('root', 'device-123');

      expect(result.ancestors).toEqual([]);
      expect(result.node.id).toBe('root');
    });
  });

  describe('getPath', () => {
    it('should return path labels to node', async () => {
      const mockHierarchy = {
        id: 'root',
        className: 'RootLayout',
        children: [
          {
            id: 'child1',
            className: 'ChildLayout',
            children: [
              {
                id: 'target',
                className: 'TargetView',
                children: [],
              },
            ],
          },
        ],
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockHierarchy),
      });

      const result = await treeService.getPath('target', 'device-123');

      expect(result.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('searchNodes match types', () => {

    it('should search with xpath match', async () => {
      const mockResults = {
        results: [
          { node: { className: 'Button', text: 'Submit' } },
        ],
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResults),
      });

      const result = await treeService.searchNodes('device-123', '//Button', 'xpath');

      expect(result.matches.length).toBe(1);
    });

    it('should search with regex match', async () => {
      const mockResults = {
        results: [
          { node: { className: 'Button', text: 'Submit123' } },
        ],
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResults),
      });

      const result = await treeService.searchNodes('device-123', 'Submit.*', 'regex');

      expect(result.matches.length).toBe(1);
    });

    it('should handle search with no results', async () => {
      const mockResults = {
        results: [],
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResults),
      });

      const result = await treeService.searchNodes('device-123', 'NotFound', 'text');

      expect(result.matches).toEqual([]);
      expect(result.totalMatches).toBe(0);
    });

    it('should handle results with nodes directly (not wrapped in node property)', async () => {
      const mockResults = {
        nodes: [
          { className: 'View', text: 'DirectNode' },
        ],
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResults),
      });

      const result = await treeService.searchNodes('device-123', 'Direct', 'text');

      expect(result.matches.length).toBe(1);
    });
  });

  describe('SSE subscription with multiple devices', () => {
    it('should notify only subscribers of specific device', () => {
      const deviceAEvents: any[] = [];
      const deviceBEvents: any[] = [];

      const unsubA = treeService.subscribeTree('device-A', event => deviceAEvents.push(event));
      const unsubB = treeService.subscribeTree('device-B', event => deviceBEvents.push(event));

      treeService.notifyTreeChange('device-A');

      expect(deviceAEvents.length).toBe(1);
      expect(deviceBEvents.length).toBe(0);

      unsubA();
      unsubB();
    });

    it('should handle all subscribers removed', () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();

      const unsub1 = treeService.subscribeTree('shared-device', cb1);
      const unsub2 = treeService.subscribeTree('shared-device', cb2);

      expect(treeService.getSubscriberCount('shared-device')).toBe(2);

      unsub1();
      expect(treeService.getSubscriberCount('shared-device')).toBe(1);

      unsub2();
      expect(treeService.getSubscriberCount('shared-device')).toBe(0);
    });
  });

  describe('isAndroidSource', () => {
    it('should return true for android source', () => {
      expect(treeService.isAndroidSource('android')).toBe(true);
    });

    it('should return true for undefined/falsy source', () => {
      expect(treeService.isAndroidSource('')).toBe(true);
      expect(treeService.isAndroidSource(undefined as any)).toBe(true);
    });

    it('should return false for ios source', () => {
      expect(treeService.isAndroidSource('ios')).toBe(false);
    });

    it('should return false for other sources', () => {
      expect(treeService.isAndroidSource('web')).toBe(false);
    });
  });

  describe('countNodes', () => {
    it('should count 1 for single node with no children', () => {
      const node = { id: 'root', label: 'Root', nodeType: 'View', attributes: {}, actions: [], childCount: 0 };
      expect(treeService.countNodes(node as any)).toBe(1);
    });

    it('should count all nodes recursively', () => {
      const node = {
        id: 'root',
        label: 'Root',
        nodeType: 'Layout',
        attributes: {},
        actions: [],
        childCount: 2,
        children: [
          { id: 'child1', label: 'Child1', nodeType: 'View', attributes: {}, actions: [], childCount: 0 },
          { id: 'child2', label: 'Child2', nodeType: 'View', attributes: {}, actions: [], childCount: 1,
            children: [
              { id: 'grandchild', label: 'GC', nodeType: 'View', attributes: {}, actions: [], childCount: 0 }
            ]
          },
        ],
      };
      expect(treeService.countNodes(node as any)).toBe(4);
    });

    it('should handle deeply nested structure', () => {
      let node = { id: 'level0', label: 'L0', nodeType: 'View', attributes: {}, actions: [], childCount: 1 };
      for (let i = 1; i <= 5; i++) {
        node = { id: `level${i}`, label: `L${i}`, nodeType: 'View', attributes: {}, actions: [], childCount: 1, children: [node] };
      }
      // level0 + level1 + level2 + level3 + level4 + level5 = 6 nodes
      expect(treeService.countNodes(node as any)).toBe(6);
    });
  });

  describe('getDepth', () => {
    it('should return 0 for single node with no children', () => {
      const node = { id: 'root', label: 'Root', nodeType: 'View', attributes: {}, actions: [], childCount: 0 };
      expect(treeService.getDepth(node as any)).toBe(0);
    });

    it('should return max depth for nested structure', () => {
      const node = {
        id: 'root',
        label: 'Root',
        nodeType: 'Layout',
        attributes: {},
        actions: [],
        childCount: 1,
        children: [
          { id: 'child1', label: 'Child1', nodeType: 'View', attributes: {}, actions: [], childCount: 1,
            children: [
              { id: 'grandchild', label: 'GC', nodeType: 'View', attributes: {}, actions: [], childCount: 0 }
            ]
          },
        ],
      };
      expect(treeService.getDepth(node as any)).toBe(2);
    });
  });

  describe('transformNode', () => {
    it('should generate id from className and depth when id is missing', () => {
      const raw = { className: 'Button', children: [] };
      const result = treeService.transformNode(raw, 5);

      expect(result.id).toBe('Button_5');
    });

    it('should prefer raw.id over raw.nodeId', () => {
      const raw = { id: 'explicit-id', nodeId: 'node-id', className: 'View', children: [] };
      const result = treeService.transformNode(raw);

      expect(result.id).toBe('explicit-id');
    });

    it('should use raw.nodeId when id is missing', () => {
      const raw = { nodeId: 'node-id', className: 'View', children: [] };
      const result = treeService.transformNode(raw);

      expect(result.id).toBe('node-id');
    });

    it('should set label priority: text > contentDesc > label > name > resourceId > "[no label]"', () => {
      const raw = { className: 'View', text: 'PrimaryText', children: [] };
      expect(treeService.transformNode(raw).label).toBe('PrimaryText');

      const raw2 = { className: 'View', contentDesc: 'DescText', children: [] };
      expect(treeService.transformNode(raw2).label).toBe('DescText');

      const raw3 = { className: 'View', label: 'LabelText', children: [] };
      expect(treeService.transformNode(raw3).label).toBe('LabelText');

      const raw4 = { className: 'View', name: 'NameText', children: [] };
      expect(treeService.transformNode(raw4).label).toBe('NameText');

      const raw5 = { className: 'View', resourceId: 'com.app:id/fab', children: [] };
      expect(treeService.transformNode(raw5).label).toBe('com.app:id/fab');

      const raw6 = { className: 'View', children: [] };
      expect(treeService.transformNode(raw6).label).toBe('[no label]');
    });

    it('should use raw.role for nodeType when className is missing (iOS)', () => {
      const raw = { role: 'button', children: [] };
      const result = treeService.transformNode(raw);

      expect(result.nodeType).toBe('button');
    });

    it('should add tap action when clickable or tap is true', () => {
      const raw1 = { className: 'View', clickable: true, children: [] };
      expect(treeService.transformNode(raw1).actions).toContain('tap');

      const raw2 = { className: 'View', tap: true, children: [] };
      expect(treeService.transformNode(raw2).actions).toContain('tap');
    });

    it('should add scroll action when scrollable is true', () => {
      const raw = { className: 'View', scrollable: true, children: [] };
      expect(treeService.transformNode(raw).actions).toContain('scroll');
    });

    it('should add long_press action when longClickable or long_press is true', () => {
      const raw1 = { className: 'View', longClickable: true, children: [] };
      expect(treeService.transformNode(raw1).actions).toContain('long_press');

      const raw2 = { className: 'View', long_press: true, children: [] };
      expect(treeService.transformNode(raw2).actions).toContain('long_press');
    });

    it('should add focus action when focusable is true', () => {
      const raw = { className: 'View', focusable: true, children: [] };
      expect(treeService.transformNode(raw).actions).toContain('focus');
    });

    it('should add check action when checkable is true', () => {
      const raw = { className: 'View', checkable: true, children: [] };
      expect(treeService.transformNode(raw).actions).toContain('check');
    });

    it('should not add actions when disabled (enabled: false)', () => {
      const raw = { className: 'View', enabled: false, clickable: true, scrollable: true, children: [] };
      const result = treeService.transformNode(raw);

      expect(result.actions).toEqual([]);
    });

    it('should build attributes from known list', () => {
      const raw = {
        className: 'Button',
        text: 'Click Me',
        resourceId: 'com.app:id/btn',
        contentDesc: 'Tap button',
        clickable: true,
        enabled: true,
        children: [],
      };
      const result = treeService.transformNode(raw);

      expect(result.attributes.text).toBe('Click Me');
      expect(result.attributes.resourceId).toBe('com.app:id/btn');
      expect(result.attributes.contentDesc).toBe('Tap button');
      expect(result.attributes.clickable).toBe(true);
      expect(result.attributes.enabled).toBe(true);
    });

    it('should exclude undefined/null attributes', () => {
      const raw = { className: 'View', text: 'Hello', missing: undefined, nullable: null, children: [] };
      const result = treeService.transformNode(raw);

      expect(result.attributes.text).toBe('Hello');
      expect(result.attributes.missing).toBeUndefined();
      expect(result.attributes.nullable).toBeUndefined();
    });

    it('should set childCount from children length', () => {
      const raw = { className: 'View', children: [{}, {}, {}] };
      const result = treeService.transformNode(raw);

      expect(result.childCount).toBe(3);
    });

    it('should recursively transform children', () => {
      const raw = {
        className: 'Layout',
        children: [
          { className: 'Child1', text: 'First', children: [] },
          { className: 'Child2', text: 'Second', children: [] },
        ],
      };
      const result = treeService.transformNode(raw);

      expect(result.children).toHaveLength(2);
      expect(result.children![0].label).toBe('First');
      expect(result.children![1].label).toBe('Second');
    });

    it('should build _meta with rawId, package, and path', () => {
      const raw = {
        className: 'View',
        resourceId: 'com.app:id/main',
        package: 'com.example.app',
        children: [],
      };
      const result = treeService.transformNode(raw);

      expect(result._meta.rawId).toBe('com.app:id/main');
      expect(result._meta.package).toBe('com.example.app');
      expect(result._meta.path).toBe('View');
    });

    it('should track depth in path for nested nodes', () => {
      const raw = {
        className: 'Root',
        children: [
          {
            className: 'Child',
            children: [],
          },
        ],
      };
      const result = treeService.transformNode(raw);

      expect(result.children![0]._meta.path).toBe('Root/Child');
    });

    it('should handle iOS fields in attributes', () => {
      const raw = {
        className: 'View',
        label: 'Label',
        value: 'Value',
        name: 'Name',
        elementId: 'elem-1',
        role: 'button',
        subrole: 'submit',
        title: 'Title',
        help: 'Help text',
        children: [],
      };
      const result = treeService.transformNode(raw);

      expect(result.attributes.label).toBe('Label');
      expect(result.attributes.value).toBe('Value');
      expect(result.attributes.name).toBe('Name');
      expect(result.attributes.elementId).toBe('elem-1');
      expect(result.attributes.role).toBe('button');
      expect(result.attributes.subrole).toBe('submit');
      expect(result.attributes.title).toBe('Title');
      expect(result.attributes.help).toBe('Help text');
    });

    it('should preserve bounds in output', () => {
      const raw = {
        className: 'View',
        bounds: { x: 0, y: 100, width: 200, height: 50 },
        children: [],
      };
      const result = treeService.transformNode(raw);

      expect(result.bounds).toEqual({ x: 0, y: 100, width: 200, height: 50 });
    });
  });
});
