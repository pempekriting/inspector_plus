/**
 * TTL-based in-memory cache for tree hierarchy data.
 * Reduces load on device bridges by caching recent tree fetches.
 */

export interface CacheEntry<T> {
  data: T;
  expiry: number;
}

// Cap the number of entries so a distinct search query per call (unbounded
// in practice — deviceId:matchType:query combinations) can't grow the cache
// forever; entries are cheap AI-friendly node lists, not raw device trees.
const DEFAULT_MAX_ENTRIES = 200;

export class TreeCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private readonly maxEntries: number;

  constructor(maxEntries: number = DEFAULT_MAX_ENTRIES) {
    this.maxEntries = maxEntries;
  }

  /**
   * Get cached value if exists and not expired.
   */
  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  /**
   * Set cache with TTL (default 30 seconds). Evicts the oldest entry (FIFO,
   * relying on Map's insertion-order iteration) once at capacity.
   */
  set(key: string, data: T, ttlMs: number = 30000): void {
    this.cache.delete(key); // re-insert at the end so updates count as "freshest"
    if (this.cache.size >= this.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) this.cache.delete(oldestKey);
    }
    this.cache.set(key, {
      data,
      expiry: Date.now() + ttlMs,
    });
  }

  /**
   * Invalidate specific cache entry.
   */
  invalidate(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Invalidate all entries matching prefix.
   */
  invalidatePrefix(prefix: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear all cache entries.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache stats for monitoring.
   */
  stats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }
}

// Global cache instance for tree data
export const treeCache = new TreeCache<object>();