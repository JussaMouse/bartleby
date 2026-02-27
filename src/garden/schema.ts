// src/garden/schema.ts
// SQL schema for the garden system.
// All DDL lives here. Services import these strings and execute them at init.

export const SCHEMA_VERSION = 1;

// ============================================================================
// Layer 1: Records table
// ============================================================================

export const CREATE_RECORDS_TABLE = `
CREATE TABLE IF NOT EXISTS records (
  id            TEXT PRIMARY KEY,
  type          TEXT NOT NULL,
  title         TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active',
  content       TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,

  -- action / project fields
  context       TEXT,
  energy        TEXT,
  time_estimate TEXT,
  due_date      TEXT,

  -- event fields
  starts_at     TEXT,
  ends_at       TEXT,
  all_day       INTEGER,
  location      TEXT,

  -- contact fields
  email         TEXT,
  phone         TEXT,
  company       TEXT,
  address       TEXT,
  birthday      TEXT,

  -- media fields
  file_path     TEXT,
  mime_type     TEXT,
  file_size     INTEGER,

  -- item fields
  source        TEXT,

  -- extensibility catch-all (never queried)
  metadata      TEXT
)
`;

export const RECORDS_INDEXES = [
  `CREATE INDEX IF NOT EXISTS idx_records_type       ON records(type)`,
  `CREATE INDEX IF NOT EXISTS idx_records_status     ON records(status)`,
  `CREATE INDEX IF NOT EXISTS idx_records_type_status ON records(type, status)`,
  `CREATE INDEX IF NOT EXISTS idx_records_title      ON records(title COLLATE NOCASE)`,
  `CREATE INDEX IF NOT EXISTS idx_records_due_date   ON records(due_date)`,
  `CREATE INDEX IF NOT EXISTS idx_records_starts_at  ON records(starts_at)`,
  `CREATE INDEX IF NOT EXISTS idx_records_created_at ON records(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_records_updated_at ON records(updated_at)`,
];

// ============================================================================
// Layer 2: Relationships table
// ============================================================================

export const CREATE_RELATIONSHIPS_TABLE = `
CREATE TABLE IF NOT EXISTS record_relationships (
  id         TEXT PRIMARY KEY,
  from_id    TEXT NOT NULL REFERENCES records(id) ON DELETE CASCADE,
  to_id      TEXT NOT NULL REFERENCES records(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  created_at TEXT NOT NULL,
  metadata   TEXT
)
`;

export const RELATIONSHIPS_INDEXES = [
  `CREATE INDEX IF NOT EXISTS idx_rel_from      ON record_relationships(from_id, type)`,
  `CREATE INDEX IF NOT EXISTS idx_rel_to        ON record_relationships(to_id, type)`,
  `CREATE INDEX IF NOT EXISTS idx_rel_type      ON record_relationships(type)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_rel_unique ON record_relationships(from_id, to_id, type)`,
];

// ============================================================================
// Layer 3: Garden views table
// ============================================================================

export const CREATE_GARDEN_VIEW_TABLE = `
CREATE TABLE IF NOT EXISTS garden_view (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  kind        TEXT NOT NULL,
  system      INTEGER DEFAULT 0,
  query_spec  TEXT,
  renderer    TEXT,
  description TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
)
`;

// ============================================================================
// Schema version tracking
// ============================================================================

export const CREATE_SCHEMA_VERSION_TABLE = `
CREATE TABLE IF NOT EXISTS garden_schema_version (
  version INTEGER NOT NULL,
  applied_at TEXT NOT NULL
)
`;

// ============================================================================
// System view seeds
// ============================================================================

// Built-in collection views seeded at init. system = 1 means they cannot be deleted.
export const SYSTEM_VIEWS = [
  {
    id: 'view-inbox',
    name: 'Inbox',
    kind: 'collection' as const,
    system: 1,
    query_spec: JSON.stringify({ filter: { op: 'and', children: [
      { op: 'eq', field: 'type', value: 'item' },
      { op: 'eq', field: 'status', value: 'active' },
    ]}}),
    renderer: null,
    description: 'Unprocessed captures',
  },
  {
    id: 'view-next-actions',
    name: 'Next Actions',
    kind: 'collection' as const,
    system: 1,
    query_spec: JSON.stringify({ filter: { op: 'and', children: [
      { op: 'eq', field: 'type', value: 'action' },
      { op: 'eq', field: 'status', value: 'active' },
    ]}, sort: [{ field: 'due_date', dir: 'asc' }]}),
    renderer: null,
    description: 'Active, next physical actions',
  },
  {
    id: 'view-waiting-for',
    name: 'Waiting For',
    kind: 'collection' as const,
    system: 1,
    query_spec: JSON.stringify({ filter: { op: 'and', children: [
      { op: 'eq', field: 'type', value: 'action' },
      { op: 'eq', field: 'status', value: 'waiting' },
    ]}}),
    renderer: null,
    description: 'Actions waiting on someone else',
  },
  {
    id: 'view-someday-maybe',
    name: 'Someday Maybe',
    kind: 'collection' as const,
    system: 1,
    query_spec: JSON.stringify({ filter: { op: 'and', children: [
      { op: 'eq', field: 'type', value: 'action' },
      { op: 'eq', field: 'status', value: 'someday' },
    ]}}),
    renderer: null,
    description: 'Deferred actions for future consideration',
  },
  {
    id: 'view-all-events',
    name: 'All Events',
    kind: 'collection' as const,
    system: 1,
    query_spec: JSON.stringify({ filter: { op: 'and', children: [
      { op: 'eq', field: 'type', value: 'event' },
      { op: 'eq', field: 'status', value: 'active' },
    ]}, sort: [{ field: 'starts_at', dir: 'asc' }]}),
    renderer: null,
    description: 'All active events',
  },
  {
    id: 'view-all-notes',
    name: 'All Notes',
    kind: 'collection' as const,
    system: 1,
    query_spec: JSON.stringify({ filter: { op: 'and', children: [
      { op: 'eq', field: 'type', value: 'note' },
      { op: 'eq', field: 'status', value: 'active' },
    ]}, sort: [{ field: 'updated_at', dir: 'desc' }]}),
    renderer: null,
    description: 'All active notes',
  },
  {
    id: 'view-all-projects',
    name: 'All Projects',
    kind: 'collection' as const,
    system: 1,
    query_spec: JSON.stringify({ filter: { op: 'and', children: [
      { op: 'eq', field: 'type', value: 'project' },
      { op: 'eq', field: 'status', value: 'active' },
    ]}}),
    renderer: null,
    description: 'All active projects',
  },
  {
    id: 'view-contacts',
    name: 'Contacts',
    kind: 'collection' as const,
    system: 1,
    query_spec: JSON.stringify({ filter: { op: 'and', children: [
      { op: 'eq', field: 'type', value: 'contact' },
      { op: 'eq', field: 'status', value: 'active' },
    ]}, sort: [{ field: 'title', dir: 'asc' }]}),
    renderer: null,
    description: 'All active contacts',
  },
];
