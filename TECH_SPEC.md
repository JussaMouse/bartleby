# Bartleby Technical Specification

Developer documentation for extending and understanding Bartleby internals.

- [Garden Specification](#garden-specification)
- [Architecture](#architecture)
- [Extending Bartleby](#extending-bartleby)
- [Database Schemas](#database-schemas)

---

## Garden Specification

The complete specification for Garden pages — types, fields, statuses, and file format.

### Page Types

Every Garden page has a `type` that determines its behavior:

| Type | Description | Has Workflow? | Example |
|------|-------------|---------------|---------|
| `item` | Raw inbox capture, not yet processed | ✓ (item → action) | "Random thought to process" |
| `action` | Concrete next step you can do | ✓ (active → done) | "Call dentist @phone" |
| `project` | Outcome requiring multiple actions | ✓ (active → done) | "2025 Taxes" |
| `entry` | Wiki/encyclopedia page | No | "How our deploy pipeline works" |
| `note` | Working notes, scratch, meeting notes | No | "1:1 with Sarah 2026-01-13" |
| `contact` | Person with details | No | "Sarah Chen" |
| `daily` | Journal entry (one per day) | No | "2026-01-13" |
| `list` | Curated collection | No | "Reading list", "Gift ideas" |
| `media` | Reference to ingested document | No | "Q4 Report.pdf" |

**Workflow types** (`item`, `action`, `project`) have a status that changes over time.
**Knowledge types** (`entry`, `note`, `contact`, `daily`, `list`, `media`) are persistent reference.

### Record Fields

Every Garden record can have these fields:

| Field | Type | Description | Used By |
|-------|------|-------------|---------|
| `id` | string | Unique identifier (UUID) | All |
| `type` | string | Page type (see above) | All |
| `title` | string | Display name | All |
| `status` | string | Current state (see below) | All |
| `content` | string | Body text / markdown | All |
| `tags` | string[] | Categorization tags | All |
| `context` | string | GTD context (@phone, @computer) | action |
| `project` | string | Parent project (+project-name) | action |
| `due_date` | string | When it's due (ISO date) | action, project |
| `waiting_for` | string | Who you're waiting on | action |
| `energy` | string | Energy level needed (low, medium, high) | action |
| `time_estimate` | string | How long it takes | action |
| `email` | string | Email address | contact |
| `phone` | string | Phone number | contact |
| `birthday` | string | Birthday (MM-DD or YYYY-MM-DD) | contact |
| `metadata` | object | Arbitrary extra data | All |
| `created_at` | string | When created (ISO timestamp) | All |
| `updated_at` | string | When last modified (ISO timestamp) | All |
| `completed_at` | string | When completed (ISO timestamp) | action, project |

### Status Values

| Status | Meaning | Typical Flow |
|--------|---------|--------------|
| `active` | Currently actionable | Default for new items |
| `completed` | Done | Action/project finished |
| `archived` | No longer relevant | Kept for history |
| `someday` | Maybe later | GTD someday/maybe list |
| `waiting` | Blocked on someone | Delegated items |

**Typical workflow:**
```
item (active) → action (active) → action (completed)
                    ↓
              action (waiting) → action (active) → action (completed)
                    ↓
              action (someday)
```

### GTD Contexts

Contexts represent *where* or *with what* you can do an action. Convention is `@` prefix:

| Context | Meaning |
|---------|---------|
| `@inbox` | Not yet processed (default for captures) |
| `@phone` | Requires phone calls |
| `@computer` | At your computer |
| `@errands` | Out and about |
| `@home` | Around the house |
| `@office` | At work |
| `@waiting` | Delegated, waiting for response |
| `@anywhere` | Can do anywhere |
| `@focus` | Requires deep focus |

You can create any context you want. These are just conventions.

### Tags

Tags categorize pages across types. Convention: lowercase, no spaces.

**Common patterns:**
```
tags: [urgent]           # Priority
tags: [taxes, 2025]      # Topic + year
tags: [meeting, sarah]   # Type + person
tags: [idea, blog]       # Category
```

### Backmatter Format

Garden files use **backmatter** — content first, metadata at the bottom.

**Structure:**
```markdown
# Title

Your content goes here. Write as much as you want.
This is what you'll read and edit most often.

---
tags: [urgent, taxes]
context: "@phone"
project: "2025-taxes"
due: 2026-01-15
type: action
status: active
id: abc-123-def
created_at: 2026-01-13T10:00:00Z
updated_at: 2026-01-13T10:00:00Z
---
```

**Why backmatter?**
- Content first — you read the content, not the metadata
- Metadata is still machine-parseable
- Easy to edit in any text editor

**Field ordering:**
Fields are written in human-relevance order:

1. **What you care about:** `tags`, `context`, `project`, `due`
2. **GTD details:** `waiting_for`, `energy`, `time_estimate`
3. **Contact fields:** `email`, `phone`, `birthday`
4. **Classification:** `type`, `status`
5. **System (last):** `id`, `created_at`, `updated_at`

**Examples by type:**

*Action:*
```markdown
# Call accountant about quarterly estimates

Ask about Q1 payment deadline and estimated amounts.

---
tags: [urgent]
context: "@phone"
project: "2025-taxes"
due: 2026-01-15
type: action
status: active
id: a1b2c3d4
---
```

*Contact:*
```markdown
# Sarah Chen

Met at the conference. Works on developer tools.

---
tags: [work, engineering]
email: sarah@example.com
phone: 555-1234
birthday: 03-15
type: contact
status: active
id: e5f6g7h8
---
```

*Entry (wiki page):*
```markdown
# How our deploy pipeline works

We use GitHub Actions to build and deploy...

## Stages
1. Build
2. Test
3. Deploy to staging
4. Deploy to production

---
tags: [engineering, infrastructure]
type: entry
status: active
id: i9j0k1l2
---
```

**Parser:** `src/utils/garden-parser.ts`

---

## Architecture

### Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        REPL (UI)                            │
│              User input → Response display                  │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────┴───────────────────────────────────┐
│                    Command Router                           │
│     Pattern → Keyword → Semantic → LLM Fallback             │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────┴───────────────────────────────────┐
│                        Tools                                │
│   GTD │ Calendar │ Contacts │ Shed │ Scheduler │ System    │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────┴───────────────────────────────────┐
│                       Services                              │
│  Garden │ Calendar │ Context │ Shed │ Scheduler │ Presence  │
│  LLM │ Embeddings │ Vectors │ Signal │ Weather              │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────┴───────────────────────────────────┐
│                       Storage                               │
│   garden/*.md │ shed/ │ database/*.sqlite3 │ logs/          │
└─────────────────────────────────────────────────────────────┘
```

### How Routing Works

95% of requests are handled without calling an LLM:

**Layer 1: Pattern Matching**
```
/^show next actions$/i → viewNextActions
/^done (\d+)$/i → markDone
```

**Layer 2: Keyword Matching**
```
verbs: [show, list] + nouns: [actions, tasks] → viewNextActions
```

**Layer 3: Semantic Matching**
Embed the input, compare to tool example embeddings, pick highest match above threshold.

**Layer 4: LLM Fallback**
If nothing matches, ask the Fast model to pick a tool. If complex, use Thinking model for multi-step reasoning.

### Services

| Service | Purpose |
|---------|---------|
| `GardenService` | CRUD for wiki pages, file sync |
| `CalendarService` | Events, temporal index |
| `ContextService` | User facts, conversation history |
| `ShedService` | Document ingestion, RAG |
| `SchedulerService` | Bartleby's task manager |
| `PresenceService` | Startup/shutdown messages, proactive behavior |
| `LLMService` | Model tiers, chat completions |
| `EmbeddingService` | Text to vectors |
| `VectorService` | HNSW index for similarity search |
| `SignalService` | Mobile notifications |
| `WeatherService` | Weather API |

### Tool Interface

Tools are the interface between user intent and services:

```typescript
export const myTool: Tool = {
  name: 'myTool',
  description: 'What it does',
  routing: {
    patterns: [/^my command$/i],
    keywords: { verbs: ['my'], nouns: ['command'] },
    examples: ['my command', 'do my thing'],
    priority: 70,
  },
  parameters: { /* JSON Schema */ },
  parseArgs: (input, match) => { /* extract args */ },
  execute: async (args, context) => { /* do the thing */ },
};
```

### Bidirectional Sync

```
┌──────────────┐     write      ┌──────────────┐
│   Bartleby   │ ─────────────► │  garden/*.md │
│   (SQLite)   │ ◄───────────── │    (files)   │
└──────────────┘     watch      └──────────────┘
```

- Bartleby writes: Updates file immediately
- User edits file: `chokidar` detects change, syncs to DB
- Files are truth: If conflict, file wins

---

## Extending Bartleby

### Adding a Tool

1. Create or edit a file in `src/tools/`
2. Define the tool following the `Tool` interface
3. Export from the tool file's array
4. Import in `src/tools/index.ts`

**Example:**

```typescript
// src/tools/example.ts
import { Tool } from './types.js';

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
    const name = context.services.context.getFact('identity', 'name')?.value;
    return name ? `Hello, ${name}!` : 'Hello!';
  },
};

export const exampleTools = [greet];
```

### Adding a Service

1. Create `src/services/myservice.ts`
2. Export a class with `initialize()` and `close()` methods
3. Add to `ServiceContainer` interface in `src/services/index.ts`
4. Initialize in `initServices()`, close in `closeServices()`

---

## Database Schemas

### Garden (`garden.sqlite3`)

```sql
CREATE TABLE garden_records (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,        -- action, project, note, contact, etc.
  title TEXT NOT NULL,
  content TEXT,
  status TEXT DEFAULT 'active',
  context TEXT,              -- @phone, @computer, etc.
  project TEXT,              -- +project-name
  due_date TEXT,
  tags TEXT,                 -- JSON array
  created_at TEXT,
  updated_at TEXT
);

CREATE INDEX idx_type ON garden_records(type);
CREATE INDEX idx_status ON garden_records(status);
CREATE INDEX idx_due_date ON garden_records(due_date);
```

### Calendar (`calendar.sqlite3`)

```sql
CREATE TABLE events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT,
  entry_type TEXT DEFAULT 'event',  -- event, deadline, reminder
  source_type TEXT,                  -- calendar, garden, scheduler
  source_id TEXT,
  reminder_minutes INTEGER DEFAULT 0,
  metadata TEXT
);

CREATE INDEX idx_start_time ON events(start_time);
CREATE INDEX idx_entry_type ON events(entry_type);
```

### Scheduler (`scheduler.sqlite3`)

```sql
CREATE TABLE scheduled_tasks (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,        -- reminder, recurring
  description TEXT,
  next_run TEXT NOT NULL,
  interval_ms INTEGER,
  action TEXT NOT NULL,      -- JSON: what to do
  created_at TEXT
);

CREATE INDEX idx_next_run ON scheduled_tasks(next_run);
```

---

*See [README.md](README.md) for user documentation.*
