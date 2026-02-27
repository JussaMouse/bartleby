// src/garden/assemblers/base.ts
// Abstract base class for record assemblers.

import type { GardenRecord, ViewData, RecordSummary } from '../types.js';
import type { GardenService } from '../GardenService.js';
import type { RelationshipService } from '../RelationshipService.js';

export interface AssemblerServices {
  garden: GardenService;
  rels: RelationshipService;
}

export abstract class Assembler {
  abstract assemble(record: GardenRecord, services: AssemblerServices): ViewData;
}

/** Convert a GardenRecord into a compact RecordSummary for use in list sections. */
export function toSummary(record: GardenRecord, parentProjectTitle?: string): RecordSummary {
  return {
    id: record.id,
    type: record.type,
    title: record.title,
    status: record.status,
    context: record.context ?? undefined,
    due: record.due_date ?? record.starts_at ?? undefined,
    project: parentProjectTitle,
  };
}

/** Convert an array of records to summaries, optionally looking up parent projects. */
export function toSummaries(records: GardenRecord[], parentProjectTitle?: string): RecordSummary[] {
  return records.map(r => toSummary(r, parentProjectTitle));
}
