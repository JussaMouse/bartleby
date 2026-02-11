// src/views/ViewCache.ts
import type { GardenGraph } from '../graph/GardenGraph.js';
import { debug } from '../utils/logger.js';

/**
 * View Cache - Performance optimization for view rendering
 *
 * Caches rendered views (markdown and JSON) to avoid regenerating them on every
 * request. Automatically invalidates when records or relationships change.
 *
 * Features:
 * - In-memory caching with stale flag
 * - Event-driven invalidation
 * - Cascade invalidation to related records
 * - Cache metrics (hit rate, size)
 * - Separate caches for markdown and JSON formats
 *
 * Example:
 * ```typescript
 * const cache = new ViewCache(graph);
 *
 * // Try to get cached view
 * const cached = cache.get(recordId, 'markdown');
 * if (cached) {
 *   return cached;
 * }
 *
 * // Generate and cache view
 * const view = generateView(record);
 * cache.set(recordId, 'markdown', view);
 * ```
 */

export type ViewFormat = 'markdown' | 'json';

interface CachedView {
  content: string;
  timestamp: number;
  stale: boolean;
}

interface CacheMetrics {
  hits: number;
  misses: number;
  hitRate: number;
  size: number;
  markdownCacheSize: number;
  jsonCacheSize: number;
}

export class ViewCache {
  private markdownCache = new Map<string, CachedView>();
  private jsonCache = new Map<string, CachedView>();
  private graph: GardenGraph;

  // Metrics
  private hits = 0;
  private misses = 0;

  constructor(graph: GardenGraph) {
    this.graph = graph;
  }

  /**
   * Get cached view for a record
   * @param recordId - The record ID
   * @param format - View format (markdown or json)
   * @returns Cached content or null if not cached/stale
   */
  get(recordId: string, format: ViewFormat = 'markdown'): string | null {
    const cache = format === 'markdown' ? this.markdownCache : this.jsonCache;
    const cached = cache.get(recordId);

    if (!cached) {
      this.misses++;
      debug('ViewCache miss', { recordId, format });
      return null;
    }

    if (cached.stale) {
      this.misses++;
      debug('ViewCache miss (stale)', { recordId, format });
      return null;
    }

    this.hits++;
    debug('ViewCache hit', { recordId, format, age: Date.now() - cached.timestamp });
    return cached.content;
  }

  /**
   * Cache a rendered view
   * @param recordId - The record ID
   * @param format - View format (markdown or json)
   * @param content - Rendered content
   */
  set(recordId: string, format: ViewFormat, content: string): void {
    const cache = format === 'markdown' ? this.markdownCache : this.jsonCache;

    cache.set(recordId, {
      content,
      timestamp: Date.now(),
      stale: false,
    });

    debug('ViewCache set', { recordId, format, size: content.length });
  }

  /**
   * Invalidate a cached view and cascade to related records
   * @param recordId - The record ID to invalidate
   * @param cascade - Whether to invalidate related records (default: true)
   */
  invalidate(recordId: string, cascade: boolean = true): void {
    // Invalidate this record in both caches
    const markdown = this.markdownCache.get(recordId);
    if (markdown) {
      markdown.stale = true;
    }

    const json = this.jsonCache.get(recordId);
    if (json) {
      json.stale = true;
    }

    debug('ViewCache invalidated', { recordId });

    // Cascade to related records
    if (cascade) {
      try {
        const related = this.graph.getRelated(recordId, {
          depth: 1,
          direction: 'both',
        });

        for (const r of related) {
          const relatedMarkdown = this.markdownCache.get(r.id);
          if (relatedMarkdown) {
            relatedMarkdown.stale = true;
          }

          const relatedJson = this.jsonCache.get(r.id);
          if (relatedJson) {
            relatedJson.stale = true;
          }
        }

        if (related.length > 0) {
          debug('ViewCache cascade invalidated', {
            recordId,
            relatedCount: related.length,
          });
        }
      } catch (err) {
        // Graph might not be available during initialization
        debug('ViewCache cascade failed', { recordId, error: String(err) });
      }
    }
  }

  /**
   * Clear all caches
   */
  clear(): void {
    const totalSize = this.markdownCache.size + this.jsonCache.size;
    this.markdownCache.clear();
    this.jsonCache.clear();
    debug('ViewCache cleared', { entriesRemoved: totalSize });
  }

  /**
   * Remove stale entries from cache
   */
  prune(): void {
    let pruned = 0;

    for (const [id, cached] of this.markdownCache.entries()) {
      if (cached.stale) {
        this.markdownCache.delete(id);
        pruned++;
      }
    }

    for (const [id, cached] of this.jsonCache.entries()) {
      if (cached.stale) {
        this.jsonCache.delete(id);
        pruned++;
      }
    }

    if (pruned > 0) {
      debug('ViewCache pruned', { entriesRemoved: pruned });
    }
  }

  /**
   * Get cache metrics
   */
  getMetrics(): CacheMetrics {
    const total = this.hits + this.misses;
    const hitRate = total > 0 ? this.hits / total : 0;

    return {
      hits: this.hits,
      misses: this.misses,
      hitRate: Math.round(hitRate * 100) / 100,
      size: this.markdownCache.size + this.jsonCache.size,
      markdownCacheSize: this.markdownCache.size,
      jsonCacheSize: this.jsonCache.size,
    };
  }

  /**
   * Reset metrics counters
   */
  resetMetrics(): void {
    this.hits = 0;
    this.misses = 0;
    debug('ViewCache metrics reset');
  }

  /**
   * Get cache entry count for a specific format
   */
  size(format?: ViewFormat): number {
    if (format === 'markdown') {
      return this.markdownCache.size;
    } else if (format === 'json') {
      return this.jsonCache.size;
    } else {
      return this.markdownCache.size + this.jsonCache.size;
    }
  }

  /**
   * Check if a view is cached (and not stale)
   */
  has(recordId: string, format: ViewFormat = 'markdown'): boolean {
    const cache = format === 'markdown' ? this.markdownCache : this.jsonCache;
    const cached = cache.get(recordId);
    return cached !== undefined && !cached.stale;
  }
}
