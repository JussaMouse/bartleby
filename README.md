# Bartleby

The personal exocortex, locally.

- [What is Bartleby?](#what-is-bartleby)
- [Quick Start](#quick-start)
- [First 10 Minutes](#first-10-minutes)
- [Your Data](#your-data)
- [Data Tools](#data-tools)
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

**2. Configure**

```bash
cp .env.example .env
```

Edit `.env` with your LLM endpoints. You'll need local models running (e.g., via [MLX](https://github.com/ml-explore/mlx), [Ollama](https://ollama.ai), or [llama.cpp](https://github.com/ggerganov/llama.cpp)).

**Minimum configuration:**

```env
# LLM endpoints (must be local)
FAST_MODEL=your-model-name
FAST_URL=http://127.0.0.1:8080/v1

EMBEDDINGS_MODEL=your-embedding-model
EMBEDDINGS_URL=http://127.0.0.1:8081/v1
```

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

You'll see:

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

### 5) Import media

```
> import ~/photos/beach.jpg vacation photo +thailand
(or drag into the dashboard)
```

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
import <path> [name]    Import image/file
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

**Create custom views:**
```
> create view "Urgent Tasks" showing urgent actions
> create view "Work Notes" showing notes in work-project

> open urgent tasks
**Urgent Tasks** (page)
────────────────────────────────────────
**Results:** (7)
  1. Submit quarterly report
  2. Call client about proposal
  ...
```

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

**Teach Bartleby naturally:**
```
> my name is Lon
> I'm a morning person
> my wife Nicole wakes up late
> I prefer short meetings
```

**Commands:**
```
/memory                      Show what Bartleby knows about you
what do you know about me    (alternative to /memory)
show profile                 (alternative to /memory)
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

All settings live in `.env`.

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

# Fast — Simple queries
FAST_MODEL=mlx-community/Qwen3-8B-4bit
FAST_URL=http://127.0.0.1:8080/v1

# Thinking — Complex reasoning
THINKING_MODEL=mlx-community/Qwen3-30B-A3B-4bit
THINKING_URL=http://127.0.0.1:8080/v1

# Embeddings — Semantic search
EMBEDDINGS_MODEL=nomic-ai/nomic-embed-text-v1.5
EMBEDDINGS_URL=http://127.0.0.1:8081/v1
```

### OCR (Optional)

Extract text from images using a vision-language model like olmOCR:

```env
OCR_URL=http://127.0.0.1:8085/v1
OCR_MODEL=olmocr
OCR_MAX_TOKENS=4096
```

**Recommended model:** `olmOCR-2-7B-1025-MLX-8bit` — optimized for text extraction, runs on Apple Silicon.

**Usage:**

```
> ocr ~/Desktop/receipt.png
**Text from receipt.png:**

COSTCO WHOLESALE
1234 WAREHOUSE BLVD
...
TOTAL: $127.43

> import ~/Desktop/screenshot.png meeting notes
📎 Media imported: meeting notes
  📁 screenshot.png
  🔍 OCR: 847 characters extracted
```

When OCR is enabled, imported images automatically have their text extracted and stored.

### Calendar

```env
CALENDAR_TIMEZONE=America/Los_Angeles
CALENDAR_DEFAULT_DURATION=60
CALENDAR_AMBIGUOUS_TIME=afternoon    # morning|afternoon|ask
CALENDAR_WEEK_START=sunday           # sunday|monday
CALENDAR_DATE_FORMAT=mdy             # mdy (1/15=Jan 15) | dmy (1/15=15 Jan)
CALENDAR_EVENT_REMINDER_MINUTES=15   # 0 to disable
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

**Signal Setup:**
1. Install [signal-cli](https://github.com/AsamK/signal-cli)
2. Register/link your number
3. Configure the settings above
4. Test: `msg me in 1 min: test`

### Presence

Control when Bartleby speaks unprompted:

```env
PRESENCE_STARTUP=true          # Show opener at startup
PRESENCE_SHUTDOWN=true         # Show tomorrow preview at quit
PRESENCE_SCHEDULED=true        # Morning/evening reviews
PRESENCE_CONTEXTUAL=true       # Surface related info during chat
PRESENCE_IDLE=false            # Nudge after idle period
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

```env
WEATHER_API_KEY=your-key  # OpenWeatherMap API key
WEATHER_CITY=London       # City for weather queries
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
