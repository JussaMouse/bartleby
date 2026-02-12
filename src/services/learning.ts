// src/services/learning.ts
// Unified Entity-Observation-Relationship (EOR) learning system
// Tracks observations and relationships across all entities: users, sessions, records, commands

import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { debug, info, warn } from '../utils/logger.js';

// ============================================================================
// Types
// ============================================================================

export type EntityType = 'user' | 'session' | 'record' | 'command' | 'topic' | 'project';

export type SourceType = 'stated' | 'inferred' | 'computed' | 'extracted';

export type ValueType = 'string' | 'number' | 'boolean' | 'json' | 'embedding';

export interface Entity {
  id: string;
  type: EntityType;
  createdAt: string;
  data?: any;  // JSON data specific to entity type
}

export interface Observation {
  id: string;
  entityId: string;
  key: string;
  value: string;
  valueType: ValueType;
  sourceType: SourceType;
  sourceId?: string;
  confidence: number;  // 0.0 to 1.0
  observedAt: string;
  expiresAt?: string;
  supersedes?: string;  // Previous observation ID if this updates it
  searchText?: string;  // Denormalized for FTS
}

export interface Relationship {
  id: string;
  fromEntity: string;
  toEntity: string;
  relationType: string;
  strength?: number;  // 0.0 to 1.0 for similarity relationships
  context?: any;      // JSON metadata about the relationship
  observedAt: string;
  sourceId?: string;
}

// Input types for creating observations and relationships
export interface ObservationInput {
  entityId: string;
  key: string;
  value: string;
  valueType?: ValueType;
  sourceType: SourceType;
  sourceId?: string;
  confidence: number;
  expiresAt?: string;
  supersedes?: string;
}

export interface RelationshipInput {
  fromEntity: string;
  toEntity: string;
  relationType: string;
  strength?: number;
  context?: any;
  sourceId?: string;
}

// Query filters
export interface ObservationFilters {
  keyPrefix?: string;      // Filter by key prefix (e.g., 'preference.')
  minConfidence?: number;  // Only return high-confidence observations
  notExpired?: boolean;    // Exclude expired observations
  sourceType?: SourceType; // Filter by how it was learned
}

export interface RelationshipFilters {
  direction?: 'from' | 'to' | 'both';
  relationType?: string;
  minStrength?: number;
}

// High-level result types
export interface UserProfile {
  preferences: Record<string, any>;
  patterns: Record<string, any>;
  context: Record<string, any>;
  goals: string[];
}

export interface WorkContext {
  records: Array<{ id: string; title: string; importance: string }>;
  topics: string[];
  projects: string[];
}

export interface SessionSummary {
  summary: string;
  topics: string[];
  decisions: string[];
  unresolved: string[];
  artifacts: string[];
}

// ============================================================================
// Schema
// ============================================================================

const SCHEMA = `
-- Core entities
CREATE TABLE IF NOT EXISTS entities (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  data TEXT  -- JSON for entity-specific data
);

-- Observations about entities (the learning layer)
CREATE TABLE IF NOT EXISTS observations (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  value_type TEXT NOT NULL DEFAULT 'string',
  source_type TEXT NOT NULL,
  source_id TEXT,
  confidence REAL NOT NULL,
  observed_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT,
  supersedes TEXT,
  search_text TEXT  -- Denormalized for FTS

  -- Note: Foreign keys omitted to allow observations about garden records
  -- which exist outside the entities table
);

-- Relationships between entities
CREATE TABLE IF NOT EXISTS relationships (
  id TEXT PRIMARY KEY,
  from_entity TEXT NOT NULL,
  to_entity TEXT NOT NULL,
  relation_type TEXT NOT NULL,
  strength REAL,
  context TEXT,  -- JSON
  observed_at TEXT NOT NULL DEFAULT (datetime('now')),
  source_id TEXT

  -- Note: Foreign keys omitted to allow relationships with garden records
  -- which exist outside the entities table
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_observations_entity ON observations(entity_id, key);
CREATE INDEX IF NOT EXISTS idx_observations_source ON observations(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_observations_expires ON observations(expires_at);
CREATE INDEX IF NOT EXISTS idx_relationships_from ON relationships(from_entity, relation_type);
CREATE INDEX IF NOT EXISTS idx_relationships_to ON relationships(to_entity, relation_type);
CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type);

-- Full-text search across observations
CREATE VIRTUAL TABLE IF NOT EXISTS observations_fts USING fts5(
  key,
  value,
  search_text,
  content='observations',
  content_rowid='rowid'
);

-- Triggers to keep FTS in sync
CREATE TRIGGER IF NOT EXISTS observations_ai AFTER INSERT ON observations BEGIN
  INSERT INTO observations_fts(rowid, key, value, search_text)
  VALUES (new.rowid, new.key, new.value, new.search_text);
END;

CREATE TRIGGER IF NOT EXISTS observations_ad AFTER DELETE ON observations BEGIN
  DELETE FROM observations_fts WHERE rowid = old.rowid;
END;

CREATE TRIGGER IF NOT EXISTS observations_au AFTER UPDATE ON observations BEGIN
  DELETE FROM observations_fts WHERE rowid = old.rowid;
  INSERT INTO observations_fts(rowid, key, value, search_text)
  VALUES (new.rowid, new.key, new.value, new.search_text);
END;
`;

// ============================================================================
// Service
// ============================================================================

export class LearningService {
  private db: Database.Database;
  private userId: string = 'user';  // Singleton user entity

  constructor(db: Database.Database) {
    this.db = db;
    this.initSchema();
    this.ensureUserEntity();
  }

  private initSchema(): void {
    this.db.exec(SCHEMA);
    info('LearningService schema initialized');
  }

  private ensureUserEntity(): void {
    const exists = this.db.prepare('SELECT id FROM entities WHERE id = ?').get(this.userId);
    if (!exists) {
      this.db.prepare(`
        INSERT INTO entities (id, type, created_at, data)
        VALUES (?, 'user', datetime('now'), '{}')
      `).run(this.userId);
      debug('Created singleton user entity');
    }
  }

  // ==========================================================================
  // Entity Management
  // ==========================================================================

  createEntity(type: EntityType, data?: any): string {
    const id = uuidv4();
    const dataJson = data ? JSON.stringify(data) : null;

    this.db.prepare(`
      INSERT INTO entities (id, type, created_at, data)
      VALUES (?, ?, datetime('now'), ?)
    `).run(id, type, dataJson);

    debug('Entity created', { id, type });
    return id;
  }

  getEntity(id: string): Entity | null {
    const row = this.db.prepare(`
      SELECT id, type, created_at, data
      FROM entities
      WHERE id = ?
    `).get(id) as any;

    if (!row) return null;

    return {
      id: row.id,
      type: row.type,
      createdAt: row.created_at,
      data: row.data ? JSON.parse(row.data) : undefined
    };
  }

  entityExists(id: string): boolean {
    const result = this.db.prepare('SELECT id FROM entities WHERE id = ?').get(id);
    return !!result;
  }

  // ==========================================================================
  // Observation Management
  // ==========================================================================

  recordObservation(input: ObservationInput): string {
    const id = uuidv4();
    const valueType = input.valueType || 'string';
    const searchText = `${input.key} ${input.value}`;

    // Handle superseding previous observations
    if (input.supersedes) {
      const exists = this.db.prepare('SELECT id FROM observations WHERE id = ?').get(input.supersedes);
      if (!exists) {
        warn('Superseded observation not found', { supersedes: input.supersedes });
      }
    }

    this.db.prepare(`
      INSERT INTO observations (
        id, entity_id, key, value, value_type,
        source_type, source_id, confidence,
        observed_at, expires_at, supersedes, search_text
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, ?)
    `).run(
      id,
      input.entityId,
      input.key,
      input.value,
      valueType,
      input.sourceType,
      input.sourceId || null,
      input.confidence,
      input.expiresAt || null,
      input.supersedes || null,
      searchText
    );

    debug('Observation recorded', {
      id,
      entityId: input.entityId,
      key: input.key,
      confidence: input.confidence
    });

    return id;
  }

  getObservations(entityId: string, filters?: ObservationFilters): Observation[] {
    let query = `
      SELECT id, entity_id, key, value, value_type,
             source_type, source_id, confidence,
             observed_at, expires_at, supersedes, search_text
      FROM observations
      WHERE entity_id = ?
    `;

    const params: any[] = [entityId];

    if (filters?.keyPrefix) {
      query += ` AND key LIKE ?`;
      params.push(`${filters.keyPrefix}%`);
    }

    if (filters?.minConfidence !== undefined) {
      query += ` AND confidence >= ?`;
      params.push(filters.minConfidence);
    }

    if (filters?.notExpired) {
      query += ` AND (expires_at IS NULL OR expires_at > datetime('now'))`;
    }

    if (filters?.sourceType) {
      query += ` AND source_type = ?`;
      params.push(filters.sourceType);
    }

    query += ` ORDER BY observed_at DESC`;

    const rows = this.db.prepare(query).all(...params) as any[];

    return rows.map(row => ({
      id: row.id,
      entityId: row.entity_id,
      key: row.key,
      value: row.value,
      valueType: row.value_type,
      sourceType: row.source_type,
      sourceId: row.source_id,
      confidence: row.confidence,
      observedAt: row.observed_at,
      expiresAt: row.expires_at,
      supersedes: row.supersedes,
      searchText: row.search_text
    }));
  }

  getObservation(entityId: string, key: string): Observation | null {
    // Get the latest observation that is NOT superseded by another
    const row = this.db.prepare(`
      SELECT o.id, o.entity_id, o.key, o.value, o.value_type,
             o.source_type, o.source_id, o.confidence,
             o.observed_at, o.expires_at, o.supersedes, o.search_text
      FROM observations o
      WHERE o.entity_id = ? AND o.key = ?
      AND (o.expires_at IS NULL OR o.expires_at > datetime('now'))
      AND NOT EXISTS (
        SELECT 1 FROM observations newer
        WHERE newer.supersedes = o.id
      )
      ORDER BY o.observed_at DESC
      LIMIT 1
    `).get(entityId, key) as any;

    if (!row) return null;

    return {
      id: row.id,
      entityId: row.entity_id,
      key: row.key,
      value: row.value,
      valueType: row.value_type,
      sourceType: row.source_type,
      sourceId: row.source_id,
      confidence: row.confidence,
      observedAt: row.observed_at,
      expiresAt: row.expires_at,
      supersedes: row.supersedes,
      searchText: row.search_text
    };
  }

  searchObservations(query: string, limit: number = 10): Observation[] {
    const rows = this.db.prepare(`
      SELECT o.id, o.entity_id, o.key, o.value, o.value_type,
             o.source_type, o.source_id, o.confidence,
             o.observed_at, o.expires_at, o.supersedes, o.search_text
      FROM observations_fts fts
      JOIN observations o ON fts.rowid = o.rowid
      WHERE observations_fts MATCH ?
      AND (o.expires_at IS NULL OR o.expires_at > datetime('now'))
      ORDER BY rank
      LIMIT ?
    `).all(query, limit) as any[];

    return rows.map(row => ({
      id: row.id,
      entityId: row.entity_id,
      key: row.key,
      value: row.value,
      valueType: row.value_type,
      sourceType: row.source_type,
      sourceId: row.source_id,
      confidence: row.confidence,
      observedAt: row.observed_at,
      expiresAt: row.expires_at,
      supersedes: row.supersedes,
      searchText: row.search_text
    }));
  }

  getObservationHistory(entityId: string, key: string): Observation[] {
    // Get the latest observation
    const latest = this.getObservation(entityId, key);
    if (!latest) return [];

    // Walk back through supersedes chain
    const history: Observation[] = [latest];
    let current = latest;

    while (current.supersedes) {
      const prev = this.db.prepare(`
        SELECT id, entity_id, key, value, value_type,
               source_type, source_id, confidence,
               observed_at, expires_at, supersedes, search_text
        FROM observations
        WHERE id = ?
      `).get(current.supersedes) as any;

      if (!prev) break;

      const prevObs: Observation = {
        id: prev.id,
        entityId: prev.entity_id,
        key: prev.key,
        value: prev.value,
        valueType: prev.value_type,
        sourceType: prev.source_type,
        sourceId: prev.source_id,
        confidence: prev.confidence,
        observedAt: prev.observed_at,
        expiresAt: prev.expires_at,
        supersedes: prev.supersedes,
        searchText: prev.search_text
      };

      history.push(prevObs);
      current = prevObs;
    }

    return history;
  }

  // ==========================================================================
  // Relationship Management
  // ==========================================================================

  recordRelationship(input: RelationshipInput): string {
    const id = uuidv4();
    const contextJson = input.context ? JSON.stringify(input.context) : null;

    this.db.prepare(`
      INSERT INTO relationships (
        id, from_entity, to_entity, relation_type,
        strength, context, observed_at, source_id
      )
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'), ?)
    `).run(
      id,
      input.fromEntity,
      input.toEntity,
      input.relationType,
      input.strength || null,
      contextJson,
      input.sourceId || null
    );

    debug('Relationship recorded', {
      id,
      from: input.fromEntity,
      to: input.toEntity,
      type: input.relationType
    });

    return id;
  }

  getRelationships(entityId: string, filters?: RelationshipFilters): Relationship[] {
    const direction = filters?.direction || 'both';
    let query = `
      SELECT id, from_entity, to_entity, relation_type,
             strength, context, observed_at, source_id
      FROM relationships
      WHERE 1=1
    `;

    const params: any[] = [];

    if (direction === 'from' || direction === 'both') {
      query += ` AND from_entity = ?`;
      params.push(entityId);
    }

    if (direction === 'to' || direction === 'both') {
      if (direction === 'both') {
        query = query.replace('AND from_entity = ?', 'AND (from_entity = ? OR to_entity = ?)');
        params.push(entityId);
      } else {
        query += ` AND to_entity = ?`;
        params.push(entityId);
      }
    }

    if (filters?.relationType) {
      query += ` AND relation_type = ?`;
      params.push(filters.relationType);
    }

    if (filters?.minStrength !== undefined) {
      query += ` AND strength >= ?`;
      params.push(filters.minStrength);
    }

    query += ` ORDER BY observed_at DESC`;

    const rows = this.db.prepare(query).all(...params) as any[];

    return rows.map(row => ({
      id: row.id,
      fromEntity: row.from_entity,
      toEntity: row.to_entity,
      relationType: row.relation_type,
      strength: row.strength,
      context: row.context ? JSON.parse(row.context) : undefined,
      observedAt: row.observed_at,
      sourceId: row.source_id
    }));
  }

  // ==========================================================================
  // High-Level Queries
  // ==========================================================================

  getUserProfile(): UserProfile {
    const observations = this.getObservations(this.userId, { notExpired: true });

    const preferences: Record<string, any> = {};
    const patterns: Record<string, any> = {};
    const context: Record<string, any> = {};
    const goals: string[] = [];

    for (const obs of observations) {
      try {
        const value = this.parseObservationValue(obs);

        if (obs.key.startsWith('preference.')) {
          const key = obs.key.replace('preference.', '');
          preferences[key] = value;
        } else if (obs.key.startsWith('pattern.')) {
          const key = obs.key.replace('pattern.', '');
          patterns[key] = value;
        } else if (obs.key.startsWith('context.')) {
          const key = obs.key.replace('context.', '');
          context[key] = value;
        } else if (obs.key.startsWith('goal.')) {
          goals.push(value);
        }
      } catch (err) {
        warn('Failed to parse observation value', { key: obs.key, error: String(err) });
      }
    }

    return { preferences, patterns, context, goals };
  }

  getRecentWorkContext(days: number): WorkContext {
    // Get records user interacted with recently
    const rows = this.db.prepare(`
      SELECT DISTINCT e.id, e.data
      FROM entities e
      JOIN relationships r ON e.id = r.to_entity
      WHERE r.from_entity = ?
      AND r.relation_type IN ('created', 'viewed', 'edited')
      AND r.observed_at > datetime('now', '-' || ? || ' days')
      ORDER BY r.observed_at DESC
      LIMIT 20
    `).all(this.userId, days) as any[];

    const records = rows.map(row => {
      const data = row.data ? JSON.parse(row.data) : {};
      return {
        id: row.id,
        title: data.title || row.id,
        importance: 'medium' // TODO: compute from observations
      };
    });

    // Get topics from observations
    const topicObs = this.db.prepare(`
      SELECT DISTINCT o.value
      FROM observations o
      JOIN entities e ON o.entity_id = e.id
      WHERE e.type = 'record'
      AND o.key = 'topic'
      AND o.observed_at > datetime('now', '-' || ? || ' days')
    `).all(days) as any[];

    const topics = topicObs.map(row => row.value);

    // Get projects from observations
    const projectObs = this.db.prepare(`
      SELECT DISTINCT o.value
      FROM observations o
      JOIN entities e ON o.entity_id = e.id
      WHERE e.type = 'record'
      AND o.key = 'project'
      AND o.observed_at > datetime('now', '-' || ? || ' days')
    `).all(days) as any[];

    const projects = projectObs.map(row => row.value);

    return { records, topics, projects };
  }

  getSessionSummary(sessionId: string): SessionSummary | null {
    const observations = this.getObservations(sessionId);

    const getSummary = observations.find(o => o.key === 'summary');
    const getTopics = observations.filter(o => o.key === 'topic');
    const getDecisions = observations.filter(o => o.key === 'decision');
    const getUnresolved = observations.filter(o => o.key === 'unresolved_question');
    const getArtifacts = observations.filter(o => o.key === 'artifact.created');

    if (!getSummary) return null;

    return {
      summary: getSummary.value,
      topics: getTopics.map(o => o.value),
      decisions: getDecisions.map(o => o.value),
      unresolved: getUnresolved.map(o => o.value),
      artifacts: getArtifacts.map(o => o.value)
    };
  }

  getEntityComplete(entityId: string): {
    entity: Entity | null;
    observations: Observation[];
    relationships: Relationship[];
  } {
    return {
      entity: this.getEntity(entityId),
      observations: this.getObservations(entityId, { notExpired: true }),
      relationships: this.getRelationships(entityId)
    };
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  private parseObservationValue(obs: Observation): any {
    switch (obs.valueType) {
      case 'number':
        return parseFloat(obs.value);
      case 'boolean':
        return obs.value === 'true';
      case 'json':
        return JSON.parse(obs.value);
      default:
        return obs.value;
    }
  }

  // ==========================================================================
  // Maintenance
  // ==========================================================================

  cleanExpiredObservations(): number {
    const result = this.db.prepare(`
      DELETE FROM observations
      WHERE expires_at IS NOT NULL
      AND expires_at <= datetime('now')
    `).run();

    if (result.changes > 0) {
      info('Cleaned expired observations', { count: result.changes });
    }

    return result.changes;
  }

  close(): void {
    // Nothing to close - db is managed by parent
  }
}
