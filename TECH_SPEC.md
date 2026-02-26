# Bartleby Technical Specification

Developer documentation for extending and understanding Bartleby internals.

- [Garden Specification](#garden-specification)
- [Architecture](#architecture)
- [Extending Bartleby](#extending-bartleby)
- [Database Schemas](#database-schemas)

---

## Garden Specification

The complete specification for Garden records — types, fields, statuses, and relationships.

### Record Types

Every Garden record has a `type`:

| Type | Purpose |
|------|---------|
| `item` | Unprocessed inbox capture (from quick capture) |
| `action` | GTD next action with optional context and due date |
| `project` | A multi-step outcome with associated actions and notes |
| `note` | Free-form text note |
| `event` | Calendar event with start/end time |
| `contact` | Person with contact details |
| `tag` | Label for organizing notes |
| `media` | Imported file (image, document, etc.) |

### Record Fields

Every Garden record has these fields:

```typescript
interface GardenRecord {
  id: string;
  type: RecordType;
  title: string;
  status: RecordStatus;
  content: string | null;
  created_at: string;     // ISO 8601
  updated_at: string;

  // Action fields
  context: string | null;         // @phone, @computer, etc.
  energy: string | null;          // low, medium, high
  time_estimate: string | null;   // "30 min", "2 hours"
  due_date: string | null;        // ISO date

  // Event fields
  starts_at: string | null;       // ISO datetime
  ends_at: string | null;
  all_day: number | null;         // 1 = true
  location: string | null;

  // Contact fields
  email: string | null;
  phone: string | null;
  company: string | null;
  address: string | null;
  birthday: string | null;

  // Media fields
  file_path: string | null;
  mime_type: string | null;
  file_size: number | null;

  // Metadata
  source: string | null;          // 'typed', 'imported', etc.
  metadata: string | null;        // JSON blob for extras
}
```

### Status Values

| Status | Meaning |
|--------|---------|
| `active` | Current, in progress |
| `completed` | Done |
| `waiting` | Delegated or blocked |
| `someday` | Someday/maybe |
| `archived` | Hidden but kept |
| `processed` | Inbox item has been processed |

### Relationship Types

Records connect via typed directed edges:

| Type | Meaning | Direction |
|------|---------|-----------|
| `belongs_to` | Child belongs to parent | action/note → project |
| `involves` | Record involves a contact | project/event → contact |
| `references` | Wiki-link backlink (`[[Title]]`) | note → note/any |
| `tagged_with` | Note has tag | note → tag |
| `attends` | Contact attends event | contact → event |
| `waiting_on` | Action is waiting on contact | action → contact |

---

## Architecture

### Overview

```
┌─────────────────────────────────────────────────────────────┐
│                  REPL / Dashboard (UI)                       │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────┴───────────────────────────────────┐
│                    Command Router                            │
│     Pattern → Keyword → Semantic → LLM Fallback             │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────┴───────────────────────────────────┐
│                        Tools                                 │
│   Actions │ Projects │ Notes │ Contacts │ Events │ Views    │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────┴───────────────────────────────────┐
│                       Services                               │
│   Garden (4-layer) │ Learning │ LLM │ Embeddings │ Vectors  │
│   Shed │ Context │ Settings │ OCR │ Weather │ Signal        │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────┴───────────────────────────────────┐
│                       Storage                                │
│           bartleby.db (SQLite, WAL mode)                     │
└─────────────────────────────────────────────────────────────┘
```

### Garden: 4-Layer Architecture

The garden uses a clean 4-layer architecture with hard boundaries:

```
Layer 1: GardenService       — Record CRUD (knows nothing about relationships or views)
Layer 2: RelationshipService — Directed edge CRUD + backlink sync
Layer 3: ViewService         — View resolution, QueryService execution, Assemblers
Layer 4: Renderers           — ViewData → output (ReplRenderer, DashboardRenderer)
```

**ViewData** is the intermediate representation output by Layer 3 and consumed by Layer 4:

```typescript
interface ViewData {
  id: string;
  title: string;
  type?: RecordType;
  sections: Section[];
}

type Section =
  | { kind: 'content';  title: string; markdown: string }
  | { kind: 'list';     title: string; items: RecordSummary[]; count: number }
  | { kind: 'metadata'; title: string; fields: MetadataField[] }
  | { kind: 'graph';    title: string; nodes: string[]; edges: string[] };
```

**Assemblers** implement one per record type: given a record and services, produce a `ViewData` with appropriate sections. Each assembler traverses the relationship graph to collect related records.

**QueryService** executes a `QuerySpec` (filter AST + sort + limit) against records:

```typescript
interface QuerySpec {
  filter?: FilterExpr;   // eq / neq / contains / and / or / not / traverse
  sort?: SortSpec[];
  limit?: number;
}
```

### How Routing Works

95% of requests are handled without calling an LLM:

**Layer 1: Pattern Matching**
```
/^show next actions$/i → listActions
/^capture (.+)$/i → captureItem
```

**Layer 2: Keyword Matching**
```
verbs: [add, create] + nouns: [action, task] → addAction (score 0.9)
noun only: [action] → score 0.7 (below threshold, no match)
```

**Layer 3: Semantic Matching**
Embed the input, compare to tool example embeddings, pick highest match above threshold.

**Layer 4: LLM Fallback**
If nothing matches, ask the Fast model to pick a tool. If complex, use Thinking model for multi-step reasoning.

### Services

| Service | Purpose |
|---------|---------|
| `GardenService` | Layer 1: Record CRUD, emits `change` events (EventEmitter) |
| `RelationshipService` | Layer 2: Edge CRUD, `syncBacklinks()` for `[[wiki links]]` |
| `ViewService` | Layer 3: View resolution, catalogue, user views |
| `ContextService` | User facts, conversation history, session management |
| `LearningService` | Entity-Observation-Relationship memory system |
| `ReflectionService` | Continuous learning from interactions |
| `SettingsService` | Runtime configuration, database-backed |
| `ShedService` | Document ingestion, RAG (reference library) |
| `LLMService` | Model tiers, chat completions, routing decisions |
| `EmbeddingService` | Text to vectors |
| `VectorService` | HNSW index for similarity search |
| `OCRService` | Image text extraction |
| `WeatherService` | Weather API integration |
| `SignalService` | Mobile notifications |
| `DataService` | CSV ingestion and SQL queries |

### WebSocket / Real-time Dashboard

`GardenService` emits a `change` event on every write:

```typescript
garden.on('change', (event: { op: 'create' | 'update' | 'delete', record: GardenRecord }) => {
  // server pushes updated ViewData to subscribed clients
});
```

The server maintains a `TYPE_VIEW_MAP` to know which view names are affected by each record type, and pushes `{ type: 'data', view: name, viewData: {...} }` to all subscribed WebSocket clients.

### Tool Interface

Tools are the interface between user intent and services:

```typescript
export const addAction: Tool = {
  name: 'addAction',
  description: 'Add a new action',
  routing: {
    patterns: [/^(?:add|new) action (.+)$/i],
    keywords: { verbs: ['add', 'create'], nouns: ['action', 'task'] },
    examples: ['add action buy groceries @errands'],
    priority: 70,
  },
  parameters: {
    type: 'object',
    properties: {
      title:   { type: 'string' },
      context: { type: 'string' },
      due:     { type: 'string' },
    },
    required: ['title'],
  },
  parseArgs: (input) => { /* extract from natural language */ },
  execute: async (args, ctx) => {
    const garden = (ctx.services as any).garden as GardenService;
    const record = garden.create({ type: 'action', title: args.title, ... });
    const views  = (ctx.services as any).views as ViewService;
    const vd     = views.resolve('Next Actions')!;
    return new ReplRenderer().render(vd);
  },
};
```

---

## Extending Bartleby

### Adding a Tool

1. Create or edit a file in `src/tools/`
2. Define the tool following the `Tool` interface
3. Import and add to the `allTools` array in `src/tools/index.ts`

```typescript
// src/tools/example.ts
import { Tool } from './types.js';
import type { GardenService } from '../garden/GardenService.js';

export const greet: Tool = {
  name: 'greet',
  description: 'Greet the user',
  routing: {
    patterns: [/^(hello|hi|hey)$/i],
    keywords: { verbs: ['say'], nouns: ['hello', 'hi'] },
    examples: ['hello', 'hi bartleby'],
    priority: 50,
  },
  execute: async (args, context) => {
    const learning = context.services.learning;
    const obs = learning.searchObservations('preferred_name', 1);
    const name = obs[0]?.value;
    return name ? `Hello, ${name}!` : 'Hello!';
  },
};
```

### Adding a Service

1. Create `src/services/myservice.ts`
2. Export a class with optional `initialize()` and `close()` methods
3. Add to `ServiceContainer` interface in `src/services/index.ts`
4. Initialize in `initServices()`, close in `closeServices()` if it owns a DB connection

---

## Database Schemas

### Main Database (`bartleby.db`)

All garden data, settings, and learning share one SQLite file. WAL mode enabled, foreign keys ON.

**Garden records:**
```sql
CREATE TABLE records (
  id           TEXT PRIMARY KEY,
  type         TEXT NOT NULL,
  title        TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'active',
  content      TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  context      TEXT,
  energy       TEXT,
  time_estimate TEXT,
  due_date     TEXT,
  starts_at    TEXT,
  ends_at      TEXT,
  all_day      INTEGER,
  location     TEXT,
  email        TEXT,
  phone        TEXT,
  company      TEXT,
  address      TEXT,
  birthday     TEXT,
  file_path    TEXT,
  mime_type    TEXT,
  file_size    INTEGER,
  source       TEXT,
  metadata     TEXT
);

CREATE INDEX idx_records_type       ON records(type);
CREATE INDEX idx_records_status     ON records(status);
CREATE INDEX idx_records_type_status ON records(type, status);
CREATE INDEX idx_records_due_date   ON records(due_date);
CREATE INDEX idx_records_updated_at ON records(updated_at DESC);
CREATE INDEX idx_records_title      ON records(title COLLATE NOCASE);
```

**Relationships:**
```sql
CREATE TABLE record_relationships (
  id        TEXT PRIMARY KEY,
  from_id   TEXT NOT NULL REFERENCES records(id) ON DELETE CASCADE,
  to_id     TEXT NOT NULL REFERENCES records(id) ON DELETE CASCADE,
  type      TEXT NOT NULL,
  created_at TEXT NOT NULL,
  metadata  TEXT,
  UNIQUE(from_id, to_id, type)
);

CREATE INDEX idx_rels_from      ON record_relationships(from_id, type);
CREATE INDEX idx_rels_to        ON record_relationships(to_id, type);
CREATE INDEX idx_rels_from_to   ON record_relationships(from_id, to_id);
```

**Views:**
```sql
CREATE TABLE garden_view (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  kind        TEXT NOT NULL DEFAULT 'collection',
  system      INTEGER NOT NULL DEFAULT 0,
  query_spec  TEXT,
  renderer    TEXT,
  description TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
```

**System views (seeded on init):** Inbox, Next Actions, Waiting For, Someday Maybe, All Events, All Notes, All Projects, Contacts.

### Settings Tables (`bartleby.db`)

```sql
CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  value_type TEXT NOT NULL,
  category   TEXT NOT NULL,
  description TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE settings_metadata (
  id                  TEXT PRIMARY KEY DEFAULT 'singleton',
  first_run_completed BOOLEAN DEFAULT FALSE,
  migration_version   INTEGER DEFAULT 0,
  last_migration_at   TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**Settings categories:** `llm.*`, `embeddings.*`, `ocr.*`, `weather.*`, `signal.*`, `dashboard.*`

### Learning System (`bartleby.db`)

**Entity-Observation-Relationship (EOR) pattern:**

```sql
CREATE TABLE entities (
  id         TEXT PRIMARY KEY,
  type       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  data       TEXT
);

CREATE TABLE observations (
  id           TEXT PRIMARY KEY,
  entity_id    TEXT NOT NULL,
  key          TEXT NOT NULL,
  value        TEXT NOT NULL,
  value_type   TEXT NOT NULL DEFAULT 'string',
  source_type  TEXT NOT NULL,
  source_id    TEXT,
  confidence   REAL NOT NULL,
  observed_at  TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at   TEXT,
  supersedes   TEXT,
  search_text  TEXT,
  last_accessed_at TEXT,
  access_count     INTEGER DEFAULT 0,
  activation_score REAL DEFAULT 0.5
);

CREATE TABLE relationships (
  id            TEXT PRIMARY KEY,
  from_entity   TEXT NOT NULL,
  to_entity     TEXT NOT NULL,
  relation_type TEXT NOT NULL,
  strength      REAL,
  context       TEXT,
  observed_at   TEXT NOT NULL DEFAULT (datetime('now')),
  source_id     TEXT
);

CREATE VIRTUAL TABLE observations_fts USING fts5(
  key, value, search_text,
  content='observations', content_rowid='rowid'
);
```

**Observation key namespace conventions:**

| Key prefix | What it stores | Loaded in prompt? |
|------------|---------------|-------------------|
| `preference.*` | Soft user preferences | Hot tier |
| `pattern.*` | Behavioral patterns | Hot tier |
| `context.*` | Current working state | Hot tier |
| `goal.*` | Tracked objectives | Hot tier |
| `instruction.*` | Standing instructions (mandatory) | Always (all) |

**Standing instructions (`instruction.*`):**
- Confidence: `1.0`, no expiry (permanent until explicitly deleted)
- Loaded unconditionally in `buildRichContext()` (bypasses hot-tier filter)
- Injected into every system prompt as `## Standing Instructions (MANDATORY)` section
- Deletion: supersedes with `confidence: 0, value: '[DELETED]'`

**Phase 5 Activation (2026-02):**
```
activation = (0.4 × recency) + (0.3 × frequency) + (0.3 × confidence)
```
- 90% reduction in context tokens via hot-tier loading
- Automatic daily consolidation and decay
- Relationship-aware search (max 2 hops)

### Shed Database (`shed.sqlite3`)

Separate file for the document library (reference material):

```sql
CREATE TABLE sources (
  id          TEXT PRIMARY KEY,
  filename    TEXT NOT NULL,
  filepath    TEXT NOT NULL,
  title       TEXT,
  author      TEXT,
  source_type TEXT,
  source_url  TEXT,
  ingested_at TEXT DEFAULT (datetime('now')),
  metadata    TEXT
);

CREATE TABLE chunks (
  id           TEXT PRIMARY KEY,
  source_id    TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  chunk_index  INTEGER NOT NULL,
  content      TEXT NOT NULL,
  token_count  INTEGER,
  embedding_id TEXT,
  metadata     TEXT,
  UNIQUE(source_id, chunk_index)
);
```

---

*See [README.md](README.md) for user documentation.*
