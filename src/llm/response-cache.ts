/**
 * Response caching for LLM requests
 *
 * Provides significant speedup for:
 * - Router classification (same queries classified identically)
 * - Repeated user questions
 * - Common tool-using patterns
 *
 * Cache Strategy:
 * - In-memory LRU cache with TTL
 * - Key: hash of (tier + messages + tools)
 * - Configurable max size and TTL
 */

import crypto from 'crypto';

interface CacheEntry {
  response: string;
  timestamp: number;
  tier: string;
  hits: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  hitRate: number;
}

export class ResponseCache {
  private cache: Map<string, CacheEntry>;
  private readonly maxSize: number;
  private readonly ttlMs: number;
  private hits: number = 0;
  private misses: number = 0;

  constructor(maxSize: number = 1000, ttlMs: number = 3600000) { // 1 hour default TTL
    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  /**
   * Generate cache key from request parameters
   */
  private generateKey(
    tier: string,
    messages: Array<any>, // Accept any message format for flexibility
    tools?: any[]
  ): string {
    const data = JSON.stringify({
      tier,
      messages,
      tools: tools?.map(t => t.function?.name) || [], // Only cache tool names, not full schemas
    });
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Get cached response if available and fresh
   */
  get(
    tier: string,
    messages: Array<any>, // Accept any message format for flexibility
    tools?: any[]
  ): string | null {
    const key = this.generateKey(tier, messages, tools);
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      return null;
    }

    // Check if entry is expired
    const age = Date.now() - entry.timestamp;
    if (age > this.ttlMs) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    // Cache hit
    entry.hits++;
    this.hits++;
    return entry.response;
  }

  /**
   * Store response in cache
   */
  set(
    tier: string,
    messages: Array<any>, // Accept any message format for flexibility
    tools: any[] | undefined,
    response: string
  ): void {
    const key = this.generateKey(tier, messages, tools);

    // Implement LRU: if cache is full, remove oldest entry
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      response,
      timestamp: Date.now(),
      tier,
      hits: 0,
    });
  }

  /**
   * Clear all cached entries
   */
  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Remove expired entries
   */
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttlMs) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      size: this.cache.size,
      hitRate: total > 0 ? this.hits / total : 0,
    };
  }

  /**
   * Get top cached entries by hit count
   */
  getTopEntries(limit: number = 10): Array<{ tier: string; hits: number; age: number }> {
    const entries = Array.from(this.cache.values())
      .sort((a, b) => b.hits - a.hits)
      .slice(0, limit)
      .map(entry => ({
        tier: entry.tier,
        hits: entry.hits,
        age: Date.now() - entry.timestamp,
      }));
    return entries;
  }
}
