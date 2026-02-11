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

### Archive Log

When items, actions, or events are completed (via `done`) or when any page is deleted, the file is removed from the Garden and a record is appended to `garden/archive.log`.

**Format:**
```
YYYY-MM-DD HH:MM | ACTION | type | title | details
```

**Examples:**
```
2026-01-13 14:30 | DONE | action | Call dentist | @phone +health
2026-01-13 15:00 | DELETED | project | Old project name |
2026-01-13 16:45 | DONE | action | Submit report | @computer due:2026-01-13
```

**Fields:**
- `ACTION`: `DONE` (completed) or `DELETED` (explicitly removed)
- `type`: The record type (action, item, project, note, etc.)
- `title`: The page title
- `details`: Context, project, due date if present

This keeps the Garden clean (only active items as files) while maintaining a permanent, searchable log of everything you've accomplished or removed.

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
                ┌─────────┴──────────┐
                │     EventBus       │  ← Loosely couples services
                └─────────┬──────────┘
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
| `FactsService` | Dynamic metadata tracking (view counts, momentum) |
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

### Event System

Services communicate via **EventBus** for loose coupling:

```typescript
// Services emit events
garden.create(data);  // → emits 'record.created'
garden.update(id);    // → emits 'record.updated'
garden.delete(id);    // → emits 'record.deleted'

// Other services listen
eventBus.on('record.created', (event) => {
  viewCache.invalidate(event.record.id);
  auditLog.log('create', event.record);
});
```

**Event Types:**
- `record.created` - New garden record
- `record.updated` - Record modified (includes previous state)
- `record.deleted` - Record removed
- `relationship.created` - New relationship
- `relationship.deleted` - Relationship removed

**Benefits:**
- Services don't know about each other
- Easy to add new listeners (plugins!)
- Testable in isolation
- Can disable for bulk operations

### Graph/Relationship System

Records connect via **typed relationships** for graph queries:

```typescript
// Add relationships
garden.addRelationship(actionId, projectId, 'parent');
garden.addRelationship(actionId, contactId, 'reference', { role: 'assignee' });

// Query relationships
const outgoing = garden.getRelationships(actionId, { direction: 'outgoing' });
const incoming = garden.getRelationships(projectId, { direction: 'incoming' });  // Backlinks!
const parents = garden.getRelationships(actionId, { types: ['parent'] });

// Get related records directly
const relatedRecords = garden.getRelatedRecords(actionId);  // Returns actual records
const projects = garden.getRelatedRecords(actionId, { recordTypes: ['project'] });
```

**Relationship Types:**
- `parent` - Child belongs to parent (action → project)
- `child` - Parent has children (project → actions)
- `reference` - Explicit connection (action → contact)
- `mentions` - Extracted from [[wiki links]]

**Features:**
- Bidirectional queries (get backlinks!)
- Type filtering
- Metadata support (role, strength, etc.)
- Migration from old fields (`project`, `contacts`)
- Event emission on changes

**Future:** Graph traversal, path finding, clustering, related item suggestions.

### Query Layer

Build complex queries with **QueryBuilder** - a fluent API for composing SQL queries:

```typescript
// Simple type filtering
const actions = garden.query()
  .type('action')
  .status('active')
  .exec();

// Complex query with relationships
const myTasks = garden.query()
  .type('action')
  .where('status', '=', 'active')
  .related('parent', projectId)
  .tag('urgent')
  .orderBy('due_date', 'asc')
  .limit(10)
  .exec();

// Backlinks - find what references this record
const backlinks = garden.query()
  .related('reference', noteId, 'incoming')
  .exec();

// Count queries (efficient, no record fetching)
const activeCount = garden.query()
  .type('action')
  .status('active')
  .execCount();

// Get first result
const nextAction = garden.query()
  .type('action')
  .status('active')
  .orderBy('due_date', 'asc')
  .execFirst();
```

**QueryBuilder Methods:**
- `type(type)` - Filter by record type(s)
- `status(status)` - Filter by status(es)
- `where(field, operator, value)` - Add WHERE clause (supports =, !=, >, <, >=, <=, LIKE, IN, IS NULL, IS NOT NULL)
- `related(relationType, targetId, direction)` - Filter by relationships (direction: 'outgoing' or 'incoming')
- `tag(tag)` - Filter by tag(s)
- `orderBy(field, direction)` - Sort results ('asc' or 'desc')
- `limit(count)` - Limit number of results
- `offset(count)` - Skip results (for pagination)

**Execution Methods:**
- `exec()` - Execute and return all matching records
- `execFirst()` - Execute and return first result (or null)
- `execCount()` - Execute and return count (efficient, no record fetching)
- `toSQL()` - Get SQL and parameters for debugging

**Features:**
- Fluent, chainable API
- Parameterized queries (SQL injection safe)
- Relationship joins with bidirectional support
- Tag filtering using SQLite JSON functions
- Efficient count queries without fetching records
- Multiple execution modes

**Use Cases:**
- Find all active tasks in a project
- Get backlinks (what references this note?)
- Find tagged items with specific criteria
- Paginated record listings
- Complex filtered views

### Graph Structure

Navigate the relationship graph with **GardenGraph** - traverse relationships in any direction:

```typescript
const graph = garden.graph();

// Get all children of a project
const actions = graph.getChildren(projectId);

// Find who references this note
const backlinks = graph.getBacklinks(noteId);

// Get all related records within 2 hops
const cluster = graph.getCluster(recordId, 2);

// Navigate with depth and filtering
const related = graph.getRelated(recordId, {
  depth: 2,
  direction: 'outgoing',
  types: ['reference', 'mentions'],
  recordTypes: ['note']
});
```

**GardenGraph Methods:**
- `getRelated(recordId, options)` - Flexible graph traversal with BFS
- `getParents()` - Records this one points to as parent
- `getChildren()` - Records that point to this one as parent
- `getReferences()` - Explicit outgoing references
- `getMentions()` - Outgoing wiki link mentions
- `getBacklinks(types?)` - All incoming references (optionally filtered)
- `getCluster(radius)` - Records within N hops (bidirectional)

**Options for getRelated:**
- `depth` - How many hops to traverse (default: 1)
- `direction` - 'outgoing', 'incoming', or 'both'
- `types` - Filter by relationship type(s)
- `recordTypes` - Filter by record type(s)
- `filter` - Custom filter function

**Features:**
- **Bidirectional traversal** - Navigate in any direction
- **Multi-hop queries** - Depth-configurable graph traversal
- **Cycle detection** - BFS algorithm avoids infinite loops
- **Cached adjacency list** - In-memory graph structure for performance
- **Event-driven invalidation** - Auto-refresh on relationship changes
- **Type filtering** - Filter by relationship or record types
- **Lazy loading** - Builds adjacency list on first query

**Use Cases:**
- Find all actions in a project: `graph.getChildren(projectId)`
- Discover backlinks: `graph.getBacklinks(noteId)`
- Navigate related notes: `graph.getRelated(noteId, { depth: 2, recordTypes: ['note'] })`
- Build graph visualizations: `graph.getCluster(recordId, 3)`
- Find connection paths between records
- Cluster analysis and related item suggestions

**Performance:**
- Adjacency list cached in memory
- Single database query loads all relationships
- BFS traversal: O(V + E) where V = vertices, E = edges
- Cache invalidates automatically via EventBus

### View Layer

Generate rich, dynamic pages by composing sections from multiple data sources:

```typescript
import { ViewRegistry } from './views/ViewRegistry.js';

// Get view services
const services = {
  garden: garden,
  graph: garden.graph(),
  facts: garden.facts,
};

// Create view for a project
const view = ViewRegistry.create(projectRecord, services);

// Render as markdown
const markdown = view.render();

// Or export as JSON for API
const json = view.toJSON();
```

**PageView Base Class:**
- Abstract base for all dynamic views
- `generateSections()` - subclasses implement to define page structure
- `render()` - outputs markdown
- `toJSON()` - outputs structured JSON for API
- Built-in helpers: formatDate(), formatAction(), formatNote()

**ProjectPageView Example:**

```typescript
class ProjectPageView extends PageView {
  generateSections(): Section[] {
    return [
      this.userContentSection(),      // User's markdown content
      this.contactsSection(),          // People involved (from graph)
      this.actionsSection(),           // Active tasks (from graph + filter)
      this.notesSection(),             // Related notes (from graph)
      this.mediaSection(),             // Files/images (from graph)
      this.metadataSection(),          // Stats (from facts service)
      this.backlinksSection(),         // References (from graph)
    ];
  }
}
```

**Section Types:**
- **User Content** - The markdown body written by user
- **Contacts** - People referenced by project (graph relationships)
- **Actions** - Active next actions (graph children filtered by status)
- **Notes** - Related notes and documentation (graph relationships)
- **Media** - Images and files (graph relationships)
- **Metadata/Stats** - View counts, last accessed (facts service)
- **Backlinks** - All pages that reference this one (graph incoming)

**ViewRegistry:**
- Factory pattern for creating views by record type
- `register(type, viewClass)` - register custom views
- `create(record, services)` - instantiate appropriate view
- DefaultPageView fallback for unregistered types

**Features:**
- **Multi-source composition** - Combine graph, query, facts, calendar data
- **Smart formatting** - Relative dates, context/tag display
- **Empty section handling** - Skip sections with no data
- **Dual output** - Markdown for CLI/files, JSON for API
- **Extensible** - Register custom views for any record type
- **Type-safe** - Full TypeScript support

**Use Cases:**
- Rich project pages showing all related data
- API endpoints returning structured page data
- Dashboard page rendering
- Export functionality (markdown, JSON, HTML)
- Custom views for different record types
- Plugin system for third-party views

**Example Output (Markdown):**

```markdown
## Content
This is my project description...

## 👥 People
- [[Alice Smith]]
- [[Bob Jones]]

## ✅ Next Actions
- [ ] Complete design mockups (@computer due:tomorrow)
- [ ] Send proposal to client (@email #urgent)

## 📝 Notes
- [[Meeting notes 2026-02-11]] — Discussed timeline and budget...

## 📊 Stats
- Views: 42
- Last viewed: today
```

### View Cache

Cache rendered views for performance optimization:

```typescript
const viewCache = garden.viewCache();

// Try to get cached view
const cached = viewCache.get(recordId, 'markdown');
if (cached) {
  return cached; // Fast path
}

// Generate and cache view
const view = ViewRegistry.create(record, services);
const markdown = view.render();
viewCache.set(recordId, 'markdown', markdown);
return markdown;
```

**ViewCache Methods:**
- `get(recordId, format)` - Retrieve cached view ('markdown' or 'json')
- `set(recordId, format, content)` - Store rendered view
- `invalidate(recordId, cascade)` - Mark view as stale (with optional cascade)
- `clear()` - Remove all cached entries
- `prune()` - Remove stale entries
- `has(recordId, format)` - Check if view is cached (and fresh)
- `size(format?)` - Get cache entry count
- `getMetrics()` - Get cache performance metrics
- `resetMetrics()` - Reset hit/miss counters

**Event-Driven Invalidation:**

ViewCache automatically invalidates when data changes:

```typescript
// These events trigger automatic invalidation:
// - record.created/updated/deleted → invalidates that record
// - relationship.created/deleted → invalidates source and target
```

**Cascade Invalidation:**

When a record is invalidated, related records are automatically invalidated:

```typescript
// Invalidating a project also invalidates:
// - All actions pointing to it
// - All notes referencing it
// - All contacts linked to it
viewCache.invalidate(projectId, true); // cascade = true
```

**Cache Metrics:**

```typescript
const metrics = viewCache.getMetrics();
// {
//   hits: 150,
//   misses: 50,
//   hitRate: 0.75,  // 75%
//   size: 42,
//   markdownCacheSize: 30,
//   jsonCacheSize: 12
// }
```

**Features:**
- **Separate caches** for markdown and JSON formats
- **Event-driven** - Auto-invalidates on data changes
- **Cascade invalidation** - Invalidates related records via graph
- **Stale flag** - Prevents serving outdated content
- **Metrics tracking** - Monitor cache effectiveness
- **Prune operation** - Remove stale entries
- **In-memory** - Fast access, no disk I/O

**Performance Benefits:**
- Avoid regenerating expensive views
- Reduce database queries for related data
- Lower CPU usage for repeated requests
- Improve response times for API endpoints

**Use Cases:**
- Dashboard rendering (same views requested repeatedly)
- API endpoints (cache JSON responses)
- CLI commands (cache expensive queries)
- Monitoring cache metrics for optimization

### LLM Generator

AI-powered content generation for Garden records:

```typescript
import { LLMGenerator } from './llm/LLMGenerator.js';

const generator = new LLMGenerator(llmService);

// Generate project summary
const relatedData = {
  actions: graph.getChildren(projectId).filter(r => r.type === 'action'),
  notes: graph.getRelated(projectId, { recordTypes: ['note'] }),
  contacts: graph.getRelated(projectId, { recordTypes: ['contact'] }),
  media: graph.getRelated(projectId, { recordTypes: ['media'] }),
};

const summary = await generator.summarizeProject(project, relatedData);
// "This project is progressing well with 3 active tasks..."

// Suggest next actions
const suggestions = await generator.suggestNextActions(
  project,
  'Need to launch new feature',
  existingActions
);
// ['Review design mockups', 'Complete spec', 'Schedule kickoff', ...]

// Generate weekly review
const review = await generator.generateWeeklyReview(
  completedActions,
  upcomingEvents,
  { includeStats: true, includeProjects: true }
);
// "Great week! You completed 5 tasks across 3 projects..."
```

**LLMGenerator Methods:**
- `summarizeProject(project, relatedData)` - Generate 2-3 sentence project summary
- `suggestNextActions(project, context, actions)` - AI-suggested next steps (max 5)
- `generateWeeklyReview(completed, upcoming, options)` - Weekly review summary
- `invalidateProject(projectId)` - Clear cached responses for a project
- `clearCache()` - Clear all cached responses

**Features:**
- **Automatic caching** - Responses cached with TTL (1 hour default, 24 hours for reviews)
- **Cache invalidation** - Cache keys include updated_at timestamp
- **Fast model** - Uses 'fast' tier for quick generation
- **Bullet parsing** - Automatically extracts list items from LLM responses
- **Project grouping** - Optional grouping for weekly reviews
- **Graceful degradation** - Handles missing data, empty projects

**Cache Behavior:**
- Project summaries: Cached per `${projectId}:${updated_at}`
- Next actions: Cached per `${projectId}:${updated_at}`
- Weekly reviews: Cached per week start date + action count
- TTL: 1 hour (summaries/actions), 24 hours (reviews)

**Use Cases:**
- Project page summaries (auto-generated overview)
- AI-suggested next steps (help users plan)
- Weekly review generation (reflection tool)
- Dashboard widgets (progress summaries)
- CLI commands (quick project status)

**Performance:**
- LLM calls: 1-3s depending on model
- Cache hits: <1ms
- TTL ensures fresh data without excessive API calls

### Templates

Create Garden records from templates with variable substitution:

```typescript
import { TemplateEngine } from './templates/TemplateEngine.js';

const templates = new TemplateEngine(garden, config);
await templates.initialize();

// Create default templates (gtd-project, meeting-notes, contact)
templates.createDefaultTemplates();

// Create record from template
const project = templates.createFromTemplate(
  'gtd-project',
  {
    title: 'Launch Product',
    description: 'Launch our new product to market.',
    goal1: 'Complete development',
    goal2: 'Marketing campaign',
    goal3: 'Sales targets',
  },
  { status: 'active' }
);
```

**Template Format:**

Templates are markdown files with frontmatter:

```markdown
---
name: gtd-project
description: GTD project with goals and success criteria
type: project
defaults:
  status: active
---
# {{title}}

{{description}}

## Goals
- {{goal1}}
- {{goal2}}
- {{goal3}}

## Success Criteria
- [ ] {{criteria1}}
- [ ] {{criteria2}}
```

**TemplateEngine Methods:**
- `register(template)` - Register a template programmatically
- `get(name)` - Get a template by name
- `list()` - List all available templates
- `render(name, vars)` - Render template with variable substitution
- `createFromTemplate(name, vars, overrides)` - Create Garden record from template
- `saveTemplate(template)` - Save template to disk
- `deleteTemplate(name)` - Delete a template
- `createDefaultTemplates()` - Create built-in templates

**Default Templates:**
- **gtd-project** - GTD project with goals, success criteria, next actions
- **meeting-notes** - Structured meeting notes (agenda, decisions, action items)
- **contact** - Contact information template

**Features:**
- **Variable substitution** - `{{variable}}` placeholders
- **Default values** - Template-level defaults
- **Override mechanism** - Provided vars override defaults
- **Title extraction** - Auto-extract title from first heading
- **Disk persistence** - Templates saved to `garden/templates/`
- **Auto-loading** - Templates loaded on initialization

**Variable Substitution:**
- Syntax: `{{variableName}}`
- Defaults can be specified in frontmatter
- Provided variables override defaults
- Unsubstituted placeholders are removed

**Use Cases:**
- Consistent project structure
- Standardized meeting notes
- Contact information capture
- Custom page types
- Team templates and conventions

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

CREATE TABLE context_facts (
  record_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,           -- JSON-serialized value
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT,               -- Optional TTL
  PRIMARY KEY (record_id, key)
);

CREATE INDEX idx_facts_record ON context_facts(record_id);
CREATE INDEX idx_facts_key ON context_facts(key);
CREATE INDEX idx_facts_expires ON context_facts(expires_at);

CREATE TABLE garden_relationships (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  relation_type TEXT NOT NULL,  -- parent, child, reference, mentions
  metadata TEXT,                 -- JSON: { role, strength, ... }
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_rel_source ON garden_relationships(source_id);
CREATE INDEX idx_rel_target ON garden_relationships(target_id);
CREATE INDEX idx_rel_type ON garden_relationships(relation_type);
CREATE INDEX idx_rel_source_type ON garden_relationships(source_id, relation_type);
```

**context_facts** stores dynamic metadata about garden records without writing to markdown files:
- Usage statistics (view counts, edit counts, last accessed)
- AI-generated insights (momentum scores, risk assessments)
- Behavioral patterns (session times, completion rates)
- Temporary state (snooze history, queue status)

This data is **derived and non-essential** - if lost, it regenerates going forward. Markdown files remain the source of truth.

**garden_relationships** stores typed connections between records:
- **Relationship types:** parent (child→parent), child (parent→child), reference (explicit link), mentions (from [[links]])
- **Bidirectional queries:** Fast lookups in both directions (source→target, target→source)
- **Metadata support:** Store role, strength, or custom attributes
- **Graph navigation:** Enables backlinks, related items, path finding

Old fields (`project`, `contacts`) are preserved for backward compatibility but relationships are the primary system going forward.

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
