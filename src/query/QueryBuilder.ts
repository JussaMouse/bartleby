// src/query/QueryBuilder.ts
import type Database from 'better-sqlite3';
import type { GardenRecord, RecordType, RecordStatus, RelationType } from '../services/garden.js';
import { debug } from '../utils/logger.js';

/**
 * Query Builder for Garden records
 *
 * Provides a fluent API for building complex queries with:
 * - Type filtering
 * - WHERE clauses
 * - Relationship joins
 * - Tag filtering
 * - Status filtering
 * - Ordering
 * - Limits
 *
 * Example:
 * ```typescript
 * garden.query()
 *   .type('action')
 *   .where('status', '=', 'active')
 *   .related('parent', projectId)
 *   .orderBy('due_date', 'asc')
 *   .limit(10)
 *   .exec()
 * ```
 */

export type Operator = '=' | '!=' | '>' | '<' | '>=' | '<=' | 'LIKE' | 'IN' | 'IS NULL' | 'IS NOT NULL';
export type OrderDirection = 'asc' | 'desc';

interface WhereClause {
  field: string;
  operator: Operator;
  value: any;
}

interface RelatedClause {
  relationType: RelationType;
  targetId: string;
  direction: 'outgoing' | 'incoming';
}

export class QueryBuilder {
  private db: Database.Database;
  private rowToRecord: (row: any) => GardenRecord;

  // Query state
  private types: RecordType[] = [];
  private whereClauses: WhereClause[] = [];
  private relatedClauses: RelatedClause[] = [];
  // tags removed - use where() with content LIKE for text search
  private statuses: RecordStatus[] = [];
  private orderByField?: string;
  private orderDirection: OrderDirection = 'asc';
  private limitCount?: number;
  private offsetCount: number = 0;

  constructor(
    db: Database.Database,
    rowToRecord: (row: any) => GardenRecord
  ) {
    this.db = db;
    this.rowToRecord = rowToRecord;
  }

  /**
   * Filter by record type(s)
   */
  type(type: RecordType | RecordType[]): this {
    this.types = Array.isArray(type) ? type : [type];
    return this;
  }

  /**
   * Add a WHERE clause
   */
  where(field: string, operator: Operator, value?: any): this {
    this.whereClauses.push({ field, operator, value });
    return this;
  }

  /**
   * Filter by relationship
   * @param relationType - Type of relationship (parent, child, reference, mentions)
   * @param targetId - Target record ID
   * @param direction - 'outgoing' (this record → target) or 'incoming' (target → this record)
   */
  related(relationType: RelationType, targetId: string, direction: 'outgoing' | 'incoming' = 'outgoing'): this {
    this.relatedClauses.push({ relationType, targetId, direction });
    return this;
  }

  // tag() method removed - use where('content', 'LIKE', '%keyword%') instead

  /**
   * Filter by status(es)
   */
  status(status: RecordStatus | RecordStatus[]): this {
    this.statuses = Array.isArray(status) ? status : [status];
    return this;
  }

  /**
   * Order results
   */
  orderBy(field: string, direction: OrderDirection = 'asc'): this {
    this.orderByField = field;
    this.orderDirection = direction;
    return this;
  }

  /**
   * Limit number of results
   */
  limit(count: number): this {
    this.limitCount = count;
    return this;
  }

  /**
   * Offset results (for pagination)
   */
  offset(count: number): this {
    this.offsetCount = count;
    return this;
  }

  /**
   * Build and execute the query
   */
  exec(): GardenRecord[] {
    const { sql, params } = this.build();

    debug('Executing query', {
      sql: sql.substring(0, 200),
      paramCount: params.length,
      types: this.types,
      whereClauses: this.whereClauses.length,
      relatedClauses: this.relatedClauses.length
    });

    const rows = this.db.prepare(sql).all(...params) as any[];
    return rows.map(row => this.rowToRecord(row));
  }

  /**
   * Execute and return first result
   */
  execFirst(): GardenRecord | null {
    this.limit(1);
    const results = this.exec();
    return results[0] || null;
  }

  /**
   * Execute and return count
   */
  execCount(): number {
    const { sql, params } = this.build(true);
    const result = this.db.prepare(sql).get(...params) as { count: number };
    return result.count;
  }

  /**
   * Build SQL query
   */
  private build(countOnly: boolean = false): { sql: string; params: any[] } {
    const params: any[] = [];

    // SELECT clause
    let sql = countOnly
      ? 'SELECT COUNT(DISTINCT r.id) as count'
      : 'SELECT DISTINCT r.*';

    // FROM clause
    sql += '\nFROM garden_records r';

    // JOIN relationships if needed
    for (let i = 0; i < this.relatedClauses.length; i++) {
      const alias = `rel${i}`;
      sql += `\nINNER JOIN garden_relationships ${alias} ON `;

      const rel = this.relatedClauses[i];
      if (rel.direction === 'outgoing') {
        sql += `${alias}.source_id = r.id AND ${alias}.target_id = ?`;
      } else {
        sql += `${alias}.target_id = r.id AND ${alias}.source_id = ?`;
      }
      sql += ` AND ${alias}.relation_type = ?`;

      params.push(rel.targetId, rel.relationType);
    }

    // WHERE clause
    const whereConditions: string[] = [];

    // Type filter
    if (this.types.length > 0) {
      if (this.types.length === 1) {
        whereConditions.push('r.type = ?');
        params.push(this.types[0]);
      } else {
        whereConditions.push(`r.type IN (${this.types.map(() => '?').join(',')})`);
        params.push(...this.types);
      }
    }

    // Status filter
    if (this.statuses.length > 0) {
      if (this.statuses.length === 1) {
        whereConditions.push('r.status = ?');
        params.push(this.statuses[0]);
      } else {
        whereConditions.push(`r.status IN (${this.statuses.map(() => '?').join(',')})`);
        params.push(...this.statuses);
      }
    }

    // Tag filter removed - use content search instead

    // Custom WHERE clauses
    for (const clause of this.whereClauses) {
      if (clause.operator === 'IS NULL' || clause.operator === 'IS NOT NULL') {
        whereConditions.push(`r.${clause.field} ${clause.operator}`);
      } else if (clause.operator === 'IN') {
        const values = Array.isArray(clause.value) ? clause.value : [clause.value];
        whereConditions.push(`r.${clause.field} IN (${values.map(() => '?').join(',')})`);
        params.push(...values);
      } else {
        whereConditions.push(`r.${clause.field} ${clause.operator} ?`);
        params.push(clause.value);
      }
    }

    if (whereConditions.length > 0) {
      sql += '\nWHERE ' + whereConditions.join(' AND ');
    }

    // ORDER BY (skip for count queries)
    if (!countOnly && this.orderByField) {
      sql += `\nORDER BY r.${this.orderByField} ${this.orderDirection.toUpperCase()}`;
    }

    // LIMIT and OFFSET (skip for count queries)
    if (!countOnly) {
      if (this.limitCount !== undefined) {
        sql += `\nLIMIT ?`;
        params.push(this.limitCount);
      }

      if (this.offsetCount > 0) {
        sql += `\nOFFSET ?`;
        params.push(this.offsetCount);
      }
    }

    return { sql, params };
  }

  /**
   * Get the SQL that would be executed (for debugging)
   */
  toSQL(): { sql: string; params: any[] } {
    return this.build();
  }
}
