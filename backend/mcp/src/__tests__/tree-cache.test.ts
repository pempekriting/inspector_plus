/**
 * Unit tests for tree-cache.ts - TreeCache TTL cache
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TreeCache } from '../cache/tree-cache';

describe('TreeCache', () => {
  let cache: TreeCache<string>;

  beforeEach(() => {
    cache = new TreeCache<string>();
  });

  describe('get/set basic operations', () => {
    it('should store and retrieve value', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('should return null for non-existent key', () => {
      expect(cache.get('nonexistent')).toBeNull();
    });

    it('should return null after TTL expires', () => {
      cache.set('key1', 'value1', 50); // 50ms TTL
      expect(cache.get('key1')).toBe('value1');

      // Wait for expiry
      return new Promise(resolve => setTimeout(resolve, 60)).then(() => {
        expect(cache.get('key1')).toBeNull();
      });
    });

    it('should use default TTL of 30 seconds', () => {
      cache.set('key1', 'value1');
      const entry = (cache as any).cache.get('key1');
      const expectedExpiry = Date.now() + 30000;
      expect(entry.expiry).toBeGreaterThanOrEqual(expectedExpiry - 10);
      expect(entry.expiry).toBeLessThanOrEqual(expectedExpiry + 10);
    });
  });

  describe('invalidate', () => {
    it('should remove specific key', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.invalidate('key1');
      expect(cache.get('key1')).toBeNull();
      expect(cache.get('key2')).toBe('value2');
    });

    it('should handle invalidating non-existent key', () => {
      expect(() => cache.invalidate('nonexistent')).not.toThrow();
    });
  });

  describe('invalidatePrefix', () => {
    it('should invalidate all keys with matching prefix', () => {
      cache.set('hierarchy:device1', 'tree1');
      cache.set('hierarchy:device2', 'tree2');
      cache.set('search:device1', 'results');
      cache.set('other:key', 'data');

      cache.invalidatePrefix('hierarchy:');

      expect(cache.get('hierarchy:device1')).toBeNull();
      expect(cache.get('hierarchy:device2')).toBeNull();
      expect(cache.get('search:device1')).toBe('results');
      expect(cache.get('other:key')).toBe('data');
    });

    it('should handle prefix with no matches', () => {
      cache.set('key1', 'value1');
      expect(() => cache.invalidatePrefix('nonexistent:')).not.toThrow();
      expect(cache.get('key1')).toBe('value1');
    });
  });

  describe('clear', () => {
    it('should remove all entries', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      cache.clear();
      expect(cache.get('key1')).toBeNull();
      expect(cache.get('key2')).toBeNull();
      expect(cache.get('key3')).toBeNull();
    });
  });

  describe('stats', () => {
    it('should return correct size and keys', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      const stats = cache.stats();
      expect(stats.size).toBe(2);
      expect(stats.keys).toContain('key1');
      expect(stats.keys).toContain('key2');
    });

    it('should return empty for empty cache', () => {
      const stats = cache.stats();
      expect(stats.size).toBe(0);
      expect(stats.keys).toEqual([]);
    });

    it('should not include expired entries in stats', async () => {
      cache.set('key1', 'value1', 50);
      await new Promise(resolve => setTimeout(resolve, 60));
      // Access it to trigger cleanup
      cache.get('key1');
      const stats = cache.stats();
      expect(stats.size).toBe(0);
    });
  });

  describe('type safety', () => {
    it('should handle different types', () => {
      cache.set('string', 'text');
      cache.set('number', '123');
      cache.set('object', JSON.stringify({ foo: 'bar' }));
      cache.set('array', JSON.stringify([1, 2, 3]));

      expect(cache.get('string')).toBe('text');
      expect(cache.get('number')).toBe('123');
      expect(JSON.parse(cache.get('object')!)).toEqual({ foo: 'bar' });
      expect(JSON.parse(cache.get('array')!)).toEqual([1, 2, 3]);
    });
  });

  describe('multiple entries same key', () => {
    it('should overwrite existing value', () => {
      cache.set('key1', 'value1');
      cache.set('key1', 'value2');
      expect(cache.get('key1')).toBe('value2');
    });

    it('should reset TTL on set', async () => {
      cache.set('key1', 'value1', 50);
      await new Promise(resolve => setTimeout(resolve, 30));
      cache.set('key1', 'value2', 200); // Reset with longer TTL
      await new Promise(resolve => setTimeout(resolve, 100)); // Wait 100ms total from start
      // After 100ms from original set(50ms TTL), it would be expired BUT we just set with 200ms TTL
      // which expires ~130ms from "now" (30ms already passed)
      expect(cache.get('key1')).toBe('value2');
    });
  });
});
