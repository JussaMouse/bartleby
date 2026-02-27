// src/garden/types.ts
// All TypeScript types for the garden system.
// No type definitions anywhere else — all types live here.

// ============================================================================
// Layer 1: Records
// ============================================================================

export type RecordType =
  | 'item'
  | 'action'
  | 'project'
  | 'note'
  | 'tag'
  | 'contact'
  | 'event'
  | 'media';

export type RecordStatus =
  | 'active'
  | 'completed'
  | 'waiting'
  | 'someday'
  | 'archived'
  | 'processed';

export interface GardenRecord {
  // Universal fields
  id: string;
  type: RecordType;
  title: string;
  status: RecordStatus;
  content: string | null;
  created_at: string;   // ISO 8601
  updated_at: string;   // ISO 8601

  // action / project fields
  context: string | null;       // @phone, @computer, @home, @errands
  energy: string | null;        // low, medium, high
  time_estimate: string | null; // 5min, 30min, 2h
  due_date: string | null;      // ISO 8601 date

  // event fields
  starts_at: string | null;     // ISO 8601 datetime
  ends_at: string | null;       // ISO 8601 datetime
  all_day: number | null;       // boolean 0/1
  location: string | null;

  // contact fields
  email: string | null;
  phone: string | null;
  company: string | null;
  address: string | null;
  birthday: string | null;      // ISO 8601 date

  // media fields
  file_path: string | null;
  mime_type: string | null;
  file_size: number | null;     // bytes

  // item fields
  source: string | null;        // 'typed', 'email', 'sms', 'drag-drop', etc.

  // catch-all for runtime extensibility (never queried against)
  metadata: string | null;      // JSON
}

export type CreateRecordInput = Partial<Omit<GardenRecord, 'id' | 'created_at' | 'updated_at'>> & {
  type: RecordType;
  title: string;
};

export type UpdateRecordInput = Partial<Omit<GardenRecord, 'id' | 'type' | 'created_at' | 'updated_at'>>;

// ============================================================================
// Layer 2: Relationships
// ============================================================================

export type RelType =
  | 'belongs_to'   // action/note/event/media → project
  | 'tagged_with'  // note → tag
  | 'involves'     // project/event → contact
  | 'waiting_on'   // action → contact
  | 'attends'      // contact → event
  | 'references'   // any → any (wiki links)
  | 'related_to';  // any → any (user-defined)

export interface Relationship {
  id: string;
  from_id: string;
  to_id: string;
  type: RelType;
  created_at: string;
  metadata: string | null; // JSON
}

// ============================================================================
// Layer 3: Views — QuerySpec
// ============================================================================

export type FilterExpr =
  | { op: 'eq' | 'neq' | 'contains'; field: string; value: string }
  | { op: 'and' | 'or'; children: FilterExpr[] }
  | { op: 'not'; child: FilterExpr }
  | { op: 'traverse'; rel: RelType; target: FilterExpr };

export interface SortSpec {
  field: 'created_at' | 'updated_at' | 'due_date' | 'starts_at' | 'title';
  dir: 'asc' | 'desc';
}

export interface QuerySpec {
  filter?: FilterExpr;
  sort?: SortSpec[];
  limit?: number;
}

// ============================================================================
// Layer 3: Views — GardenView
// ============================================================================

export type ViewKind = 'collection' | 'computed' | 'record';

export interface GardenView {
  id: string;
  name: string;
  kind: ViewKind;
  system: number;        // 1 = built-in, cannot be deleted
  query_spec: string | null;  // JSON QuerySpec
  renderer: string | null;    // named renderer for computed views
  description: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Layer 3/4: ViewData — intermediate representation
// ============================================================================

export interface RecordSummary {
  id: string;
  type: string;
  title: string;
  status: string;
  context?: string;
  due?: string;
  project?: string; // title of parent project if known
}

export interface MetadataField {
  label: string;
  value: string;
}

export interface NodeSummary {
  id: string;
  type: string;
  title: string;
}

export interface EdgeSummary {
  from: string;
  to: string;
  type: string;
}

export type Section =
  | { kind: 'content'; title: string; markdown: string }
  | { kind: 'list'; title: string; items: RecordSummary[]; count: number }
  | { kind: 'metadata'; title: string; fields: MetadataField[] }
  | { kind: 'graph'; title: string; nodes: NodeSummary[]; edges: EdgeSummary[] };

export interface ViewData {
  id?: string;    // record ID if this is a record view
  type?: string;  // record type if this is a record view
  title: string;
  sections: Section[];
}
