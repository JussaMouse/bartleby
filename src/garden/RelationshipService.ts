// src/garden/RelationshipService.ts
// Layer 2: Typed edge store for record relationships.
// This service knows nothing about views or rendering.

import { v4 as uuidv4 } from 'uuid';
import type { Database as DB } from 'better-sqlite3';
import type { Relationship, RelType, GardenRecord, RecordType } from './types.js';
import type { GardenService } from './GardenService.js';

export class RelationshipService {
  private db: DB;
  private garden: GardenService;

  constructor(db: DB, garden: GardenService) {
    this.db = db;
    this.garden = garden;
  }

  // ── CRUD ────────────────────────────────────────────────────────────────────

  add(from_id: string, to_id: string, type: RelType, metadata?: object): Relationship {
    const rel: Relationship = {
      id: uuidv4(),
      from_id,
      to_id,
      type,
      created_at: new Date().toISOString(),
      metadata: metadata ? JSON.stringify(metadata) : null,
    };

    // Use INSERT OR IGNORE so duplicate (from, to, type) silently no-ops
    this.db.prepare(`
      INSERT OR IGNORE INTO record_relationships (id, from_id, to_id, type, created_at, metadata)
      VALUES (@id, @from_id, @to_id, @type, @created_at, @metadata)
    `).run(rel);

    // Return the existing or new row
    const existing = this.db.prepare(
      'SELECT * FROM record_relationships WHERE from_id = ? AND to_id = ? AND type = ?'
    ).get(from_id, to_id, type) as Relationship;
    return existing;
  }

  remove(from_id: string, to_id: string, type: RelType): boolean {
    const result = this.db.prepare(
      'DELETE FROM record_relationships WHERE from_id = ? AND to_id = ? AND type = ?'
    ).run(from_id, to_id, type);
    return result.changes > 0;
  }

  removeById(id: string): boolean {
    const result = this.db.prepare('DELETE FROM record_relationships WHERE id = ?').run(id);
    return result.changes > 0;
  }

  // ── Traversal ────────────────────────────────────────────────────────────────

  /**
   * Get records that `from_id` points TO, optionally filtered by relationship type.
   * E.g. getOutbound(action.id, 'belongs_to') → the project that action belongs to
   */
  getOutbound(from_id: string, type?: RelType): GardenRecord[] {
    let rows: { to_id: string }[];
    if (type) {
      rows = this.db.prepare(
        'SELECT to_id FROM record_relationships WHERE from_id = ? AND type = ?'
      ).all(from_id, type) as { to_id: string }[];
    } else {
      rows = this.db.prepare(
        'SELECT to_id FROM record_relationships WHERE from_id = ?'
      ).all(from_id) as { to_id: string }[];
    }
    return this.garden.getManyByIds(rows.map(r => r.to_id));
  }

  /**
   * Get records that point TO `to_id`, optionally filtered by relationship type.
   * E.g. getInbound(project.id, 'belongs_to') → all actions/notes belonging to project
   */
  getInbound(to_id: string, type?: RelType): GardenRecord[] {
    let rows: { from_id: string }[];
    if (type) {
      rows = this.db.prepare(
        'SELECT from_id FROM record_relationships WHERE to_id = ? AND type = ?'
      ).all(to_id, type) as { from_id: string }[];
    } else {
      rows = this.db.prepare(
        'SELECT from_id FROM record_relationships WHERE to_id = ?'
      ).all(to_id) as { from_id: string }[];
    }
    return this.garden.getManyByIds(rows.map(r => r.from_id));
  }

  /**
   * Get all relationship rows involving a given record (either direction).
   */
  getAll(record_id: string): Relationship[] {
    return this.db.prepare(
      'SELECT * FROM record_relationships WHERE from_id = ? OR to_id = ?'
    ).all(record_id, record_id) as Relationship[];
  }

  /**
   * Get all relationships of a given type.
   */
  getAllByType(type: RelType): Relationship[] {
    return this.db.prepare(
      'SELECT * FROM record_relationships WHERE type = ?'
    ).all(type) as Relationship[];
  }

  /**
   * Remove relationships whose from_id or to_id no longer exist in records.
   * Normally handled by ON DELETE CASCADE, but useful for maintenance.
   */
  deleteOrphans(): number {
    const result = this.db.prepare(`
      DELETE FROM record_relationships
      WHERE from_id NOT IN (SELECT id FROM records)
         OR to_id   NOT IN (SELECT id FROM records)
    `).run();
    return result.changes;
  }

  // ── Backlink sync ────────────────────────────────────────────────────────────

  /**
   * Parse [[wiki links]] in content and upsert `references` relationships.
   * Replaces the full set of `references` edges for this record on every call.
   *
   * Safer policy:
   * - only create a reference when the link title resolves uniquely
   * - never create a self-reference
   * - if multiple records share the same title across types, skip linking
   */
  syncBacklinks(record: GardenRecord): void {
    if (!record.content) {
      this.db.prepare(
        "DELETE FROM record_relationships WHERE from_id = ? AND type = 'references'"
      ).run(record.id);
      return;
    }

    const titles = parseWikiLinks(record.content);

    this.db.prepare(
      "DELETE FROM record_relationships WHERE from_id = ? AND type = 'references'"
    ).run(record.id);

    for (const title of titles) {
      const target = this.resolveUniqueRecordByTitle(title);
      if (target && target.id !== record.id) {
        this.add(record.id, target.id, 'references');
      }
    }
  }

  private resolveUniqueRecordByTitle(title: string): GardenRecord | null {
    const matches = this.garden.getAll().filter(record => record.title.localeCompare(title, undefined, { sensitivity: 'accent' }) === 0);
    if (matches.length !== 1) return null;
    return matches[0] ?? null;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Extract [[Link Title]] references from markdown content. Returns unique titles. */
function parseWikiLinks(content: string): string[] {
  const regex = /\[\[([^\]]+)\]\]/g;
  const titles = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    titles.add(match[1].trim());
  }
  return Array.from(titles);
}
