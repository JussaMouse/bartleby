// src/services/learning.ts
// Unified Entity-Observation-Relationship (EOR) learning system
// Tracks observations and relationships across all entities: users, sessions, records, commands

import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
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

export interface CommandRecord {
  id: string;
  timestamp: string;
  rawInput: string;
  intentType: string;
  success: boolean;
  resultId?: string;
  executionTimeMs: number;
  source: 'cli' | 'dashboard' | 'api';
  errorMessage?: string;
}

export interface CommandStats {
  totalCommands: number;
  successfulCommands: number;
  failedCommands: number;
  topIntents: Array<{ intent: string; count: number }>;
}

export interface RoutingEventInput {
  input: string;
  routeType: 'routed' | 'llm-simple' | 'llm-complex';
  predictedComplexity?: 'SIMPLE' | 'COMPLEX';
  finalTier: 'router' | 'fast' | 'thinking';
  matchedTool?: string;
  success: boolean;
  responseTimeMs: number;
  errorMessage?: string;
  decisionReason?: string;
  decisionSignals?: string[];
  routerModel?: string;
  routerModelVersion?: string;
  routerSource?: 'base' | 'active-adapter' | 'canary-adapter' | 'shadow-adapter';
  routerAdapterId?: string;
  routerAdapterVersion?: string;
  traceId?: string;
}

export interface RoutingEventRecord {
  id: string;
  createdAt: string;
  inputHash: string;
  inputLength: number;
  routeType: 'routed' | 'llm-simple' | 'llm-complex';
  predictedComplexity?: 'SIMPLE' | 'COMPLEX';
  finalTier: 'router' | 'fast' | 'thinking';
  matchedTool?: string;
  success: boolean;
  responseTimeMs: number;
  errorMessage?: string;
  overrideApplied: boolean;
  overrideReason?: string;
  decisionReason?: string;
  decisionSignals: string[];
  routerModel?: string;
  routerModelVersion?: string;
  routerSource?: 'base' | 'active-adapter' | 'canary-adapter' | 'shadow-adapter';
  routerAdapterId?: string;
  routerAdapterVersion?: string;
  traceId?: string;
}

export interface RoutingEventSummary {
  totalEvents: number;
  successfulEvents: number;
  successRate: number;
  avgResponseTimeMs: number;
  routeTypeBreakdown: {
    routed: number;
    'llm-simple': number;
    'llm-complex': number;
  };
  lastSeenAt?: string;
}

export type RoutingCaptureMode = 'canary' | 'opt_in' | 'eval' | 'shadow' | 'all_local';

export type RouterRouteLabel = 'DIRECT_TOOL' | 'FAST_AGENT' | 'THINKING_AGENT';

export type RoutingLabelSource = 'heuristic' | 'adjudicated_rule' | 'human';

export type RoutingLabelStatus = 'pending' | 'auto_accepted' | 'reviewed' | 'rejected';

export interface RoutingTrainingExampleInput {
  routingEventId?: string;
  traceId?: string;
  captureMode: RoutingCaptureMode;
  userId?: string;
  sanitizedInput: string;
  inputLength?: number;
  piiRedactionVersion: string;
  predictedComplexity?: 'SIMPLE' | 'COMPLEX';
  chosenRoute: RouterRouteLabel;
  finalTier: 'router' | 'fast' | 'thinking';
  matchedTool?: string;
  decisionSignals?: string[];
  success: boolean;
  responseTimeMs: number;
  userCorrectionWithin1Turn?: boolean;
  retryCount?: number;
  escalatedAfterResponse?: boolean;
  qualityScore?: number;
  candidateLabel?: RouterRouteLabel;
  candidateLabelSource?: RoutingLabelSource;
  candidateLabelConfidence?: number;
  labelStatus?: RoutingLabelStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNotes?: string;
  split?: 'train' | 'val' | 'test';
  datasetVersion?: string;
  exportedAt?: string;
}

export interface RoutingTrainingExampleRecord {
  id: string;
  createdAt: string;
  routingEventId?: string;
  traceId?: string;
  captureMode: RoutingCaptureMode;
  userId: string;
  sanitizedInput: string;
  inputLength: number;
  piiRedactionVersion: string;
  predictedComplexity?: 'SIMPLE' | 'COMPLEX';
  chosenRoute: RouterRouteLabel;
  finalTier: 'router' | 'fast' | 'thinking';
  matchedTool?: string;
  decisionSignals: string[];
  success: boolean;
  responseTimeMs: number;
  userCorrectionWithin1Turn: boolean;
  retryCount: number;
  escalatedAfterResponse: boolean;
  qualityScore?: number;
  candidateLabel?: RouterRouteLabel;
  candidateLabelSource?: RoutingLabelSource;
  candidateLabelConfidence?: number;
  labelStatus: RoutingLabelStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNotes?: string;
  split?: 'train' | 'val' | 'test';
  datasetVersion?: string;
  exportedAt?: string;
}

export interface RoutingTrainingExampleFilters {
  userId?: string;
  labelStatus?: RoutingLabelStatus;
  datasetVersion?: string;
  captureMode?: RoutingCaptureMode;
  minCandidateConfidence?: number;
  limit?: number;
}

export interface RoutingTrainingExampleUpdate {
  userCorrectionWithin1Turn?: boolean;
  retryCount?: number;
  escalatedAfterResponse?: boolean;
  qualityScore?: number;
  candidateLabel?: RouterRouteLabel;
  candidateLabelSource?: RoutingLabelSource;
  candidateLabelConfidence?: number;
  labelStatus?: RoutingLabelStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNotes?: string;
  split?: 'train' | 'val' | 'test';
  datasetVersion?: string;
  exportedAt?: string;
}

export interface ReviewRoutingTrainingExampleInput {
  id: string;
  reviewer?: string;
  label?: RouterRouteLabel;
  action: 'approve' | 'reject';
  notes?: string;
}

export type RouterTrainingRunStatus =
  | 'queued'
  | 'running'
  | 'evaluating'
  | 'shadow'
  | 'canary'
  | 'active'
  | 'failed'
  | 'rejected'
  | 'rolled_back';

export type RouterTrainingRunStage = 'preflight' | 'train' | 'eval' | 'shadow' | 'canary' | 'activate';

export interface RouterTrainingRunInput {
  userId: string;
  datasetVersion: string;
  baseId?: string;
  baseModel: string;
  baseModelVersion?: string;
  outputAdapterVersion?: string;
  status: RouterTrainingRunStatus;
  stage: RouterTrainingRunStage;
  config: Record<string, unknown>;
  metrics?: Record<string, unknown>;
  hardware?: Record<string, unknown>;
  failureReason?: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface RouterTrainingRunRecord {
  id: string;
  createdAt: string;
  userId: string;
  datasetVersion: string;
  baseId?: string;
  baseModel: string;
  baseModelVersion?: string;
  outputAdapterVersion?: string;
  status: RouterTrainingRunStatus;
  stage: RouterTrainingRunStage;
  config: Record<string, unknown>;
  metrics?: Record<string, unknown>;
  hardware?: Record<string, unknown>;
  failureReason?: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface RouterTrainingRunStatusUpdate {
  status?: RouterTrainingRunStatus;
  stage?: RouterTrainingRunStage;
  baseId?: string;
  outputAdapterVersion?: string;
  metrics?: Record<string, unknown>;
  hardware?: Record<string, unknown>;
  failureReason?: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface RouterTrainingRunFilters {
  userId?: string;
  status?: RouterTrainingRunStatus;
  limit?: number;
}

export type RouterAdapterLifecycleState = 'active' | 'shadow' | 'canary' | 'archived' | 'rolled_back';

export interface RouterAdapterRuntimeBinding {
  model: string;
  modelVersion?: string;
  baseId?: string;
  artifactId?: string;
  artifactPath?: string;
  artifactFormat?: string;
  artifactPrecision?: string;
  updatedAt?: string;
  notes?: string;
}

export interface RouterAdapterInput {
  userId: string;
  adapterVersion: string;
  baseId?: string;
  baseModel: string;
  baseModelVersion?: string;
  sourceRunId?: string;
  path: string;
  format: 'safetensors' | 'gguf' | 'other';
  lifecycleState: RouterAdapterLifecycleState;
  promotedAt?: string;
  rolledBackAt?: string;
  rollbackReason?: string;
  runtimeBinding?: RouterAdapterRuntimeBinding;
  evalSummary?: Record<string, unknown>;
}

export interface RouterAdapterRecord {
  id: string;
  createdAt: string;
  userId: string;
  adapterVersion: string;
  baseId?: string;
  baseModel: string;
  baseModelVersion?: string;
  sourceRunId?: string;
  path: string;
  format: 'safetensors' | 'gguf' | 'other';
  lifecycleState: RouterAdapterLifecycleState;
  promotedAt?: string;
  rolledBackAt?: string;
  rollbackReason?: string;
  runtimeBinding?: RouterAdapterRuntimeBinding;
  evalSummary?: Record<string, unknown>;
}

export interface RouterAdapterRollbackResult {
  rolledBackAdapterId?: string;
  restoredAdapterId?: string;
}

export interface RouterAdapterLifecycleUpdate {
  lifecycleState?: RouterAdapterLifecycleState;
  promotedAt?: string | null;
  rolledBackAt?: string | null;
  rollbackReason?: string | null;
  runtimeBinding?: RouterAdapterRuntimeBinding | null;
  evalSummary?: Record<string, unknown>;
}

export interface RouterAdapterFilters {
  userId?: string;
  lifecycleState?: RouterAdapterLifecycleState;
  limit?: number;
}

export interface RouterModelBaseInput {
  id: string;
  baseFamily: string;
  baseModelName: string;
  basePrecision: string;
  baseFormat: string;
  tokenizerId?: string;
  sourceUriOrOrigin?: string;
  localPath: string;
  sha256?: string;
  notes?: string;
}

export interface RouterModelBaseRecord extends RouterModelBaseInput {
  createdAt: string;
}

export interface RouterArtifactInput {
  id: string;
  userId: string;
  runId?: string;
  baseId?: string;
  datasetVersion?: string;
  adapterVersion?: string;
  artifactPath: string;
  artifactFormat: string;
  artifactPrecision?: string;
  quantizationRecipe?: Record<string, unknown>;
  manifestPath?: string;
  metrics?: Record<string, unknown>;
}

export interface RouterArtifactRecord extends RouterArtifactInput {
  createdAt: string;
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

-- Routing telemetry for model/tier selection diagnostics
CREATE TABLE IF NOT EXISTS routing_events (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  input_hash TEXT NOT NULL,
  input_length INTEGER NOT NULL,
  route_type TEXT NOT NULL,
  predicted_complexity TEXT,
  final_tier TEXT NOT NULL,
  matched_tool TEXT,
  success INTEGER NOT NULL,
  response_time_ms INTEGER NOT NULL,
  error_message TEXT,
  override_applied INTEGER NOT NULL DEFAULT 0,
  override_reason TEXT,
  decision_reason TEXT,
  decision_signals TEXT,  -- JSON array of routing signals
  router_model TEXT,
  router_model_version TEXT,
  router_source TEXT,
  router_adapter_id TEXT,
  router_adapter_version TEXT,
  trace_id TEXT
);

-- Router training examples for per-user adaptation loops
CREATE TABLE IF NOT EXISTS routing_training_examples (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  routing_event_id TEXT,
  trace_id TEXT,
  capture_mode TEXT NOT NULL,
  user_id TEXT NOT NULL,
  sanitized_input TEXT NOT NULL,
  input_length INTEGER NOT NULL,
  pii_redaction_version TEXT NOT NULL,
  predicted_complexity TEXT,
  chosen_route TEXT NOT NULL,
  final_tier TEXT NOT NULL,
  matched_tool TEXT,
  decision_signals TEXT,
  success INTEGER NOT NULL,
  response_time_ms INTEGER NOT NULL,
  user_correction_within_1_turn INTEGER NOT NULL DEFAULT 0,
  retry_count INTEGER NOT NULL DEFAULT 0,
  escalated_after_response INTEGER NOT NULL DEFAULT 0,
  quality_score REAL,
  candidate_label TEXT,
  candidate_label_source TEXT,
  candidate_label_confidence REAL,
  label_status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by TEXT,
  reviewed_at TEXT,
  review_notes TEXT,
  split TEXT,
  dataset_version TEXT,
  exported_at TEXT
);

-- Router training run registry
CREATE TABLE IF NOT EXISTS router_training_runs (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  user_id TEXT NOT NULL,
  dataset_version TEXT NOT NULL,
  base_id TEXT,
  base_model TEXT NOT NULL,
  base_model_version TEXT,
  output_adapter_version TEXT,
  status TEXT NOT NULL,
  stage TEXT NOT NULL,
  config_json TEXT NOT NULL,
  metrics_json TEXT,
  hardware_json TEXT,
  failure_reason TEXT,
  started_at TEXT,
  finished_at TEXT
);

-- Router adapter lifecycle registry
CREATE TABLE IF NOT EXISTS router_adapters (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  user_id TEXT NOT NULL,
  adapter_version TEXT NOT NULL,
  base_id TEXT,
  base_model TEXT NOT NULL,
  base_model_version TEXT,
  source_run_id TEXT,
  path TEXT NOT NULL,
  format TEXT NOT NULL,
  lifecycle_state TEXT NOT NULL,
  promoted_at TEXT,
  rolled_back_at TEXT,
  rollback_reason TEXT,
  runtime_binding_json TEXT,
  eval_summary_json TEXT
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_observations_entity ON observations(entity_id, key);
CREATE INDEX IF NOT EXISTS idx_observations_entity_time ON observations(entity_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_observations_key ON observations(key);
CREATE INDEX IF NOT EXISTS idx_observations_supersedes ON observations(supersedes);
CREATE INDEX IF NOT EXISTS idx_observations_confidence ON observations(confidence);
CREATE INDEX IF NOT EXISTS idx_observations_source ON observations(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_observations_expires ON observations(expires_at);
CREATE INDEX IF NOT EXISTS idx_observations_observed_at ON observations(observed_at);
CREATE INDEX IF NOT EXISTS idx_relationships_from ON relationships(from_entity, relation_type);
CREATE INDEX IF NOT EXISTS idx_relationships_to ON relationships(to_entity, relation_type);
CREATE INDEX IF NOT EXISTS idx_relationships_strength ON relationships(strength);
CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type);
CREATE INDEX IF NOT EXISTS idx_entities_created ON entities(created_at);
CREATE INDEX IF NOT EXISTS idx_routing_events_created ON routing_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_routing_events_route_type ON routing_events(route_type);
CREATE INDEX IF NOT EXISTS idx_routing_events_final_tier ON routing_events(final_tier);
CREATE INDEX IF NOT EXISTS idx_routing_events_success ON routing_events(success);
CREATE INDEX IF NOT EXISTS idx_routing_events_input_hash ON routing_events(input_hash);
CREATE INDEX IF NOT EXISTS idx_rte_created ON routing_training_examples(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rte_status ON routing_training_examples(label_status);
CREATE INDEX IF NOT EXISTS idx_rte_candidate_label ON routing_training_examples(candidate_label);
CREATE INDEX IF NOT EXISTS idx_rte_confidence ON routing_training_examples(candidate_label_confidence);
CREATE INDEX IF NOT EXISTS idx_rte_quality ON routing_training_examples(quality_score);
CREATE INDEX IF NOT EXISTS idx_rte_event ON routing_training_examples(routing_event_id);
CREATE INDEX IF NOT EXISTS idx_rte_user_id ON routing_training_examples(user_id);
CREATE INDEX IF NOT EXISTS idx_rte_dataset_version ON routing_training_examples(dataset_version);
CREATE INDEX IF NOT EXISTS idx_rtr_user_id ON router_training_runs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rtr_status ON router_training_runs(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ra_user_adapter_version ON router_adapters(user_id, adapter_version);
CREATE INDEX IF NOT EXISTS idx_ra_user_state ON router_adapters(user_id, lifecycle_state);

CREATE TABLE IF NOT EXISTS router_model_bases (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  base_family TEXT NOT NULL,
  base_model_name TEXT NOT NULL,
  base_precision TEXT NOT NULL,
  base_format TEXT NOT NULL,
  tokenizer_id TEXT,
  source_uri_or_origin TEXT,
  local_path TEXT NOT NULL,
  sha256 TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS router_artifacts (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  user_id TEXT NOT NULL,
  run_id TEXT,
  base_id TEXT,
  dataset_version TEXT,
  adapter_version TEXT,
  artifact_path TEXT NOT NULL,
  artifact_format TEXT NOT NULL,
  artifact_precision TEXT,
  quantization_recipe_json TEXT,
  manifest_path TEXT,
  metrics_json TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rmb_local_path ON router_model_bases(local_path);
CREATE INDEX IF NOT EXISTS idx_router_artifacts_run_id ON router_artifacts(run_id);
CREATE INDEX IF NOT EXISTS idx_router_artifacts_adapter_version ON router_artifacts(adapter_version);

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
    this.migrateActivationTracking();
    this.migrateRoutingSchema();
    this.ensureUserEntity();
  }

  private initSchema(): void {
    this.db.exec(SCHEMA);
    info('LearningService schema initialized');
  }

  /**
   * Migrate schema to add activation tracking columns if they don't exist.
   * Runs on service initialization to ensure backward compatibility.
   */
  private migrateActivationTracking(): void {
    try {
      // Check if columns already exist
      const tableInfo = this.db.prepare('PRAGMA table_info(observations)').all() as Array<{ name: string }>;
      const hasActivation = tableInfo.some(col => col.name === 'activation_score');

      if (!hasActivation) {
        info('Migrating observations table for activation tracking');

        // Add activation tracking columns
        this.db.exec(`
          ALTER TABLE observations ADD COLUMN last_accessed_at TEXT;
          ALTER TABLE observations ADD COLUMN access_count INTEGER DEFAULT 0;
          ALTER TABLE observations ADD COLUMN activation_score REAL DEFAULT 0.5;
        `);

        // Create index for activation queries
        this.db.exec(`
          CREATE INDEX IF NOT EXISTS idx_observations_activation
          ON observations(entity_id, activation_score DESC);
        `);

        // Initialize activation scores for existing observations based on age
        // Recent observations (< 30 days) get higher initial scores
        this.db.exec(`
          UPDATE observations
          SET activation_score = CASE
            WHEN observed_at > datetime('now', '-7 days') THEN 0.7
            WHEN observed_at > datetime('now', '-30 days') THEN 0.5
            ELSE 0.3
          END,
          last_accessed_at = observed_at,
          access_count = 0
          WHERE activation_score IS NULL;
        `);

        info('Activation tracking migration complete');
      } else {
        debug('Activation tracking columns already exist');
      }
    } catch (err) {
      warn('Activation tracking migration failed', { error: String(err) });
    }
  }

  /**
   * Backward-compatible migration for routing telemetry and training tables.
   */
  private migrateRoutingSchema(): void {
    try {
      const tableInfo = this.db.prepare('PRAGMA table_info(routing_events)').all() as Array<{ name: string }>;
      const hasRouterModel = tableInfo.some(col => col.name === 'router_model');
      const hasRouterModelVersion = tableInfo.some(col => col.name === 'router_model_version');
      const hasRouterSource = tableInfo.some(col => col.name === 'router_source');
      const hasRouterAdapterId = tableInfo.some(col => col.name === 'router_adapter_id');
      const hasRouterAdapterVersion = tableInfo.some(col => col.name === 'router_adapter_version');
      const hasTraceId = tableInfo.some(col => col.name === 'trace_id');

      if (!hasRouterModel) {
        this.db.exec('ALTER TABLE routing_events ADD COLUMN router_model TEXT');
      }

      if (!hasRouterModelVersion) {
        this.db.exec('ALTER TABLE routing_events ADD COLUMN router_model_version TEXT');
      }

      if (!hasRouterSource) {
        this.db.exec('ALTER TABLE routing_events ADD COLUMN router_source TEXT');
      }

      if (!hasRouterAdapterId) {
        this.db.exec('ALTER TABLE routing_events ADD COLUMN router_adapter_id TEXT');
      }

      if (!hasRouterAdapterVersion) {
        this.db.exec('ALTER TABLE routing_events ADD COLUMN router_adapter_version TEXT');
      }

      if (!hasTraceId) {
        this.db.exec('ALTER TABLE routing_events ADD COLUMN trace_id TEXT');
      }

      const runTableInfo = this.db.prepare('PRAGMA table_info(router_training_runs)').all() as Array<{ name: string }>;
      const hasRunBaseId = runTableInfo.some(col => col.name === 'base_id');
      if (!hasRunBaseId) {
        this.db.exec('ALTER TABLE router_training_runs ADD COLUMN base_id TEXT');
      }

      const adapterTableInfo = this.db.prepare('PRAGMA table_info(router_adapters)').all() as Array<{ name: string }>;
      const hasAdapterBaseId = adapterTableInfo.some(col => col.name === 'base_id');
      if (!hasAdapterBaseId) {
        this.db.exec('ALTER TABLE router_adapters ADD COLUMN base_id TEXT');
      }
      const hasRuntimeBinding = adapterTableInfo.some(col => col.name === 'runtime_binding_json');
      if (!hasRuntimeBinding) {
        this.db.exec('ALTER TABLE router_adapters ADD COLUMN runtime_binding_json TEXT');
      }

      this.db.exec('CREATE INDEX IF NOT EXISTS idx_routing_events_trace_id ON routing_events(trace_id)');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_routing_events_router_source ON routing_events(router_source, created_at DESC)');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_routing_events_router_adapter_version ON routing_events(router_adapter_version, created_at DESC)');

      debug('Routing schema migration complete', {
        addedRouterModel: !hasRouterModel,
        addedRouterModelVersion: !hasRouterModelVersion,
        addedRouterSource: !hasRouterSource,
        addedRouterAdapterId: !hasRouterAdapterId,
        addedRouterAdapterVersion: !hasRouterAdapterVersion,
        addedTraceId: !hasTraceId,
        addedRunBaseId: !hasRunBaseId,
        addedAdapterBaseId: !hasAdapterBaseId,
        addedAdapterRuntimeBinding: !hasRuntimeBinding,
      });
    } catch (err) {
      warn('Routing schema migration failed', { error: String(err) });
    }
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

  registerRouterModelBase(data: RouterModelBaseInput): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO router_model_bases (
        id, created_at, base_family, base_model_name, base_precision, base_format,
        tokenizer_id, source_uri_or_origin, local_path, sha256, notes
      )
      VALUES (?, COALESCE((SELECT created_at FROM router_model_bases WHERE id = ?), datetime('now')), ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.id,
      data.id,
      data.baseFamily,
      data.baseModelName,
      data.basePrecision,
      data.baseFormat,
      data.tokenizerId ?? null,
      data.sourceUriOrOrigin ?? null,
      data.localPath,
      data.sha256 ?? null,
      data.notes ?? null,
    );
  }

  getRouterModelBase(id: string): RouterModelBaseRecord | null {
    const row = this.db.prepare(`
      SELECT id, created_at, base_family, base_model_name, base_precision, base_format,
             tokenizer_id, source_uri_or_origin, local_path, sha256, notes
      FROM router_model_bases
      WHERE id = ?
    `).get(id) as any;

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      createdAt: row.created_at,
      baseFamily: row.base_family,
      baseModelName: row.base_model_name,
      basePrecision: row.base_precision,
      baseFormat: row.base_format,
      tokenizerId: row.tokenizer_id || undefined,
      sourceUriOrOrigin: row.source_uri_or_origin || undefined,
      localPath: row.local_path,
      sha256: row.sha256 || undefined,
      notes: row.notes || undefined,
    };
  }

  registerRouterArtifact(data: RouterArtifactInput): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO router_artifacts (
        id, created_at, user_id, run_id, base_id, dataset_version, adapter_version,
        artifact_path, artifact_format, artifact_precision, quantization_recipe_json,
        manifest_path, metrics_json
      )
      VALUES (?, COALESCE((SELECT created_at FROM router_artifacts WHERE id = ?), datetime('now')), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.id,
      data.id,
      data.userId,
      data.runId ?? null,
      data.baseId ?? null,
      data.datasetVersion ?? null,
      data.adapterVersion ?? null,
      data.artifactPath,
      data.artifactFormat,
      data.artifactPrecision ?? null,
      data.quantizationRecipe ? JSON.stringify(data.quantizationRecipe) : null,
      data.manifestPath ?? null,
      data.metrics ? JSON.stringify(data.metrics) : null,
    );
  }

  getRouterArtifactByAdapterVersion(userId: string, adapterVersion: string): RouterArtifactRecord | null {
    const row = this.db.prepare(`
      SELECT id, created_at, user_id, run_id, base_id, dataset_version, adapter_version,
             artifact_path, artifact_format, artifact_precision, quantization_recipe_json,
             manifest_path, metrics_json
      FROM router_artifacts
      WHERE user_id = ? AND adapter_version = ?
      ORDER BY datetime(created_at) DESC
      LIMIT 1
    `).get(userId, adapterVersion) as any;

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      createdAt: row.created_at,
      userId: row.user_id,
      runId: row.run_id || undefined,
      baseId: row.base_id || undefined,
      datasetVersion: row.dataset_version || undefined,
      adapterVersion: row.adapter_version || undefined,
      artifactPath: row.artifact_path,
      artifactFormat: row.artifact_format,
      artifactPrecision: row.artifact_precision || undefined,
      quantizationRecipe: parseJsonObject(row.quantization_recipe_json),
      manifestPath: row.manifest_path || undefined,
      metrics: parseJsonObject(row.metrics_json),
    };
  }

  // ==========================================================================
  // Entity Management
  // ==========================================================================

  createEntity(type: EntityType, data?: any, id?: string): string {
    const entityId = id || uuidv4();
    const dataJson = data ? JSON.stringify(data) : null;

    this.db.prepare(`
      INSERT INTO entities (id, type, created_at, data)
      VALUES (?, ?, datetime('now'), ?)
    `).run(entityId, type, dataJson);

    debug('Entity created', { id: entityId, type });
    return entityId;
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
      query += ` AND (expires_at IS NULL OR datetime(expires_at) > datetime('now'))`;
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
      AND (o.expires_at IS NULL OR datetime(o.expires_at) > datetime('now'))
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

  /**
   * Sanitize FTS5 query by escaping special characters.
   * FTS5 special chars: " ' . , ? : ; ( ) [ ] { } ! @ # $ % ^ & * + - = < > / \ |
   */
  private sanitizeFTS5Query(query: string): string {
    // Escape double quotes by doubling them
    const escaped = query.replace(/"/g, '""');
    // Wrap in double quotes to treat as a phrase (allows special chars)
    return `"${escaped}"`;
  }

  searchObservations(query: string, limit: number = 10): Observation[] {
    const sanitizedQuery = this.sanitizeFTS5Query(query);
    const rows = this.db.prepare(`
      SELECT o.id, o.entity_id, o.key, o.value, o.value_type,
             o.source_type, o.source_id, o.confidence,
             o.observed_at, o.expires_at, o.supersedes, o.search_text
      FROM observations_fts fts
      JOIN observations o ON fts.rowid = o.rowid
      WHERE observations_fts MATCH ?
      AND (o.expires_at IS NULL OR datetime(o.expires_at) > datetime('now'))
      ORDER BY rank
      LIMIT ?
    `).all(sanitizedQuery, limit) as any[];

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

  /**
   * Query observations across all entities by key prefix.
   * Useful for finding all observations of a certain type (e.g., all 'fact.view_count' observations).
   */
  queryObservationsByKey(keyPrefix: string, filters?: {
    notExpired?: boolean;
    minConfidence?: number;
    limit?: number;
  }): Observation[] {
    let query = `
      SELECT id, entity_id, key, value, value_type,
             source_type, source_id, confidence,
             observed_at, expires_at, supersedes, search_text
      FROM observations
      WHERE key LIKE ?
    `;

    const params: any[] = [`${keyPrefix}%`];

    if (filters?.notExpired) {
      query += ` AND (expires_at IS NULL OR datetime(expires_at) > datetime('now'))`;
    }

    if (filters?.minConfidence !== undefined) {
      query += ` AND confidence >= ?`;
      params.push(filters.minConfidence);
    }

    query += ` ORDER BY observed_at DESC`;

    if (filters?.limit) {
      query += ` LIMIT ?`;
      params.push(filters.limit);
    }

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

  getUserProfile(tier: 'hot' | 'warm' | 'all' = 'all'): UserProfile {
    // Use activation-based filtering for hot/warm tiers
    const observations = tier === 'all'
      ? this.getObservations(this.userId, { notExpired: true })
      : this.getObservationsByActivation(this.userId, tier);

    // Track access for activation scoring
    for (const obs of observations) {
      this.updateActivation(obs.id);
    }

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

  // ==========================================================================
  // Maintenance and Cleanup
  // ==========================================================================

  /**
   * Clean up expired observations to improve performance and reduce database size.
   * This removes observations where expires_at < now.
   *
   * @returns Number of observations deleted
   */
  cleanupExpiredObservations(): number {
    const result = this.db.prepare(`
      DELETE FROM observations
      WHERE expires_at IS NOT NULL
      AND datetime(expires_at) <= datetime('now')
    `).run();

    if (result.changes > 0) {
      info('Cleaned up expired observations', { count: result.changes });
    }

    return result.changes;
  }

  /**
   * Get statistics about the learning database for monitoring.
   */
  getStats(): {
    entities: number;
    observations: number;
    relationships: number;
    expiredObservations: number;
    databaseSizeMB: number;
  } {
    const entities = this.db.prepare('SELECT COUNT(*) as count FROM entities').get() as { count: number };
    const observations = this.db.prepare('SELECT COUNT(*) as count FROM observations').get() as { count: number };
    const relationships = this.db.prepare('SELECT COUNT(*) as count FROM relationships').get() as { count: number };

    const expired = this.db.prepare(`
      SELECT COUNT(*) as count FROM observations
      WHERE expires_at IS NOT NULL AND datetime(expires_at) <= datetime('now')
    `).get() as { count: number };

    // Get database file size
    const pragma = this.db.prepare('PRAGMA page_count').get() as { page_count: number };
    const pageSize = this.db.prepare('PRAGMA page_size').get() as { page_size: number };
    const sizeBytes = pragma.page_count * pageSize.page_size;
    const sizeMB = sizeBytes / (1024 * 1024);

    return {
      entities: entities.count,
      observations: observations.count,
      relationships: relationships.count,
      expiredObservations: expired.count,
      databaseSizeMB: Math.round(sizeMB * 100) / 100
    };
  }

  /**
   * Optimize the database by running VACUUM and ANALYZE.
   * This reclaims space and updates query planner statistics.
   *
   * @returns Statistics before and after optimization
   */
  optimizeDatabase(): { before: number; after: number; reclaimedMB: number } {
    const before = this.getStats();

    // VACUUM to reclaim space
    this.db.prepare('VACUUM').run();

    // ANALYZE to update query planner stats
    this.db.prepare('ANALYZE').run();

    const after = this.getStats();
    const reclaimedMB = Math.round((before.databaseSizeMB - after.databaseSizeMB) * 100) / 100;

    info('Database optimized', {
      beforeMB: before.databaseSizeMB,
      afterMB: after.databaseSizeMB,
      reclaimedMB
    });

    return {
      before: before.databaseSizeMB,
      after: after.databaseSizeMB,
      reclaimedMB
    };
  }

  // ============================================================================
  // Command History API
  // ============================================================================

  /**
   * Record a command execution in the learning system
   */
  recordCommand(data: {
    rawInput: string;
    intentType: string;
    parsedMetadata?: any;
    success: boolean;
    resultId?: string;
    errorMessage?: string;
    executionTimeMs: number;
    source: 'cli' | 'dashboard' | 'api';
    sessionId?: string;
  }): string {
    // Create command entity
    const commandId = this.createEntity('command', {
      source: data.source,
      timestamp: new Date().toISOString()
    });

    // Record observations about the command
    this.recordObservation({
      entityId: commandId,
      key: 'raw_input',
      value: data.rawInput,
      sourceType: 'computed',
      confidence: 1.0
    });

    this.recordObservation({
      entityId: commandId,
      key: 'intent_type',
      value: data.intentType,
      sourceType: 'computed',
      confidence: 1.0
    });

    this.recordObservation({
      entityId: commandId,
      key: 'success',
      value: String(data.success),
      sourceType: 'computed',
      confidence: 1.0
    });

    this.recordObservation({
      entityId: commandId,
      key: 'execution_time_ms',
      value: String(data.executionTimeMs),
      sourceType: 'computed',
      confidence: 1.0
    });

    if (data.parsedMetadata) {
      this.recordObservation({
        entityId: commandId,
        key: 'parsed_metadata',
        value: JSON.stringify(data.parsedMetadata),
        valueType: 'json',
        sourceType: 'computed',
        confidence: 1.0
      });
    }

    if (data.resultId) {
      this.recordObservation({
        entityId: commandId,
        key: 'result_id',
        value: data.resultId,
        sourceType: 'computed',
        confidence: 1.0
      });

      // Create relationship: command created/modified a record
      const actionType = data.intentType.includes('create') ? 'created' :
                        data.intentType.includes('edit') || data.intentType.includes('update') ? 'modified' :
                        'affected';
      this.recordRelationship({
        fromEntity: commandId,
        toEntity: data.resultId,
        relationType: actionType
      });
    }

    if (data.errorMessage) {
      this.recordObservation({
        entityId: commandId,
        key: 'error_message',
        value: data.errorMessage,
        sourceType: 'computed',
        confidence: 1.0
      });
    }

    // Link to user
    this.recordRelationship({
      fromEntity: 'user',
      toEntity: commandId,
      relationType: 'executed'
    });

    // Link to session if available
    if (data.sessionId) {
      this.recordRelationship({
        fromEntity: commandId,
        toEntity: data.sessionId,
        relationType: 'part_of'
      });
    }

    debug('Command recorded', { commandId, intentType: data.intentType, success: data.success });
    return commandId;
  }

  /**
   * Get recent commands
   */
  getRecentCommands(limit: number = 10): CommandRecord[] {
    const commands = this.db.prepare(`
      SELECT id, data, created_at
      FROM entities
      WHERE type = 'command'
      ORDER BY created_at DESC
      LIMIT ?
    `).all(limit) as Array<{id: string; data: string; created_at: string}>;

    return commands.map(cmd => this.commandEntityToRecord(cmd));
  }

  /**
   * Get commands by intent type
   */
  getCommandsByIntent(intentType: string, limit: number = 10): CommandRecord[] {
    const obs = this.queryObservationsByKey('intent_type', { notExpired: true });
    const matching = obs
      .filter(o => o.value === intentType)
      .slice(0, limit);

    return matching.map(o => {
      const entity = this.getEntity(o.entityId);
      if (!entity) return null;
      return this.commandEntityToRecord({
        id: entity.id,
        data: JSON.stringify(entity.data),
        created_at: entity.createdAt
      });
    }).filter(Boolean) as CommandRecord[];
  }

  /**
   * Search command history
   */
  searchCommands(query: string, limit: number = 10): CommandRecord[] {
    const results = this.searchObservations(query, limit * 3);
    const commandIds = new Set(
      results
        .map(o => o.entityId)
        .filter(id => {
          const entity = this.getEntity(id);
          return entity?.type === 'command';
        })
    );

    return Array.from(commandIds).slice(0, limit).map(id => {
      const entity = this.getEntity(id);
      if (!entity) return null;
      return this.commandEntityToRecord({
        id: entity.id,
        data: JSON.stringify(entity.data),
        created_at: entity.createdAt
      });
    }).filter(Boolean) as CommandRecord[];
  }

  /**
   * Get commands for a specific session
   */
  getCommandsBySession(sessionId: string): CommandRecord[] {
    const rels = this.getRelationships(sessionId, {
      direction: 'to',
      relationType: 'part_of'
    });

    return rels.map(rel => {
      const entity = this.getEntity(rel.fromEntity);
      if (!entity || entity.type !== 'command') return null;
      return this.commandEntityToRecord({
        id: entity.id,
        data: JSON.stringify(entity.data),
        created_at: entity.createdAt
      });
    }).filter(Boolean) as CommandRecord[];
  }

  /**
   * Get command statistics
   */
  getCommandStats(): CommandStats {
    const allCommands = this.db.prepare(`
      SELECT COUNT(*) as total
      FROM entities
      WHERE type = 'command'
    `).get() as { total: number };

    const successObs = this.queryObservationsByKey('success', { notExpired: true });
    const successful = successObs.filter(o => o.value === 'true').length;
    const failed = successObs.filter(o => o.value === 'false').length;

    const intentObs = this.queryObservationsByKey('intent_type', { notExpired: true });
    const intentCounts: Record<string, number> = {};
    for (const obs of intentObs) {
      intentCounts[obs.value] = (intentCounts[obs.value] || 0) + 1;
    }

    const topIntents = Object.entries(intentCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([intent, count]) => ({ intent, count }));

    return {
      totalCommands: allCommands.total,
      successfulCommands: successful,
      failedCommands: failed,
      topIntents
    };
  }

  /**
   * Convert command entity to CommandRecord format
   */
  private commandEntityToRecord(cmd: {id: string; data: string; created_at: string}): CommandRecord {
    const data = JSON.parse(cmd.data || '{}');
    const obs = this.getObservations(cmd.id);

    const executionTimeStr = obs.find(o => o.key === 'execution_time_ms')?.value || '0';

    return {
      id: cmd.id,
      timestamp: cmd.created_at,
      rawInput: obs.find(o => o.key === 'raw_input')?.value || '',
      intentType: obs.find(o => o.key === 'intent_type')?.value || '',
      success: obs.find(o => o.key === 'success')?.value === 'true',
      resultId: obs.find(o => o.key === 'result_id')?.value,
      executionTimeMs: parseInt(executionTimeStr),
      source: data.source,
      errorMessage: obs.find(o => o.key === 'error_message')?.value
    };
  }

  /**
   * Record a routing event for telemetry and offline analysis.
   */
  recordRoutingEvent(data: RoutingEventInput): string {
    const id = uuidv4();
    const inputHash = crypto.createHash('sha256').update(data.input).digest('hex');
    const inputLength = data.input.length;
    const overrideApplied = data.decisionSignals?.includes('simple-guardrail-override') ? 1 : 0;
    const decisionSignalsJson = data.decisionSignals && data.decisionSignals.length > 0
      ? JSON.stringify(data.decisionSignals)
      : null;

    this.db.prepare(`
      INSERT INTO routing_events (
        id, created_at, input_hash, input_length, route_type,
        predicted_complexity, final_tier, matched_tool, success, response_time_ms,
        error_message, override_applied, override_reason, decision_reason, decision_signals,
        router_model, router_model_version, router_source, router_adapter_id, router_adapter_version, trace_id
      )
      VALUES (?, datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      inputHash,
      inputLength,
      data.routeType,
      data.predictedComplexity || null,
      data.finalTier,
      data.matchedTool || null,
      data.success ? 1 : 0,
      Math.max(0, Math.round(data.responseTimeMs)),
      data.errorMessage || null,
      overrideApplied,
      overrideApplied ? 'simple-guardrail-override' : null,
      data.decisionReason || null,
      decisionSignalsJson,
      data.routerModel || null,
      data.routerModelVersion || null,
      data.routerSource || null,
      data.routerAdapterId || null,
      data.routerAdapterVersion || null,
      data.traceId || null,
    );

    debug('Routing event recorded', {
      id,
      routeType: data.routeType,
      predictedComplexity: data.predictedComplexity,
      finalTier: data.finalTier,
      success: data.success,
      responseTimeMs: data.responseTimeMs,
      traceId: data.traceId,
    });

    return id;
  }

  /**
   * Get recent routing events (newest first).
   */
  getRecentRoutingEvents(limit: number = 50): RoutingEventRecord[] {
    const rows = this.db.prepare(`
      SELECT id, created_at, input_hash, input_length, route_type,
             predicted_complexity, final_tier, matched_tool, success, response_time_ms,
             error_message, override_applied, override_reason, decision_reason, decision_signals,
             router_model, router_model_version, router_source, router_adapter_id, router_adapter_version, trace_id
      FROM routing_events
      ORDER BY created_at DESC
      LIMIT ?
    `).all(limit) as any[];

    return rows.map(row => ({
      id: row.id,
      createdAt: row.created_at,
      inputHash: row.input_hash,
      inputLength: row.input_length,
      routeType: row.route_type,
      predictedComplexity: row.predicted_complexity || undefined,
      finalTier: row.final_tier,
      matchedTool: row.matched_tool || undefined,
      success: row.success === 1,
      responseTimeMs: row.response_time_ms,
      errorMessage: row.error_message || undefined,
      overrideApplied: row.override_applied === 1,
      overrideReason: row.override_reason || undefined,
      decisionReason: row.decision_reason || undefined,
      decisionSignals: row.decision_signals ? JSON.parse(row.decision_signals) : [],
      routerModel: row.router_model || undefined,
      routerModelVersion: row.router_model_version || undefined,
      routerSource: row.router_source || undefined,
      routerAdapterId: row.router_adapter_id || undefined,
      routerAdapterVersion: row.router_adapter_version || undefined,
      traceId: row.trace_id || undefined,
    }));
  }

  summarizeRoutingEvents(filters: {
    routerSource?: 'base' | 'active-adapter' | 'canary-adapter' | 'shadow-adapter';
    routerAdapterVersion?: string;
    sinceHours?: number;
    limit?: number;
  } = {}): RoutingEventSummary {
    const clauses: string[] = [];
    const params: unknown[] = [];

    if (filters.routerSource) {
      clauses.push('router_source = ?');
      params.push(filters.routerSource);
    }

    if (filters.routerAdapterVersion) {
      clauses.push('router_adapter_version = ?');
      params.push(filters.routerAdapterVersion);
    }

    if (filters.sinceHours && Number.isFinite(filters.sinceHours) && filters.sinceHours > 0) {
      clauses.push(`created_at >= datetime('now', ?)`);
      params.push(`-${Math.round(filters.sinceHours)} hours`);
    }

    const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const limitClause =
      filters.limit && Number.isFinite(filters.limit) && filters.limit > 0 ? 'LIMIT ?' : '';

    if (limitClause) {
      params.push(Math.round(filters.limit!));
    }

    const rows = this.db.prepare(`
      SELECT created_at, route_type, success, response_time_ms
      FROM routing_events
      ${whereClause}
      ORDER BY created_at DESC
      ${limitClause}
    `).all(...params) as Array<{
      created_at: string;
      route_type: 'routed' | 'llm-simple' | 'llm-complex';
      success: number;
      response_time_ms: number;
    }>;

    if (rows.length === 0) {
      return {
        totalEvents: 0,
        successfulEvents: 0,
        successRate: 0,
        avgResponseTimeMs: 0,
        routeTypeBreakdown: {
          routed: 0,
          'llm-simple': 0,
          'llm-complex': 0,
        },
      };
    }

    let successfulEvents = 0;
    let totalResponseTimeMs = 0;
    const routeTypeBreakdown: RoutingEventSummary['routeTypeBreakdown'] = {
      routed: 0,
      'llm-simple': 0,
      'llm-complex': 0,
    };

    for (const row of rows) {
      successfulEvents += row.success === 1 ? 1 : 0;
      totalResponseTimeMs += row.response_time_ms;
      routeTypeBreakdown[row.route_type] += 1;
    }

    return {
      totalEvents: rows.length,
      successfulEvents,
      successRate: successfulEvents / rows.length,
      avgResponseTimeMs: totalResponseTimeMs / rows.length,
      routeTypeBreakdown,
      lastSeenAt: rows[0]?.created_at,
    };
  }

  /**
   * Persist a routing training example for future adapter fine-tuning.
   */
  recordRoutingTrainingExample(data: RoutingTrainingExampleInput): string {
    const id = uuidv4();
    const decisionSignalsJson = data.decisionSignals && data.decisionSignals.length > 0
      ? JSON.stringify(data.decisionSignals)
      : null;

    this.db.prepare(`
      INSERT INTO routing_training_examples (
        id, created_at, routing_event_id, trace_id, capture_mode, user_id,
        sanitized_input, input_length, pii_redaction_version,
        predicted_complexity, chosen_route, final_tier, matched_tool, decision_signals,
        success, response_time_ms,
        user_correction_within_1_turn, retry_count, escalated_after_response,
        quality_score, candidate_label, candidate_label_source, candidate_label_confidence,
        label_status, reviewed_by, reviewed_at, review_notes,
        split, dataset_version, exported_at
      )
      VALUES (?, datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.routingEventId || null,
      data.traceId || null,
      data.captureMode,
      data.userId || this.userId,
      data.sanitizedInput,
      data.inputLength ?? data.sanitizedInput.length,
      data.piiRedactionVersion,
      data.predictedComplexity || null,
      data.chosenRoute,
      data.finalTier,
      data.matchedTool || null,
      decisionSignalsJson,
      data.success ? 1 : 0,
      Math.max(0, Math.round(data.responseTimeMs)),
      data.userCorrectionWithin1Turn ? 1 : 0,
      Math.max(0, Math.floor(data.retryCount ?? 0)),
      data.escalatedAfterResponse ? 1 : 0,
      data.qualityScore ?? null,
      data.candidateLabel ?? null,
      data.candidateLabelSource ?? null,
      data.candidateLabelConfidence ?? null,
      data.labelStatus ?? 'pending',
      data.reviewedBy ?? null,
      data.reviewedAt ?? null,
      data.reviewNotes ?? null,
      data.split ?? null,
      data.datasetVersion ?? null,
      data.exportedAt ?? null,
    );

    return id;
  }

  /**
   * Query routing training examples for review/export.
   */
  listRoutingTrainingExamples(filters: RoutingTrainingExampleFilters = {}): RoutingTrainingExampleRecord[] {
    let query = `
      SELECT id, created_at, routing_event_id, trace_id, capture_mode, user_id,
             sanitized_input, input_length, pii_redaction_version,
             predicted_complexity, chosen_route, final_tier, matched_tool, decision_signals,
             success, response_time_ms,
             user_correction_within_1_turn, retry_count, escalated_after_response,
             quality_score, candidate_label, candidate_label_source, candidate_label_confidence,
             label_status, reviewed_by, reviewed_at, review_notes,
             split, dataset_version, exported_at
      FROM routing_training_examples
      WHERE 1=1
    `;

    const params: any[] = [];

    if (filters.userId) {
      query += ' AND user_id = ?';
      params.push(filters.userId);
    }

    if (filters.labelStatus) {
      query += ' AND label_status = ?';
      params.push(filters.labelStatus);
    }

    if (filters.datasetVersion) {
      query += ' AND dataset_version = ?';
      params.push(filters.datasetVersion);
    }

    if (filters.captureMode) {
      query += ' AND capture_mode = ?';
      params.push(filters.captureMode);
    }

    if (filters.minCandidateConfidence !== undefined) {
      query += ' AND candidate_label_confidence >= ?';
      params.push(filters.minCandidateConfidence);
    }

    query += ' ORDER BY created_at DESC';
    query += ' LIMIT ?';
    params.push(filters.limit ?? 100);

    const rows = this.db.prepare(query).all(...params) as any[];

    return rows.map(row => ({
      id: row.id,
      createdAt: row.created_at,
      routingEventId: row.routing_event_id || undefined,
      traceId: row.trace_id || undefined,
      captureMode: row.capture_mode,
      userId: row.user_id,
      sanitizedInput: row.sanitized_input,
      inputLength: row.input_length,
      piiRedactionVersion: row.pii_redaction_version,
      predictedComplexity: row.predicted_complexity || undefined,
      chosenRoute: row.chosen_route,
      finalTier: row.final_tier,
      matchedTool: row.matched_tool || undefined,
      decisionSignals: row.decision_signals ? JSON.parse(row.decision_signals) : [],
      success: row.success === 1,
      responseTimeMs: row.response_time_ms,
      userCorrectionWithin1Turn: row.user_correction_within_1_turn === 1,
      retryCount: row.retry_count,
      escalatedAfterResponse: row.escalated_after_response === 1,
      qualityScore: row.quality_score ?? undefined,
      candidateLabel: row.candidate_label || undefined,
      candidateLabelSource: row.candidate_label_source || undefined,
      candidateLabelConfidence: row.candidate_label_confidence ?? undefined,
      labelStatus: row.label_status,
      reviewedBy: row.reviewed_by || undefined,
      reviewedAt: row.reviewed_at || undefined,
      reviewNotes: row.review_notes || undefined,
      split: row.split || undefined,
      datasetVersion: row.dataset_version || undefined,
      exportedAt: row.exported_at || undefined,
    }));
  }

  getRoutingTrainingExample(id: string): RoutingTrainingExampleRecord | null {
    const row = this.db.prepare(`
      SELECT id, created_at, routing_event_id, trace_id, capture_mode, user_id,
             sanitized_input, input_length, pii_redaction_version,
             predicted_complexity, chosen_route, final_tier, matched_tool, decision_signals,
             success, response_time_ms,
             user_correction_within_1_turn, retry_count, escalated_after_response,
             quality_score, candidate_label, candidate_label_source, candidate_label_confidence,
             label_status, reviewed_by, reviewed_at, review_notes,
             split, dataset_version, exported_at
      FROM routing_training_examples
      WHERE id = ?
      LIMIT 1
    `).get(id) as any;

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      createdAt: row.created_at,
      routingEventId: row.routing_event_id || undefined,
      traceId: row.trace_id || undefined,
      captureMode: row.capture_mode,
      userId: row.user_id,
      sanitizedInput: row.sanitized_input,
      inputLength: row.input_length,
      piiRedactionVersion: row.pii_redaction_version,
      predictedComplexity: row.predicted_complexity || undefined,
      chosenRoute: row.chosen_route,
      finalTier: row.final_tier,
      matchedTool: row.matched_tool || undefined,
      decisionSignals: row.decision_signals ? JSON.parse(row.decision_signals) : [],
      success: row.success === 1,
      responseTimeMs: row.response_time_ms,
      userCorrectionWithin1Turn: row.user_correction_within_1_turn === 1,
      retryCount: row.retry_count,
      escalatedAfterResponse: row.escalated_after_response === 1,
      qualityScore: row.quality_score ?? undefined,
      candidateLabel: row.candidate_label || undefined,
      candidateLabelSource: row.candidate_label_source || undefined,
      candidateLabelConfidence: row.candidate_label_confidence ?? undefined,
      labelStatus: row.label_status,
      reviewedBy: row.reviewed_by || undefined,
      reviewedAt: row.reviewed_at || undefined,
      reviewNotes: row.review_notes || undefined,
      split: row.split || undefined,
      datasetVersion: row.dataset_version || undefined,
      exportedAt: row.exported_at || undefined,
    };
  }

  /**
   * Update mutable routing training fields during enrichment/review.
   */
  updateRoutingTrainingExample(id: string, update: RoutingTrainingExampleUpdate): boolean {
    const sets: string[] = [];
    const params: any[] = [];

    if (update.userCorrectionWithin1Turn !== undefined) {
      sets.push('user_correction_within_1_turn = ?');
      params.push(update.userCorrectionWithin1Turn ? 1 : 0);
    }

    if (update.retryCount !== undefined) {
      sets.push('retry_count = ?');
      params.push(Math.max(0, Math.floor(update.retryCount)));
    }

    if (update.escalatedAfterResponse !== undefined) {
      sets.push('escalated_after_response = ?');
      params.push(update.escalatedAfterResponse ? 1 : 0);
    }

    if (update.qualityScore !== undefined) {
      sets.push('quality_score = ?');
      params.push(update.qualityScore);
    }

    if (update.candidateLabel !== undefined) {
      sets.push('candidate_label = ?');
      params.push(update.candidateLabel);
    }

    if (update.candidateLabelSource !== undefined) {
      sets.push('candidate_label_source = ?');
      params.push(update.candidateLabelSource);
    }

    if (update.candidateLabelConfidence !== undefined) {
      sets.push('candidate_label_confidence = ?');
      params.push(update.candidateLabelConfidence);
    }

    if (update.labelStatus !== undefined) {
      sets.push('label_status = ?');
      params.push(update.labelStatus);
    }

    if (update.reviewedBy !== undefined) {
      sets.push('reviewed_by = ?');
      params.push(update.reviewedBy);
    }

    if (update.reviewedAt !== undefined) {
      sets.push('reviewed_at = ?');
      params.push(update.reviewedAt);
    }

    if (update.reviewNotes !== undefined) {
      sets.push('review_notes = ?');
      params.push(update.reviewNotes);
    }

    if (update.split !== undefined) {
      sets.push('split = ?');
      params.push(update.split);
    }

    if (update.datasetVersion !== undefined) {
      sets.push('dataset_version = ?');
      params.push(update.datasetVersion);
    }

    if (update.exportedAt !== undefined) {
      sets.push('exported_at = ?');
      params.push(update.exportedAt);
    }

    if (sets.length === 0) {
      return false;
    }

    params.push(id);

    const result = this.db.prepare(`
      UPDATE routing_training_examples
      SET ${sets.join(', ')}
      WHERE id = ?
    `).run(...params);

    return result.changes > 0;
  }

  /**
   * Create a training run registry entry.
   */
  createRouterTrainingRun(data: RouterTrainingRunInput): string {
    const id = uuidv4();

    this.db.prepare(`
      INSERT INTO router_training_runs (
        id, created_at, user_id, dataset_version, base_id, base_model, base_model_version,
        output_adapter_version, status, stage, config_json, metrics_json, hardware_json,
        failure_reason, started_at, finished_at
      )
      VALUES (?, datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.userId,
      data.datasetVersion,
      data.baseId ?? null,
      data.baseModel,
      data.baseModelVersion ?? null,
      data.outputAdapterVersion ?? null,
      data.status,
      data.stage,
      JSON.stringify(data.config),
      data.metrics ? JSON.stringify(data.metrics) : null,
      data.hardware ? JSON.stringify(data.hardware) : null,
      data.failureReason ?? null,
      data.startedAt ?? null,
      data.finishedAt ?? null,
    );

    return id;
  }

  /**
   * Get a single training run by id.
   */
  getRouterTrainingRun(runId: string): RouterTrainingRunRecord | null {
    const row = this.db.prepare(`
      SELECT id, created_at, user_id, dataset_version, base_id, base_model, base_model_version,
             output_adapter_version, status, stage, config_json, metrics_json, hardware_json,
             failure_reason, started_at, finished_at
      FROM router_training_runs
      WHERE id = ?
      LIMIT 1
    `).get(runId) as any;

    if (!row) {
      return null;
    }

    const parseObject = (value: string | null): Record<string, unknown> | undefined => {
      if (!value) return undefined;
      try {
        const parsed = JSON.parse(value);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        // ignore parse errors and fall back to undefined
      }
      return undefined;
    };

    return {
      id: row.id,
      createdAt: row.created_at,
      userId: row.user_id,
      datasetVersion: row.dataset_version,
      baseId: row.base_id || undefined,
      baseModel: row.base_model,
      baseModelVersion: row.base_model_version || undefined,
      outputAdapterVersion: row.output_adapter_version || undefined,
      status: row.status,
      stage: row.stage,
      config: parseObject(row.config_json) ?? {},
      metrics: parseObject(row.metrics_json),
      hardware: parseObject(row.hardware_json),
      failureReason: row.failure_reason || undefined,
      startedAt: row.started_at || undefined,
      finishedAt: row.finished_at || undefined,
    };
  }

  /**
   * List training runs with optional user/status filters.
   */
  listRouterTrainingRuns(filters: RouterTrainingRunFilters = {}): RouterTrainingRunRecord[] {
    let query = `
      SELECT id, created_at, user_id, dataset_version, base_model, base_model_version,
             output_adapter_version, status, stage, config_json, metrics_json, hardware_json,
             failure_reason, started_at, finished_at
      FROM router_training_runs
      WHERE 1=1
    `;

    const params: any[] = [];

    if (filters.userId) {
      query += ' AND user_id = ?';
      params.push(filters.userId);
    }

    if (filters.status) {
      query += ' AND status = ?';
      params.push(filters.status);
    }

    query += ' ORDER BY created_at DESC';
    query += ' LIMIT ?';
    params.push(filters.limit ?? 50);

    const rows = this.db.prepare(query).all(...params) as any[];

    const parseObject = (value: string | null): Record<string, unknown> | undefined => {
      if (!value) return undefined;
      try {
        const parsed = JSON.parse(value);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        // ignore parse errors and fall back to undefined
      }
      return undefined;
    };

    return rows.map(row => ({
      id: row.id,
      createdAt: row.created_at,
      userId: row.user_id,
      datasetVersion: row.dataset_version,
      baseModel: row.base_model,
      baseModelVersion: row.base_model_version || undefined,
      outputAdapterVersion: row.output_adapter_version || undefined,
      status: row.status,
      stage: row.stage,
      config: parseObject(row.config_json) ?? {},
      metrics: parseObject(row.metrics_json),
      hardware: parseObject(row.hardware_json),
      failureReason: row.failure_reason || undefined,
      startedAt: row.started_at || undefined,
      finishedAt: row.finished_at || undefined,
    }));
  }

  /**
   * Update run status/stage and associated metadata.
   */
  updateRouterTrainingRunStatus(runId: string, update: RouterTrainingRunStatusUpdate): boolean {
    const sets: string[] = [];
    const params: any[] = [];

    if (update.status !== undefined) {
      sets.push('status = ?');
      params.push(update.status);
    }

    if (update.stage !== undefined) {
      sets.push('stage = ?');
      params.push(update.stage);
    }

    if (update.baseId !== undefined) {
      sets.push('base_id = ?');
      params.push(update.baseId);
    }

    if (update.outputAdapterVersion !== undefined) {
      sets.push('output_adapter_version = ?');
      params.push(update.outputAdapterVersion);
    }

    if (update.metrics !== undefined) {
      sets.push('metrics_json = ?');
      params.push(JSON.stringify(update.metrics));
    }

    if (update.hardware !== undefined) {
      sets.push('hardware_json = ?');
      params.push(JSON.stringify(update.hardware));
    }

    if (update.failureReason !== undefined) {
      sets.push('failure_reason = ?');
      params.push(update.failureReason);
    }

    if (update.startedAt !== undefined) {
      sets.push('started_at = ?');
      params.push(update.startedAt);
    }

    if (update.finishedAt !== undefined) {
      sets.push('finished_at = ?');
      params.push(update.finishedAt);
    }

    if (sets.length === 0) {
      return false;
    }

    params.push(runId);

    const result = this.db.prepare(`
      UPDATE router_training_runs
      SET ${sets.join(', ')}
      WHERE id = ?
    `).run(...params);

    return result.changes > 0;
  }

  /**
   * Register an adapter artifact and lifecycle state.
   */
  registerRouterAdapter(data: RouterAdapterInput): string {
    const id = uuidv4();

    this.db.prepare(`
      INSERT INTO router_adapters (
        id, created_at, user_id, adapter_version, base_id, base_model, base_model_version,
        source_run_id, path, format, lifecycle_state,
        promoted_at, rolled_back_at, rollback_reason, runtime_binding_json, eval_summary_json
      )
      VALUES (?, datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.userId,
      data.adapterVersion,
      data.baseId ?? null,
      data.baseModel,
      data.baseModelVersion ?? null,
      data.sourceRunId ?? null,
      data.path,
      data.format,
      data.lifecycleState,
      data.promotedAt ?? null,
      data.rolledBackAt ?? null,
      data.rollbackReason ?? null,
      data.runtimeBinding ? JSON.stringify(data.runtimeBinding) : null,
      data.evalSummary ? JSON.stringify(data.evalSummary) : null,
    );

    return id;
  }

  /**
   * Look up an adapter by source run id or adapter version.
   */
  getRouterAdapter(filters: {
    id?: string;
    userId?: string;
    adapterVersion?: string;
    sourceRunId?: string;
  }): RouterAdapterRecord | null {
    let query = `
      SELECT id, created_at, user_id, adapter_version, base_id, base_model, base_model_version,
             source_run_id, path, format, lifecycle_state, promoted_at,
             rolled_back_at, rollback_reason, runtime_binding_json, eval_summary_json
      FROM router_adapters
      WHERE 1=1
    `;

    const params: any[] = [];

    if (filters.id) {
      query += ' AND id = ?';
      params.push(filters.id);
    }

    if (filters.userId) {
      query += ' AND user_id = ?';
      params.push(filters.userId);
    }

    if (filters.adapterVersion) {
      query += ' AND adapter_version = ?';
      params.push(filters.adapterVersion);
    }

    if (filters.sourceRunId) {
      query += ' AND source_run_id = ?';
      params.push(filters.sourceRunId);
    }

    query += ' ORDER BY datetime(created_at) DESC LIMIT 1';

    const row = this.db.prepare(query).get(...params) as any;
    if (!row) {
      return null;
    }

    const runtimeBinding = parseAdapterRuntimeBinding(row.runtime_binding_json);
    const evalSummary = parseJsonObject(row.eval_summary_json);

    return {
      id: row.id,
      createdAt: row.created_at,
      userId: row.user_id,
      adapterVersion: row.adapter_version,
      baseId: row.base_id || undefined,
      baseModel: row.base_model,
      baseModelVersion: row.base_model_version || undefined,
      sourceRunId: row.source_run_id || undefined,
      path: row.path,
      format: row.format,
      lifecycleState: row.lifecycle_state,
      promotedAt: row.promoted_at || undefined,
      rolledBackAt: row.rolled_back_at || undefined,
      rollbackReason: row.rollback_reason || undefined,
      runtimeBinding,
      evalSummary,
    };
  }

  /**
   * Update adapter lifecycle state and metadata.
   */
  updateRouterAdapterLifecycle(adapterId: string, update: RouterAdapterLifecycleUpdate): boolean {
    const sets: string[] = [];
    const params: any[] = [];

    if (update.lifecycleState !== undefined) {
      sets.push('lifecycle_state = ?');
      params.push(update.lifecycleState);
    }

    if (update.promotedAt !== undefined) {
      sets.push('promoted_at = ?');
      params.push(update.promotedAt);
    }

    if (update.rolledBackAt !== undefined) {
      sets.push('rolled_back_at = ?');
      params.push(update.rolledBackAt);
    }

    if (update.rollbackReason !== undefined) {
      sets.push('rollback_reason = ?');
      params.push(update.rollbackReason);
    }

    if (update.runtimeBinding !== undefined) {
      sets.push('runtime_binding_json = ?');
      params.push(update.runtimeBinding ? JSON.stringify(update.runtimeBinding) : null);
    }

    if (update.evalSummary !== undefined) {
      sets.push('eval_summary_json = ?');
      params.push(JSON.stringify(update.evalSummary));
    }

    if (sets.length === 0) {
      return false;
    }

    params.push(adapterId);

    const result = this.db.prepare(`
      UPDATE router_adapters
      SET ${sets.join(', ')}
      WHERE id = ?
    `).run(...params);

    return result.changes > 0;
  }

  /**
   * List adapters with optional user/state filters.
   */
  listRouterAdapters(filters: RouterAdapterFilters = {}): RouterAdapterRecord[] {
    let query = `
      SELECT id, created_at, user_id, adapter_version, base_model, base_model_version,
             source_run_id, path, format, lifecycle_state, promoted_at,
             rolled_back_at, rollback_reason, runtime_binding_json, eval_summary_json
      FROM router_adapters
      WHERE 1=1
    `;

    const params: any[] = [];

    if (filters.userId) {
      query += ' AND user_id = ?';
      params.push(filters.userId);
    }

    if (filters.lifecycleState) {
      query += ' AND lifecycle_state = ?';
      params.push(filters.lifecycleState);
    }

    query += ' ORDER BY datetime(created_at) DESC LIMIT ?';
    params.push(filters.limit ?? 50);

    const rows = this.db.prepare(query).all(...params) as any[];

    return rows.map((row) => {
      const runtimeBinding = parseAdapterRuntimeBinding(row.runtime_binding_json);
      const evalSummary = parseJsonObject(row.eval_summary_json);

      return {
        id: row.id,
        createdAt: row.created_at,
        userId: row.user_id,
        adapterVersion: row.adapter_version,
        baseModel: row.base_model,
        baseModelVersion: row.base_model_version || undefined,
        sourceRunId: row.source_run_id || undefined,
        path: row.path,
        format: row.format,
        lifecycleState: row.lifecycle_state,
        promotedAt: row.promoted_at || undefined,
        rolledBackAt: row.rolled_back_at || undefined,
        rollbackReason: row.rollback_reason || undefined,
        runtimeBinding,
        evalSummary,
      };
    });
  }

  /**
   * Activate an adapter for a user and archive prior active/shadow/canary states.
   */
  setActiveRouterAdapter(userId: string, adapterId: string): boolean {
    let changed = false;

    const tx = this.db.transaction(() => {
      this.db.prepare(`
        UPDATE router_adapters
        SET lifecycle_state = 'archived'
        WHERE user_id = ?
        AND lifecycle_state IN ('active', 'shadow', 'canary')
      `).run(userId);

      const result = this.db.prepare(`
        UPDATE router_adapters
        SET lifecycle_state = 'active',
            promoted_at = datetime('now'),
            rolled_back_at = NULL,
            rollback_reason = NULL
        WHERE id = ? AND user_id = ?
      `).run(adapterId, userId);

      changed = result.changes > 0;
    });

    tx();
    return changed;
  }

  /**
   * Roll back current active adapter and restore latest archived candidate if available.
   */
  rollbackRouterAdapter(userId: string, reason: string = 'manual-rollback'): RouterAdapterRollbackResult {
    const active = this.db.prepare(`
      SELECT id
      FROM router_adapters
      WHERE user_id = ? AND lifecycle_state = 'active'
      ORDER BY datetime(promoted_at) DESC, datetime(created_at) DESC
      LIMIT 1
    `).get(userId) as { id: string } | undefined;

    if (!active) {
      return {};
    }

    const fallback = this.db.prepare(`
      SELECT id
      FROM router_adapters
      WHERE user_id = ?
      AND id <> ?
      AND lifecycle_state IN ('archived', 'shadow', 'canary')
      ORDER BY datetime(created_at) DESC
      LIMIT 1
    `).get(userId, active.id) as { id: string } | undefined;

    const result: RouterAdapterRollbackResult = {
      rolledBackAdapterId: active.id,
      restoredAdapterId: fallback?.id,
    };

    const tx = this.db.transaction(() => {
      this.db.prepare(`
        UPDATE router_adapters
        SET lifecycle_state = 'rolled_back',
            rolled_back_at = datetime('now'),
            rollback_reason = ?
        WHERE id = ?
      `).run(reason, active.id);

      if (fallback) {
        this.db.prepare(`
          UPDATE router_adapters
          SET lifecycle_state = 'active',
              promoted_at = datetime('now'),
              rolled_back_at = NULL,
              rollback_reason = NULL
          WHERE id = ?
        `).run(fallback.id);
      }
    });

    tx();
    return result;
  }

  // ==========================================================================
  // Phase 5: Memory System Enhancements
  // ==========================================================================

  /**
   * Get observations filtered by activation tier.
   * Hot tier (>0.7): Frequently accessed, recent, high confidence
   * Warm tier (0.4-0.7): Moderately accessed
   * Cold tier (<0.4): Rarely accessed
   */
  getObservationsByActivation(entityId: string, tier: 'hot' | 'warm' | 'cold'): Observation[] {
    const thresholds = {
      hot: 0.7,
      warm: 0.4,
      cold: 0.0
    };

    const minScore = thresholds[tier];
    const maxScore = tier === 'hot' ? 1.0 : (tier === 'warm' ? 0.7 : 0.4);

    const query = `
      SELECT id, entity_id, key, value, value_type,
             source_type, source_id, confidence,
             observed_at, expires_at, supersedes, search_text
      FROM observations
      WHERE entity_id = ?
      AND (expires_at IS NULL OR datetime(expires_at) > datetime('now'))
      AND activation_score >= ?
      AND activation_score < ?
      ORDER BY activation_score DESC, observed_at DESC
    `;

    const rows = this.db.prepare(query).all(entityId, minScore, maxScore) as any[];

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

  /**
   * Update activation score when an observation is accessed.
   * Activation formula: (0.4 × recency) + (0.3 × frequency) + (0.3 × confidence)
   * - recency: exponential decay (half-life 30 days)
   * - frequency: log scale (10 accesses = 1.0)
   */
  updateActivation(observationId: string): void {
    try {
      // Get current observation data
      const obs = this.db.prepare(`
        SELECT confidence, observed_at, access_count, last_accessed_at
        FROM observations
        WHERE id = ?
      `).get(observationId) as any;

      if (!obs) return;

      const now = new Date();
      const observedAt = new Date(obs.observed_at);
      const daysSinceObserved = (now.getTime() - observedAt.getTime()) / (1000 * 60 * 60 * 24);

      // Calculate recency component (exponential decay, half-life 30 days)
      const recency = Math.exp(-0.693 * daysSinceObserved / 30);

      // Calculate frequency component (log scale, 10 accesses = 1.0)
      const newAccessCount = (obs.access_count || 0) + 1;
      const frequency = Math.min(1.0, Math.log10(newAccessCount + 1) / Math.log10(11));

      // Confidence component (already normalized 0-1)
      const confidence = obs.confidence;

      // Combined activation score
      const activation = (0.4 * recency) + (0.3 * frequency) + (0.3 * confidence);

      // Update database
      this.db.prepare(`
        UPDATE observations
        SET access_count = ?,
            last_accessed_at = datetime('now'),
            activation_score = ?
        WHERE id = ?
      `).run(newAccessCount, activation, observationId);

      debug('Updated activation', {
        id: observationId.slice(0, 8),
        activation: Math.round(activation * 100) / 100,
        accessCount: newAccessCount
      });
    } catch (err) {
      warn('Failed to update activation', { error: String(err) });
    }
  }

  /**
   * Decay activation scores for all observations.
   * Reduces activation by 1% daily for observations not accessed recently.
   * This prevents the system from being overwhelmed by old memories.
   */
  decayActivationScores(): number {
    const decayFactor = 0.99; // 1% decay per day

    const result = this.db.prepare(`
      UPDATE observations
      SET activation_score = activation_score * ?
      WHERE last_accessed_at IS NULL
         OR datetime(last_accessed_at) < datetime('now', '-1 day')
    `).run(decayFactor);

    if (result.changes > 0) {
      info('Decayed activation scores', { count: result.changes, factor: decayFactor });
    }

    return result.changes;
  }

  /**
   * Find similar observations for consolidation.
   * Groups observations by key where values are very similar.
   */
  findSimilarObservations(entityId: string): Array<{ key: string; observations: Observation[] }> {
    const allObs = this.getObservations(entityId, { notExpired: true });

    // Group by key
    const grouped = new Map<string, Observation[]>();
    for (const obs of allObs) {
      const existing = grouped.get(obs.key) || [];
      existing.push(obs);
      grouped.set(obs.key, existing);
    }

    // Find keys with 3+ similar observations
    const candidates: Array<{ key: string; observations: Observation[] }> = [];
    for (const [key, observations] of grouped.entries()) {
      if (observations.length >= 3) {
        // Check if values are similar (exact match for now)
        const values = new Set(observations.map(o => o.value));
        if (values.size === 1) {
          // All observations have the same value - perfect consolidation candidate
          candidates.push({ key, observations });
        }
      }
    }

    return candidates;
  }

  /**
   * Consolidate similar observations into a single high-confidence observation.
   * Uses supersedes chains to preserve history.
   */
  consolidateObservations(entityId: string): number {
    const candidates = this.findSimilarObservations(entityId);
    let consolidated = 0;

    for (const { key, observations } of candidates) {
      // Sort by observed_at to get the most recent
      const sorted = observations.sort((a, b) =>
        new Date(b.observedAt).getTime() - new Date(a.observedAt).getTime()
      );

      const latest = sorted[0];
      const older = sorted.slice(1);

      // Boost confidence based on multiple confirmations
      const boostedConfidence = Math.min(0.95, latest.confidence + (older.length * 0.05));

      // Create consolidated observation that supersedes the latest
      // The consolidated observation inherits the supersedes chain from the latest
      this.recordObservation({
        entityId,
        key,
        value: latest.value,
        valueType: latest.valueType,
        sourceType: 'computed',
        confidence: boostedConfidence,
        supersedes: latest.id
      });

      // Expire older parallel observations so they don't appear in queries
      // This handles the case where we have multiple independent observations
      // rather than a proper supersedes chain
      for (const old of older) {
        this.db.prepare(`
          UPDATE observations
          SET expires_at = datetime('now', '-1 second')
          WHERE id = ?
        `).run(old.id);
      }

      consolidated++;
      info('Consolidated observations', {
        key,
        count: observations.length,
        newConfidence: boostedConfidence
      });
    }

    return consolidated;
  }

  /**
   * Search observations with relationship-aware context enrichment.
   * Follows relationship chains to include related observations.
   */
  searchObservationsWithRelationships(
    query: string,
    limit: number = 10,
    maxDepth: number = 2
  ): Array<Observation & { relatedContext?: string[] }> {
    // First, do standard FTS search
    const baseResults = this.searchObservations(query, limit);

    // Enrich with relationship context
    const enriched = baseResults.map(obs => {
      const relatedContext = this.getRelationshipContext(obs.entityId, maxDepth);
      return {
        ...obs,
        relatedContext: relatedContext.length > 0 ? relatedContext : undefined
      };
    });

    // Sort by relevance (relationship count boosts score)
    return enriched.sort((a, b) => {
      const aScore = (a.relatedContext?.length || 0) * 0.1 + a.confidence;
      const bScore = (b.relatedContext?.length || 0) * 0.1 + b.confidence;
      return bScore - aScore;
    });
  }

  /**
   * Get relationship context for an entity by following relationship chains.
   * Returns hot observations from related entities (max depth = 2 hops).
   */
  getRelationshipContext(entityId: string, maxDepth: number = 2): string[] {
    const context: string[] = [];
    const visited = new Set<string>([entityId]);

    const traverse = (currentId: string, depth: number) => {
      if (depth >= maxDepth) return;

      // Get relationships for current entity
      const relationships = this.getRelationships(currentId);

      for (const rel of relationships) {
        // Determine the related entity (could be from or to)
        const relatedId = rel.fromEntity === currentId ? rel.toEntity : rel.fromEntity;

        if (visited.has(relatedId)) continue;
        visited.add(relatedId);

        // Get hot observations from related entity
        const relatedObs = this.getObservationsByActivation(relatedId, 'hot').slice(0, 3);

        for (const obs of relatedObs) {
          context.push(`[${rel.relationType}] ${obs.key}: ${obs.value.slice(0, 60)}`);
        }

        // Recurse for next level
        traverse(relatedId, depth + 1);
      }
    };

    traverse(entityId, 0);
    return context;
  }

  close(): void {
    // Nothing to close - db is managed by parent
  }
}

function parseJsonObject(value: string | null): Record<string, unknown> | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // ignore parse errors
  }
  return undefined;
}

function parseAdapterRuntimeBinding(value: string | null): RouterAdapterRuntimeBinding | undefined {
  const parsed = parseJsonObject(value);
  if (!parsed) return undefined;

  const model = typeof parsed.model === 'string' ? parsed.model.trim() : '';
  if (!model) return undefined;

  return {
    model,
    modelVersion: typeof parsed.modelVersion === 'string' && parsed.modelVersion.trim()
      ? parsed.modelVersion.trim()
      : undefined,
    updatedAt: typeof parsed.updatedAt === 'string' && parsed.updatedAt.trim()
      ? parsed.updatedAt.trim()
      : undefined,
    notes: typeof parsed.notes === 'string' && parsed.notes.trim()
      ? parsed.notes.trim()
      : undefined,
  };
}
