# Bartleby

The personal exocortex, locally.

- [What is Bartleby?](#what-is-bartleby)
- [Quick Start](#quick-start)
- [Your Data](#your-data)
- [GTD Workflow](#gtd-workflow)
- [The Time System](#the-time-system)
- [Configuration](#configuration)
- [Dashboard](#dashboard)
- [Troubleshooting](#troubleshooting)

## What is Bartleby?

Bartleby is a personal assistant that runs entirely on your machine. It works best paired with locally run LLMs.

At its heart are **The Garden** and **The Shed**. The Garden is a personal wiki that grows with you, letting you curate a vast interconnected knowledgebase of articles, notes, and the projects they support. The Shed is the intelligent reference library. You feed it PDFs, books, and videos to support your knowledge work in The Garden and to power Bartleby's memory.

Your tasks, calendar, contacts, journal — they all live in the Garden too. Everything connects. Everything is plain markdown you own forever.

Talk to Bartleby naturally. It figures out what you mean.

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

At minimum:

```env
FAST_MODEL=your-model-name
FAST_URL=http://127.0.0.1:8080/v1

EMBEDDINGS_MODEL=your-embedding-model
EMBEDDINGS_URL=http://127.0.0.1:8081/v1
```

**3. Run**

```bash
pnpm start
```

You'll see:

```
📋 Bartleby is ready. Type "help" for commands, "quit" to exit.
```

**Pro tip:** Hit `TAB` to autocomplete commands, page names, contexts, and projects.

---

## Your Data

Everything lives on your machine in three places.

### The Garden

Your personal wiki — plain markdown files you own forever.

The Garden is where your knowledge lives: wiki-like pages, projects, and notes. But the same system includes contacts, events, daily journals, and reference media. Over time it becomes your external brain — a searchable map of everything you know.

Your productivity lives here too — actions, projects, and inbox items are all special page types in The Garden.

It consists of two layers: the **files** and the **database**.
- The files are a flat dir of markdown files, one for each page. The files each have lines of metadata at the bottom (YAML backmatter).
- The database system monitors these files for changes and updates the database. A db gives Bartleby the speed and flexibility to make the most of this centralized store of knowledge.

**Page types:**
| Type | What it's for |
|------|---------------|
| `note` | Meeting notes, scratch, working documents |
| `entry` | Wiki/encyclopedia pages — your accumulated knowledge |
| `contact` | People, with email/phone/birthday |
| `daily` | Journal entries, one per day |
| `list` | Curated collections (reading list, gift ideas) |
| `media` | References to ingested documents |

Pages are dynamic so `list` and `project` can programmatically display linked actions, notes, calendar events, contacts, etc. via tagging.

**Commands:**
```
new note <title>        Create a note (prompts for content)
add contact <name>      Add a person
open <title>            View any page
show notes <project>    List notes tagged with project
show contacts           List all contacts
```

**Files are the source of truth.** Edit them in any text editor — Bartleby watches for changes and syncs automatically.

**When you complete or delete something:** The file is removed and a record is appended to `archive.log`. This keeps your Garden clean while maintaining a permanent log.

Location: `./garden/`

### The Shed

Your reference library. Ingest PDF, YouTube, web page, ebook. Query them with natural language. This is where you feed Bartleby the expertise he needs to help do knowledge work.

**How it works:**
1. You ingest a document (PDF, markdown, text)
2. Bartleby chunks it and creates embeddings
3. You ask questions, Bartleby finds relevant chunks
4. It synthesizes an answer from your documents

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

Location: `./shed/`

### About You

What Bartleby learns about you over time.

**Automatically collected from conversation:**
- Your name, preferences, habits
- Relationships ("my wife Sarah")
- Goals and interests
- Conversation history

**How Bartleby uses it:**
- Startup message surfaces relevant follow-ups
- Responses adapt to your preferences
- Can recall past conversations

**Teach Bartleby naturally:**
```
> my name is Lon
> I'm a morning person
> my wife Nicole wakes up late
> I prefer short meetings
```

**Commands:**
```
what do you know about me    Show stored facts
show profile                 Same
```

Location: `./database/memory/`

---

## GTD Workflow

Bartleby implements Getting Things Done (GTD) — a system for capturing everything on your mind and organizing it so you always know what to do next.

### The Core Idea

Your brain is for having ideas, not holding them. GTD gets everything out of your head and into a trusted system so you can focus on doing instead of remembering.

### Things You'll Work With

| Type | What it is | Example |
|------|------------|---------|
| **Item** | Raw capture, not yet processed | "Call someone about that thing" |
| **Action** | A single, concrete next step | "Call Dr. Smith to schedule checkup @phone" |
| **Project** | An outcome requiring multiple actions | "2025 Taxes" |
| **Event** | Something happening at a specific time | "Team meeting at 2pm" |

The key insight: an **action** is something you can actually *do*. "Do taxes" isn't an action — it's a project. "Find last year's W2" is an action.

### The Lists

GTD organizes your work into lists:

| List | What goes here | Command |
|------|----------------|---------|
| **Inbox** | Everything you capture, before processing | `process inbox` |
| **Next Actions** | Actions you can do now, organized by context | `show next actions` |
| **Projects** | Outcomes you're working toward | `show projects` |
| **Someday/Maybe** | Things you might do later | `show someday` |
| **Waiting For** | Actions blocked on someone else | `show waiting` |

### Contexts

Contexts answer: *where or with what can I do this?*

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

### Tags

Tags categorize across types. Use them for:

- **Priority:** `urgent`, `important`
- **Topics:** `taxes`, `health`, `house`
- **People:** `sarah`, `boss`
- **Time horizons:** `thisweek`, `q1`

```
> new action call accountant @phone #taxes #urgent
> show tagged urgent
```

### Projects

A project is any outcome requiring more than one action. The key discipline: every project needs at least one action in your Next Actions list, or it stalls.

```
> new project 2025 taxes

> new action gather W2 forms +2025-taxes
> new action find last year's return +2025-taxes
> new action call accountant +2025-taxes @phone
```

The `+project-name` links actions to their project. View a project to see all associated actions and more:

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

### Tips

**Commands combine naturally.** Context, project, due date, and tags can appear anywhere:
```
> new action call accountant @phone +2025-taxes due:friday #urgent
```

**Tab completion.** Hit `TAB` to autocomplete commands, page names, `@contexts`, and `+projects`:
```
edit scr[TAB] @ho[TAB] +20[TAB]  →  edit screenshot tax form @home +2025-taxes
```

**Auto-creation.** Using `@newcontext` or `+newproject` creates them if they don't exist:
```
> new action research flights +thailand-trip
✓ Created project: "thailand-trip"
✓ Added: "research flights" (thailand-trip)
```

---

## The Time System

Everything with a "when" shows up in one place.

### What it tracks

| Symbol | Type | Source |
|--------|------|--------|
| 📅 | Events | Calendar |
| ⚠️ | Deadlines | Actions with due dates |
| 🔔 | Scheduled | Reminders and recurring items |

### Commands

```
today                        Today's unified view
calendar                     Upcoming events
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

### Notifications

When scheduled items come due, Bartleby notifies you:

- **Console** — Always shows in your terminal
- **Signal** — Optionally sends to your phone (see [Configuration](#notifications-signal))

If you weren't running when something was due, Bartleby handles missed items on next startup (configurable).

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

---

## Dashboard

A minimal web UI for viewing and editing Garden pages while you work in the CLI.

### Starting the Dashboard

```bash
# Terminal 1: Bartleby CLI
pnpm start

# Terminal 2: Dashboard server
pnpm dashboard
```

Open http://localhost:3333 in your browser.

### Panels

The dashboard shows live-updating panels:

| Panel | What it shows |
|-------|---------------|
| **Inbox** | Uncategorized captures |
| **Next Actions** | Actions grouped by context |
| **Projects** | Active projects (click to open) |
| **Today** | Today's events + overdue items |
| **Recent** | Last 10 modified pages |
| **Project: X** | Specific project with its actions |

Click the `+` buttons in the footer to add panels.

### Editing

Click any item to open the editor:

- Edit the raw markdown (including backmatter)
- **Save:** `Cmd+S` or click Save
- **Cancel:** `Escape` or click Cancel

Changes are written to the `.md` file. The file watcher syncs everything — both CLI and dashboard see updates instantly.

### Configuration

```env
DASHBOARD_PORT=3333    # Default port
```

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

---

## More

- [COMMANDS.md](COMMANDS.md) — Full command reference
- [TECH_SPEC.md](TECH_SPEC.md) — Developer documentation, database schemas, architecture

---

## License

MIT — see [LICENSE](LICENSE)

---

*Built for humans who want to own their data.*
