// src/services/facts.ts
import { debug, warn } from '../utils/logger.js';
import type { LearningService } from './learning.js';

/**
 * Facts Service (Record Metadata)
 *
 * Tracks evolving metadata about garden records without writing to markdown files.
 * Now backed by the unified LearningService for correlation with other learning data.
 *
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
 * - Stored as observations in unified learning system with 'fact.' prefix
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
  private learning: LearningService;

  constructor(learning: LearningService) {
    this.learning = learning;
  }

  /**
   * Get all facts for a record
   * @param recordId - The garden record ID
   * @returns Object with all facts, or null if no facts exist
   */
  getFacts(recordId: string): Facts | null {
    const observations = this.learning.getObservations(recordId, {
      keyPrefix: 'fact.',
      notExpired: true
    });

    if (observations.length === 0) return null;

    const facts: Facts = {};
    for (const obs of observations) {
      // Remove 'fact.' prefix from key
      const key = obs.key.substring(5);
      try {
        facts[key] = JSON.parse(obs.value);
      } catch (err) {
        warn('Failed to parse fact value', {
          recordId,
          key,
          error: String(err)
        });
        facts[key] = obs.value; // Store as-is if parse fails
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
    const obs = this.learning.getObservation(recordId, `fact.${key}`);
    if (!obs) return null;

    // Check if expired
    if (obs.expiresAt && new Date(obs.expiresAt) <= new Date()) {
      return null;
    }

    try {
      return JSON.parse(obs.value);
    } catch (err) {
      warn('Failed to parse fact value', {
        recordId,
        key,
        error: String(err)
      });
      return obs.value;
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
      : undefined;

    // Get existing observation to supersede it
    const existing = this.learning.getObservation(recordId, `fact.${key}`);

    this.learning.recordObservation({
      entityId: recordId,
      key: `fact.${key}`,
      value: valueStr,
      valueType: 'json',
      sourceType: 'computed',
      confidence: 1.0,
      expiresAt,
      supersedes: existing?.id
    });

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
    // Get all observations with this fact key across all entities
    const observations = this.learning.queryObservationsByKey(`fact.${key}`, {
      notExpired: true
    });

    // Filter by value comparison
    const results: string[] = [];
    for (const obs of observations) {
      try {
        const obsValue = JSON.parse(obs.value);
        let matches = false;

        switch (operator) {
          case '=':
            matches = obsValue === value;
            break;
          case '!=':
            matches = obsValue !== value;
            break;
          case '>':
            matches = obsValue > value;
            break;
          case '<':
            matches = obsValue < value;
            break;
          case '>=':
            matches = obsValue >= value;
            break;
          case '<=':
            matches = obsValue <= value;
            break;
        }

        if (matches && !results.includes(obs.entityId)) {
          results.push(obs.entityId);
        }
      } catch (err) {
        // Skip unparseable values
      }
    }

    return results;
  }

  /**
   * Delete a specific fact
   * @param recordId - The garden record ID
   * @param key - The fact key to delete
   */
  deleteFact(recordId: string, key: string): void {
    // Supersede with an immediately expired observation to "delete"
    const existing = this.learning.getObservation(recordId, `fact.${key}`);
    if (existing) {
      this.learning.recordObservation({
        entityId: recordId,
        key: `fact.${key}`,
        value: 'null',
        valueType: 'json',
        sourceType: 'computed',
        confidence: 1.0,
        expiresAt: new Date(0).toISOString(), // Expired immediately
        supersedes: existing.id
      });
      debug('Fact deleted', { recordId, key });
    }
  }

  /**
   * Delete all facts for a record
   * @param recordId - The garden record ID
   */
  deleteAllFacts(recordId: string): void {
    // Only get active (non-expired) facts to delete
    const facts = this.learning.getObservations(recordId, {
      keyPrefix: 'fact.',
      notExpired: true
    });

    for (const obs of facts) {
      this.learning.recordObservation({
        entityId: recordId,
        key: obs.key,
        value: 'null',
        valueType: 'json',
        sourceType: 'computed',
        confidence: 1.0,
        expiresAt: new Date(0).toISOString(), // Expired immediately
        supersedes: obs.id
      });
    }

    debug('All facts deleted', { recordId, count: facts.length });
  }

  /**
   * Delete expired facts (cleanup)
   * Note: In the new system, expired observations are filtered at query time.
   * This method is a no-op but kept for API compatibility.
   * @returns Number of facts deleted (always 0 in new system)
   */
  deleteExpired(): number {
    debug('Expired facts cleanup (no-op in unified system - handled by query filters)');
    return 0;
  }

  /**
   * Get all records with a specific fact key
   * @param key - The fact key
   * @returns Array of record IDs
   */
  getRecordsWith(key: string): string[] {
    const observations = this.learning.queryObservationsByKey(`fact.${key}`, {
      notExpired: true
    });

    // Get unique entity IDs
    const recordIds = new Set<string>();
    for (const obs of observations) {
      recordIds.add(obs.entityId);
    }

    return Array.from(recordIds);
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
    // Get all fact observations
    const allFacts = this.learning.queryObservationsByKey('fact.');

    const activeFacts = this.learning.queryObservationsByKey('fact.', {
      notExpired: true
    });

    // Count unique records
    const uniqueRecords = new Set<string>();
    for (const obs of activeFacts) {
      uniqueRecords.add(obs.entityId);
    }

    return {
      totalRecords: uniqueRecords.size,
      totalFacts: activeFacts.length,
      expiredFacts: allFacts.length - activeFacts.length
    };
  }
}
