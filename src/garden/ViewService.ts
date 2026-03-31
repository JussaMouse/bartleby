// src/garden/ViewService.ts
// Layer 3: View resolution, assembly, and catalogue.
// Knows about assemblers and QueryService. Does not know about renderers.

import { v4 as uuidv4 } from 'uuid';
import type { Database as DB } from 'better-sqlite3';
import type { GardenRecord, GardenView, ViewData, QuerySpec, RecordType } from './types.js';
import type { GardenService } from './GardenService.js';
import type { RelationshipService } from './RelationshipService.js';
import { QueryService } from './QueryService.js';
import type { Assembler, AssemblerServices } from './assemblers/base.js';
import { toSummaries } from './assemblers/base.js';
import { ProjectAssembler } from './assemblers/ProjectAssembler.js';
import { NoteAssembler } from './assemblers/NoteAssembler.js';
import { ActionAssembler } from './assemblers/ActionAssembler.js';
import { ContactAssembler } from './assemblers/ContactAssembler.js';
import { EventAssembler } from './assemblers/EventAssembler.js';
import { ItemAssembler } from './assemblers/ItemAssembler.js';
import { TagAssembler } from './assemblers/TagAssembler.js';
import { MediaAssembler } from './assemblers/MediaAssembler.js';

// ── Assembler registry ────────────────────────────────────────────────────────

const ASSEMBLERS: Partial<Record<RecordType, Assembler>> = {
  project: new ProjectAssembler(),
  note:    new NoteAssembler(),
  action:  new ActionAssembler(),
  contact: new ContactAssembler(),
  event:   new EventAssembler(),
  item:    new ItemAssembler(),
  tag:     new TagAssembler(),
  media:   new MediaAssembler(),
};

// ── CatalogueEntry ────────────────────────────────────────────────────────────

export interface CatalogueEntry {
  id: string;
  name: string;
  kind: 'collection' | 'computed' | 'record';
  system: boolean;
  description: string;
}

// ── ViewService ───────────────────────────────────────────────────────────────

export class ViewService {
  private db: DB;
  private garden: GardenService;
  private rels: RelationshipService;
  private query: QueryService;
  private services: AssemblerServices;

  constructor(db: DB, garden: GardenService, rels: RelationshipService) {
    this.db = db;
    this.garden = garden;
    this.rels = rels;
    this.query = new QueryService(rels);
    this.services = { garden, rels };
  }

  // ── Resolution ───────────────────────────────────────────────────────────────

  /**
   * Resolve a stored or computed view by exact name only.
   */
  resolve(name: string): ViewData | null {
    const storedView = this.db.prepare(
      'SELECT * FROM garden_view WHERE name = ? COLLATE NOCASE'
    ).get(name) as GardenView | undefined;

    if (!storedView) return null;
    return this.executeStoredView(storedView);
  }

  /**
   * Open a record by exact title.
   */
  openRecordByTitle(title: string): ViewData | null {
    const record = this.garden.getByTitle(title);
    if (!record) return null;
    return this.assembleRecord(record);
  }

  /**
   * Legacy mixed resolver retained temporarily during migration.
   */
  resolveLegacy(name: string): ViewData | null {
    return this.resolve(name) ?? this.openRecordByTitle(name);
  }

  /**
   * Open a record by ID directly.
   */
  openRecord(id: string): ViewData | null {
    const record = this.garden.get(id);
    if (!record) return null;
    return this.assembleRecord(record);
  }

  /**
   * Execute a stored garden_view.
   */
  private executeStoredView(view: GardenView): ViewData {
    if (view.kind === 'collection' && view.query_spec) {
      const spec: QuerySpec = JSON.parse(view.query_spec);
      const all = this.garden.getAll();
      const filtered = this.query.execute(all, spec);

      return {
        title: view.name,
        sections: [{
          kind: 'list',
          title: view.description ?? view.name,
          items: toSummaries(filtered),
          count: filtered.length,
        }],
      };
    }

    // Fallback for computed views (not implemented in Phase 2)
    return {
      title: view.name,
      sections: [],
    };
  }

  /**
   * Run the appropriate assembler for a record's type.
   */
  assembleRecord(record: GardenRecord): ViewData {
    const assembler = ASSEMBLERS[record.type];
    if (!assembler) {
      // Graceful fallback for unknown types
      return {
        id: record.id,
        type: record.type,
        title: record.title,
        sections: [],
      };
    }
    return assembler.assemble(record, this.services);
  }

  // ── Catalogue ────────────────────────────────────────────────────────────────

  catalogue(): CatalogueEntry[] {
    const storedViews = this.db.prepare('SELECT * FROM garden_view ORDER BY system DESC, name ASC').all() as GardenView[];

    const stored: CatalogueEntry[] = storedViews.map(v => ({
      id: v.id,
      name: v.name,
      kind: v.kind as 'collection' | 'computed',
      system: v.system === 1,
      description: v.description ?? '',
    }));

    // Record assembler entries
    const assemblerEntries: CatalogueEntry[] = (Object.keys(ASSEMBLERS) as RecordType[]).map(type => ({
      id: `assembler-${type}`,
      name: `show ${type}`,
      kind: 'record' as const,
      system: true,
      description: `View a ${type} record with all related items`,
    }));

    return [...stored, ...assemblerEntries];
  }

  // ── User views ────────────────────────────────────────────────────────────────

  createUserView(name: string, querySpec: QuerySpec, description?: string): GardenView {
    const now = new Date().toISOString();
    const view: GardenView = {
      id: uuidv4(),
      name,
      kind: 'collection',
      system: 0,
      query_spec: JSON.stringify(querySpec),
      renderer: null,
      description: description ?? null,
      created_at: now,
      updated_at: now,
    };

    this.db.prepare(`
      INSERT INTO garden_view (id, name, kind, system, query_spec, renderer, description, created_at, updated_at)
      VALUES (@id, @name, @kind, @system, @query_spec, @renderer, @description, @created_at, @updated_at)
    `).run(view);

    return view;
  }

  deleteUserView(id: string): boolean {
    // Cannot delete system views
    const view = this.db.prepare('SELECT * FROM garden_view WHERE id = ?').get(id) as GardenView | undefined;
    if (!view || view.system === 1) return false;

    const result = this.db.prepare('DELETE FROM garden_view WHERE id = ? AND system = 0').run(id);
    return result.changes > 0;
  }

  getView(id: string): GardenView | null {
    return (this.db.prepare('SELECT * FROM garden_view WHERE id = ?').get(id) as GardenView) ?? null;
  }
}
