/**
 * Memory Tools - Agent-controlled memory operations
 *
 * These tools allow the LLM to manage its own memory through the LearningService,
 * enabling it to:
 * - Store facts and observations about entities
 * - Retrieve relevant context from memory
 * - Update outdated information
 * - Forget irrelevant observations
 *
 * This creates a self-improving agent that learns from interactions.
 */

import { LearningService } from '../services/learning.js';
import { ObservationInput } from '../services/learning.js';
import { debug, info } from '../utils/logger.js';

export interface StoreObservationParams {
  entityId: string;
  key: string;
  value: string;
  confidence?: number;
  expiresIn?: string; // e.g., "7d", "30d", "1y"
  supersedes?: string; // ID of observation to replace
}

export interface RetrieveContextParams {
  entityId: string;
  keys?: string[]; // Filter by specific keys
  since?: string; // ISO date string
  limit?: number;
}

export interface UpdateObservationParams {
  observationId: string;
  newValue: string;
  reason?: string;
}

export interface ForgetObservationParams {
  observationId: string;
  reason?: string;
}

export class MemoryTools {
  constructor(private learning: LearningService) {}

  /**
   * Store an observation about an entity
   *
   * Examples:
   * - store_observation({ entityId: "user", key: "preferred_name", value: "Alex" })
   * - store_observation({ entityId: "project-123", key: "deadline", value: "2026-03-15", expiresIn: "30d" })
   */
  storeObservation(params: StoreObservationParams): { success: boolean; observationId: string } {
    const { entityId, key, value, confidence = 0.9, expiresIn, supersedes } = params;

    // Calculate expiration date if provided
    let expiresAt: string | undefined;
    if (expiresIn) {
      expiresAt = this.parseExpiresIn(expiresIn);
    }

    const input: ObservationInput = {
      entityId,
      key,
      value,
      valueType: 'string',
      sourceType: 'inferred', // Agent-inferred facts from conversation
      confidence,
      expiresAt,
      supersedes,
    };

    const observationId = this.learning.recordObservation(input);

    info('Agent stored observation', { entityId, key, value, observationId });

    return {
      success: true,
      observationId,
    };
  }

  /**
   * Retrieve context about an entity from memory
   *
   * Returns observations and relationships for the given entity.
   *
   * Examples:
   * - retrieve_context({ entityId: "user" })
   * - retrieve_context({ entityId: "project-123", keys: ["deadline", "status"] })
   */
  retrieveContext(params: RetrieveContextParams): {
    observations: Array<{ id: string; key: string; value: string; confidence: number; observedAt: string }>;
    relationships: Array<{ type: string; target: string; strength?: number }>;
  } {
    const { entityId, keys, since, limit = 100 } = params;

    // Build filters for observations
    const filters: any = {};
    if (keys && keys.length > 0) {
      filters.keys = keys;
    }
    if (since) {
      filters.since = since;
    }

    const observations = this.learning.getObservations(entityId, filters);
    const relationships = this.learning.getRelationships(entityId);

    debug('Agent retrieved context', { entityId, observationCount: observations.length });

    return {
      observations: observations.slice(0, limit).map(obs => ({
        id: obs.id,
        key: obs.key,
        value: obs.value,
        confidence: obs.confidence,
        observedAt: obs.observedAt,
      })),
      relationships: relationships.map(rel => ({
        type: rel.relationType,
        target: rel.toEntity,
        strength: rel.strength,
      })),
    };
  }

  /**
   * Update an existing observation with new information
   *
   * Creates a new observation that supersedes the old one.
   *
   * Example:
   * - update_observation({ observationId: "obs-123", newValue: "updated value", reason: "User corrected information" })
   */
  updateObservation(params: UpdateObservationParams): { success: boolean; newObservationId: string } {
    const { observationId, newValue, reason } = params;

    // Get the original observation
    const allObservations = this.learning.getObservations('user'); // This is a simplification
    const original = allObservations.find(obs => obs.id === observationId);

    if (!original) {
      return {
        success: false,
        newObservationId: '',
      };
    }

    // Create new observation that supersedes the old one
    const input: ObservationInput = {
      entityId: original.entityId,
      key: original.key,
      value: newValue,
      valueType: original.valueType,
      sourceType: 'inferred', // Agent-inferred update
      confidence: 0.9,
      supersedes: observationId,
    };

    const newObservationId = this.learning.recordObservation(input);

    info('Agent updated observation', {
      oldId: observationId,
      newId: newObservationId,
      reason,
    });

    return {
      success: true,
      newObservationId,
    };
  }

  /**
   * Mark an observation as no longer relevant
   *
   * Creates a superseding observation with confidence 0 to effectively "forget" it.
   *
   * Example:
   * - forget_observation({ observationId: "obs-123", reason: "Information is outdated" })
   */
  forgetObservation(params: ForgetObservationParams): { success: boolean } {
    const { observationId, reason } = params;

    // Get the original observation
    const allObservations = this.learning.getObservations('user');
    const original = allObservations.find(obs => obs.id === observationId);

    if (!original) {
      return { success: false };
    }

    // Create superseding observation with confidence 0 to mark as forgotten
    const input: ObservationInput = {
      entityId: original.entityId,
      key: original.key,
      value: '[FORGOTTEN]',
      valueType: original.valueType,
      sourceType: 'inferred', // Agent-inferred deletion
      confidence: 0,
      supersedes: observationId,
    };

    this.learning.recordObservation(input);

    info('Agent forgot observation', {
      observationId,
      key: original.key,
      reason,
    });

    return { success: true };
  }

  /**
   * Parse "expiresIn" duration string to ISO datetime
   * Format: "7d", "30d", "1y", etc.
   */
  private parseExpiresIn(expiresIn: string): string {
    const match = expiresIn.match(/^(\d+)([dhmy])$/);
    if (!match) {
      throw new Error(`Invalid expiresIn format: ${expiresIn}. Use format like "7d", "30d", "1y"`);
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    const now = new Date();
    switch (unit) {
      case 'd':
        now.setDate(now.getDate() + value);
        break;
      case 'h':
        now.setHours(now.getHours() + value);
        break;
      case 'm':
        now.setMonth(now.getMonth() + value);
        break;
      case 'y':
        now.setFullYear(now.getFullYear() + value);
        break;
    }

    return now.toISOString();
  }
}
