// src/garden/QueryService.ts
// Layer 3: Execute QuerySpec against the records + relationships layer.
// No view logic, no rendering. Pure filtering and sorting.

import type { GardenRecord, QuerySpec, FilterExpr, SortSpec, RelType } from './types.js';
import type { RelationshipService } from './RelationshipService.js';

export class QueryService {
  private rels: RelationshipService;

  constructor(rels: RelationshipService) {
    this.rels = rels;
  }

  execute(records: GardenRecord[], spec: QuerySpec): GardenRecord[] {
    let result = spec.filter
      ? records.filter(r => this.matchFilter(r, spec.filter!))
      : [...records];

    if (spec.sort?.length) {
      result = this.applySort(result, spec.sort);
    }

    if (spec.limit) {
      result = result.slice(0, spec.limit);
    }

    return result;
  }

  private matchFilter(record: GardenRecord, expr: FilterExpr): boolean {
    switch (expr.op) {
      case 'eq':
        return this.getField(record, expr.field) === expr.value;

      case 'neq':
        return this.getField(record, expr.field) !== expr.value;

      case 'contains': {
        const val = this.getField(record, expr.field);
        if (val === null || val === undefined) return false;
        return val.toLowerCase().includes(expr.value.toLowerCase());
      }

      case 'and':
        return expr.children.every(child => this.matchFilter(record, child));

      case 'or':
        return expr.children.some(child => this.matchFilter(record, child));

      case 'not':
        return !this.matchFilter(record, expr.child);

      case 'traverse': {
        // Find records that this record points to (outbound) or that point here (inbound)
        // For belongs_to: action → project, so "traverse belongs_to to project X" means:
        // check outbound belongs_to edges from this record, then match target against expr.target
        const outbound = this.rels.getOutbound(record.id, expr.rel as RelType);
        return outbound.some(target => this.matchFilter(target, expr.target));
      }

      default:
        return false;
    }
  }

  private getField(record: GardenRecord, field: string): string | null {
    const val = (record as unknown as Record<string, unknown>)[field];
    if (val === null || val === undefined) return null;
    return String(val);
  }

  private applySort(records: GardenRecord[], sorts: SortSpec[]): GardenRecord[] {
    return [...records].sort((a, b) => {
      for (const s of sorts) {
        const av = this.getField(a, s.field) ?? '';
        const bv = this.getField(b, s.field) ?? '';
        const cmp = av.localeCompare(bv);
        if (cmp !== 0) return s.dir === 'asc' ? cmp : -cmp;
      }
      return 0;
    });
  }
}
