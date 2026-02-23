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
| `SettingsService` | Runtime configuration, database-backed settings |
| `InboxService` | Import history, duplicate detection |
| `LearningService` | Entity-Observation-Relationship memory system (Phase 5: activation tracking, consolidation) |

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

### Import System

The Import System provides smart file ingestion with duplicate detection, rule-based organization, and configurable workflows.

**Architecture:**

```
┌──────────────────────────────────────────────────────────────┐
│                         Inbox                                 │
│         Drop files → Detect duplicates → Apply rules         │
└────────────────┬─────────────────────────────────────────────┘
                 │
        ┌────────┴────────┐
        │  InboxService   │
        │                 │
        │ - SHA256 hashing │
        │ - Import history │
        │ - Duplicate check│
        └────────┬────────┘
                 │
        ┌────────┴────────┐
        │  Import Rules   │
        │                 │
        │ - Match patterns│
        │ - Auto-organize │
        │ - Profiles      │
        └────────┬────────┘
                 │
        ┌────────┴────────┐
        │ GardenService   │
        │  Create records │
        └─────────────────┘
```

**Components:**

**InboxService** (`src/services/inbox.ts`):
- Import history tracking with metadata
- SHA256-based duplicate detection
- Statistics (imports by type, date)
- Links to created Garden records

```typescript
class InboxService {
  async checkDuplicate(filePath: string): Promise<DuplicateCheckResult>
  async recordImport(item: InboxItem, recordId: string, ruleApplied?: string): Promise<void>
  getImportHistory(limit?: number): ImportHistoryRecord[]
  searchHistory(query: string): ImportHistoryRecord[]
  getImportStats(): { total: number, byType: Record<string, number>, ... }
}
```

**Import Rules** (`import-rules.json`):
- Pattern-based file matching (filename, type, content)
- Auto-apply metadata (project, context, privacy, tags)
- Priority system for rule resolution
- Interactive CRUD commands

```typescript
interface ImportRule {
  name: string;
  match: {
    filenamePattern?: string;
    fileTypes?: FileType[];
    contentPattern?: string;
  };
  actions: {
    project?: string;
    context?: string;
    privacy?: PrivacyLevel;
    tags?: string[];
  };
  priority: number;
  enabled: boolean;
}
```

**Import Profiles** (`import-profiles.json`):
- Named configurations for different workflows
- Profile settings: project, context, privacy, OCR, auto-confirm, duplicate handling
- Zod validation for type safety

```typescript
interface ImportProfile {
  name: string;
  description: string;
  defaultProject?: string;
  defaultContext?: string;
  defaultPrivacy?: 'public' | 'private' | 'confidential';
  enableOcr: boolean;
  autoConfirm: boolean;
  duplicateAction: 'skip' | 'prompt' | 'reimport';
  rulesEnabled: boolean;
}
```

**Tools:**

| Tool | Description |
|------|-------------|
| `importFiles` | Import files from inbox directory |
| `importAll` | Batch import with rule matching |
| `importWithProfile` | Import using named profile |
| `showImportHistory` | View import history |
| `createImportRule` | Interactive rule creation wizard |
| `editImportRule` | Modify existing rule |
| `deleteImportRule` | Remove rule |
| `testImportRule` | Dry-run test against inbox |
| `createImportProfile` | Create new profile |
| `listImportProfiles` | Show available profiles |

**Features:**
- **Duplicate Detection** - SHA256 hashing prevents re-imports
- **Dry-Run Mode** - Preview imports before executing (`--dry-run`)
- **Rule Matching** - Auto-organize files with confidence scores
- **Import History** - Full audit trail with metadata
- **Profile Workflows** - Preset configurations for different scenarios
- **Zod Validation** - Type-safe parameters for all tools
- **Result Types** - Structured error handling

**Typical Workflow:**

```typescript
// 1. Drop files into inbox directory
// 2. Bartleby detects new files
> import files

// 3. Check for duplicates via SHA256
// 4. Match against import rules (priority order)
// 5. Preview what will be imported
// 6. Confirm and create Garden records
// 7. Record in import history
// 8. Move files from inbox
```

**Use Cases:**
- Batch document imports with consistent metadata
- Receipt scanning with auto-categorization
- Research paper organization
- Photo imports with OCR
- Work document ingestion with privacy settings

### Settings System

The Settings System provides runtime configuration with database-backed storage and interactive management.

**Architecture:**

```
┌──────────────────────────────────────────────────────────────┐
│                    Configuration Layers                       │
│                                                               │
│  Bootstrap (.env)          Runtime (database)                │
│  ─────────────────         ──────────────────                │
│  - LLM_URL                 - llm.router-model                │
│  - DATABASE_PATH           - llm.fast-model                  │
│  - GARDEN_PATH             - calendar.timezone               │
│  - LOG_LEVEL               - presence.startup                │
│  (15 lines total)          - import.ocr-enabled              │
│                            - defaults.project                │
│                            (100+ settings)                   │
└──────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────┴──────────┐
                    │  SettingsService   │
                    │                    │
                    │  - Type conversion │
                    │  - Category org    │
                    │  - Caching         │
                    │  - Migration       │
                    └────────────────────┘
```

**Hybrid Configuration:**

**Bootstrap Settings** (`.env` - required to start):
```bash
# Bootstrap only - ~15 lines
LLM_URL=http://localhost:11434/v1
DATABASE_PATH=./database
GARDEN_PATH=./garden
LOG_LEVEL=info
```

**Runtime Settings** (database - everything else):
- LLM configuration (models, tiers, timeouts, agent settings)
- Calendar settings (timezone, format, duration, reminders)
- Presence settings (startup, scheduled, contextual, idle)
- Import settings (OCR, duplicates, auto-confirm, rules)
- Default metadata (project, privacy, context)
- Content processing (max length, structure, extraction)
- Optional features (OCR, weather, Signal, scheduler)
- Dashboard settings (host, port)

**SettingsService** (`src/services/settings.ts`):

```typescript
class SettingsService {
  // Core operations
  getSetting<T>(key: string, defaultValue?: T): T
  setSetting<T>(key: string, value: T, category: string, description?: string): void
  getCategory(category: string): Record<string, unknown>
  getAllSettings(): Record<string, Record<string, unknown>>
  reset(category?: string): void

  // First-run detection
  isFirstRun(): boolean
  markFirstRunComplete(): void

  // Migration
  migrateFromEnv(envConfig: Record<string, any>): void
  getMigrationVersion(): number

  // Statistics
  getStats(): { total: number, byCategory: Record<string, number>, ... }
}
```

**Settings Categories:**

| Category | Settings |
|----------|----------|
| `llm.*` | router-model, fast-model, thinking-model, max-tokens, timeouts |
| `embeddings.*` | model, dimensions |
| `calendar.*` | timezone, date-format, default-duration, reminder-minutes |
| `presence.*` | startup, scheduled, contextual, idle, morning-hour |
| `import.*` | ocr-enabled, duplicate-action, auto-confirm |
| `defaults.*` | project, privacy, context |
| `content.*` | max-length, preserve-structure, extract-metadata |
| `ocr.*` | enabled, url, model, max-tokens |
| `weather.*` | city, units, api-key |
| `signal.*` | enabled, cli-path, number, recipient |
| `scheduler.*` | enabled, check-interval, missed-reminders |
| `dashboard.*` | host, port |

**Tools:**

| Tool | Description |
|------|-------------|
| `viewSettings` | Show all settings or by category |
| `setSetting` | Quick set with type conversion |
| `resetSettings` | Reset all or category to defaults |
| `showSettingsStats` | View statistics |
| `runSetupWizard` | Interactive first-run setup |
| `migrateSettings` | Migrate .env to database |

**First-Run Wizard:**

New users are guided through interactive setup:
1. Welcome message
2. LLM configuration (auto-detect models, choose tier strategy)
3. Embeddings setup (optional)
4. Calendar basics (timezone, date format)
5. Optional features (OCR, weather, presence)
6. Save settings and mark complete

**Migration for Existing Users:**

```bash
> migrate settings
# Reads current .env
# Parses and categorizes all settings
# Saves to database
# Backs up .env to .env.backup
# Creates minimal bootstrap .env
# Sets migration version
```

**Features:**
- **Type Safety** - Automatic conversion (string ↔ number ↔ boolean ↔ JSON)
- **Caching** - Sub-millisecond access via in-memory cache
- **Category Organization** - Group related settings
- **Runtime Updates** - Change settings without restart (except bootstrap)
- **First-Run Detection** - Trigger setup wizard for new users
- **Migration Support** - Seamless upgrade from .env-based config
- **Statistics** - Track settings count by category
- **Reset Capability** - Restore defaults by category

**Use Cases:**
- New user onboarding with guided setup
- Existing user migration from .env
- Runtime configuration changes (timezone, models)
- Multi-environment settings (dev/prod)
- A/B testing different configurations
- Settings backup and restore

### Additional Page Views

Specialized views for different record types:

**ContactPageView:**

Shows contact information with all related activity:

```typescript
const view = ViewRegistry.create(contactRecord, services);
const markdown = view.render();
```

Sections:
- **Contact Information** - Email, phone, birthday
- **Projects** - Projects involving this contact
- **Actions** - Active actions assigned to or mentioning contact
- **Notes** - Notes referencing this contact
- **Metadata** - View counts, last accessed
- **Backlinks** - All records linking to contact

**DailyPageView:**

Daily journal page showing that day's activity:

```typescript
const view = ViewRegistry.create(dailyRecord, services);
const markdown = view.render();
```

Sections:
- **User Content** - Journal entry for the day
- **Due Today** - Actions with this due date
- **Events** - Calendar events happening today
- **Completed** - Actions completed on this day
- **Metadata** - Stats for the day

**TagPageView:**

Aggregate view of all records with a tag:

```typescript
// Note: Requires tagName parameter
const view = new TagPageView(record, services, 'medical');
const markdown = view.render();
```

Sections:
- **Overview** - Tag name and total item count
- **Projects** - Active projects with this tag
- **Actions** - Active actions with this tag (sorted by due date)
- **Notes** - Notes and entries with this tag
- **People** - Contacts with this tag
- **Other** - Other record types with this tag

**Registered Views:**

The ViewRegistry automatically uses the appropriate view:

```typescript
// Auto-selects view based on record type
const view = ViewRegistry.create(record, services);

// Currently registered:
// - project → ProjectPageView
// - contact → ContactPageView
// - daily → DailyPageView
// - * → DefaultPageView (fallback)
```

**Features:**
- **Automatic registration** - Views mapped to record types
- **Relationship queries** - Uses GardenGraph for related records
- **Tag filtering** - TagPageView queries by tag
- **Date filtering** - DailyPageView filters by date
- **Dual output** - Markdown and JSON for all views
- **Empty section filtering** - Skips sections with no content

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

### Import System (`garden.sqlite3`)

**Inbox staging table:**
```sql
CREATE TABLE inbox_items (
  id TEXT PRIMARY KEY,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  created_at TEXT NOT NULL,
  captured_at TEXT NOT NULL DEFAULT (datetime('now')),
  processing_status TEXT DEFAULT 'pending',  -- pending, processed, failed, skipped
  processing_metadata TEXT  -- JSON
);

CREATE INDEX idx_inbox_created ON inbox_items(created_at DESC);
CREATE INDEX idx_inbox_type ON inbox_items(file_type);
CREATE INDEX idx_inbox_captured ON inbox_items(captured_at DESC);
```

**Import history with duplicate detection:**
```sql
CREATE TABLE import_history (
  id TEXT PRIMARY KEY,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_hash TEXT NOT NULL,        -- SHA256 hash for duplicate detection
  file_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  imported_at TEXT NOT NULL DEFAULT (datetime('now')),
  garden_record_id TEXT,          -- Link to created garden record
  rule_applied TEXT,              -- Name of import rule that matched
  metadata TEXT                   -- JSON: additional import context
);

CREATE UNIQUE INDEX idx_import_hash ON import_history(file_hash);
CREATE INDEX idx_import_date ON import_history(imported_at DESC);
CREATE INDEX idx_import_record ON import_history(garden_record_id);
CREATE INDEX idx_import_filename ON import_history(file_name);
```

**Features:**
- **SHA256 duplicate detection** - Prevents re-importing the same file
- **Import history tracking** - Full audit trail of all imports
- **Rule matching** - Tracks which import rule was applied
- **Garden record links** - Connect imports to created records
- **Statistics** - Import counts by type and date

### Settings System (`garden.sqlite3`)

**Runtime configuration:**
```sql
CREATE TABLE settings (
  key TEXT PRIMARY KEY,           -- e.g., 'llm.router-model', 'calendar.timezone'
  value TEXT NOT NULL,            -- JSON-serialized value
  value_type TEXT NOT NULL,       -- string, number, boolean, json
  category TEXT NOT NULL,         -- llm, calendar, presence, ocr, etc.
  description TEXT,               -- Human-readable description
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_settings_category ON settings(category);
```

**Migration metadata:**
```sql
CREATE TABLE settings_metadata (
  id TEXT PRIMARY KEY DEFAULT 'singleton',
  first_run_completed BOOLEAN DEFAULT FALSE,
  migration_version INTEGER DEFAULT 0,
  last_migration_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO settings_metadata (id) VALUES ('singleton');
```

**Settings categories:**
- `llm.*` - LLM models, timeouts, agent configuration
- `embeddings.*` - Embedding model and dimensions
- `calendar.*` - Timezone, date format, default duration
- `presence.*` - Startup, scheduled moments, idle behavior
- `scheduler.*` - Scheduler configuration
- `ocr.*` - OCR enablement and configuration
- `weather.*` - Weather city, units, API key
- `signal.*` - Signal notification settings

**Features:**
- **Type-safe storage** - Automatic type conversion (string ↔ number ↔ boolean)
- **Category organization** - Group related settings
- **First-run detection** - Trigger setup wizard for new users
- **Migration tracking** - Version control for settings migrations
- **Runtime updates** - Change settings without restart
- **Caching** - Sub-millisecond access via in-memory cache

### Learning System (`bartleby.db`)

**Unified memory with Entity-Observation-Relationship (EOR) pattern:**
```sql
CREATE TABLE entities (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,        -- user, session, command, record, etc.
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  data TEXT                  -- JSON: entity-specific data
);

CREATE TABLE observations (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  value_type TEXT NOT NULL DEFAULT 'string',
  source_type TEXT NOT NULL,
  source_id TEXT,
  confidence REAL NOT NULL,
  observed_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT,
  supersedes TEXT,           -- ID of observation this replaces
  search_text TEXT,          -- Denormalized for FTS

  -- Phase 5: Activation Tracking (added 2026-02)
  last_accessed_at TEXT,
  access_count INTEGER DEFAULT 0,
  activation_score REAL DEFAULT 0.5
);

CREATE TABLE relationships (
  id TEXT PRIMARY KEY,
  from_entity TEXT NOT NULL,
  to_entity TEXT NOT NULL,
  relation_type TEXT NOT NULL,
  strength REAL,
  context TEXT,              -- JSON metadata
  observed_at TEXT NOT NULL DEFAULT (datetime('now')),
  source_id TEXT
);

-- Performance indexes (Phase 4)
CREATE INDEX idx_observations_entity ON observations(entity_id, key);
CREATE INDEX idx_observations_entity_time ON observations(entity_id, observed_at DESC);
CREATE INDEX idx_observations_key ON observations(key);
CREATE INDEX idx_observations_supersedes ON observations(supersedes);
CREATE INDEX idx_observations_confidence ON observations(confidence);
CREATE INDEX idx_observations_source ON observations(source_type, source_id);
CREATE INDEX idx_observations_expires ON observations(expires_at);
CREATE INDEX idx_observations_observed_at ON observations(observed_at);

-- Phase 5: Activation index
CREATE INDEX idx_observations_activation ON observations(entity_id, activation_score DESC);

-- Relationship indexes
CREATE INDEX idx_relationships_from ON relationships(from_entity, relation_type);
CREATE INDEX idx_relationships_to ON relationships(to_entity, relation_type);
CREATE INDEX idx_relationships_strength ON relationships(strength);

-- Entity indexes
CREATE INDEX idx_entities_type ON entities(type);
CREATE INDEX idx_entities_created ON entities(created_at);

-- Full-text search (Phase 4)
CREATE VIRTUAL TABLE observations_fts USING fts5(
  key,
  value,
  search_text,
  content='observations',
  content_rowid='rowid'
);
```

**Features:**
- **Flexible entity system** - Track any type of entity (users, sessions, commands, records)
- **Confidence scoring** - Weight reliability of observations (0.0-1.0)
- **TTL expiration** - Automatic cleanup of temporary facts
- **Superseding chain** - Track how information changes over time
- **Full-text search** - FTS5 index on observation values
- **Graph relationships** - Connect entities with typed relationships
- **Phase 5 Enhancements (2026-02):**
  - **Hierarchical Memory** - Tiered loading (hot ≥0.7, warm 0.4-0.7, cold <0.4)
  - **Activation Tracking** - Score based on recency, frequency, and confidence
  - **Memory Consolidation** - Automatic deduplication (3+ similar observations → 1 high-confidence)
  - **Relationship-Aware Search** - Graph traversal enriches search results (max 2 hops)
  - **Automatic Decay** - Daily job reduces activation for unused observations (0.99 factor)

**Phase 5 Activation Formula:**
```
activation = (0.4 × recency) + (0.3 × frequency) + (0.3 × confidence)
- recency: exponential decay (half-life 30 days)
- frequency: log scale (10 accesses = 1.0)
- confidence: existing 0-1 score
```

**Performance Impact:**
- 90% reduction in context tokens (hot tier loading)
- 40-60% reduction in total observations (consolidation)
- Sub-2ms query times (7 optimized indexes)
- Automatic background maintenance (daily at 1 AM)

---

*See [README.md](README.md) for user documentation.*
