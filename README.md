# Bartleby

The personal exocortex, locally.

- [What is Bartleby?](#what-is-bartleby)
- [Quick Start](#quick-start)
- [First 10 Minutes](#first-10-minutes)
- [Your Data](#your-data)
- [Memory & Learning](#memory--learning)
- [Data Tools](#data-tools)
- [Import System](#import-system)
- [GTD Workflow](#gtd-workflow)
- [The Time System](#the-time-system)
- [Dashboard](#dashboard)
- [Running on a Server](#running-on-a-server)
- [Configuration](#configuration)
- [Backups](#backups)
- [Security](#security)
- [Troubleshooting](#troubleshooting)

## What is Bartleby?

A local-first personal assistant. Runs on your machine with local LLMs.

- **The Garden** — Your wiki. Actions, projects, notes, contacts, calendar. Plain markdown files.
- **The Shed** — Your reference library. Ingest PDFs, ask questions.

Type commands in the CLI or speak them in the mobile app. One agent with many ways to interact.

### ✨ New Features (2026-02)

**Persistent Standing Instructions**
- `(remember this)` suffix saves a mandatory rule: `always use bullet points (remember this)`
- Also: `remember this: <rule>`, `rule: <rule>`, `new rule: <rule>`
- Rules are injected into every system prompt — the LLM must follow them, not just note them
- `/rules` to view, `delete rule N` to remove

**First-Launch Setup Flow**
- `.env` guard: clear error if `LLM_URL` is missing before anything starts
- Interactive intro: learns your name and what to call the assistant
- Auto-imports README, COMMANDS, TECH_SPEC as searchable Garden pages
- Silently migrates `.env` settings to the database
- Optional settings wizard for weather, Signal, OCR

**Smart Import System**
- Automatic duplicate detection (SHA256 hashing)
- Import rules for auto-organization
- Import profiles for different workflows
- Dry-run mode for safe previews
- Full import history tracking

**Database-Backed Settings**
- Minimal `.env` (just LLM URL + paths)
- Runtime configuration (no restart needed)
- Interactive setup wizard (runs automatically on first start)
- Settings migration tool

**Developer Experience**
- Structured error handling (Result types)
- Type-safe parameters (Zod schemas)
- Comprehensive test suite (25 integration tests)

---

## Quick Start

**1. Clone and install**

```bash
git clone https://github.com/JussaMouse/bartleby.git
cd bartleby
pnpm install
pnpm approve-builds
pnpm build
```

**2. Configure (minimal)**

```bash
cp .env.example .env
```

Edit `.env` with your LLM endpoint. You'll need local models running (e.g., via [MLX](https://github.com/ml-explore/mlx), [Ollama](https://ollama.ai), or [llama.cpp](https://github.com/ggerganov/llama.cpp)).

**New minimal configuration:**

```env
# Single LLM endpoint (required)
LLM_URL=http://127.0.0.1:8080/v1

# Optional: Storage paths (defaults shown)
DATABASE_PATH=./database
GARDEN_PATH=./garden
LOG_LEVEL=info
```

**All other settings** (models, calendar, presence, etc.) are configured via the interactive wizard on first run or using the `settings` command.

**For remote access** (accessing dashboard from other devices):

```bash
# Generate secure API token
openssl rand -hex 32
```

Add to `.env`:
```env
# Required for remote access
BARTLEBY_API_TOKEN=<paste-generated-token>
DASHBOARD_HOST=localhost  # or your Tailscale IP
```

See [Running on a Server](#running-on-a-server) for Tailscale setup.

**3. Run**

```bash
pnpm start
```

**First run:** Bartleby walks you through a one-time setup flow before the prompt appears:

```
──────────────────────────────────────────────────
Hello! I'm Bartleby, your personal AI assistant.

What's your name?
> _
```

It will:
- Ask your name and what to call the assistant
- Import README, COMMANDS, and TECH_SPEC as Garden pages
- Migrate any settings from `.env` into the database
- Configure smart defaults (models, calendar, presence)
- Offer an optional wizard for weather, Signal, and OCR

After first-run completes, normal startup:

```
📋 Bartleby is ready. Type "help" for commands, "quit" to exit.
📊 Dashboard: http://localhost:3333
```

Open http://localhost:3333 in your browser for the web UI with live-updating panels. Same data as the CLI, visual interface.

**Pro tip:** Hit `TAB` to autocomplete commands, page names, contexts, and projects.

---

## First 10 Minutes

Try these commands.

### 1) Capture anything

```
> capture call insurance about claim
> capture idea for blog post
> capture look into that thing Jake mentioned
```

### 2) Create your first action

```
> new action call mom @phone
```

### 3) Make a project and link actions

```
> new project 2025 taxes
> new action gather W2 forms +2025-taxes
> new action call accountant +2025-taxes @phone
```

### 4) Create a wiki page and a scratch note

```
> new page house rules
Content (optional, Enter to skip):
> Family guidelines for house maintenance
✓ Created page: "house rules"
```

Pages support optional content prompts after creation. Press Enter to skip or type content.

**Notes** support multi-line content. Two ways to create:

```
# With title upfront:
> new note cherry pie
📝 Note: cherry pie
What would you like to add to this note?
> grandma's secret recipe
> - 2 cups flour
> - 1 cup sugar
> done
Any project? (e.g., +project, or ENTER to skip)
> +thanksgiving
✓ Saved: cherry pie

# Without title (prompts for it):
> new note
What would you like to call this note?
> meeting notes jan 24
📝 Note: meeting notes jan 24
What would you like to add to this note?
> discussed Q1 roadmap
> - prioritize mobile app
> - hire 2 engineers
> done
Any metadata? (e.g., +project @context with person, or ENTER to skip)
> +q1-planning @work with sarah
✓ Note saved: "meeting notes jan 24"
  +q1-planning @work with sarah
```

While in note mode, everything you type is appended verbatim — no routing, no AI processing. Type `done` when finished.

**Metadata step supports these operators:**
- `+project name` — link to project (spaces allowed, auto-creates)
- `@context` — set context
- `with person` — link to contact (auto-creates)

### 5) Import files with automatic organization

```
# Add files to inbox directory
> import files

# Preview what would be imported
> import all --dry-run

# Import everything
> import all

# View import history
> import history
```

**Import Rules** — Automatically organize imports:
```
> create import rule
Name: Financial Documents
Filename pattern: invoice.*
Project: +finances
Privacy: confidential

> test import rule Financial Documents
✓ Would match: invoice-jan-2026.pdf (85% confidence)
```

**Duplicate Detection** — SHA256-based deduplication prevents re-importing the same files.

### 6) Add an event in one line

```
> new event dentist tomorrow 2pm 15m reminder
```

### 7) Edit anything with tab completion

```
> edit nort[TAB]
> edit northside-hs-attendance-zone
> +home-search
```

---

## Your Data

Everything lives on your machine in three places.

### The Garden

Plain markdown files. One file per page.

Three layers:
- **Files** — Flat directory of `.md` files with YAML frontmatter (source of truth)
- **Database** — SQLite index, rebuilt automatically from files (fast queries)
- **Facts** — Dynamic metadata tracking (view counts, momentum, AI insights)

**Page types:**
| Type | What it's for |
|------|---------------|
| `action` | A single next step you can do |
| `project` | An outcome requiring multiple actions |
| `item` | Inbox capture, not yet processed |
| `page` | Wiki page — permanent structured knowledge |
| `note` | Scratch text, meeting notes, journal entries |
| `contact` | People, with email/phone/birthday |
| `event` | Calendar event with specific time |
| `list` | Dynamic smart lists (Next Actions, Projects) |
| `media` | Images and files imported into the garden |

**Page vs Note:** A *page* is permanent reference ("house rules", "packing checklist"). A *note* is scratch/working text, often attached to a project. Both support prompted content entry after creation.

**Data Layers Explained:**

| Layer | Contains | Essential? | Example |
|-------|----------|------------|---------|
| **Files** | User content, static metadata | ✅ Required | Title, status, projects, due dates |
| **Database** | Parsed data, search indexes | ⚠️ Derived | Full-text index, fast lookups |
| **Facts** | Usage stats, AI insights | ❌ Optional | View counts, momentum scores |

If you lose the database, Bartleby rebuilds it from files on startup. If you lose facts, they start fresh going forward. Only the markdown files are irreplaceable.

**How dynamic pages work:** Bartleby builds a knowledge graph from your markdown files. When you use `[[wiki links]]`, `+projects`, and `with contacts`, these become edges in the graph. Pages automatically display related items by querying this graph:

- **Project pages** → show all actions with `+project-name`, notes mentioning `[[Project Name]]`, and media linked to the project
- **Contact pages** → show all actions/events with `with person-name`
- **Any page** → shows backlinks (what references this page)

Example: Create `new action book flights +thailand-trip` and it immediately appears on the Thailand Trip project page. Create a note mentioning `[[Thailand Trip]]` and it appears there too. No manual organization needed — just link things together.

**Commands:**
```
new page <title>        Create a wiki page (prompts for content)
new note <title>        Create a note
import <path> [name]    Import single image/file
import url <url>        Import web page from URL
import files            Import all files from inbox directory
import all              Import all files at once (skip confirmation)
import only <type>      Import only specific file type
show inbox              View files staged for import
show inbox <type>       View specific file type in inbox
show import rules       View active import rules
confirm import          Process and import staged files
clear inbox             Delete all staged files
open <title>            View any page
show pages              List all pages
show notes              List all notes
show projects           List all projects
show events             List all events
```

**System Views:** Dynamic query pages that show filtered lists. **8 standard GTD views are auto-created at startup:**

| View | Shows | Usage |
|------|-------|-------|
| Inbox | Unprocessed items | `open inbox` |
| Next Actions | All active actions | `open next actions` |
| Projects | Active projects | `open projects` |
| Waiting For | Delegated actions | `open waiting for` |
| Someday Maybe | Future possibilities | `open someday maybe` |
| All Events | Calendar events | `open all events` |
| All Notes | Reference notes | `open all notes` |
| Contacts | People directory | `open contacts` |

**Create custom views with powerful queries:**
```
> create view "Urgent Tasks" showing urgent actions
> create view "Work Notes" showing notes in work-project
> create view "Phone Calls" showing actions @phone
> create view "This Week" showing events this week
> create view "Project Dashboard" showing actions and notes in client-work

> open urgent tasks
**Urgent Tasks** (page)
────────────────────────────────────────
**Results:** (7)
  1. Submit quarterly report
  2. Call client about proposal
  ...
```

**Query features:**
- **Context filtering:** `@phone`, `@computer`, `@errands`
- **Date ranges:** `this week`, `next month`, `due in 7 days`
- **Priority:** `urgent`, `important`
- **Search:** `containing "keyword"`
- **Multiple types:** `actions and notes`
- **Combined:** `urgent active actions @phone in project due this week`

System views execute queries dynamically when opened, always showing current results.

**Files are the source of truth.** Edit them in any text editor — Bartleby watches for changes and syncs automatically.

**When you complete or delete something:** The file is removed and a record is appended to `archive.log`. This keeps your Garden clean while maintaining a permanent log.

Location: `./garden/`

### The Shed

Ingest documents and web pages, ask questions.

1. `ingest <file or url> [+project]` — chunks and embeds (supports .md, .txt, .pdf, URLs)
2. `ask shed <question>` — searches chunks, synthesizes answer

**Commands:**
```
ingest <file or url> [+project]
    Add to library (also creates Garden page)
    Optionally link to projects with tab completion
list sources            Show all documents
ask shed <question>     Query your documents
```

**Examples:**
```
# Local files
> ingest ~/Documents/contract.pdf
✓ Ingested: contract.pdf (23 chunks)

# Web pages with metadata
> ingest https://www.uscis.gov/e-2-visa-requirements +visa-project
✓ Ingested: "E-2 Treaty Investors"
  URL: https://www.uscis.gov/e-2-visa-requirements
  Chunks: 15
  Saved as: uscis.gov-2026-02-10T20-14-56.md
  Projects: +visa-project

# Query any ingested content
> ask shed what are the E-2 visa financial requirements
Based on the USCIS guidelines, E-2 visa requires a substantial
investment, typically $100,000-$200,000 depending on the business...
```

**Tab Completion:** Press Tab after typing `+` to see available projects.

**Self-Documentation:** Bartleby makes its own docs available in two ways:

- **Garden pages** — README, COMMANDS, and TECH_SPEC are imported as searchable wiki pages during first-launch (`open Bartleby README`, `open Bartleby Commands`)
- **Shed** — You can also ingest the docs for natural language queries:

```
> ingest README.md
> ask shed how do I import files?
> ask shed what is the learning system?
```

Location: `./shed/`

### About You

What Bartleby learns about you over time using the **unified learning system** — an Entity-Observation-Relationship (EOR) architecture that captures knowledge across all interactions.

**Automatically collected from conversation:**
- Your name, preferences, habits
- Relationships ("my wife Sarah")
- Goals and interests
- Conversation history and session summaries
- Command execution history (timing, success/failure, patterns)
- Work patterns and primary projects
- Record importance and AI insights

**How Bartleby uses it:**
- Startup message surfaces relevant follow-ups
- Responses adapt to your preferences
- Can recall past conversations
- Automatically discovers semantic relationships between notes
- Tracks observation confidence and supersedes outdated facts

**Teach Bartleby naturally (soft preferences):**
```
> my name is Lon
> I'm a morning person
> my wife Nicole wakes up late
> I prefer short meetings
```

**Save mandatory standing instructions:**
```
> always use bullet points (remember this)
> never use markdown headers (remember this)
> remember this: keep responses under 100 words
> rule: respond in plain text only
```

These are injected into every system prompt as binding rules — not soft hints. View and manage them:
```
> /rules
> delete rule 2
> delete rule all
```

**Commands:**
```
/memory                      Show what Bartleby knows about you
what do you know about me    (alternative to /memory)
show profile                 (alternative to /memory)
/rules                       View your standing instructions
/insights                    AI insights about your garden
/related <record>            Find records related to a given record
/history [N]                 Show recent command history (default 20, specify N for more)
/search history <query>      Search command execution history
pnpm monitor                 Database stats and health
pnpm optimize                Clean expired data and optimize
pnpm profile export          Backup learning data
pnpm profile import <file>   Restore from backup
```

**Dashboard panels:**
- **+ Memory** button - View preferences, patterns, context, and goals
- **+ Graph** button - Visualize relationship graph between records

**Data location:** `./database/garden.sqlite3` (unified SQLite database with garden records, learning system, and command history)

---

## Memory & Learning

Bartleby learns from every interaction and maintains persistent memory across sessions using the **Entity-Observation-Relationship (EOR)** system.

### How Memory Works

**Three core concepts:**

| Concept | What it is | Example |
|---------|------------|---------|
| **Entity** | A person, project, session, or command | `user`, `project-123`, `session-456` |
| **Observation** | A fact about an entity | `user prefers dark mode` |
| **Relationship** | A connection between entities | `user works_on project-123` |

**Data structure:**
```
entities/           # Things in your world
  └─ observations/  # Facts about each entity
       └─ confidence (0.0-1.0)
       └─ expires_at (optional TTL)
       └─ supersedes (update chain)
       └─ activation_score (Phase 5: tiered loading)
       └─ access_count (Phase 5: usage tracking)
```

### Agent-Controlled Memory

Bartleby can now manage its own memory through natural language commands:

**Store observations:**
```
> remember that I prefer dark mode
✓ Remembered: preference.theme = dark

> note that project deadline is March 15
✓ Remembered: project.deadline = 2026-03-15

> remember for 7 days that I'm working from home
✓ Remembered (expires in 7 days): status = working from home
```

**Retrieve context:**
```
> what do you know about me?
**Context for user:**

**Observations:**
- preference.theme: dark (confidence: 90%)
- name: Alex (confidence: 95%)
- preferred_tool: vim (confidence: 85%)

**Relationships:**
- works_on → project-website
- manages → team-design
```

**Update information:**
```
> I changed my mind, I prefer light mode now
✓ Updated: preference.theme = light
(Creates superseding observation, maintains history)
```

**Forget outdated information:**
```
> forget that I'm working from home
✓ Marked observation as forgotten
```

### Standing Instructions

Standing instructions are mandatory rules that Bartleby follows in every response. Unlike soft preferences (which inform but don't bind), standing instructions are injected directly into every system prompt.

**Save a rule:**
```
> always use bullet points (remember this)
✓ Rule saved: "always use bullet points"
Say /rules to view all your rules.
```

**Accepted patterns:**
- `<text> (remember this)` — suffix
- `<text> (always remember this)` — suffix
- `remember this: <text>` — prefix
- `rule: <text>` — prefix
- `new rule: <text>` — prefix

**View and manage:**
```
> /rules
═══ Your Rules ═══

1. always use bullet points
2. keep responses under 100 words

Say "delete rule 2" to remove a rule.
Say "delete rule all" to clear all rules.

> delete rule 1
✓ Rule 1 deleted.
```

Rules persist across sessions and are stored as `instruction.*` observations in the learning system (confidence 1.0, no expiry). Deleting a rule supersedes it — the history is preserved but it's no longer active.

### Memory Features

**Confidence Scoring:**
- Bartleby tracks confidence (0.0-1.0) for each fact
- Agent-inferred facts default to 0.9 confidence
- Updates maintain confidence levels
- Low confidence facts can be filtered out

**Superseding Chain:**
- When information changes, new observations supersede old ones
- History is preserved for analysis
- Most recent superseding observation is considered current

**Time-To-Live (TTL):**
- Observations can expire automatically
- Useful for temporary status ("on vacation until...")
- Expired observations are filtered from queries

**Source Types:**
- `stated` - User explicitly said it
- `inferred` - Agent learned from conversation
- `computed` - Derived from calculations
- `extracted` - Pulled from documents

### Dashboard Integration

View all learned facts in the dashboard:
```
> dashboard
```

Click **+ Memory** to see:
- **Preferences:** User settings and choices
- **Patterns:** Learned behavioral patterns
- **Context:** Current working state
- **Goals:** Tracked objectives

### Technical Details

**Storage:** All observations stored in `database/bartleby.db` (SQLite)

**Schema:**
```sql
entities (id, type, created_at, data)
observations (id, entity_id, key, value, confidence, expires_at, supersedes)
relationships (from_entity, to_entity, relation_type, strength)
```

**Optimizations:**
- 7 database indexes for sub-2ms query times
- Automatic cleanup of expired observations (daily)
- FTS5 full-text search on observation content
- Response caching (60-80% latency reduction for repeated queries)
- Structured outputs with Zod schemas (100% reliable tool calls)
- **Phase 5 Enhancements (2026-02):**
  - **Hierarchical Memory**: Tiered loading (hot/warm/cold) based on access patterns
  - **Memory Consolidation**: Automatic deduplication with confidence boosting
  - **Relationship-Aware Retrieval**: Graph traversal for enriched context
  - 90% reduction in context tokens via hot tier loading
  - Automatic consolidation prevents memory bloat
- **Enhanced Router with Learning:**
  - Confidence scoring for routing decisions (70-95% confidence)
  - Historical performance tracking (success rate, response time per tier)
  - Adaptive routing based on outcomes (escalates to better model if needed)
  - 15+ complexity signals (sequential ops, code generation, analysis, etc.)
  - Optimization recommendations based on usage patterns
  - Typical fast tier: ~180ms response time, 77%+ success rate
  - Typical thinking tier: ~2.6s response time, 95%+ success rate
- **Response Streaming:**
  - Real-time token streaming for conversational responses
  - Reduced perceived latency (see first tokens immediately)
  - Async generator pattern for efficient chunk processing
  - Compatible with response caching (cached responses yield instantly)
  - Available via `chatStream()` and `handleSimpleStream()` methods
- **Prompt Optimization (49.2% token savings):**
  - Optimized system prompts: 654 → 332 tokens
  - Thinking tier: 384 → 171 tokens (55.5% savings)
  - Fast tier: 162 → 98 tokens (39.5% savings)
  - Router tier: 108 → 63 tokens (41.7% savings)
  - Dynamic prompt building (include only relevant sections)
  - Automatic redundancy removal (verbose phrases, intensifiers)
  - Better caching effectiveness (more stable prompts)
  - Set `OPTIMIZE_PROMPTS=false` to use detailed prompts for debugging

**Testing & Validation:**
- Comprehensive test suites for all optimization phases
- Integration tests verify all systems working together
- Performance benchmarking tools for measuring impact
- Run tests: `pnpm exec tsx test-integration.ts`
- See `docs/optimization-guide.md` for complete documentation

**Performance Summary:**

| Metric | Value |
|--------|-------|
| Prompt token savings | 49.2% (654 → 332 tokens) |
| Cache hit latency reduction | 60-80% |
| Tool call reliability | 35% → 100% |
| Routing confidence | 70-95% |
| Fast tier response time | ~180ms (77%+ success) |
| Thinking tier response time | ~2.6s (95%+ success) |
| Time to first token (streaming) | Immediate |
| **Phase 5: Memory efficiency** | **90% context reduction** |
| Observation consolidation | 40-60% reduction in total observations |
| Activation-based loading | Only ~50 hot observations loaded vs 500 total |

**Self-Improvement:**
- Agent learns from mistakes
- Updates understanding based on corrections
- Builds context over multiple sessions
- Personalizes responses based on preferences
- Validates all tool parameters before execution
- Provides clear error messages for invalid requests

**Continuous Learning (Reflection Service):**
- Automatically analyzes every conversation turn
- Detects user preferences ("I prefer X", "I like Y")
- Identifies behavioral patterns (time-based habits, routines)
- Learns from corrections ("No, I meant X", "Actually...")
- Tracks goals and intentions ("I want to X", "My goal is Y")
- Runs asynchronously to avoid blocking responses
- All insights stored with confidence scores in learning system

---

## Data Tools

Import, query, and analyze CSV/TSV data with SQL. Designed for financial data cleanup (e.g., crypto tax preparation with Summ exports).

### Import Data

```
ingest csv ~/Downloads/data.csv as mytable
ingest csv ~/Downloads/summ-report.csv as summ --skip-lines 12 --replace
```

**Options:**
- `--replace` — Drop existing table first
- `--append` — Add to existing table
- `--no-header` — File has no header row
- `--skip-lines N` — Skip N preamble lines (Summ exports have 12)

### Query Data

```
sql SELECT * FROM mytable LIMIT 10
sql SELECT type, COUNT(*), SUM(value) FROM summ GROUP BY type
sql SELECT * FROM summ WHERE value > 1000 ORDER BY value DESC
```

Full SQLite SQL support. Results truncated at 100 rows.

### Safe Mutations

Always preview before changing data:

```
preview UPDATE summ SET type = 'Buy' WHERE id = 'abc123'
```

Backup before making changes:

```
snapshot summ
sql UPDATE summ SET type = 'Buy' WHERE id = 'abc123'
```

Rollback if needed:

```
snapshots                           # List available backups
restore summ_snapshot_2026_01_24 to summ
```

### Schema & Export

```
tables                              # List all tables
describe summ                       # Show columns and types
export "SELECT * FROM summ" to cleaned-data.csv
```

### Tax Mode

For crypto tax preparation with Summ:

```
tax mode
```

This activates tax-specific context with:
- Common cleanup queries
- Issue detection patterns
- Safe workflow reminders

**Typical workflow:**
```
> tax mode
> ingest csv ~/Documents/summ-2025.csv as summ --skip-lines 12
> sql SELECT Trade_Type, COUNT(*), SUM(Value) FROM summ GROUP BY Trade_Type
> sql SELECT * FROM summ WHERE Trade_Type = 'Incoming' AND Value > 100
> preview UPDATE summ SET Trade_Type = 'Buy' WHERE Transaction_Id = '...'
> snapshot summ
> sql UPDATE summ SET Trade_Type = 'Buy' WHERE Transaction_Id = '...'
```

**Storage:**
- Database: `./database/data.sqlite3`
- Source files preserved: `./data/sources/`
- Exports: `./data/exports/`
- Audit log: `./data/audit.log`

---

## Import System

Import files into your Garden with automatic organization and duplicate detection.

### Basic Import

```bash
# Add files to inbox directory
mkdir inbox
cp ~/Downloads/*.pdf inbox/

# Preview what will be imported
> import files
Found 3 files in inbox:
📄 DOCUMENT (2):
  - invoice-jan-2026.pdf (245 KB)
  - receipt.pdf (89 KB)

Ready to import. Type "confirm" to process.

> confirm import
✓ Imported 2 files
```

### Batch Operations

```bash
# Import all files without confirmation
> import all

# Preview first (dry-run mode)
> import all --dry-run
🔍 Dry-run mode: Previewing 3 files

✓ invoice-jan-2026.pdf (245 KB)
  → Type: note | Project: +finances | Privacy: confidential
  → Rule: "Financial Documents" (85% confidence)

⊘ old-invoice.pdf
  → Skip: Already imported (2 days ago)

Summary: Would import 2, skip 1

# Import specific file types only
> import only images
> import only documents --dry-run
```

### Import Rules

Automatically organize imports based on filename patterns:

```bash
# Create a rule interactively
> create import rule
Name: Financial Documents
Filename pattern: invoice.*|receipt.*
File types: document
Project: +finances
Privacy: confidential
Priority: 100

✓ Rule created successfully!

# Test a rule
> test import rule Financial Documents
✓ Would match: invoice-jan-2026.pdf (85% confidence)
  → Project: +finances
  → Privacy: confidential

# Manage rules
> show import rules
> edit import rule Financial Documents
> delete import rule Financial Documents
```

### Import History

Track all imports with automatic duplicate detection:

```bash
# View history
> import history

2026-02-23:
  • invoice-jan-2026.pdf (245 KB) - 10:30am
    → Garden record: abc123
    → Rule applied: Financial Documents

Statistics:
  Total imports: 247
  Last 7 days: 12

# Duplicate prevention
> import files
✓ Imported 1 file
⊘ Skipped 1 duplicate: invoice-jan-2026.pdf
  → Already imported (2026-02-23)
```

**Features:**
- SHA256-based duplicate detection
- Links to garden records
- Tracks applied rules
- Search by filename/path
- Import statistics by type

### Import Profiles

Create named profiles with preset import configurations for different workflows:

```bash
# List available profiles
> import profiles
📋 Import Profiles (3)

work-documents
  Confidential work documents with OCR
  Project: +work | Context: @office | Privacy: confidential | OCR: enabled | Duplicate: skip

personal-photos
  Batch import personal photos without OCR
  Project: +memories | Privacy: private | Auto-confirm: yes | Rules: disabled

# Create a new profile
> create import profile
name: receipts
description: Financial receipts with OCR
defaultProject: +finances
defaultContext: @admin
defaultPrivacy: private
enableOcr: true
duplicateAction: prompt

✓ Created import profile: receipts

# Import using a profile
> import with profile work-documents
📋 Using profile: work-documents
Confidential work documents with OCR

Found 5 files...
✓ Imported 5 files with work-documents settings

# Manage profiles
> edit import profile receipts
> delete import profile old-profile
```

**Profile settings:**
- `defaultProject` - Auto-tag with project
- `defaultContext` - Set context for all imports
- `defaultPrivacy` - Privacy level (public/private/confidential)
- `enableOcr` - OCR images by default
- `autoConfirm` - Skip confirmation prompts
- `duplicateAction` - How to handle duplicates (skip/prompt/reimport)
- `rulesEnabled` - Apply import rules

**Example profiles:**
- `work-documents` - Confidential work files with OCR and manual review
- `personal-photos` - Quick batch import without processing
- `receipts` - Financial documents with strict organization
- `research-papers` - Academic papers with full processing

Create profiles interactively with `create import profile`.

---

## GTD Workflow

Capture everything. Process later. Work from lists.

### Things You'll Work With

| Type | What it is | Example |
|------|------------|---------|
| **Item** | Raw capture, not yet processed | "Call someone about that thing" |
| **Action** | A single, concrete next step | "Call Dr. Smith to schedule checkup @phone" |
| **Project** | An outcome requiring multiple actions | "2025 Taxes" |
| **Event** | Garden record with specific time (synced to calendar) | "Team meeting at 2pm" |

The key insight: an **action** is something you can actually *do*. "Do taxes" isn't an action — it's a project. "Find last year's W2" is an action.

**Events** are now proper garden records (type: `event`) with `startTime` and `endTime` metadata. They appear in the calendar and can be linked to projects and contacts like any other record.

### The Lists

GTD organizes your work into lists:

| List | What goes here | Command |
|------|----------------|---------|
| **Inbox** | Everything you capture, before processing | `process inbox` |
| **Next Actions** | Actions you can do now, organized by context | `show next actions` |
| **Projects** | Outcomes you're working toward | `show projects` |
| **Someday/Maybe** | Things you might do later | `show someday` |
| **Waiting For** | Actions blocked on someone else | `show waiting` |

### Items vs Actions

This distinction is key:

| Type | What it is | Has context? | Where it lives |
|------|------------|--------------|----------------|
| **Item** | Raw capture, not yet processed | No | Inbox |
| **Action** | Clarified, doable next step | Yes | Next Actions (by context) |

When you `capture` something, it becomes an **item** in your inbox. When you process the inbox and clarify what the next action is, it becomes an **action** with a context.

### Contexts

Contexts answer: *where or with what can I do this?* Only **actions** have contexts — items are contextless until processed.

| Context | When to use |
|---------|-------------|
| `@phone` | Need to make a call |
| `@computer` | Need your laptop |
| `@errands` | Need to be out |
| `@home` | Need to be home |
| `@office` | Need to be at work |
| `@waiting` | Delegated, waiting for response |
| `@focus` | Need uninterrupted time |

When you have 10 minutes and your phone, filter to `@phone` actions. When you're running errands, check `@errands`. Contexts let you see only what's possible right now.

```
> new action call mom @phone
> new action buy batteries @errands
> new action review proposal @focus
```

**Note:** There is no `@inbox` context. Items live in the inbox by virtue of being `type: item`, not by having a context.

### Content Field

All record types (pages, projects, contacts, notes) support a `content` field for arbitrary text. When creating pages, projects, or contacts, Bartleby prompts for optional content:

```
> new project thailand trip
✓ Created project: "thailand trip"

Content (optional, Enter to skip):
> Planning 2-week trip to Thailand for March 2026. Budget: $5000.
✓ Added content to "thailand trip"
```

Press Enter to skip content entry. Content is always searchable and displayed when viewing the record.

### Contacts

Link actions and events to people using the `with` operator (see [Linking Operators](#linking-operators)):

**Create contacts** with flexible syntax (Bartleby adapts your input):
```
> new contact Sarah Chen, email: sarah@example.com, phone: 555-1234
> new contact Ali Brodie, email ali@example.com, company: Fox Rothschild, note: immigration lawyer
> new contact Mike Jones, phone 555-9999, address: 123 Main St, birthday: 1985-03-15
```

**Available fields:** email, phone, company, address, birthday, note (stored as content)

**Edit contacts** - update individual fields directly:
```
> edit sarah email new@example.com
> edit ali company New Firm LLC
> edit mike address 456 Oak Ave
> edit sarah note specializes in EB-2 visas
```

Or use interactive mode:
```
> edit sarah
📝 Sarah Chen (contact)
  📧 Email: sarah@example.com
  🏢 Company: Acme Corp
  📱 Phone: 555-1234

To edit fields, use: edit <name> <field> <value>
Fields: email, phone, company, address, birthday, note
```

Contact names are fuzzy-matched — "sarah" finds "Sarah Chen". Unknown names create contacts automatically.

**Query by contact:**
```
> show all with sarah
> do i have anything with nicole?
> open sarah chen
> find contact sarah
```

Opening a contact shows all linked actions, events, projects, and notes.

### Projects

A project is any outcome requiring more than one action. The key discipline: every project needs at least one action in your Next Actions list, or it stalls.

```
> new project 2025 taxes

> new action gather W2 forms +2025-taxes
> new action find last year's return +2025-taxes
> new action call accountant +2025-taxes @phone with jamie
```

The `+project` operator links actions to projects (see [Linking Operators](#linking-operators)). View a project to see all associated actions and more:

```
> open 2025 taxes
```

### The Workflow

```
Capture → Clarify → Organize → Review → Do
```

**1. Capture everything** — Get it out of your head immediately.
```
> capture call insurance about claim
> capture idea for blog post
> capture look into that thing Jake mentioned
```

**2. Clarify** — Process your inbox. For each item ask: Is it actionable?
- **Yes:** What's the next action? Create it.
- **No:** Delete it, file it as reference, or put it in Someday/Maybe.

```
> process inbox
> new action call insurance claims dept @phone
> done 2
```

**3. Organize** — Actions get contexts. Multi-step outcomes become projects.
```
> new action write blog outline @computer
> new project home renovation
```

**4. Review** — Weekly, look at all projects and lists. Is everything current? Does every project have a next action?
```
> show projects
> show next actions
> show waiting
```

**5. Do** — When it's time to work, filter by context and pick something.
```
> show next actions @phone
> done 1
```

**Dashboard workflow:** The web UI provides visual task management:
- **Inbox panel** — Click items to edit inline, convert to actions/projects/notes
- **Next Actions** — Grouped by context, click any action to edit
- **Projects** — Click to open project panel showing all related actions/notes/media
- Tab completion works in the dashboard too (`@ho[TAB]` → `@home`, `+proj[TAB]` → `+project-name`)

### Linking Operators

Three operators connect actions and events to context, projects, and people:

| Operator | Meaning | Example |
|----------|---------|---------|
| `@context` | Where/how you'll do it | `@phone`, `@home`, `@computer` |
| `+project` | What it's part of | `+taxes`, `+trip-japan` |
| `with name` | Who's involved | `with sarah`, `with Dr. Lee` |

These can appear anywhere in a command:
```
> new action call accountant @phone +2025-taxes with sarah
> new event lunch with mike friday noon +team-building
```

**Auto-creation:** Using an unknown `@context`, `+project`, or `with name` creates it automatically:
```
> new action research flights +thailand-trip with jamie
✓ Created project: "thailand-trip"
✓ Created contact: "jamie"
✓ Added: "research flights"
```

### Tips

**Tab completion.** Hit `TAB` to autocomplete commands, page names, `@contexts`, `+projects`, and `with` contacts:
```
edit scr[TAB] @ho[TAB] +20[TAB]  →  edit screenshot tax form @home +2025-taxes
new action call with sar[TAB]   →  new action call with sarah chen
ingest doc.pdf +visa[TAB]  →  ingest doc.pdf +visa-project
```

**Command history.** Use `↑` and `↓` arrow keys to cycle through previous commands, even from past sessions:
```
↑           Previous command
↓           Next command
Ctrl+R      Reverse search through history
```
History is saved to `~/.bartleby/database/history.txt` (last 1,000 commands).

**Batch completion.** Complete multiple items at once after viewing any list:
```
> show inbox
> done 1 3 5
✓ Completed 3 items
```

---

## The Time System

Everything with a "when" shows up in one place. Events are garden records that automatically sync to the calendar temporal index.

### Architecture

**Events are garden records** with `type: 'event'` and temporal fields:
- `start_time`: ISO datetime (when it starts)
- `end_time`: ISO datetime (when it ends)
- `all_day`: Boolean (all-day event flag)

When you create an event, it's stored as a markdown file in your garden AND automatically indexed in the calendar. The calendar is a temporal view, not the source of truth.

### What it tracks

| Symbol | Type | Source |
|--------|------|--------|
| 📅 | Events | Garden records (type: event) |
| ⚠️ | Deadlines | Actions with due dates |
| 🔔 | Scheduled | Reminders and recurring items |

### Commands

```
today                              Today's unified view
calendar                           Upcoming events and deadlines
new event                          Create event (guided wizard)
new event <details>                Create event (inline)
show events                        List all events
open <event name>                  View event details
reschedule <event> to <new-time>   Reschedule an event
edit event <name>                  Edit event interactively
remind me <msg> in <time>          Set reminder
```

### Timed Actions

If you add a **time** to an action's `due:` it becomes a scheduled event in the Time System (30m default duration). It still behaves like a normal action, but you'll see it on the calendar for that day.

```
> new action submit report due:tomorrow 11am
```

### Creating Events

**Wizard mode** — type `new event` and answer prompts:

```
> new event
📅 **New Event**

What's the event?
> Coffee with Sarah
When? (e.g., tomorrow 3pm, 1/22 7:30am, friday 2pm)
> friday 10am
Reminder?
→ **none** / **15m** / **30m** / **1h**
> 15m
Add anything else? (Enter to skip)
→ **with <person>**, **at <location>**
> with sarah at Blue Bottle
✓ Created: Coffee with Sarah
  Friday, January 17 at 10:00 AM
  📍 Blue Bottle
  👤 sarah
  🔔 Reminder: 15m before

Description/notes (optional, Enter to skip):
> Discuss Q2 planning and website redesign
✓ Added description to "Coffee with Sarah"
```

Events automatically prompt for optional content/notes after creation, just like projects and contacts.

**Inline mode** — everything in one command:

```
> new event dentist tomorrow at 2pm 15m reminder
> new event call mom tomorrow night with mom
> new event picnic when sunday noon who nicole leena where lakeside 1h reminder
```

The `when`, `who`, `where` keywords let you structure complex events clearly.

### Natural Language Dates

**Month names:**
```
> new event team meeting March 15 at 2pm
> new event conference Apr 22 10am
> new event dentist 15 March 3pm           # European format works too
```

**Relative days:**
```
> new event planning session next week
> new event follow up in 3 days at 2pm
> new event review 5 days from now
```

**Relative times:**
```
> new event standup in 2 hours
> new event quick call in 30 minutes
> new event reminder 45 min from now
```

**Week references:**
```
> new event team meeting next Monday 3pm
> new event demo this Friday morning
> new event 1:1 next Tuesday afternoon
```

**Combined patterns:**
```
> new event planning next Tuesday at 3pm with sarah
> new event conference March 22 at 10am 1h reminder
> new event follow up in 3 days at 2pm with mike
```

All date parsing is smart:
- Past dates automatically advance to next year (March 15 in May → next year)
- "next Monday" = Monday of next week (always 7+ days away)
- "this Friday" = Friday of this week (0-6 days away)
- Works with all existing time formats (3pm, 15:30, afternoon, etc.)

**All-Day Events:**

Omit the time to create all-day events:
```
> new event vacation next week
> new event company holiday friday
> new event tax deadline april 15
```

All-day events show "(all day)" in calendar view and are listed before timed events. Perfect for vacations, holidays, birthdays, and deadlines.

### Example

```
> today

📅 Today — Monday, January 13

  09:00  📅 Team standup
  14:00  📅 1:1 with Sarah
  17:00  ⚠️ Submit report (due)
```

### Editing & Rescheduling Events

**Quick reschedule** — one command to move any event:

```
> reschedule team meeting to tomorrow 3pm
✓ Rescheduled: "team meeting"
  Thursday, February 13 at 3:00 PM

> reschedule dentist to next Monday 10am
✓ Rescheduled: "dentist appointment"
  Monday, February 17 at 10:00 AM

> reschedule call to in 2 hours
✓ Rescheduled: "call"
  Wednesday, February 12 at 4:30 PM
```

**Interactive editing** — change multiple properties:

```
> edit event team meeting

📅 **Team Meeting**
  When: Friday, February 14 at 10:00 AM
  Duration: 60 minutes
  📍 Conference Room A
  👤 Sarah, Mike

What would you like to change?
  • time <new-time> - Reschedule event
  • title <new-title> - Rename event
  • location <place> - Change location
  • description <text> - Update description
  • done - Finish editing

> time next Tuesday 2pm
✓ Rescheduled to Tuesday, February 18 at 2:00 PM

> location Zoom
✓ Location changed to "Zoom"

> done
✓ Finished editing "Team Meeting"
```

**Smart features:**
- Fuzzy name matching finds events by partial title
- Duration preserved when rescheduling (90-minute meeting stays 90 minutes)
- Uses full natural language date parsing
- Automatically updates calendar and reminders
- Suggests similar events if name not found

### Event Architecture & Persistence

**Events are first-class garden records**, not just calendar entries. This means:

**Stored as Markdown:**
```markdown
# Coffee with Sarah

Discuss Q2 planning and website redesign

---
type: event
status: active
start: 2026-01-17T10:00:00Z
end: 2026-01-17T11:00:00Z
contacts: [sarah-id]
id: evt-abc123
---
```

**Benefits:**
- ✅ Events persist in your garden (source of truth)
- ✅ Edit events in any text editor
- ✅ Events included in backups (just markdown files)
- ✅ Calendar automatically syncs from garden
- ✅ Can link events to projects, contacts, notes
- ✅ Events appear in search and knowledge graph

**Automatic Syncing:**
When you create or update an event in the garden, it automatically:
1. Registers in the calendar temporal index (for time-based views)
2. Schedules reminders via the scheduler (if reminder specified)
3. Updates project/contact relationships
4. Appears in relevant views (today, calendar, project pages)

The calendar is a **derived view** — delete `database/calendar.sqlite3` and it rebuilds from your markdown files on startup.

### Notifications

When scheduled items come due, Bartleby notifies you:

- **Console** — Always shows in your terminal
- **Signal** — Optionally sends to your phone (see [Configuration](#notifications-signal))

If you weren't running when something was due, Bartleby handles missed items on next startup (configurable).

---

## Dashboard

Web UI at http://localhost:3333. View panels, edit pages, speak commands. Same data as CLI.

### Starting the Dashboard

The dashboard is integrated into Bartleby and starts automatically:

```bash
pnpm start
```

Open http://localhost:3333 in your browser.

**Authentication:** When `DASHBOARD_HOST` is not `localhost`, you'll be prompted to enter your `BARTLEBY_API_TOKEN` on first use. The token is stored in browser localStorage for subsequent visits.

### Panels

The dashboard shows live-updating panels:

| Panel | What it shows |
|-------|---------------|
| **Inbox** | Unprocessed items (`type: item`) |
| **Next Actions** | Actions grouped by context |
| **Projects** | Active projects (click to open) |
| **Notes** | All notes (click to open panel) |
| **Calendar** | Upcoming events + deadlines |
| **Today** | Today's events + overdue items |
| **Recent** | Last 10 modified pages |
| **REPL** | Command line in the browser |

Click the `+` buttons in the footer to add panels. Layout persists across reloads.

### Command History API

Track and analyze your command execution patterns with the command history API:

**CLI Commands:**
```
> /history              Show last 20 commands with timestamps and status
> /history 50           Show last 50 commands
> /search history note  Search for commands containing "note"
```

Each entry shows:
- ✓/✗ Success indicator
- Timestamp and execution time
- Full command text
- Error messages (if failed)

**API Endpoints:**

```bash
# Get recent commands
curl http://localhost:3333/api/command/history?limit=50

# Search command history (full-text search)
curl http://localhost:3333/api/command/search?q=note&limit=20

# Get execution statistics
curl http://localhost:3333/api/command/stats
```

Statistics include:
- Total commands executed
- Success rate percentage
- Most-used command types (intents)
- Commands by source (cli, dashboard, api)

All command history is stored in the unified learning database and used to improve Bartleby's context awareness during conversations.

### Rich Project & Note Views

Project and note panels display **auto-generated sections** built from the knowledge graph:

**Project panels show:**
- 📝 **Content** — Your project description
- 👥 **People** — Contacts referenced by this project (`with person`)
- ✅ **Next Actions** — Tasks with `+project-name`
- 📝 **Notes** — Notes mentioning `[[Project Name]]`
- 📎 **Media** — Images and files tagged to this project
- 🔗 **Backlinks** — Any page that links to this project

**Note panels show:**
- 📝 **Content** — Full note with markdown rendering
- 🔗 **Backlinks** — Pages that reference this note
- 📊 **Stats** — View counts, last edited

Sections update automatically as you link items together. When you create `new action research visa +thailand-trip`, it instantly appears in the Thailand Trip project panel under "Next Actions". When you mention `[[Sarah]]` in a note, both the note and Sarah's contact page show the connection.

### Quick Create

Each panel has a **+ New** button for quick creation:

| Panel | Button | Creates |
|-------|--------|---------|
| Inbox | + New Item | Raw capture (no context) |
| Actions | + New Action | Action with `@home` context (inline edit) |
| Projects | + New Project | New project |
| Calendar | + New Event | Event (prompts for date/time) |
| Notes | + New Note | New note |

**Inline creation:** When you click **+ New Action**, an empty action appears and you can immediately start typing. Add `@context` or `+project` inline, then press Enter to save.

### Editing Actions

Click any action to edit inline:

```
pack bags                    →  pack bags @home +thailand-trip due:friday
       ↑ click                        ↑ full text with context/project/due appears
```

- Line expands showing the full action text with `@context`, `+project`, and `due:date`
- Cursor appears at end — start typing to add/change metadata
- **Tab completion:** Type `@h[TAB]` → `@home`, or `+20[TAB]` → `+2025-taxes`
- **Save:** `Enter` or click Save
- **Cancel:** `Escape` or click Cancel
- **Done:** Mark action complete (disappears instantly)
- **Convert:** (Inbox only) Convert item to action, project, note, or event

**Changing context:** To move an action to a different context, edit it and change `@home` to `@phone` (or any context). New contexts are created automatically.

**New contexts:** Type any `@newcontext` — if it doesn't exist, it will be created. The action will appear under that context after you save.

### Editing Notes

Notes use the same inline editing as actions:

- **Click** any note → edit title inline, add `+project`
- **View** → opens note content in its own panel
- **Save** / **Cancel** / **Remove** buttons

Note panels show:
- Full content with markdown rendering
- Metadata (project, last updated)
- Edit in REPL button for content changes

### Project Pages

Click a project name to open its dedicated panel showing:

- **Actions** — all actions linked to this project
- **Media** — images and files (click for full-size lightbox)
- **Notes** — notes linked to this project

### Importing Media & OCR

**Drag and drop** images or files onto the dashboard:

1. Drag any file onto the dashboard
2. Blue overlay appears: "Drop to import or OCR"
3. For images, a prompt appears:
   - **Type a title** — Extract text and save as note with that title
   - **1** — OCR only (extract text, show in REPL, don't save)
   - **3** — Import image to garden (can add `+project`)
4. Non-images go straight to import

Images appear as thumbnails on project pages. Click to view full-size.

**CLI OCR:**
```
> ocr ~/Desktop/screenshot.png
```

### Web Page Import

Import articles, blog posts, or any web page:

```
> import url https://example.com/article
✓ Imported web page: "Article Title"

Source: https://example.com/article
Content: 8,432 characters

Saved as note: "Article Title"
```

- Fetches the URL and extracts text content
- Removes scripts, ads, navigation
- Stores as note with source URL
- Content limited to 10,000 characters

### File Import Workflow

Import multiple files at once using the inbox directory:

**1. Add files to inbox:**
```bash
# Copy files to the inbox directory
cp ~/Downloads/*.pdf ./inbox/
cp ~/Documents/*.txt ./inbox/
cp ~/Pictures/*.jpg ./inbox/
```

**2. Review and import:**
```
> import files              # Scan inbox
> import files --ocr        # Enable OCR for images

# Or import all at once without confirmation
> import all
> import all --ocr

Found 5 files in inbox:

📄 DOCUMENT (2):
  - contract.pdf (245.3 KB)
  - report.docx (89.1 KB)

🖼️ IMAGE (2):
  - photo1.jpg (1.2 MB)
  - photo2.jpg (856.3 KB)

📝 TEXT (1):
  - notes.txt (3.4 KB)

Ready to import. Type "confirm" to process these files.

> confirm
✓ Imported 5 files:

  • contract.pdf
    → note: "Imported: Contract"
    → garden/imports/2026-02-14/contract.pdf
  • report.docx
    → note: "Imported: Report"
    → garden/imports/2026-02-14/report.docx
  ...

Files stored in: /Users/you/bartleby/garden/imports/2026-02-14
```

**3. View staged files:**
```
> show inbox                # Show all files
> show inbox images         # Filter by type
> show inbox documents

Inbox: 5 files (2.4 MB)

📄 DOCUMENT (2):
  • contract.pdf (245.3 KB) - captured 2026-02-14
  • report.docx (89.1 KB) - captured 2026-02-14
...
```

**4. Selective and batch operations:**
```
> import only images        # Import only images, leave others
> import only documents     # Import only documents

> clear inbox               # Delete all staged files
```

**What happens on import:**
- Files are copied to `garden/imports/YYYY-MM-DD/`
- **Content is automatically extracted:**
  - **PDFs** → Full text extraction
  - **CSVs** → Structure analysis (rows, columns, sample data)
  - **Text files** → Content reading
  - **Images** → OCR text extraction (with `--ocr` flag)
- Garden records are created with enriched content
- Original files are removed from inbox
- Records include `source_file` reference to the imported file

**Supported file types:**
- **Documents**: PDF (text extraction), DOC, DOCX, ODT, RTF
- **Spreadsheets**: XLSX (multi-sheet parsing), XLS, CSV (structure analysis), TSV, ODS
- **Images**: PNG, JPG, JPEG, GIF, BMP, SVG, WEBP, HEIC (OCR with --ocr)
- **Text**: TXT, MD, JSON, XML, YAML, LOG (content extraction)
- **Archives**: ZIP, TAR, GZ, 7Z, RAR
- **Email**: EML, MSG, MBOX
- **Web**: HTML, HTM, MHTML
- **URLs**: Any web page (text extraction)

**Import Rules (Automatic Organization):**

Create rules interactively to automatically organize imports:
```
> create import rule
```

Example rule:
- **Name:** Financial Documents
- **Match:** Filename pattern `(invoice|receipt|statement)` + file types `document, text`
- **Actions:** Apply project `finances`, context `admin`, tags `financial, records`
- **Priority:** 100 (higher = evaluated first)

View and manage rules:
```
> show import rules       # List all rules
> edit import rule <name> # Modify a rule
> delete import rule <name> # Remove a rule
```

Rules are automatically applied during import confirmation. Higher priority rules are evaluated first.

**Configuration:**
```env
# .env
BARTLEBY_INBOX_PATH=./inbox  # Default location
```

### Voice Commands

Voice commands work via iOS Siri Shortcuts (see [Running on a Server](#option-3-siri-shortcuts-recommended-for-voice)). The shortcut handles speech-to-text and text-to-speech on-device for speed.

Works with any command you'd type in the CLI.

---

## Running on a Server

Run headless, access remotely.

### Basic Server Setup

```bash
# On server
git clone https://github.com/JussaMouse/bartleby.git
cd bartleby
pnpm install && pnpm approve-builds && pnpm build
cp .env.example .env

# Generate API token for authentication
openssl rand -hex 32

# Edit .env with your config
# Add the generated token as BARTLEBY_API_TOKEN=<token>
# Set DASHBOARD_HOST=localhost (or Tailscale IP for VPN access)

# Start in tmux or screen
tmux new -s bartleby
pnpm start
# Ctrl+B D to detach
```

**⚠️ Security Note:** All API endpoints require authentication. Set `BARTLEBY_API_TOKEN` in `.env` before accessing remotely.

### Accessing the Dashboard Remotely

**Option 1: SSH Tunnel (simplest, most secure)**

From your local machine:
```bash
ssh -L 3333:localhost:3333 user@your-server
```

Then open http://localhost:3333 locally.

Add to `~/.ssh/config` for convenience:
```
Host bartleby
    HostName your-server-ip
    User your-user
    LocalForward 3333 localhost:3333
```

Then just `ssh bartleby` — tunnel is created automatically.

**Option 2: Tailscale VPN (recommended for mobile)**

Tailscale creates a secure mesh VPN between your devices. No port forwarding needed.

**Setup on server (headless macOS):**

```bash
# Install
brew install tailscale

# Start daemon
sudo tailscaled &

# Authenticate (opens a URL to sign in)
sudo tailscale up
```

**Make it start on boot:**

```bash
sudo tee /Library/LaunchDaemons/com.tailscale.tailscaled.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.tailscale.tailscaled</string>
    <key>ProgramArguments</key>
    <array>
        <string>/opt/homebrew/bin/tailscaled</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>
EOF

sudo launchctl load /Library/LaunchDaemons/com.tailscale.tailscaled.plist
```

**Setup on iPhone:**
1. Install Tailscale from App Store
2. Sign in with same account
3. Access dashboard via Tailscale IP: `http://<server-tailscale-ip>:3333`

Find your server's Tailscale IP:
```bash
tailscale ip -4
```

**Configure Bartleby for VPN access:**

```env
# Bind to Tailscale IP (not 0.0.0.0 - that exposes to all networks!)
DASHBOARD_HOST=100.x.x.x  # Your server's Tailscale IP (find with: tailscale ip -4)
DASHBOARD_PORT=3333
BARTLEBY_API_TOKEN=<your-generated-token>  # Required for authentication
```

**Option 3: Siri Shortcuts (recommended for voice)**

Use iOS Shortcuts for hands-free voice commands. All speech recognition and text-to-speech happens on-device for speed.

**⚠️ Authentication Required:** All shortcuts must include your `BARTLEBY_API_TOKEN` in the Authorization header.

Get your token from server's `.env` file:
```bash
# On server
grep BARTLEBY_API_TOKEN .env
```

**Quick Capture Shortcut** (fastest — dedicated endpoint):

1. Open Shortcuts app → tap **+**
2. Add action: **Dictate Text**
3. Add action: **Get Contents of URL**
   - URL: `http://<tailscale-ip>:3333/api/capture`
   - Method: **POST**
   - Headers:
     - `Content-Type`: `application/json`
     - `Authorization`: `Bearer <paste-your-token-here>`
   - Request Body: **JSON**
     - Add field `text` with value: select **Dictated Text** variable
4. Add action: **Get Dictionary Value**
   - Key: `reply`
5. Add action: **Speak Text** → select **Dictionary Value**
6. Name shortcut "Bartleby Capture" (or "Capture" for shorter invocation)

Now say "Hey Siri, Bartleby Capture" → speak your thought → hear confirmation.

**Long Note Shortcut** (voice memos — no timeout):

For longer dictation that doesn't cut off after a pause:

1. Open Shortcuts app → tap **+**
2. Add action: **Dictate Text**
   - Stop Listening: **After Pause** (default)
3. Add action: **Set Variable**
   - Name: `Title`
4. Add action: **Dictate Text**
   - Stop Listening: **On Tap** ← key setting for long content
5. Add action: **Set Variable**
   - Name: `Content`
6. Add action: **Get Contents of URL**
   - URL: `http://<tailscale-ip>:3333/api/note`
   - Method: **POST**
   - Headers:
     - `Content-Type`: `application/json`
   - Request Body: **JSON**
     - `title`: select **Title** variable
     - `content`: select **Content** variable
7. Add action: **Speak Text** → "Saved" + **Title** variable
8. Name shortcut "Long Note" or "Voice Memo"

Say "Hey Siri, Long Note" → speak title → pause → speak your full note → tap Done → "Saved [title]"

The "On Tap" setting keeps Siri listening until you tap Done, allowing unlimited dictation length.

**General Command Shortcut** (any command):

Same as above but use URL: `http://<tailscale-ip>:3333/api/chat?voice=true`

The `?voice=true` parameter strips markdown from responses for cleaner TTS.

**OCR to Note Shortcut** (recommended — saves as note):

1. Open Shortcuts app → tap **+**
2. Add action: **Select Photos**
3. Add action: **Get Contents of URL**
   - URL: `http://<tailscale-ip>:3333/api/ocr/note`
   - Method: **POST**
   - Request Body: **Form**
     - Add field `file` with value: select **Photos** variable
4. Add action: **Get Dictionary from Input** (parse JSON response)
5. Add action: **Get Dictionary Value** → Key: `url`
6. Add action: **Open URLs** → Dictionary Value
7. Name shortcut "OCR"

Pick a photo → text is extracted → saved as "OCR Jan 15, 3:45 PM" → opens in browser.

**OCR Only Shortcut** (just extract text, no save):

Same as above but:
- URL: `http://<tailscale-ip>:3333/api/ocr`
- Get Dictionary Value key: `text`
- Use **Copy to Clipboard** instead of Open URLs

**Read Today Shortcut** (hear your schedule):

1. Open Shortcuts app → tap **+**
2. Add action: **Get Contents of URL**
   - URL: `http://<tailscale-ip>:3333/api/today?voice=true`
   - Method: **GET**
   - Headers:
     - `Authorization`: `Bearer YOUR_TOKEN`
3. Add action: **Get Dictionary Value**
   - Key: `summary`
4. Add action: **Speak Text** → select **Dictionary Value**
5. Name shortcut "Bartleby Today"

Say "Hey Siri, Bartleby Today" to hear your schedule and tasks.

**Read Inbox Shortcut** (hear pending items):

Same as above but use URL: `http://<tailscale-ip>:3333/api/inbox?voice=true`

**Tips:**
- Add shortcuts to Home Screen for one-tap access
- Use Shortcuts widget for quick capture
- "Hey Siri, Capture" works if you name the shortcut just "Capture"
- Share Sheet shortcuts let you OCR screenshots from any app

### API Token

**⚠️ REQUIRED for all remote access.** All API endpoints now require authentication.

Generate a secure token:
```bash
openssl rand -hex 32
```

Add to `.env`:
```env
BARTLEBY_API_TOKEN=<paste-generated-token>
```

All API requests must include:
```
Authorization: Bearer <your-token>
```

**Security: Dashboard Host Binding**

| Setting | Security | When to use |
|---------|----------|-------------|
| `DASHBOARD_HOST=localhost` | ✅ High | Local server access only (default) |
| `DASHBOARD_HOST=100.x.x.x` | ✅ High | Tailscale VPN access (recommended for remote) |
| `DASHBOARD_HOST=0.0.0.0` | ⚠️ With IP whitelist | Multi-device access with IP restrictions |
| `DASHBOARD_HOST=0.0.0.0` | ❌ NEVER | Without IP whitelist - unsafe |

**⚠️ Critical:** Using `0.0.0.0` without an IP whitelist exposes your data to any device on any network. Bartleby will refuse to start with this insecure configuration.

For remote access via Tailscale, you can bind specifically to your Tailscale IP:

```env
DASHBOARD_HOST=100.x.x.x   # Your Tailscale IP (find with: tailscale ip -4)
DASHBOARD_PORT=3333
```

This ensures Bartleby is only accessible via the VPN, not on local networks.

#### IP Whitelisting for Multi-Device Access

If you need to access Bartleby from multiple devices with different connection methods (e.g., laptop via SSH tunnel + iPhone via Tailscale), you can use IP whitelisting with `0.0.0.0` binding:

```env
DASHBOARD_HOST=0.0.0.0
DASHBOARD_PORT=3333
BARTLEBY_API_TOKEN=your-64-char-token-here
BARTLEBY_ALLOWED_IPS=127.0.0.1,100.x.x.x  # Localhost + iPhone Tailscale IP
```

**How it works:**
- `DASHBOARD_HOST=0.0.0.0` binds to all network interfaces
- `BARTLEBY_ALLOWED_IPS` restricts access to specific IPs only
- `127.0.0.1` allows localhost access (SSH tunnels work)
- `100.x.x.x` is your iPhone's Tailscale IP (direct access)
- Any other IP will receive `403 Forbidden`

**Finding your device IPs:**
```bash
# On iPhone: Install Tailscale app, find IP in settings (starts with 100.)
# On server: Run `tailscale status` to see all connected devices and their IPs
```

### SSH Tunnel to Remote MLX Server

Connect local Bartleby to MLX models running on a remote server via SSH tunnel over Tailscale. Useful for testing locally while using a more powerful server's GPU, or running multiple Bartleby instances against the same backend.

**Setup:**

1. Get remote server's Tailscale IP: `tailscale ip -4` (e.g., `100.x.x.x`)
2. Create SSH tunnel (replace `<ssh-port>` and `<tailscale-ip>`):
   ```bash
   ssh -p <ssh-port> \
       -L 8080:127.0.0.1:8080 \
       -L 8081:127.0.0.1:8081 \
       -L 8083:127.0.0.1:8083 \
       -L 8084:127.0.0.1:8084 \
       user@<tailscale-ip>
   ```
3. Keep local `.env` unchanged (already points to `127.0.0.1`)
4. Test: `curl http://127.0.0.1:8080/v1/models`
5. Start Bartleby: `pnpm start`

The tunnel must stay open while running. Multiple instances can share the same backend (requests queue independently).

---

## Configuration

Bartleby uses a **hybrid configuration system**:
- **Bootstrap** (`.env`) — Minimal configuration to start: LLM URL, storage paths, logging
- **Runtime** (database) — All other settings: models, calendar, presence, etc.

### Quick Setup

**New installations:**
1. Create minimal `.env` with just `LLM_URL`
2. Run `pnpm start`
3. The first-launch wizard runs automatically — asks your name, configures defaults, and offers optional settings

**Existing installations:**
Your current `.env` works as-is. Settings are migrated to the database automatically on first run. To trigger migration manually:
```bash
> migrate settings
```

### Settings Commands

```bash
# View settings
> settings                       # Show all settings by category
> settings calendar              # Show calendar settings
> settings llm                   # Show LLM configuration

# Change settings (no restart needed)
> set calendar.timezone to America/New_York
> set llm.router-model to qwen3:1b
> set presence.startup to false

# Statistics
> settings stats                 # View settings count by category

# Reset to defaults
> reset settings calendar        # Reset one category
> reset settings                 # Reset all (with confirmation)

# Reconfigure
> setup wizard                   # Run first-run wizard again
```

**Settings take effect immediately** — no restart required (except for bootstrap settings in `.env`).

### LLM Models

Bartleby uses a 3-tier model system for intelligent workload distribution:

| Tier | Size | Purpose | Speed |
|------|------|---------|-------|
| Router | 0.5-1B | Classify simple vs complex | ~50ms |
| Fast | 7-30B | Simple queries, single tools | ~500ms |
| Thinking | 30B+ | Multi-step reasoning | 2-10s |
| Embedding | ~1B | Text to vectors | ~100ms |

**Configure via settings:**

```bash
# View current configuration
> settings llm

# Change models
> set llm.router-model to qwen3:0.6b
> set llm.fast-model to qwen3:7b
> set llm.thinking-model to qwen3:32b

# Adjust timeouts and limits
> set llm.health-timeout to 35000
> set llm.agent-max-iterations to 10
```

**Bootstrap (`.env` only):**
```env
# LLM URL (required)
LLM_URL=http://127.0.0.1:8080/v1

# Optional: Separate embeddings server
EMBEDDINGS_URL=http://127.0.0.1:8081/v1
```

The first-run wizard auto-detects available models and configures sensible defaults.

### OCR (Optional)

Extract text from images using a vision-language model like olmOCR.

**Configure:**
```bash
> settings ocr

# Enable OCR
> set ocr.enabled to true
> set ocr.url to http://127.0.0.1:8085/v1
> set ocr.model to olmocr
> set ocr.max-tokens to 4096
```

**Recommended model:** `olmOCR-2-7B-1025-MLX-8bit` — optimized for text extraction, runs on Apple Silicon.

**Usage:**
```bash
> ocr ~/Desktop/receipt.png
**Text from receipt.png:**

COSTCO WHOLESALE
1234 WAREHOUSE BLVD
...
TOTAL: $127.43

# Import with automatic OCR
> import ~/Desktop/screenshot.png meeting notes
📎 Media imported: meeting notes
  📁 screenshot.png
  🔍 OCR: 847 characters extracted
```

When OCR is enabled, imported images automatically have their text extracted and stored.

### Calendar

**Configure:**
```bash
> settings calendar

# Change individual settings
> set calendar.timezone to America/Los_Angeles
> set calendar.default-duration to 60
> set calendar.ambiguous-time to afternoon
> set calendar.week-start to sunday
> set calendar.date-format to mdy
> set calendar.reminder-minutes to 15
```

**Options:**
- `ambiguous-time`: `morning` | `afternoon` | `ask`
- `week-start`: `sunday` | `monday`
- `date-format`: `mdy` (1/15=Jan 15) | `dmy` (1/15=15 Jan)
- `reminder-minutes`: `0` to disable default reminders

### Notifications (Signal)

Get notifications on your phone via Signal.

**Setup:**
1. Install [signal-cli](https://github.com/AsamK/signal-cli)
2. Register/link your number
3. Configure in Bartleby:
   ```bash
   > set signal.enabled to true
   > set signal.cli-path to /usr/local/bin/signal-cli
   > set signal.number to +1234567890
   > set signal.recipient to +0987654321
   ```
4. Test: `msg me in 1 min: test`

### Presence

Control when Bartleby speaks unprompted:

```bash
> settings presence

# Enable/disable presence moments
> set presence.startup to true           # Greet on startup
> set presence.shutdown to true          # Preview tomorrow on quit
> set presence.scheduled to true         # Morning/evening check-ins
> set presence.contextual to true        # Surface related info
> set presence.idle to false             # Nudge after idle period

# Timing
> set presence.morning-hour to 8         # Morning moment (24h)
> set presence.evening-hour to 18        # Evening moment (24h)
> set presence.idle-minutes to 5         # Minutes until considered idle
```

### Paths

Where Bartleby stores data:

```env
GARDEN_PATH=./garden      # Your wiki (markdown files)
SHED_PATH=./shed          # Ingested documents
DATABASE_PATH=./database  # SQLite indexes
LOG_DIR=./logs            # Log files
```

### Logging

```env
LOG_LEVEL=INFO            # DEBUG, INFO, WARN, ERROR
LOG_LLM_VERBOSE=false     # Show model reasoning (debugging)
```

### Scheduler

```env
SCHEDULER_ENABLED=true              # Enable reminders and scheduling
SCHEDULER_CHECK_INTERVAL=60000      # How often to check (ms)
SCHEDULER_MISSED_REMINDERS=         # What to do with missed items:
                                    #   ask  = summarize and prompt
                                    #   fire = execute immediately
                                    #   skip = dismiss silently
                                    #   show = display only
```

### Weather (Optional)

Configure via settings (recommended — prompted during first-launch):
```bash
> set weather.city to London
> set weather.api-key to your-key
```

Or in `.env` (picked up automatically during first-launch migration):
```env
WEATHER_CITY=London
OPENWEATHERMAP_API_KEY=your-key
```

Get a free API key at [openweathermap.org](https://openweathermap.org/api).

### Dashboard

```env
DASHBOARD_PORT=3333       # Default port
DASHBOARD_HOST=localhost  # Options: localhost, 0.0.0.0, or specific IP
BARTLEBY_API_TOKEN=       # REQUIRED for remote access (generate: openssl rand -hex 32)
BARTLEBY_ALLOWED_IPS=     # Optional: comma-separated IP whitelist (e.g., 127.0.0.1,100.x.x.x)
```

**Host binding options:**

| Value | Accessible from | When to use |
|-------|-----------------|-------------|
| `localhost` | Server only | Default, most secure |
| `0.0.0.0` | All interfaces | Only with IP whitelist or behind VPN |
| `100.x.x.x` | Tailscale only | Remote access without exposing to LAN |

**Authentication:** All API endpoints require `BARTLEBY_API_TOKEN` when `DASHBOARD_HOST` is not `localhost`. Generate a secure token with `openssl rand -hex 32`.

**IP Whitelisting:** Use `BARTLEBY_ALLOWED_IPS` to restrict access to specific IPs when binding to `0.0.0.0`. Example: `BARTLEBY_ALLOWED_IPS=127.0.0.1,100.64.x.x` allows localhost and one Tailscale device. Localhost (127.0.0.1, ::1) is automatically included.

---

## Backups

### Data Architecture: Markdown as Source of Truth

Bartleby follows a **files-first architecture** where markdown files are authoritative:

**Essential data (in markdown files):**
- All content (notes, descriptions, journal entries)
- Essential metadata (type, status, projects, due dates)
- Relationships (projects, contexts, contacts, wiki links)
- File structure and organization

**Derived data (in database):**
- SQLite indexes for fast queries
- Full-text search index
- Embeddings vectors
- Usage statistics (view counts, momentum scores)

**Recovery guarantee:** If you have only the `garden/` directory, Bartleby can rebuild everything else. The database is a performance cache, not the data-of-record.

### What to Back Up

| Path | Priority | Contains | Recoverable? |
|------|----------|----------|--------------|
| `garden/` | **CRITICAL** | All pages, notes, media (markdown) | Source of truth |
| `garden/archive.log` | **CRITICAL** | Completed/deleted items | No rebuild |
| `.env` | **CRITICAL** | Configuration, API keys | No rebuild |
| `database/` | Optional | SQLite indexes, stats | ✅ Auto-rebuilt |
| `shed/` | Optional | Ingested docs, embeddings | Expensive to rebuild |

### Backup Strategies

**Minimal backup (essential data only):**
```bash
# Just the irreplaceable data
rsync -avz garden/ backup/garden/
cp .env backup/.env
```

**Full backup (includes derived data):**
```bash
tar -czvf bartleby-backup-$(date +%Y%m%d).tar.gz \
    garden/ \
    database/ \
    shed/ \
    .env
```

**Git backup (versioned, recommended):**
```bash
cd garden/
git init  # if not already a repo
git add -A
git commit -m "Daily backup"
git push origin main
```

### Disaster Recovery

**Scenario:** You lost the database but have the `garden/` folder.

```bash
# 1. Start Bartleby
pnpm start

# 2. Garden service automatically:
#    - Scans all .md files
#    - Parses frontmatter (type, status, projects, dates)
#    - Extracts [[wiki links]] and +projects/@contexts
#    - Rebuilds entire database
#    - Regenerates full-text search index
#    - Recreates relationship graph

# 3. Result: Full recovery of all essential data
```

**What you never lose** (as long as you have markdown files):
- ✅ All content and notes
- ✅ All essential metadata (type, status, projects, dates)
- ✅ All relationships (projects, contexts, wiki links)
- ✅ File organization

**What you might lose** (derived data, can be regenerated):
- ❌ Historical usage stats (view counts) — stats start fresh going forward
- ❌ Embeddings vectors (costly to regenerate) — re-run `ingest` on shed documents
- ❌ View cache — auto-rebuilt on first page access

**Good news:** Bartleby automatically rebuilds from markdown:
- ✅ Knowledge graph (all `[[links]]`, `+projects`, `with contacts`)
- ✅ PageViews and sections (auto-generated from graph relationships)
- ✅ Full-text search index
- ✅ All queries and filters

**None of the lost data is essential** — it's all computed from your markdown files.

### Sync to Cloud

The `garden/` folder is just markdown — sync it however you like:

```bash
# rsync to another machine
rsync -avz garden/ user@backup-server:~/bartleby-garden/

# Or use any cloud sync (Syncthing, Dropbox, iCloud Drive, git)
```

**Why this works:** Every action, project, note has its metadata in frontmatter:

```markdown
---
id: action-xyz789
type: action
title: Call dentist
status: active
contexts: [phone]
due_date: 2026-02-15
project: +medical
---

Follow up about [[Insurance claim]].
```

If you sync this file, you sync the complete record. The database just makes it fast to query.

---

## Security

Bartleby stores sensitive personal data (notes, calendar, financial records). Proper security hardening is essential.

### Security Audit

Run the automated security audit to check your system:

```bash
./scripts/security-audit.sh
```

The script performs 8 security checks:

**1. File Permissions**
- Verifies `.env` is 600 (owner read/write only)
- Checks data directories are 700 (owner access only)
- Validates `data.sqlite3` permissions

**2. Network Configuration**
- Checks `DASHBOARD_HOST` setting:
  - ✓ `localhost` or `127.0.0.1` (local only)
  - ✓ `100.x.x.x` (Tailscale VPN)
  - ✗ `0.0.0.0` (exposed to all networks)
- Verifies `BARTLEBY_API_TOKEN` is set if exposing remotely

**3. LLM Endpoints (Data Privacy)**
- Ensures all AI models are LOCAL
- Checks: `ROUTER_URL`, `FAST_URL`, `THINKING_URL`, `EMBEDDINGS_URL`, `OCR_URL`
- ✗ External URLs mean your data leaves your machine

**4. Logging Configuration**
- `LOG_LEVEL` should be `info`/`warn`/`error` (not `debug`)
- `LOG_LLM_VERBOSE` must be `false` (or full conversations including financial data get logged)

**5. Full-Disk Encryption**
- macOS: Checks FileVault status
- Linux: Checks for LUKS/dm-crypt encrypted volumes
- ✗ Without FDE, anyone with physical access can read your data

**6. Backup Status**
- Searches common backup locations
- Checks Time Machine configuration (macOS)
- Recommends encrypted backup setup

**7. Sensitive Data Inventory**
- Shows sizes of data directories
- ✗ CRITICAL: Checks if `.env` is tracked by git (secrets would be committed!)

**8. Financial Data Protection**
- Checks `database/data.sqlite3` permissions
- Shows CSV source file count in `data/sources/`

**Output format:**
- ✓ PASS (green) — secure configuration
- ⚠ WARN (yellow) — review recommended
- ✗ FAIL (red) — critical issue requiring immediate fix

### Quick Checklist

Before importing sensitive data:

- [ ] Full-disk encryption enabled (FileVault/LUKS)
- [ ] `.env` permissions are `600`
- [ ] `DASHBOARD_HOST` is `localhost` or Tailscale IP (not `0.0.0.0`)
- [ ] `LOG_LEVEL` is `info` (not `debug`)
- [ ] `LOG_LLM_VERBOSE` is `false`
- [ ] All LLM endpoints are local (`127.0.0.1` or `localhost`)
- [ ] Backups exist and are encrypted
- [ ] `.env` is NOT tracked by git

### Authentication & Network Exposure

All API endpoints require authentication when accessing remotely (`DASHBOARD_HOST` is not `localhost`).

| `DASHBOARD_HOST` | Authentication | Who can access | Safe? |
|------------------|---------------|----------------|-------|
| `localhost` | None (local-only) | Only the server | ✓ Yes (default) |
| `100.x.x.x` (Tailscale) | API token required | Only your VPN devices | ✓ Yes |
| `0.0.0.0` + IP whitelist | API token + IP check | Whitelisted IPs only | ✓ Yes |
| `0.0.0.0` without whitelist | ✗ Blocked at startup | N/A | ✗ NEVER |

**Token requirement:** All requests to a remote dashboard must include:
```
Authorization: Bearer <your-token>
```

Browser sessions cache the token in localStorage after first entry. Siri Shortcuts and API clients must include the header in every request.

**Why this matters:** Bartleby stores highly sensitive data (calendar, notes, financial records). Without authentication, anyone on the network could read, modify, or delete everything.

For detailed security documentation, see [devs-notes/SECURITY.md](devs-notes/SECURITY.md).

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

### better-sqlite3 version mismatch

If you see `NODE_MODULE_VERSION` errors after updating Node.js:

```bash
pnpm rebuild better-sqlite3
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

---

## More

- [COMMANDS.md](COMMANDS.md) — Full command reference
- [TECH_SPEC.md](TECH_SPEC.md) — Developer documentation, database schemas, architecture

---

## License

MIT — see [LICENSE](LICENSE)
