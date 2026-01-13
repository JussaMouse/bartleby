# Bartleby

A local-first AI assistant that runs entirely on your machine. Your data stays yours.

---

## Index

- [What is Bartleby?](#what-is-bartleby)
- [Quick Start](#quick-start)
- [Your Data](#your-data)
  - [The Garden](#the-garden)
  - [The Shed](#the-shed)
  - [Context](#context)
- [Garden Specification](#garden-specification)
  - [Page Types](#page-types)
  - [Record Fields](#record-fields)
  - [Status Values](#status-values)
  - [Contexts](#contexts)
  - [Tags](#tags)
  - [Backmatter Format](#backmatter-format)
- [Commands](#commands)
- [GTD Workflow](#gtd-workflow)
- [The Time System](#the-time-system)
- [Configuration](#configuration)
  - [LLM Models](#llm-models)
  - [Calendar](#calendar-settings)
  - [Notifications (Signal)](#notifications-signal)
  - [Presence](#presence-settings)
  - [Paths](#paths)
  - [Logging](#logging)
  - [Scheduler](#scheduler)
  - [Weather](#weather-optional)
- [Architecture](#architecture)
  - [Overview](#architecture-overview)
  - [How Routing Works](#how-routing-works)
  - [Services](#services)
  - [Tools](#tools)
- [For Developers](#for-developers)
  - [Adding a Tool](#adding-a-tool)
  - [Adding a Service](#adding-a-service)
  - [Database Schemas](#database-schemas)
  - [File Format (Backmatter)](#file-format-backmatter)
  - [Bidirectional Sync](#bidirectional-sync)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## What is Bartleby?

Bartleby is a personal AI assistant that runs entirely on your machine using local LLMs. No cloud. No subscriptions. No data leaving your computer.

**Why local?**
- **Privacy** — Your thoughts, tasks, and documents never leave your machine
- **Ownership** — Plain markdown files you can read, edit, backup, migrate
- **Speed** — No network latency for most operations
- **Reliability** — Works offline, no API outages
- **Customization** — Swap models, modify code, make it yours

**What can Bartleby do?**
- GTD task management (inbox, actions, projects, contexts)
- Personal wiki (notes, contacts, journal entries)
- Calendar with mobile notifications via Signal
- Document library with semantic search (RAG)
- Learn your preferences and adapt over time

Talk to Bartleby naturally. It figures out what you mean.

---

## Quick Start

### 1. Clone

```bash
git clone https://github.com/JussaMouse/bartleby.git
cd bartleby
```

### 2. Install

```bash
pnpm install
pnpm approve-builds   # Required for native modules
pnpm build
```

### 3. Configure

```bash
cp .env.example .env
```

Edit `.env` with your LLM endpoints. You'll need local models running (e.g., via [MLX](https://github.com/ml-explore/mlx), [Ollama](https://ollama.ai), or [llama.cpp](https://github.com/ggerganov/llama.cpp)).

At minimum:

```env
FAST_MODEL=your-model-name
FAST_URL=http://127.0.0.1:8080/v1

EMBEDDINGS_MODEL=your-embedding-model
EMBEDDINGS_URL=http://127.0.0.1:8081/v1
```

See [Configuration > LLM Models](#llm-models) for the full 4-tier setup.

### 4. Run

```bash
pnpm start
```

You'll see:

```
📋 Bartleby is ready. Type "help" for commands, "quit" to exit.
```

---

## Your Data

Bartleby stores everything in three places, all on your machine.

### The Garden

Your personal wiki. Plain markdown files you own forever.

**What lives here:**
| Type | Description | Example |
|------|-------------|---------|
| `action` | Something you can do | "Call dentist @phone" |
| `project` | Outcome with multiple actions | "2025 Taxes" |
| `item` | Inbox capture, not yet processed | "Random thought" |
| `note` | Working notes, meeting notes | "1:1 with Sarah" |
| `entry` | Wiki/encyclopedia page | "How our deploy works" |
| `contact` | Person with details | "Sarah Chen" |
| `daily` | Journal entry | "2026-01-13" |
| `list` | Curated collection | "Reading list" |
| `media` | Ingested document reference | "Q4 Report.pdf" |

**Commands:**
```
new action <text>       Create an action
new note <title>        Create a note (prompts for content)
new project <name>      Create a project
add contact <name>      Create a contact
capture <text>          Quick inbox capture
show next actions       List actions by context
show projects           List projects
show notes              List notes
show contacts           List contacts
recent                  Last 10 modified
open <title>            View any page
```

**Files are the source of truth.** Edit them in any text editor. Bartleby watches for changes and syncs automatically.

Location: `./garden/` (configurable via `GARDEN_PATH`)

### The Shed

Your document library. Ingest files, query them with natural language.

**How it works:**
1. You ingest a document (PDF, markdown, text)
2. Bartleby chunks it and creates vector embeddings
3. You ask questions, Bartleby finds relevant chunks
4. The Thinking model synthesizes an answer

**Commands:**
```
ingest <file or url>    Add to library (also creates Garden page)
list sources            Show all documents
ask shed <question>     Query your documents
```

**Example:**
```
> ingest ~/Documents/contract.pdf
✓ Ingested: contract.pdf (23 chunks)

> ask shed what are the payment terms
Based on the contract, payment is due within 30 days...
```

Location: `./shed/` (configurable via `SHED_PATH`)

### Context

What Bartleby learns about you over time.

**Automatically collected from conversation:**
- Your name, preferences, habits
- Relationships ("my wife Sarah")
- Goals and interests
- Conversation history and follow-ups

**How Bartleby uses it:**
- Startup message surfaces relevant follow-ups
- Responses adapt to your preferences
- Can recall past conversations

**Commands:**
```
what do you know about me    Show stored facts
show profile                 Same
```

**Teach Bartleby naturally:**
```
> my name is Lon
> I'm a morning person
> my wife Nicole wakes up late
> I prefer short meetings
> I'm trying to learn piano
```

Location: `./database/memory/` (JSON files)

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

### Contexts

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

**Usage:**
```
> new action call mom @phone
> new action buy groceries @errands
> show next actions
```

Actions are grouped by context in `show next actions`.

### Tags

Tags categorize pages across types. Convention: lowercase, no spaces.

**Common patterns:**
```
tags: [urgent]           # Priority
tags: [taxes, 2025]      # Topic + year
tags: [meeting, sarah]   # Type + person
tags: [idea, blog]       # Category
```

**Query by tag:**
```
> show tagged urgent
> #taxes                 # Shorthand
```

Tags are freeform — use whatever makes sense for your system.

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

*Note:*
```markdown
# 1:1 with Sarah — 2026-01-13

## Topics
- Project timeline
- Hiring update

## Action items
- Review the proposal by Friday
- Send intro to candidate

---
tags: [meeting, sarah]
type: note
status: active
id: i9j0k1l2
---
```

---

## Commands

Quick reference of common commands:

```
new action <text>            Add a GTD action
new action <text> @phone     ...with context
new action <text> +project   ...with project
new note <title>             Create a note
new project <name>           Start a project
add contact <name>           Add a contact
add event <title> at <time>  Schedule an event
remind me to X in 30 min     Set a reminder

show next actions            Your action list
show projects                Active projects
today                        Today's schedule
recent                       Recently modified pages

done <number>                Complete an action
open <title>                 View any page
help                         Full command reference
```

**See [COMMANDS.md](COMMANDS.md) for the complete reference.**

---

## GTD Workflow

Bartleby implements Getting Things Done (GTD):

### The Flow

```
Capture → Clarify → Organize → Review → Do
```

### In Practice

**1. Capture everything**
```
> capture call insurance about claim
> capture idea for blog post
> capture buy groceries
```

**2. Process your inbox**
```
> show inbox
```
For each item, decide: Is it actionable? What's the next action?

**3. Organize with context**
```
> new action call insurance @phone
> new action write blog outline @computer
> new action buy groceries @errands
```

**4. Work by context**
```
> show next actions
```
When you're at the computer, do @computer actions. When you're out, do @errands.

**5. Complete and review**
```
> done 3
> show projects
```

### Contexts

Contexts are *where* or *how* you do something:
- `@phone` — Calls to make
- `@computer` — At your desk
- `@errands` — Out and about
- `@home` — Around the house
- `@office` — At work
- `@waiting` — Delegated, waiting for response

### Projects

Projects are outcomes requiring multiple actions:

```
> new project 2025 taxes
> new action gather W2 forms +2025-taxes
> new action find last year's return +2025-taxes
> new action schedule accountant call +2025-taxes @phone
```

---

## The Time System

Everything with a "when" shows up in one place.

### What the Time System tracks

| Symbol | Type | Source |
|--------|------|--------|
| 📅 | Events | Calendar |
| ⚠️ | Deadlines | Actions with due dates |
| ⚙️ | Automation | Scheduler |

### Commands

```
today                        Today's unified view
calendar                     Upcoming (all types)
add event <title> at <time>  Create event
remind me <msg> in <time>    Set reminder
```

### Example

```
> today

📅 Today — Monday, January 13

  09:00  📅 Team standup
  14:00  📅 1:1 with Sarah
  17:00  ⚠️ Submit report (due)

> [15:30] 📲 Sent via Signal: "Stretch break"
```

### Why unified?

You never miss something because it's in the "wrong system." Due dates from GTD, calendar events, and scheduled notifications all flow into one temporal view.

### Notifications

When scheduled items come due, Bartleby notifies you:

- **Console** — Always shows in your terminal
- **Signal** — Optionally sends to your phone (see [Notifications](#notifications-signal))

Bartleby checks for due items periodically. If you weren't running when something was due, it handles missed items on next startup (configurable via `SCHEDULER_MISSED_REMINDERS`).

---

## Configuration

All settings live in `.env`. It's the source of truth.

### LLM Models

Bartleby uses a 4-tier model system:

| Tier | Size | Purpose | Speed |
|------|------|---------|-------|
| Router | 0.5-1B | Classify simple vs complex | ~50ms |
| Fast | 7-30B | Simple queries, single tools | ~500ms |
| Thinking | 30B+ | Multi-step reasoning | 2-10s |
| Embedding | ~1B | Text to vectors | ~100ms |

```env
# Router — Complexity classification
ROUTER_MODEL=mlx-community/Qwen3-0.6B-4bit
ROUTER_URL=http://127.0.0.1:8080/v1
ROUTER_MAX_TOKENS=100

# Fast — Simple queries
FAST_MODEL=mlx-community/Qwen3-8B-4bit
FAST_URL=http://127.0.0.1:8080/v1
FAST_MAX_TOKENS=1000

# Thinking — Complex reasoning
THINKING_MODEL=mlx-community/Qwen3-30B-A3B-4bit
THINKING_URL=http://127.0.0.1:8080/v1
THINKING_MAX_TOKENS=4000

# Embeddings — Semantic search
EMBEDDINGS_MODEL=nomic-ai/nomic-embed-text-v1.5
EMBEDDINGS_URL=http://127.0.0.1:8081/v1
EMBEDDINGS_DIMENSIONS=4096
```

### Calendar Settings

```env
CALENDAR_TIMEZONE=America/Los_Angeles
CALENDAR_DEFAULT_DURATION=60
CALENDAR_AMBIGUOUS_TIME=afternoon    # morning|afternoon|ask
CALENDAR_WEEK_START=sunday           # sunday|monday
CALENDAR_DATE_FORMAT=mdy             # mdy (1/15=Jan 15) | dmy (1/15=15 Jan)
CALENDAR_EVENT_REMINDER_MINUTES=15   # 0=off
```

Or configure interactively:
```
> change calendar settings
```

### Notifications (Signal)

Get notifications on your phone via Signal:

```env
SIGNAL_ENABLED=true
SIGNAL_CLI_PATH=/usr/local/bin/signal-cli
SIGNAL_NUMBER=+1234567890      # Your Signal number
SIGNAL_RECIPIENT=+0987654321   # Where to send notifications
```

**Setup:**
1. Install [signal-cli](https://github.com/AsamK/signal-cli)
2. Register/link your number
3. Configure the settings above
4. Test: `remind me test in 1 min`

### Presence Settings

Control when Bartleby speaks unprompted:

```env
PRESENCE_STARTUP=true          # Show opener at startup
PRESENCE_SHUTDOWN=true         # Show tomorrow preview at quit
PRESENCE_SCHEDULED=true        # Morning/evening/weekly reviews
PRESENCE_CONTEXTUAL=true       # Surface related info during chat
PRESENCE_IDLE=false            # Nudge after idle period
PRESENCE_IDLE_MINUTES=5

# Scheduled times (24h)
PRESENCE_MORNING_HOUR=8
PRESENCE_EVENING_HOUR=18
PRESENCE_WEEKLY_DAY=0          # 0=Sunday
PRESENCE_WEEKLY_HOUR=9
```

### Paths

Where Bartleby stores data:

```env
GARDEN_PATH=./garden      # Your wiki (markdown files)
SHED_PATH=./shed          # Ingested documents
DATABASE_PATH=./database  # SQLite databases
LOG_DIR=./logs            # Log files
```

### Logging

```env
LOG_LEVEL=INFO            # DEBUG, INFO, WARN, ERROR
LOG_LLM_VERBOSE=false     # Show model chain-of-thought (debugging)
```

### Scheduler

```env
SCHEDULER_ENABLED=true              # Enable the task manager
SCHEDULER_CHECK_INTERVAL=60000      # How often to check for due tasks (ms)
SCHEDULER_MISSED_REMINDERS=         # What to do with missed tasks:
                                    #   (blank) = ask on first occurrence
                                    #   ask     = summarize and prompt each time
                                    #   fire    = execute all immediately
                                    #   skip    = dismiss silently
                                    #   show    = display only, don't execute
```

### Weather (Optional)

```env
WEATHER_API_KEY=your-key  # OpenWeatherMap API key
WEATHER_CITY=London       # City for weather queries
```

Get a free API key at [openweathermap.org](https://openweathermap.org/api).

---

## Architecture

### Architecture Overview

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

### Tools

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

---

## For Developers

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

### Database Schemas

**Garden** (`garden.sqlite3`):
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
```

**Calendar** (`calendar.sqlite3`):
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
```

**Scheduler** (`scheduler.sqlite3`):
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
```

### File Format (Backmatter)

Garden files use backmatter (metadata at bottom):

```markdown
# Call accountant

Ask about quarterly estimates and payment schedule.

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
- Content first — humans read the content, not the metadata
- Still machine-parseable
- Fields ordered by relevance (human stuff first, system IDs last)

**Parser:** `src/utils/garden-parser.ts`

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

## Troubleshooting

### "Cannot find module" errors

```bash
pnpm build
```

### Native module errors (hnswlib-node)

```bash
pnpm rebuild hnswlib-node
# or
rm -rf node_modules && pnpm install && pnpm approve-builds && pnpm build
```

### LLM not responding

1. Check model is running: `curl http://127.0.0.1:8080/v1/models`
2. Check `.env` URLs match your setup
3. Run `status` in Bartleby to see which tiers are connected

### Signal notifications not working

1. Verify signal-cli path: `which signal-cli`
2. Check it's registered: `signal-cli -u +YOUR_NUMBER receive`
3. Verify `.env` settings match

### Logs

```bash
tail -f logs/bartleby.log
```

Set `LOG_LEVEL=DEBUG` for verbose output.
Set `LOG_LLM_VERBOSE=true` to see model reasoning.

---

## License

MIT — see [LICENSE](LICENSE)

---

*Built with care for humans who want to own their data.*
