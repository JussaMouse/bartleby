// src/services/garden.ts
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import chokidar, { FSWatcher } from 'chokidar';
import { Config, resolvePath, getDbPath, ensureDir } from '../config.js';
import { sanitizeFilename } from '../utils/markdown.js';
import { parseGardenPage, toGardenPage, extractTitle } from '../utils/garden-parser.js';
import { info, warn, error, debug } from '../utils/logger.js';
import type { CalendarService } from './calendar.js';
import type { SchedulerService } from './scheduler.js';
import { FactsService } from './facts.js';
import { EventBus, getEventBus } from '../events/EventBus.js';
import { QueryBuilder } from '../query/QueryBuilder.js';
import { GardenGraph } from '../graph/GardenGraph.js';
import { ViewCache } from '../views/ViewCache.js';

// === Types ===

// GTD types: item → action → completed (workflow)
// Wiki types: entry, note, contact, media, list, daily (persistent knowledge)
export type RecordType =
  | 'item'      // Raw inbox, unprocessed
  | 'action'    // Doable next step
  | 'project'   // Multi-action outcome
  | 'entry'     // Wiki/encyclopedia page
  | 'note'      // Reference/scratch notes
  | 'contact'   // Person
  | 'media'     // File attachment
  | 'list'      // Curated collection
  | 'daily';    // Journal entry
export type RecordStatus = 'active' | 'completed' | 'archived' | 'someday' | 'waiting';
export type PrivacyLevel = 'public' | 'private' | 'confidential';

export interface GardenRecord {
  id: string;
  type: RecordType;
  title: string;
  status: RecordStatus;
  context?: string;
  project?: string;
  privacy?: PrivacyLevel;  // Explicit privacy setting
  due_date?: string;
  email?: string;
  phone?: string;
  birthday?: string;
  content?: string;
  tags?: string[];
  contacts?: string[];  // Array of contact record IDs
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

export interface TaskFilters {
  status?: RecordStatus | RecordStatus[];
  context?: string;
  project?: string;
  type?: RecordType;
  dueBefore?: string;
  dueAfter?: string;
}

// Relationship types for graph structure
export type RelationType =
  | 'parent'      // Child belongs to parent (action → project)
  | 'child'       // Parent has children (project → action)
  | 'reference'   // Explicit reference (action → contact, note → note)
  | 'mentions';   // Extracted from [[wiki links]] in content

export interface Relationship {
  id: string;
  sourceId: string;
  sourceType: RecordType;
  targetId: string;
  targetType: RecordType;
  relationType: RelationType;
  metadata?: Record<string, unknown>;  // e.g., { role: 'primary', strength: 0.8 }
  created_at: string;
}

// === Schema ===

const SCHEMA = `
CREATE TABLE IF NOT EXISTS garden_records (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  context TEXT,
  project TEXT,
  privacy TEXT,
  due_date TEXT,
  email TEXT,
  phone TEXT,
  birthday TEXT,
  content TEXT,
  tags TEXT,
  metadata TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS garden_links (
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  link_text TEXT,
  PRIMARY KEY (source_id, target_id)
);

CREATE TABLE IF NOT EXISTS context_facts (
  record_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT,
  PRIMARY KEY (record_id, key)
);

CREATE TABLE IF NOT EXISTS garden_relationships (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  relation_type TEXT NOT NULL,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_garden_type ON garden_records(type);
CREATE INDEX IF NOT EXISTS idx_garden_status ON garden_records(status);
CREATE INDEX IF NOT EXISTS idx_garden_context ON garden_records(context);
CREATE INDEX IF NOT EXISTS idx_garden_project ON garden_records(project);
CREATE INDEX IF NOT EXISTS idx_garden_due ON garden_records(due_date);
CREATE INDEX IF NOT EXISTS idx_garden_privacy ON garden_records(privacy);
CREATE INDEX IF NOT EXISTS idx_facts_record ON context_facts(record_id);
CREATE INDEX IF NOT EXISTS idx_facts_key ON context_facts(key);
CREATE INDEX IF NOT EXISTS idx_facts_expires ON context_facts(expires_at);
CREATE INDEX IF NOT EXISTS idx_rel_source ON garden_relationships(source_id);
CREATE INDEX IF NOT EXISTS idx_rel_target ON garden_relationships(target_id);
CREATE INDEX IF NOT EXISTS idx_rel_type ON garden_relationships(relation_type);
CREATE INDEX IF NOT EXISTS idx_rel_source_type ON garden_relationships(source_id, relation_type);
`;

// Migrations for existing databases
const MIGRATIONS = [
  `ALTER TABLE garden_records ADD COLUMN contacts TEXT`,  // JSON array of contact IDs
  `ALTER TABLE garden_records ADD COLUMN privacy TEXT`,   // Privacy level
];

// === Service ===

export class GardenService {
  private db: Database.Database;
  private gardenPath: string;
  private archivePath: string;
  private watcher?: FSWatcher;
  private syncing = false;
  private calendar?: CalendarService;
  private scheduler?: SchedulerService;
  private facts: FactsService;
  private eventBus: EventBus;
  private _graphInstance?: GardenGraph;
  private _viewCacheInstance?: ViewCache;

  getDatabase(): Database.Database {
    return this.db;
  }

  constructor(private config: Config) {
    const dbPath = getDbPath(config, 'garden.sqlite3');
    ensureDir(path.dirname(dbPath));

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.gardenPath = resolvePath(config, 'garden');
    this.archivePath = path.join(this.gardenPath, 'archive.log');

    // Initialize FactsService for tracking record metadata
    this.facts = new FactsService(this.db);
    debug('FactsService initialized');

    // Initialize EventBus for loose coupling
    this.eventBus = getEventBus();
    debug('EventBus connected');

    // Listen for relationship changes to invalidate graph cache
    this.eventBus.on('relationship.created', () => {
      if (this._graphInstance) {
        this._graphInstance.invalidate();
      }
    });

    this.eventBus.on('relationship.deleted', () => {
      if (this._graphInstance) {
        this._graphInstance.invalidate();
      }
    });

    // Listen for record changes to invalidate view cache
    this.eventBus.on('record.updated', (event: any) => {
      if (this._viewCacheInstance && event.record) {
        this._viewCacheInstance.invalidate(event.record.id);
      }
    });

    this.eventBus.on('record.deleted', (event: any) => {
      if (this._viewCacheInstance && event.record) {
        this._viewCacheInstance.invalidate(event.record.id);
      }
    });

    this.eventBus.on('relationship.created', (event: any) => {
      if (this._viewCacheInstance && event.sourceId && event.targetId) {
        // Invalidate both source and target
        this._viewCacheInstance.invalidate(event.sourceId);
        this._viewCacheInstance.invalidate(event.targetId);
      }
    });

    this.eventBus.on('relationship.deleted', (event: any) => {
      if (this._viewCacheInstance && event.sourceId && event.targetId) {
        // Invalidate both source and target
        this._viewCacheInstance.invalidate(event.sourceId);
        this._viewCacheInstance.invalidate(event.targetId);
      }
    });
  }

  /**
   * Set the calendar service for temporal index integration.
   * Called after both services are initialized.
   */
  setCalendar(calendar: CalendarService): void {
    this.calendar = calendar;
  }

  setScheduler(scheduler: SchedulerService): void {
    this.scheduler = scheduler;
  }

  /**
   * Get the FactsService instance for tracking record metadata.
   */
  getFactsService(): FactsService {
    return this.facts;
  }

  /**
   * Get the EventBus instance for listening to garden events.
   */
  getEventBus(): EventBus {
    return this.eventBus;
  }

  async initialize(): Promise<void> {
    this.db.exec(SCHEMA);

    // Run migrations for existing databases
    for (const migration of MIGRATIONS) {
      try {
        this.db.exec(migration);
        debug('Migration applied', { migration: migration.substring(0, 50) });
      } catch (err) {
        // Column already exists or other issue - check if it's the expected error
        const errMsg = String(err);
        if (errMsg.includes('duplicate column name')) {
          debug('Migration skipped (column exists)', { migration: migration.substring(0, 50) });
        } else {
          warn('Migration failed', { migration: migration.substring(0, 50), error: errMsg });
        }
      }
    }

    // Verify critical columns exist
    try {
      const tableInfo = this.db.prepare('PRAGMA table_info(garden_records)').all() as any[];
      const columns = tableInfo.map((col: any) => col.name);
      const requiredColumns = ['privacy', 'contacts'];
      const missing = requiredColumns.filter(col => !columns.includes(col));

      if (missing.length > 0) {
        error('Database schema is missing required columns', { missing });
        throw new Error(`Database schema outdated. Missing columns: ${missing.join(', ')}. Please delete database/garden.sqlite3 and restart.`);
      }

      debug('Database schema verified', { columns });
    } catch (err) {
      if ((err as Error).message.includes('schema outdated')) throw err;
      warn('Could not verify schema', { error: String(err) });
    }

    ensureDir(this.gardenPath);

    await this.syncFromFiles();
    this.startWatcher();

    info('GardenService initialized', { path: this.gardenPath });
  }

  // === CRUD ===

  create(data: Omit<GardenRecord, 'id' | 'created_at' | 'updated_at'>): GardenRecord {
    const id = uuidv4();
    const now = new Date().toISOString();

    const record: GardenRecord = {
      ...data,
      id,
      status: data.status || 'active',
      created_at: now,
      updated_at: now,
    };

    debug('Creating garden record', {
      type: record.type,
      title: record.title,
      contentLength: record.content?.length || 0,
      hasProject: !!record.project,
      hasTags: (record.tags?.length || 0) > 0,
    });

    this.db.prepare(`
      INSERT INTO garden_records
      (id, type, title, status, context, project, privacy, due_date, email, phone, birthday, content, tags, contacts, metadata, created_at, updated_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.id, record.type, record.title, record.status,
      record.context, record.project, record.privacy,
      record.due_date,
      record.email, record.phone, record.birthday,
      record.content, JSON.stringify(record.tags || []),
      JSON.stringify(record.contacts || []),
      JSON.stringify(record.metadata || {}),
      record.created_at, record.updated_at, record.completed_at
    );

    this.syncToFile(record);

    const filePath = this.getFilePath(record);
    info('Garden record created', {
      id: record.id,
      type: record.type,
      title: record.title,
      filePath,
      fileExists: fs.existsSync(filePath),
    });

    // Sync temporal data to calendar
    this.syncToCalendar(record);

    // Emit event (unless syncing from file to avoid loops)
    if (!this.syncing) {
      this.eventBus.emit({ type: 'record.created', record });
    }

    return record;
  }

  get(id: string): GardenRecord | null {
    const row = this.db.prepare('SELECT * FROM garden_records WHERE id = ?').get(id) as any;
    if (!row) return null;

    const record = this.rowToRecord(row);

    // Track view in facts (unless syncing to avoid noise)
    if (!this.syncing) {
      this.facts.increment(id, 'viewCount');
      this.facts.setFact(id, 'lastViewed', new Date().toISOString());
    }

    return record;
  }

  /**
   * Get effective privacy level for a record (inherited from project if not set explicitly)
   */
  getEffectivePrivacy(record: GardenRecord): PrivacyLevel {
    // If record has explicit privacy, use it
    if (record.privacy) {
      return record.privacy;
    }

    // If record has a project, inherit from project
    if (record.project) {
      const projectPages = this.getByType('project').filter(p => p.status === 'active');
      const project = projectPages.find(p =>
        p.title.toLowerCase().replace(/\s+/g, '-') === record.project?.toLowerCase()
      );

      if (project?.privacy) {
        return project.privacy;
      }
    }

    // Default to public
    return 'public';
  }

  /**
   * Get privacy icon for display
   */
  getPrivacyIcon(level: PrivacyLevel): string {
    switch (level) {
      case 'private': return '🔒';
      case 'confidential': return '🔐';
      default: return '';
    }
  }

  getByTitle(title: string): GardenRecord | null {
    const row = this.db.prepare('SELECT * FROM garden_records WHERE title = ? COLLATE NOCASE').get(title) as any;
    return row ? this.rowToRecord(row) : null;
  }

  update(id: string, updates: Partial<GardenRecord>): GardenRecord | null {
    const existing = this.get(id);
    if (!existing) return null;

    const updated: GardenRecord = {
      ...existing,
      ...updates,
      id: existing.id,
      updated_at: new Date().toISOString(),
    };

    if (updates.status === 'completed' && existing.status !== 'completed') {
      updated.completed_at = updated.updated_at;
    }

    this.db.prepare(`
      UPDATE garden_records SET
        type=?, title=?, status=?, context=?, project=?, privacy=?, due_date=?,
        email=?, phone=?, birthday=?, content=?, tags=?, contacts=?, metadata=?,
        updated_at=?, completed_at=?
      WHERE id=?
    `).run(
      updated.type, updated.title, updated.status,
      updated.context, updated.project, updated.privacy,
      updated.due_date,
      updated.email, updated.phone, updated.birthday,
      updated.content, JSON.stringify(updated.tags || []),
      JSON.stringify(updated.contacts || []),
      JSON.stringify(updated.metadata || {}),
      updated.updated_at, updated.completed_at, id
    );

    this.syncToFile(updated);

    // Sync temporal data to calendar (handles add/update/remove)
    this.syncToCalendar(updated, existing);

    // Track edit in facts (unless syncing to avoid noise)
    if (!this.syncing) {
      this.facts.increment(id, 'editCount');
      this.facts.setFact(id, 'lastEdited', new Date().toISOString());
    }

    // Emit event (unless syncing from file to avoid loops)
    if (!this.syncing) {
      this.eventBus.emit({ type: 'record.updated', record: updated, previous: existing });
    }

    return updated;
  }

  delete(id: string): boolean {
    const record = this.get(id);
    if (!record) return false;

    // Archive before deletion
    this.appendToArchive(record, 'DELETED');

    // Remove from calendar temporal index
    if (this.calendar) {
      this.calendar.removeTemporal('garden', id);
    }

    // Delete file and DB record
    this.deleteFile(record);
    this.deleteFromDb(id);

    // Emit event (unless syncing from file to avoid loops)
    if (!this.syncing) {
      this.eventBus.emit({ type: 'record.deleted', record });
    }

    return true;
  }

  // === Relationships ===

  /**
   * Add a relationship between two records
   */
  addRelationship(
    sourceId: string,
    targetId: string,
    relationType: RelationType,
    metadata?: Record<string, unknown>
  ): Relationship {
    const source = this.get(sourceId);
    const target = this.get(targetId);

    if (!source || !target) {
      throw new Error(`Cannot create relationship: source or target not found`);
    }

    const relationship: Relationship = {
      id: uuidv4(),
      sourceId,
      sourceType: source.type,
      targetId,
      targetType: target.type,
      relationType,
      metadata,
      created_at: new Date().toISOString()
    };

    this.db.prepare(`
      INSERT INTO garden_relationships
      (id, source_id, source_type, target_id, target_type, relation_type, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      relationship.id,
      relationship.sourceId,
      relationship.sourceType,
      relationship.targetId,
      relationship.targetType,
      relationship.relationType,
      JSON.stringify(relationship.metadata || {}),
      relationship.created_at
    );

    debug('Relationship created', {
      id: relationship.id,
      type: relationType,
      from: `${source.type}:${sourceId}`,
      to: `${target.type}:${targetId}`
    });

    // Emit event (unless syncing)
    if (!this.syncing) {
      this.eventBus.emit({
        type: 'relationship.created',
        sourceId,
        targetId,
        relationType
      });
    }

    return relationship;
  }

  /**
   * Remove a relationship between two records
   */
  removeRelationship(sourceId: string, targetId: string, relationType?: RelationType): boolean {
    let sql = 'DELETE FROM garden_relationships WHERE source_id = ? AND target_id = ?';
    const params: any[] = [sourceId, targetId];

    if (relationType) {
      sql += ' AND relation_type = ?';
      params.push(relationType);
    }

    const result = this.db.prepare(sql).run(...params);

    if (result.changes > 0) {
      debug('Relationship removed', { sourceId, targetId, relationType, count: result.changes });

      // Emit event (unless syncing)
      if (!this.syncing && relationType) {
        this.eventBus.emit({
          type: 'relationship.deleted',
          sourceId,
          targetId,
          relationType
        });
      }
    }

    return result.changes > 0;
  }

  /**
   * Get all relationships for a record
   */
  getRelationships(
    recordId: string,
    options?: {
      direction?: 'outgoing' | 'incoming' | 'both';
      types?: RelationType[];
    }
  ): Relationship[] {
    const direction = options?.direction || 'both';
    const types = options?.types;

    let sql = 'SELECT * FROM garden_relationships WHERE ';
    const params: any[] = [];

    if (direction === 'outgoing') {
      sql += 'source_id = ?';
      params.push(recordId);
    } else if (direction === 'incoming') {
      sql += 'target_id = ?';
      params.push(recordId);
    } else {
      sql += '(source_id = ? OR target_id = ?)';
      params.push(recordId, recordId);
    }

    if (types && types.length > 0) {
      sql += ` AND relation_type IN (${types.map(() => '?').join(',')})`;
      params.push(...types);
    }

    const rows = this.db.prepare(sql).all(...params) as any[];

    return rows.map(row => ({
      id: row.id,
      sourceId: row.source_id,
      sourceType: row.source_type,
      targetId: row.target_id,
      targetType: row.target_type,
      relationType: row.relation_type,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      created_at: row.created_at
    }));
  }

  /**
   * Get related records (follows relationships and returns the records)
   */
  getRelatedRecords(
    recordId: string,
    options?: {
      direction?: 'outgoing' | 'incoming' | 'both';
      types?: RelationType[];
      recordTypes?: RecordType[];
    }
  ): GardenRecord[] {
    const relationships = this.getRelationships(recordId, options);
    const relatedIds = new Set<string>();

    for (const rel of relationships) {
      if (rel.sourceId === recordId) {
        relatedIds.add(rel.targetId);
      } else {
        relatedIds.add(rel.sourceId);
      }
    }

    const records = Array.from(relatedIds)
      .map(id => this.get(id))
      .filter((r): r is GardenRecord => r !== null);

    // Filter by record type if specified
    if (options?.recordTypes) {
      return records.filter(r => options.recordTypes!.includes(r.type));
    }

    return records;
  }

  /**
   * Migrate existing project/context/contact fields to relationships table.
   * This is a one-time migration to populate the new relationships system.
   * Old fields are kept for backward compatibility.
   */
  migrateToRelationships(): { created: number; skipped: number; errors: number } {
    info('Starting relationship migration...');

    const stats = { created: 0, skipped: 0, errors: 0 };

    // Temporarily disable events during bulk migration
    this.eventBus.disable();
    const originalSyncing = this.syncing;
    this.syncing = true;

    try {
      const allRecords = this.db.prepare('SELECT * FROM garden_records').all() as any[];

      for (const row of allRecords) {
        const record = this.rowToRecord(row);

        // Migrate project relationships (child → parent)
        if (record.project) {
          const projectRecord = this.getByTitle(record.project.replace(/^\+/, ''));
          if (projectRecord) {
            try {
              // Check if relationship already exists
              const existing = this.getRelationships(record.id, {
                direction: 'outgoing',
                types: ['parent']
              }).find(r => r.targetId === projectRecord.id);

              if (!existing) {
                this.addRelationship(record.id, projectRecord.id, 'parent');
                stats.created++;
              } else {
                stats.skipped++;
              }
            } catch (err) {
              warn('Failed to migrate project relationship', {
                record: record.id,
                project: projectRecord.id,
                error: String(err)
              });
              stats.errors++;
            }
          }
        }

        // Migrate contact relationships (reference)
        if (record.contacts && Array.isArray(record.contacts)) {
          for (const contactId of record.contacts) {
            const contactRecord = this.get(contactId);
            if (contactRecord) {
              try {
                const existing = this.getRelationships(record.id, {
                  direction: 'outgoing',
                  types: ['reference']
                }).find(r => r.targetId === contactId);

                if (!existing) {
                  this.addRelationship(record.id, contactId, 'reference', {
                    role: 'contact'
                  });
                  stats.created++;
                } else {
                  stats.skipped++;
                }
              } catch (err) {
                warn('Failed to migrate contact relationship', {
                  record: record.id,
                  contact: contactId,
                  error: String(err)
                });
                stats.errors++;
              }
            }
          }
        }

        // Note: context (@phone, @computer) are not migrated to relationships
        // as they're more like tags/filters than record relationships
      }

      info('Relationship migration complete', stats);
    } finally {
      // Re-enable events and restore syncing state
      this.eventBus.enable();
      this.syncing = originalSyncing;
    }

    return stats;
  }

  // === Queries ===

  /**
   * Create a new query builder for complex queries
   */
  query(): QueryBuilder {
    return new QueryBuilder(this.db, this.rowToRecord.bind(this));
  }

  /**
   * Get the graph navigator for relationship traversal
   * Returns cached instance for performance
   */
  graph(): GardenGraph {
    if (!this._graphInstance) {
      this._graphInstance = new GardenGraph(this.db, this.get.bind(this));
    }
    return this._graphInstance;
  }

  /**
   * Get the view cache for rendered views
   * Returns cached instance for performance
   */
  viewCache(): ViewCache {
    if (!this._viewCacheInstance) {
      this._viewCacheInstance = new ViewCache(this.graph());
    }
    return this._viewCacheInstance;
  }

  getTasks(filters: TaskFilters = {}): GardenRecord[] {
    let sql = 'SELECT * FROM garden_records WHERE type = ?';
    const params: unknown[] = ['action'];

    if (filters.status) {
      const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
      sql += ` AND status IN (${statuses.map(() => '?').join(', ')})`;
      params.push(...statuses);
    }

    if (filters.context) {
      sql += ' AND context = ?';
      params.push(filters.context);
    }

    if (filters.project) {
      sql += ' AND project = ?';
      params.push(filters.project);
    }

    if (filters.dueBefore) {
      sql += ' AND due_date <= ?';
      params.push(filters.dueBefore);
    }

    if (filters.dueAfter) {
      sql += ' AND due_date >= ?';
      params.push(filters.dueAfter);
    }

    sql += ' ORDER BY context, project, title';

    const rows = this.db.prepare(sql).all(...params) as any[];
    return rows.map(r => this.rowToRecord(r));
  }

  getByType(type: RecordType): GardenRecord[] {
    const rows = this.db.prepare('SELECT * FROM garden_records WHERE type = ? ORDER BY title').all(type) as any[];
    return rows.map(r => this.rowToRecord(r));
  }

  getRecent(limit = 10): GardenRecord[] {
    const rows = this.db.prepare(`
      SELECT * FROM garden_records 
      ORDER BY updated_at DESC
      LIMIT ?
    `).all(limit) as any[];
    return rows.map(r => this.rowToRecord(r));
  }

  getByTag(tag: string): GardenRecord[] {
    const pattern = `%"${tag}"%`;
    const rows = this.db.prepare(`
      SELECT * FROM garden_records 
      WHERE tags LIKE ? 
      AND status = 'active'
      ORDER BY updated_at DESC
    `).all(pattern) as any[];
    return rows.map(r => this.rowToRecord(r));
  }

  search(query: string, limit = 50): GardenRecord[] {
    const pattern = `%${query}%`;
    const rows = this.db.prepare(`
      SELECT * FROM garden_records 
      WHERE title LIKE ? OR content LIKE ?
      ORDER BY updated_at DESC
      LIMIT ?
    `).all(pattern, pattern, limit) as any[];
    return rows.map(r => this.rowToRecord(r));
  }

  // === Task Helpers ===

  addTask(title: string, context?: string, project?: string, dueDate?: string): GardenRecord {
    return this.create({
      type: 'action',
      title,
      status: 'active',
      context,
      project,
      due_date: dueDate,
    });
  }

  completeTask(identifier: string | number): GardenRecord | null {
    let record: GardenRecord | null = null;

    if (typeof identifier === 'number') {
      const tasks = this.getTasks({ status: 'active' });
      if (identifier > 0 && identifier <= tasks.length) {
        record = tasks[identifier - 1];
      }
    } else {
      // Try exact match first
      record = this.get(identifier) || this.getByTitle(identifier);
      
      // Try partial title match
      if (!record) {
        const tasks = this.getTasks({ status: 'active' });
        const search = identifier.toLowerCase();
        record = tasks.find(t => t.title.toLowerCase().includes(search)) || null;
      }
    }

    if (!record) return null;
    
    // Archive, remove from calendar, delete file and DB record
    this.appendToArchive(record, 'DONE');
    if (this.calendar) {
      this.calendar.removeTemporal('garden', record.id);
    }
    this.deleteFile(record);
    this.deleteFromDb(record.id);
    
    return record;
  }

  captureToInbox(text: string): GardenRecord {
    return this.create({
      type: 'item',
      title: text,
      status: 'active',
    });
  }

  /**
   * Import a media file (image, document, etc.) into the garden.
   * Copies the file to garden/media/ and creates a media record.
   */
  importMedia(sourcePath: string, title: string, projectId?: string): GardenRecord {
    // Ensure media directory exists
    const mediaDir = path.join(this.gardenPath, 'media');
    ensureDir(mediaDir);
    
    // Get file extension and generate unique filename
    const ext = path.extname(sourcePath);
    const baseName = sanitizeFilename(title);
    const fileName = `${baseName}${ext}`;
    const destPath = path.join(mediaDir, fileName);
    
    // Handle name collision
    let finalPath = destPath;
    let counter = 1;
    while (fs.existsSync(finalPath)) {
      finalPath = path.join(mediaDir, `${baseName}-${counter}${ext}`);
      counter++;
    }
    
    // Copy file
    fs.copyFileSync(sourcePath, finalPath);
    
    // Create media record with path in metadata
    const record = this.create({
      type: 'media',
      title,
      status: 'active',
      project: projectId,
      metadata: {
        filePath: finalPath,
        fileName: path.basename(finalPath),
        originalPath: sourcePath,
        mimeType: this.getMimeType(ext),
      },
    });
    
    info('Media imported', { title, path: finalPath, project: projectId });
    return record;
  }

  private getMimeType(ext: string): string {
    const types: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.pdf': 'application/pdf',
      '.mp3': 'audio/mpeg',
      '.mp4': 'video/mp4',
      '.txt': 'text/plain',
    };
    return types[ext.toLowerCase()] || 'application/octet-stream';
  }

  getMediaDir(): string {
    return path.join(this.gardenPath, 'media');
  }

  // === Stats for Proactive ===

  getStaleInboxItems(days: number): GardenRecord[] {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString();

    const rows = this.db.prepare(`
      SELECT * FROM garden_records 
      WHERE type = 'action' AND context = '@inbox' AND created_at < ?
      ORDER BY created_at
    `).all(cutoffStr) as any[];
    return rows.map(r => this.rowToRecord(r));
  }

  getOverdueTasks(): GardenRecord[] {
    const today = new Date().toISOString().split('T')[0];
    const rows = this.db.prepare(`
      SELECT * FROM garden_records 
      WHERE type = 'action' AND status = 'active' 
      AND due_date IS NOT NULL AND due_date < ?
    `).all(today) as any[];
    return rows.map(r => this.rowToRecord(r));
  }

  getTaskStats(days: number): { added: number; completed: number } {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString();
    const cutoffDate = cutoffStr.split('T')[0];

    // Count added from database
    const added = this.db.prepare(`
      SELECT COUNT(*) as count FROM garden_records 
      WHERE type = 'action' AND created_at >= ?
    `).get(cutoffStr) as { count: number };

    // Count completed from archive log
    let completed = 0;
    if (fs.existsSync(this.archivePath)) {
      const lines = fs.readFileSync(this.archivePath, 'utf-8').split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        // Format: YYYY-MM-DD HH:MM | DONE | action | title | details
        const parts = line.split(' | ');
        if (parts.length >= 3) {
          const dateStr = parts[0].split(' ')[0]; // YYYY-MM-DD
          const action = parts[1];
          const type = parts[2];
          if (dateStr >= cutoffDate && action === 'DONE' && type === 'action') {
            completed++;
          }
        }
      }
    }

    return { added: added.count, completed };
  }

  // === Contact Helpers ===

  addContact(name: string, data: Partial<GardenRecord> = {}): GardenRecord {
    return this.create({
      type: 'contact',
      title: name,
      status: 'active',
      email: data.email,
      phone: data.phone,
      birthday: data.birthday,
      content: data.content,
      tags: data.tags,
    });
  }

  searchContacts(query: string): GardenRecord[] {
    const pattern = `%${query}%`;
    const rows = this.db.prepare(`
      SELECT * FROM garden_records 
      WHERE type = 'contact' AND (title LIKE ? OR email LIKE ?)
      ORDER BY title
    `).all(pattern, pattern) as any[];
    return rows.map(r => this.rowToRecord(r));
  }

  /**
   * Resolve a contact name to a contact ID.
   * Returns: { id, title } if unique match, null if no match, array if ambiguous
   */
  resolveContact(name: string): { id: string; title: string } | null | GardenRecord[] {
    const matches = this.searchContacts(name);
    
    if (matches.length === 0) return null;
    if (matches.length === 1) return { id: matches[0].id, title: matches[0].title };
    
    // Check for exact match (case-insensitive)
    const exact = matches.find(m => m.title.toLowerCase() === name.toLowerCase());
    if (exact) return { id: exact.id, title: exact.title };
    
    // Ambiguous - return all matches
    return matches;
  }

  /**
   * Resolve multiple contact names to IDs.
   * Returns { resolved: [{id, title}], unresolved: [name], ambiguous: [{name, matches}] }
   */
  resolveContacts(names: string[]): {
    resolved: { id: string; title: string }[];
    unresolved: string[];
    ambiguous: { name: string; matches: GardenRecord[] }[];
  } {
    const resolved: { id: string; title: string }[] = [];
    const unresolved: string[] = [];
    const ambiguous: { name: string; matches: GardenRecord[] }[] = [];

    for (const name of names) {
      const result = this.resolveContact(name);
      if (result === null) {
        unresolved.push(name);
      } else if (Array.isArray(result)) {
        ambiguous.push({ name, matches: result });
      } else {
        resolved.push(result);
      }
    }

    return { resolved, unresolved, ambiguous };
  }

  /**
   * Get all records linked to a contact.
   */
  getByContact(contactId: string): GardenRecord[] {
    const pattern = `%"${contactId}"%`;
    const rows = this.db.prepare(`
      SELECT * FROM garden_records 
      WHERE contacts LIKE ? AND status = 'active'
      ORDER BY updated_at DESC
    `).all(pattern) as any[];
    return rows.map(r => this.rowToRecord(r));
  }

  /**
   * Get all records linked to a contact, by contact name (convenience method).
   */
  getByContactName(name: string): GardenRecord[] | null {
    const result = this.resolveContact(name);
    if (result === null || Array.isArray(result)) return null;
    return this.getByContact(result.id);
  }

  // === File Sync ===

  getFilePath(record: GardenRecord): string {
    const filename = `${sanitizeFilename(record.title)}.md`;
    return path.join(this.gardenPath, filename);
  }

  private syncToFile(record: GardenRecord): void {
    if (this.syncing) return;

    const filepath = this.getFilePath(record);

    // Build body: title + content
    const body = `# ${record.title}\n\n${record.content || ''}`;

    // Build metadata (backmatter format - human-first ordering handled by toGardenPage)
    const meta: Record<string, unknown> = {
      tags: record.tags?.length ? record.tags : undefined,
      contacts: record.contacts?.length ? record.contacts : undefined,
      context: record.context,
      project: record.project,
      due: record.due_date,
      email: record.email,
      phone: record.phone,
      birthday: record.birthday,
      type: record.type,
      status: record.status,
      id: record.id,
    };

    const markdown = toGardenPage(body, meta);

    this.syncing = true;
    fs.writeFileSync(filepath, markdown);
    this.syncing = false;

    debug('Synced to file', {
      filepath,
      type: record.type,
      title: record.title,
      contentLength: markdown.length,
      fileExists: fs.existsSync(filepath),
    });
  }

  private syncFromFile(filepath: string): void {
    if (this.syncing || !filepath.endsWith('.md')) return;

    try {
      const content = fs.readFileSync(filepath, 'utf-8');
      
      // Parse with new parser (handles both backmatter and frontmatter)
      const { body, meta } = parseGardenPage(content);

      // Extract title from # heading or filename
      const title = extractTitle(body, path.basename(filepath, '.md'));

      // Check if this file has an ID (was created by us)
      const existingId = meta.id as string | undefined;
      // Try ID first, then fall back to title if ID not found
      let existing = existingId ? this.get(existingId) : null;
      if (!existing) {
        existing = this.getByTitle(title);
      }

      // Extract content (remove title heading and any stray backmatter)
      let extractedContent = body.replace(/^#\s+.+\n+/, '').trim();
      // Strip any backmatter that leaked into content
      extractedContent = extractedContent.replace(/\n---\n[\s\S]*?---\s*$/g, '').trim();
      
      const recordData = {
        type: (meta.type as RecordType) || 'note',
        title,
        status: (meta.status as RecordStatus) || 'active',
        context: meta.context as string | undefined,
        project: meta.project as string | undefined,
        due_date: meta.due as string | undefined,
        email: meta.email as string | undefined,
        phone: meta.phone as string | undefined,
        birthday: meta.birthday as string | undefined,
        content: extractedContent,
        tags: meta.tags as string[] | undefined,
      };

      this.syncing = true;

      if (existing) {
        this.update(existing.id, recordData);
      } else {
        this.create(recordData);
      }

      this.syncing = false;
    } catch (err) {
      error('Failed to sync from file', { filepath, error: String(err) });
      this.syncing = false;
    }
  }

  private async syncFromFiles(): Promise<void> {
    if (!fs.existsSync(this.gardenPath)) return;

    const files = fs.readdirSync(this.gardenPath)
      .filter(f => f.endsWith('.md') && f !== 'archive.log');

    for (const file of files) {
      this.syncFromFile(path.join(this.gardenPath, file));
    }

    info('Initial file sync complete', { files: files.length });
  }

  /**
   * Public method to resync all files from disk.
   * Used by dashboard to refresh after external changes.
   */
  syncAll(): void {
    this.syncFromFiles();
  }

  private startWatcher(): void {
    this.watcher = chokidar.watch(this.gardenPath, {
      ignored: [/(^|[\/\\])\./, /archive\.log$/],
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 300 },
    });

    this.watcher.on('change', filepath => {
      if (!this.syncing) this.syncFromFile(filepath);
    });

    this.watcher.on('add', filepath => {
      if (!this.syncing) this.syncFromFile(filepath);
    });
  }

  // === Helpers ===

  private rowToRecord(row: any): GardenRecord {
    return {
      id: row.id,
      type: row.type,
      title: row.title,
      status: row.status,
      context: row.context || undefined,
      project: row.project || undefined,
      privacy: row.privacy as PrivacyLevel | undefined,
      due_date: row.due_date || undefined,
      email: row.email || undefined,
      phone: row.phone || undefined,
      birthday: row.birthday || undefined,
      content: row.content || undefined,
      tags: row.tags ? JSON.parse(row.tags) : [],
      contacts: row.contacts ? JSON.parse(row.contacts) : [],
      metadata: row.metadata ? JSON.parse(row.metadata) : {},
      created_at: row.created_at,
      updated_at: row.updated_at,
      completed_at: row.completed_at || undefined,
    };
  }

  // === Calendar Temporal Sync ===

  /**
   * Get all tasks that have due dates (for reconciliation)
   */
  getTasksWithDueDates(): GardenRecord[] {
    const rows = this.db.prepare(`
      SELECT * FROM garden_records 
      WHERE type = 'action' AND due_date IS NOT NULL AND status = 'active'
      ORDER BY due_date
    `).all() as any[];
    return rows.map(r => this.rowToRecord(r));
  }

  /**
   * Check if a record exists (for reconciliation)
   */
  exists(id: string): boolean {
    const row = this.db.prepare('SELECT 1 FROM garden_records WHERE id = ?').get(id);
    return !!row;
  }

  /**
   * Sync a record's temporal data to the calendar index
   */
  private syncToCalendar(record: GardenRecord, previous?: GardenRecord): void {
    if (!this.calendar) return;

    const hasDueDate = !!record.due_date && record.status === 'active';
    const hadDueDate = previous && !!previous.due_date && previous.status === 'active';

    if (hasDueDate) {
      const dueDate = new Date(record.due_date!);
      const hasTime = record.due_date!.includes('T');

      if (hasTime) {
        // Timed action: show as event in calendar
        const endTime = new Date(dueDate.getTime() + 30 * 60 * 1000); // 30 min default
        this.calendar.registerTemporal(
          'garden',
          record.id,
          dueDate,
          'event',
          record.title,
          {
            endTime,
            metadata: {
              context: record.context,
              project: record.project,
              type: 'action',
            },
          }
        );

        // Schedule a single reminder at start time (system-generated)
        if (this.scheduler) {
          const existing = this.scheduler.getByRelatedRecord(record.id, 'system');
          for (const task of existing) {
            if (task.type === 'reminder') this.scheduler.cancel(task.id);
          }

          if (dueDate > new Date()) {
            this.scheduler.create({
              type: 'reminder',
              scheduleType: 'once',
              scheduleValue: dueDate.toISOString(),
              actionType: 'notify',
              actionPayload: `Action due: ${record.title}`,
              nextRun: dueDate.toISOString(),
              createdBy: 'system',
              relatedRecord: record.id,
            });
          }
        }
      } else {
        // Date-only: register as deadline
        this.calendar.registerTemporal(
          'garden',
          record.id,
          dueDate,
          'deadline',
          record.title,
          {
            metadata: {
              context: record.context,
              project: record.project,
            },
          }
        );

        // Clear any system reminders from previous timed due dates
        if (this.scheduler) {
          const existing = this.scheduler.getByRelatedRecord(record.id, 'system');
          for (const task of existing) {
            if (task.type === 'reminder') this.scheduler.cancel(task.id);
          }
        }
      }
    } else if (hadDueDate && !hasDueDate) {
      // Due date was removed or task completed - remove from calendar
      this.calendar.removeTemporal('garden', record.id);

      if (this.scheduler) {
        const existing = this.scheduler.getByRelatedRecord(record.id, 'system');
        for (const task of existing) {
          if (task.type === 'reminder') this.scheduler.cancel(task.id);
        }
      }
    }
  }

  close(): void {
    this.watcher?.close();
    this.db.close();
  }

  // === Archive ===

  /**
   * Append a record to the archive log before deletion.
   * Format: YYYY-MM-DD HH:MM | ACTION | type | title | context/project
   */
  private appendToArchive(record: GardenRecord, action: 'DONE' | 'DELETED'): void {
    const now = new Date();
    const date = now.toISOString().split('T')[0];
    const time = now.toTimeString().slice(0, 5);
    
    const details = [
      record.context,
      record.project ? `+${record.project}` : null,
      record.due_date ? `due:${record.due_date}` : null,
    ].filter(Boolean).join(' ');
    
    const line = `${date} ${time} | ${action} | ${record.type} | ${record.title}${details ? ` | ${details}` : ''}\n`;
    
    fs.appendFileSync(this.archivePath, line);
    debug('Archived record', { action, title: record.title });
  }

  /**
   * Delete a record's file (internal, no archive).
   */
  private deleteFile(record: GardenRecord): void {
    const filepath = this.getFilePath(record);
    if (fs.existsSync(filepath)) {
      this.syncing = true;
      fs.unlinkSync(filepath);
      this.syncing = false;
    }
  }

  /**
   * Delete a record from DB (internal, no archive).
   */
  private deleteFromDb(id: string): void {
    this.db.prepare('DELETE FROM garden_records WHERE id = ?').run(id);
  }
}
