// src/graph/GardenGraph.ts
import type Database from 'better-sqlite3';
import type { GardenRecord, RecordType, RelationType, Relationship } from '../services/garden.js';
import { debug } from '../utils/logger.js';

/**
 * Graph Structure for navigating relationships
 *
 * Provides methods for traversing the Garden relationship graph:
 * - Navigate relationships in any direction
 * - Find backlinks (who references this?)
 * - Multi-hop queries (depth > 1)
 * - Type filtering and custom filters
 *
 * Example:
 * ```typescript
 * const graph = garden.graph();
 *
 * // Get all children of a project
 * const actions = graph.getChildren(projectId);
 *
 * // Find who references this note
 * const backlinks = graph.getBacklinks(noteId);
 *
 * // Get related records within 2 hops
 * const cluster = graph.getRelated(recordId, { depth: 2 });
 * ```
 */

export interface GetRelatedOptions {
  /** Filter by relationship type(s) */
  types?: RelationType[];
  /** How many hops (default: 1) */
  depth?: number;
  /** Direction to traverse */
  direction?: 'outgoing' | 'incoming' | 'both';
  /** Filter by record type */
  recordTypes?: RecordType[];
  /** Custom filter function */
  filter?: (record: GardenRecord) => boolean;
}

interface AdjacencyList {
  outgoing: Map<string, Relationship[]>;
  incoming: Map<string, Relationship[]>;
}

export class GardenGraph {
  private db: Database.Database;
  private getRecord: (id: string) => GardenRecord | null;
  private adjacencyList: AdjacencyList | null = null;

  constructor(
    db: Database.Database,
    getRecord: (id: string) => GardenRecord | null
  ) {
    this.db = db;
    this.getRecord = getRecord;
  }

  /**
   * Get all records related to this one
   */
  getRelated(recordId: string, options: GetRelatedOptions = {}): GardenRecord[] {
    const {
      types,
      depth = 1,
      direction = 'outgoing',
      recordTypes,
      filter
    } = options;

    // Build adjacency list if not cached
    if (!this.adjacencyList) {
      this.buildAdjacencyList();
    }

    // BFS traversal
    const visited = new Set<string>();
    const queue: Array<{ id: string; currentDepth: number }> = [{ id: recordId, currentDepth: 0 }];
    const results = new Set<string>();

    while (queue.length > 0) {
      const { id, currentDepth } = queue.shift()!;

      if (visited.has(id)) continue;
      visited.add(id);

      // Don't add the starting node to results
      if (currentDepth > 0) {
        results.add(id);
      }

      // Stop if we've reached max depth
      if (currentDepth >= depth) continue;

      // Get relationships based on direction
      const relationships: Relationship[] = [];

      if (direction === 'outgoing' || direction === 'both') {
        const outgoing = this.adjacencyList!.outgoing.get(id) || [];
        relationships.push(...outgoing);
      }

      if (direction === 'incoming' || direction === 'both') {
        const incoming = this.adjacencyList!.incoming.get(id) || [];
        relationships.push(...incoming);
      }

      // Filter by relationship type if specified
      const filtered = types
        ? relationships.filter(rel => types.includes(rel.relationType))
        : relationships;

      // Add targets to queue
      for (const rel of filtered) {
        const targetId = direction === 'incoming' ? rel.sourceId : rel.targetId;
        if (!visited.has(targetId)) {
          queue.push({ id: targetId, currentDepth: currentDepth + 1 });
        }
      }
    }

    // Convert IDs to records and apply filters
    const records: GardenRecord[] = [];
    for (const id of results) {
      const record = this.getRecord(id);
      if (!record) continue;

      // Filter by record type
      if (recordTypes && !recordTypes.includes(record.type)) continue;

      // Apply custom filter
      if (filter && !filter(record)) continue;

      records.push(record);
    }

    return records;
  }

  /**
   * Get parent records (this record has parent → target relationship)
   */
  getParents(recordId: string): GardenRecord[] {
    return this.getRelated(recordId, {
      types: ['parent'],
      direction: 'outgoing'
    });
  }

  /**
   * Get child records (records that have this record as parent)
   * Finds incoming 'parent' relationships (child → this record)
   */
  getChildren(recordId: string): GardenRecord[] {
    return this.getRelated(recordId, {
      types: ['parent'],
      direction: 'incoming'
    });
  }

  /**
   * Get referenced records (this record → references)
   */
  getReferences(recordId: string): GardenRecord[] {
    return this.getRelated(recordId, {
      types: ['reference'],
      direction: 'outgoing'
    });
  }

  /**
   * Get mentioned records (this record → mentions)
   */
  getMentions(recordId: string): GardenRecord[] {
    return this.getRelated(recordId, {
      types: ['mentions'],
      direction: 'outgoing'
    });
  }

  /**
   * Get backlinks - all records that reference this one
   */
  getBacklinks(recordId: string, types?: RelationType[]): GardenRecord[] {
    return this.getRelated(recordId, {
      types,
      direction: 'incoming'
    });
  }

  /**
   * Get cluster of related records within N hops
   */
  getCluster(recordId: string, radius: number = 2): GardenRecord[] {
    return this.getRelated(recordId, {
      depth: radius,
      direction: 'both'
    });
  }

  /**
   * Invalidate the adjacency list cache
   */
  invalidate(): void {
    this.adjacencyList = null;
    debug('Graph cache invalidated');
  }

  /**
   * Build adjacency list from relationships table
   */
  private buildAdjacencyList(): void {
    const start = Date.now();

    const outgoing = new Map<string, Relationship[]>();
    const incoming = new Map<string, Relationship[]>();

    // Query all relationships
    const rows = this.db.prepare(`
      SELECT * FROM garden_relationships
    `).all() as any[];

    // Build adjacency lists
    for (const row of rows) {
      const rel: Relationship = {
        id: row.id,
        sourceId: row.source_id,
        sourceType: row.source_type as RecordType,
        targetId: row.target_id,
        targetType: row.target_type as RecordType,
        relationType: row.relation_type as RelationType,
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
        created_at: row.created_at
      };

      // Add to outgoing map (source → target)
      if (!outgoing.has(rel.sourceId)) {
        outgoing.set(rel.sourceId, []);
      }
      outgoing.get(rel.sourceId)!.push(rel);

      // Add to incoming map (target ← source)
      if (!incoming.has(rel.targetId)) {
        incoming.set(rel.targetId, []);
      }
      incoming.get(rel.targetId)!.push(rel);
    }

    this.adjacencyList = { outgoing, incoming };

    const duration = Date.now() - start;
    debug(`Built graph adjacency list: ${rows.length} relationships in ${duration}ms`);
  }
}
