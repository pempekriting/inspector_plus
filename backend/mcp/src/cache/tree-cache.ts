/**
 * TTL-based in-memory cache for tree hierarchy data.
 * Reduces load on device bridges by caching recent tree fetches.
 */

export interface CacheEntry<T> {
  data: T;
  expiry: number;
}

export class TreeCache<T> {
  private cache = new Map<string, CacheEntry<T>>();

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
   * Set cache with TTL (default 30 seconds).
   */
  set(key: string, data: T, ttlMs: number = 30000): void {
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

// Specialized cache instances
export const hierarchyCache = new TreeCache<object>();
export const nodeCache = new TreeCache<object>();