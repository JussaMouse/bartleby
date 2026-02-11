// src/services/facts.ts
import Database from 'better-sqlite3';
import { debug, warn } from '../utils/logger.js';

/**
 * Facts Service (aka Context/Facts)
 *
 * Tracks evolving metadata about garden records without writing to markdown files.
 * Use cases:
 * - Usage statistics (view counts, last accessed)
 * - Behavioral patterns (edit frequency, session times)
 * - AI-generated insights (momentum, risk scores)
 * - Temporary state (snooze history, queue status)
 *
 * Design principles:
 * - Facts are NOT essential data (can be lost/regenerated)
 * - Frontmatter stores static metadata, facts store dynamic metadata
 * - High-frequency updates without file I/O
 */

export interface Facts {
  [key: string]: any;
}

export interface FactEntry {
  recordId: string;
  key: string;
  value: any;
  updatedAt: string;
  expiresAt?: string;
}

export class FactsService {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Get all facts for a record
   * @param recordId - The garden record ID
   * @returns Object with all facts, or null if no facts exist
   */
  getFacts(recordId: string): Facts | null {
    const stmt = this.db.prepare(`
      SELECT key, value, updated_at, expires_at
      FROM context_facts
      WHERE record_id = ?
        AND (expires_at IS NULL OR expires_at > datetime('now'))
    `);

    const rows = stmt.all(recordId) as Array<{
      key: string;
      value: string;
      updated_at: string;
      expires_at: string | null;
    }>;

    if (rows.length === 0) return null;

    const facts: Facts = {};
    for (const row of rows) {
      try {
        facts[row.key] = JSON.parse(row.value);
      } catch (err) {
        warn('Failed to parse fact value', {
          recordId,
          key: row.key,
          error: String(err)
        });
        facts[row.key] = row.value; // Store as-is if parse fails
      }
    }

    return facts;
  }

  /**
   * Get a single fact for a record
   * @param recordId - The garden record ID
   * @param key - The fact key
   * @returns The fact value, or null if not found/expired
   */
  getFact(recordId: string, key: string): any | null {
    const stmt = this.db.prepare(`
      SELECT value
      FROM context_facts
      WHERE record_id = ?
        AND key = ?
        AND (expires_at IS NULL OR expires_at > datetime('now'))
    `);

    const row = stmt.get(recordId, key) as { value: string } | undefined;
    if (!row) return null;

    try {
      return JSON.parse(row.value);
    } catch (err) {
      warn('Failed to parse fact value', {
        recordId,
        key,
        error: String(err)
      });
      return row.value;
    }
  }

  /**
   * Set a fact for a record (upsert)
   * @param recordId - The garden record ID
   * @param key - The fact key
   * @param value - The fact value (will be JSON serialized)
   * @param ttlSeconds - Optional time-to-live in seconds
   */
  setFact(
    recordId: string,
    key: string,
    value: any,
    ttlSeconds?: number
  ): void {
    const valueStr = JSON.stringify(value);
    const expiresAt = ttlSeconds
      ? new Date(Date.now() + ttlSeconds * 1000).toISOString()
      : null;

    const stmt = this.db.prepare(`
      INSERT INTO context_facts (record_id, key, value, updated_at, expires_at)
      VALUES (?, ?, ?, datetime('now'), ?)
      ON CONFLICT(record_id, key)
      DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at,
        expires_at = excluded.expires_at
    `);

    stmt.run(recordId, key, valueStr, expiresAt);
    debug('Fact set', { recordId, key, hasExpiry: !!ttlSeconds });
  }

  /**
   * Increment a numeric fact (creates if doesn't exist)
   * @param recordId - The garden record ID
   * @param key - The fact key
   * @param amount - Amount to increment (default: 1)
   */
  increment(recordId: string, key: string, amount: number = 1): void {
    const current = this.getFact(recordId, key);
    const currentNum = typeof current === 'number' ? current : 0;
    this.setFact(recordId, key, currentNum + amount);
    debug('Fact incremented', { recordId, key, from: currentNum, to: currentNum + amount });
  }

  /**
   * Track an event (append to time-series array)
   * Useful for tracking history like: view times, edit times, etc.
   * @param recordId - The garden record ID
   * @param key - The fact key (e.g., 'viewHistory')
   * @param event - Event data (will include timestamp)
   * @param maxEvents - Max events to keep (default: 100)
   */
  trackEvent(
    recordId: string,
    key: string,
    event: any,
    maxEvents: number = 100
  ): void {
    const current = this.getFact(recordId, key);
    const events = Array.isArray(current) ? current : [];

    // Add new event with timestamp
    events.push({
      ...event,
      timestamp: new Date().toISOString()
    });

    // Keep only recent events
    const trimmed = events.slice(-maxEvents);
    this.setFact(recordId, key, trimmed);

    debug('Event tracked', { recordId, key, eventCount: trimmed.length });
  }

  /**
   * Query record IDs by fact value
   * @param key - The fact key to search
   * @param operator - Comparison operator
   * @param value - The value to compare
   * @returns Array of record IDs matching the query
   */
  query(
    key: string,
    operator: '=' | '!=' | '>' | '<' | '>=' | '<=',
    value: any
  ): string[] {
    const valueStr = JSON.stringify(value);

    // SQLite JSON comparison for simple cases
    const stmt = this.db.prepare(`
      SELECT DISTINCT record_id
      FROM context_facts
      WHERE key = ?
        AND (expires_at IS NULL OR expires_at > datetime('now'))
        AND json_extract(value, '$') ${operator} json_extract(?, '$')
    `);

    const rows = stmt.all(key, valueStr) as Array<{ record_id: string }>;
    return rows.map(r => r.record_id);
  }

  /**
   * Delete a specific fact
   * @param recordId - The garden record ID
   * @param key - The fact key to delete
   */
  deleteFact(recordId: string, key: string): void {
    const stmt = this.db.prepare(`
      DELETE FROM context_facts
      WHERE record_id = ? AND key = ?
    `);
    stmt.run(recordId, key);
    debug('Fact deleted', { recordId, key });
  }

  /**
   * Delete all facts for a record
   * @param recordId - The garden record ID
   */
  deleteAllFacts(recordId: string): void {
    const stmt = this.db.prepare(`
      DELETE FROM context_facts
      WHERE record_id = ?
    `);
    const result = stmt.run(recordId);
    debug('All facts deleted', { recordId, count: result.changes });
  }

  /**
   * Delete expired facts (cleanup)
   * @returns Number of facts deleted
   */
  deleteExpired(): number {
    const stmt = this.db.prepare(`
      DELETE FROM context_facts
      WHERE expires_at IS NOT NULL
        AND expires_at <= datetime('now')
    `);
    const result = stmt.run();
    if (result.changes > 0) {
      debug('Expired facts deleted', { count: result.changes });
    }
    return result.changes;
  }

  /**
   * Get all records with a specific fact key
   * @param key - The fact key
   * @returns Array of record IDs
   */
  getRecordsWith(key: string): string[] {
    const stmt = this.db.prepare(`
      SELECT DISTINCT record_id
      FROM context_facts
      WHERE key = ?
        AND (expires_at IS NULL OR expires_at > datetime('now'))
    `);
    const rows = stmt.all(key) as Array<{ record_id: string }>;
    return rows.map(r => r.record_id);
  }

  /**
   * Get statistics about context facts
   * @returns Stats object
   */
  getStats(): {
    totalRecords: number;
    totalFacts: number;
    expiredFacts: number;
  } {
    const total = this.db.prepare(`
      SELECT COUNT(*) as count FROM context_facts
    `).get() as { count: number };

    const uniqueRecords = this.db.prepare(`
      SELECT COUNT(DISTINCT record_id) as count FROM context_facts
    `).get() as { count: number };

    const expired = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM context_facts
      WHERE expires_at IS NOT NULL
        AND expires_at <= datetime('now')
    `).get() as { count: number };

    return {
      totalRecords: uniqueRecords.count,
      totalFacts: total.count,
      expiredFacts: expired.count
    };
  }
}
