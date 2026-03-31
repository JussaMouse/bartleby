// src/garden/GardenService.ts
// Layer 1: CRUD for garden records.
// This service knows nothing about relationships, views, or rendering.

import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';
import type { Database as DB } from 'better-sqlite3';
import {
  CREATE_RECORDS_TABLE,
  CREATE_RELATIONSHIPS_TABLE,
  CREATE_GARDEN_VIEW_TABLE,
  CREATE_SCHEMA_VERSION_TABLE,
  RECORDS_INDEXES,
  RELATIONSHIPS_INDEXES,
  SCHEMA_VERSION,
  SYSTEM_VIEWS,
} from './schema.js';
import type { GardenRecord, RecordType, RecordStatus, CreateRecordInput, UpdateRecordInput } from './types.js';

export class GardenService extends EventEmitter {
  private db: DB;

  constructor(dbPath: string) {
    super();
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.initSchema();
  }

  // ── Schema ──────────────────────────────────────────────────────────────────

  private initSchema(): void {
    this.db.exec(CREATE_SCHEMA_VERSION_TABLE);
    this.db.exec(CREATE_RECORDS_TABLE);
    this.db.exec(CREATE_RELATIONSHIPS_TABLE);
    this.db.exec(CREATE_GARDEN_VIEW_TABLE);

    for (const sql of RECORDS_INDEXES) {
      this.db.exec(sql);
    }
    for (const sql of RELATIONSHIPS_INDEXES) {
      this.db.exec(sql);
    }

    this.seedSystemViews();
    this.recordSchemaVersion();
  }

  private seedSystemViews(): void {
    const now = new Date().toISOString();
    const insert = this.db.prepare(`
      INSERT OR IGNORE INTO garden_view
        (id, name, kind, system, query_spec, renderer, description, created_at, updated_at)
      VALUES
        (@id, @name, @kind, @system, @query_spec, @renderer, @description, @created_at, @updated_at)
    `);

    const insertMany = this.db.transaction(() => {
      for (const v of SYSTEM_VIEWS) {
        insert.run({ ...v, created_at: now, updated_at: now });
      }
    });
    insertMany();
  }

  private recordSchemaVersion(): void {
    const existing = this.db.prepare('SELECT version FROM garden_schema_version').get() as { version: number } | undefined;
    if (!existing) {
      this.db.prepare('INSERT INTO garden_schema_version (version, applied_at) VALUES (?, ?)').run(SCHEMA_VERSION, new Date().toISOString());
    }
  }

  // ── Accessors ────────────────────────────────────────────────────────────────

  getDB(): DB {
    return this.db;
  }

  close(): void {
    this.db.close();
  }

  // ── CRUD ────────────────────────────────────────────────────────────────────

  create(input: CreateRecordInput): GardenRecord {
    const now = new Date().toISOString();
    const record: GardenRecord = {
      id: uuidv4(),
      type: input.type,
      title: input.title,
      status: input.status ?? 'active',
      content: input.content ?? null,
      created_at: now,
      updated_at: now,
      context: input.context ?? null,
      energy: input.energy ?? null,
      time_estimate: input.time_estimate ?? null,
      due_date: input.due_date ?? null,
      starts_at: input.starts_at ?? null,
      ends_at: input.ends_at ?? null,
      all_day: input.all_day ?? null,
      location: input.location ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      company: input.company ?? null,
      address: input.address ?? null,
      birthday: input.birthday ?? null,
      file_path: input.file_path ?? null,
      mime_type: input.mime_type ?? null,
      file_size: input.file_size ?? null,
      source: input.source ?? null,
      metadata: input.metadata ?? null,
    };

    this.db.prepare(`
      INSERT INTO records
        (id, type, title, status, content, created_at, updated_at,
         context, energy, time_estimate, due_date,
         starts_at, ends_at, all_day, location,
         email, phone, company, address, birthday,
         file_path, mime_type, file_size,
         source, metadata)
      VALUES
        (@id, @type, @title, @status, @content, @created_at, @updated_at,
         @context, @energy, @time_estimate, @due_date,
         @starts_at, @ends_at, @all_day, @location,
         @email, @phone, @company, @address, @birthday,
         @file_path, @mime_type, @file_size,
         @source, @metadata)
    `).run(record);

    this.emit('change', { op: 'create', record });
    return record;
  }

  get(id: string): GardenRecord | null {
    return (this.db.prepare('SELECT * FROM records WHERE id = ?').get(id) as GardenRecord) ?? null;
  }

  getByTitle(title: string): GardenRecord | null {
    return (this.db.prepare('SELECT * FROM records WHERE title = ? COLLATE NOCASE LIMIT 1').get(title) as GardenRecord) ?? null;
  }

  update(id: string, input: UpdateRecordInput): GardenRecord | null {
    const existing = this.get(id);
    if (!existing) return null;

    const updated_at = new Date().toISOString();
    const merged = { ...existing, ...input, updated_at };

    this.db.prepare(`
      UPDATE records SET
        title = @title, status = @status, content = @content, updated_at = @updated_at,
        context = @context, energy = @energy, time_estimate = @time_estimate, due_date = @due_date,
        starts_at = @starts_at, ends_at = @ends_at, all_day = @all_day, location = @location,
        email = @email, phone = @phone, company = @company, address = @address, birthday = @birthday,
        file_path = @file_path, mime_type = @mime_type, file_size = @file_size,
        source = @source, metadata = @metadata
      WHERE id = @id
    `).run(merged);

    const updated = this.get(id);
    if (updated) this.emit('change', { op: 'update', record: updated });
    return updated;
  }

  delete(id: string): boolean {
    const existing = this.get(id);
    const result = this.db.prepare('DELETE FROM records WHERE id = ?').run(id);
    if (result.changes > 0 && existing) {
      this.emit('change', { op: 'delete', record: existing });
    }
    return result.changes > 0;
  }

  // ── Queries ─────────────────────────────────────────────────────────────────

  getAll(opts: { status?: RecordStatus } = {}): GardenRecord[] {
    if (opts.status) {
      return this.db.prepare('SELECT * FROM records WHERE status = ? ORDER BY created_at DESC').all(opts.status) as GardenRecord[];
    }
    return this.db.prepare('SELECT * FROM records ORDER BY created_at DESC').all() as GardenRecord[];
  }

  getInboxItemsOldestFirst(): GardenRecord[] {
    return this.db.prepare("SELECT * FROM records WHERE type = 'item' AND status = 'active' ORDER BY created_at ASC").all() as GardenRecord[];
  }

  getByType(type: RecordType, opts: { status?: RecordStatus } = {}): GardenRecord[] {
    if (opts.status) {
      return this.db.prepare('SELECT * FROM records WHERE type = ? AND status = ? ORDER BY created_at DESC').all(type, opts.status) as GardenRecord[];
    }
    return this.db.prepare('SELECT * FROM records WHERE type = ? ORDER BY created_at DESC').all(type) as GardenRecord[];
  }

  search(query: string): GardenRecord[] {
    const like = `%${query}%`;
    return this.db.prepare(`
      SELECT * FROM records
      WHERE title LIKE ? OR content LIKE ?
      ORDER BY updated_at DESC
      LIMIT 50
    `).all(like, like) as GardenRecord[];
  }

  getManyByIds(ids: string[]): GardenRecord[] {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(',');
    return this.db.prepare(`SELECT * FROM records WHERE id IN (${placeholders})`).all(...ids) as GardenRecord[];
  }
}
