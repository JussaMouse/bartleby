# Bartleby

The personal exocortex, locally.

- [What is Bartleby?](#what-is-bartleby)
- [Quick Start](#quick-start)
- [First 10 Minutes](#first-10-minutes)
- [Your Data](#your-data)
- [GTD Workflow](#gtd-workflow)
- [The Time System](#the-time-system)
- [Dashboard](#dashboard)
- [Running on a Server](#running-on-a-server)
- [Configuration](#configuration)
- [Backups](#backups)
- [Troubleshooting](#troubleshooting)

## What is Bartleby?

A local-first personal assistant. Runs on your machine with local LLMs.

- **The Garden** — Your wiki. Actions, projects, notes, contacts, calendar. Plain markdown files.
- **The Shed** — Your reference library. Ingest PDFs, ask questions.

Type commands in the CLI or speak them in the Dashboard. Same system, same data.

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
📊 Dashboard: http://localhost:3333
```

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
> new action call mom @phone #family
```

### 3) Make a project and link actions

```
> new project 2025 taxes
> new action gather W2 forms +2025-taxes
> new action call accountant +2025-taxes @phone
```

### 4) Create a wiki page (entry) and a scratch note

```
> new entry house rules #family +home
> new note cherry pie
What would you like to add to this note?
> (paste recipe)
> done
Any project or tags? (e.g., +project #tag1 #tag2, or ENTER to skip)
> +thanksgiving #recipe
```

### 5) Import media

```
> import ~/photos/beach.jpg vacation photo +thailand #travel
```

### 6) Add an event in one line

```
> new event dentist tomorrow 2pm 15m reminder
```

### 7) Edit anything with tab completion

```
> edit nort[TAB]
> edit northside-hs-attendance-zone
> +home-search #schools
```

---

## Your Data

Everything lives on your machine in three places.

### The Garden

Plain markdown files. One file per page.

Two layers:
- **Files** — Flat directory of `.md` files with YAML backmatter
- **Database** — SQLite index, rebuilt automatically from files

**Page types:**
| Type | What it's for |
|------|---------------|
| `entry` | Wiki/encyclopedia pages — permanent structured knowledge |
| `note` | Scratch text, meeting notes, working documents |
| `contact` | People, with email/phone/birthday |
| `daily` | Journal entries, one per day |
| `list` | Curated collections (reading list, gift ideas) |
| `media` | Images and files imported into the garden |

**Entry vs Note:** An *entry* is a permanent wiki page ("house rules", "packing checklist"). A *note* is scratch/working text, often attached to a project.

Pages are dynamic — projects automatically display linked actions, notes, media, and calendar events.

**Commands:**
```
new entry <title>       Create a wiki page (+project #tags inline)
new note <title>        Create a note (prompts for content, then tags)
import <path> [name]    Import image/file (+project #tags inline)
add contact <name>      Add a person
open <title>            View any page
show notes              List all notes
show contacts           List all contacts
```

**Files are the source of truth.** Edit them in any text editor — Bartleby watches for changes and syncs automatically.

**When you complete or delete something:** The file is removed and a record is appended to `archive.log`. This keeps your Garden clean while maintaining a permanent log.

Location: `./garden/`

### The Shed

Ingest documents, ask questions.

1. `ingest <file>` — chunks and embeds
2. `ask shed <question>` — searches chunks, synthesizes answer

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

Capture everything. Process later. Work from lists.

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

**Batch completion.** Complete multiple items at once after viewing any list:
```
> show inbox
> done 1 3 5
✓ Completed 3 items
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
calendar                     Upcoming events and deadlines
new event                    Create event (guided wizard)
new event <details>          Create event (inline)
remind me <msg> in <time>    Set reminder
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
→ **with <person>**, **at <location>**, **#tag**
> with sarah at Blue Bottle #social
✓ Created: Coffee with Sarah
  Friday, January 17 at 10:00 AM
  📍 Blue Bottle
  👤 sarah
  🏷️ #social
  🔔 Reminder: 15m before
```

**Inline mode** — everything in one command:

```
> new event dentist tomorrow at 2pm 15m reminder
> new event call mom tomorrow night with mom
> new event picnic when sunday noon who nicole leena where lakeside 1h reminder
```

The `when`, `who`, `where` keywords let you structure complex events clearly.

### Example

```
> today

📅 Today — Monday, January 13

  09:00  📅 Team standup
  14:00  📅 1:1 with Sarah
  17:00  ⚠️ Submit report (due)
```

### Notifications

When scheduled items come due, Bartleby notifies you:

- **Console** — Always shows in your terminal
- **Signal** — Optionally sends to your phone (see [Configuration](#notifications-signal))

If you weren't running when something was due, Bartleby handles missed items on next startup (configurable).

---

## Dashboard

Web UI at http://localhost:3333. View panels, edit pages, speak commands. Same data as CLI.

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
| **Calendar** | Upcoming events + deadlines |
| **Today** | Today's events + overdue items |
| **Recent** | Last 10 modified pages |
| **Project: X** | Specific project with its actions |

Click the `+` buttons in the footer to add panels. Layout persists across reloads.

### Editing Actions

Click any action to edit inline:

```
pack bags                    →  pack bags @home +thailand-trip due:friday
       ↑ click                        ↑ full text with tags appears
```

- Line expands showing the full action text with `@context`, `+project`, and `due:date`
- Cursor appears at end — start typing to add/change tags
- **Tab completion:** Type `@h[TAB]` → `@home`, or `+20[TAB]` → `+2025-taxes`
- **Save:** `Enter` or click Save
- **Cancel:** `Escape` or click Cancel
- **Done:** Mark action complete (disappears instantly)
- **→ Action:** (Inbox only) Convert to a real action and start editing

### Editing Other Pages

Click notes, entries, or projects to open the full editor modal:

- Edit the raw markdown (including backmatter)
- **Save:** `Cmd+S` or click Save
- **Cancel:** `Escape` or click Cancel

Changes are written to the `.md` file. The file watcher syncs everything — both CLI and dashboard see updates instantly.

### Project Pages

Click a project name to open its dedicated panel showing:

- **Actions** — all actions linked to this project
- **Media** — images and files (click for full-size lightbox)
- **Notes** — notes linked to this project

### Importing Media

**Drag and drop** images or files onto the dashboard:

1. Drag any file onto the dashboard
2. Blue overlay appears: "Drop to import media"
3. Enter a name (can include `+project` and `#tags`)
4. File is copied to `garden/media/` and linked to the project

Images appear as thumbnails on project pages. Click to view full-size.

### Voice Commands

On mobile (Safari), tap the mic and speak a command. Bartleby transcribes, processes, and replies with text and voice.

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
# Edit .env with your config

# Start in tmux or screen
tmux new -s bartleby
pnpm start
# Ctrl+B D to detach
```

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

**Option 2: VPN (Tailscale, WireGuard)**

For mobile access, a VPN is more practical than tunnels:

1. Install Tailscale on server and phone
2. Run `tailscale up` on both
3. Access via tailnet hostname: `http://your-server:3333`

When using a VPN, bind to all interfaces:
```env
DASHBOARD_HOST=0.0.0.0
DASHBOARD_PORT=3333
```

**Option 3: Siri Shortcuts**

Create an iOS Shortcut for hands-free access:

1. **Dictate Text** → Variable `spokenText`
2. **Get Contents of URL**
   - URL: `http://your-server:3333/api/chat`
   - Method: `POST`
   - Headers: `Content-Type: application/json`, `Authorization: Bearer YOUR_TOKEN`
   - Body: JSON `{ "text": spokenText }`
3. **Speak Text** from the JSON response field `reply`

### API Token

For remote access, set an API token:

```env
BARTLEBY_API_TOKEN=your-secret-token
```

Requests must include:
```
Authorization: Bearer your-secret-token
```

**Note:** Only set `DASHBOARD_HOST=0.0.0.0` when access is protected by VPN, firewall, or API token. On an open network, keep it as `localhost` and use SSH tunnels.

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

### Dashboard

```env
DASHBOARD_PORT=3333       # Default port
DASHBOARD_HOST=localhost  # Use 0.0.0.0 only with VPN/firewall
BARTLEBY_API_TOKEN=       # Optional: require token for /api/chat
```

---

## Backups

### What to Back Up

| Path | Contains | Format |
|------|----------|--------|
| `garden/` | All your pages, notes, media | Markdown files |
| `garden/archive.log` | Completed/deleted items | Text log |
| `database/` | SQLite indexes | `.sqlite3` files |
| `shed/` | Ingested documents and embeddings | Mixed |

### Quick Backup

```bash
# Backup everything personal
tar -czvf bartleby-backup-$(date +%Y%m%d).tar.gz \
    garden/ \
    database/*.sqlite3 \
    shed/ \
    .env
```

### Restore

```bash
# Stop Bartleby first
tar -xzvf bartleby-backup-20260115.tar.gz
pnpm start
```

### Sync to Cloud

The `garden/` folder is just markdown — sync it however you like:

```bash
# rsync to another machine
rsync -avz garden/ user@backup-server:~/bartleby-garden/

# Or use any cloud sync (Syncthing, Dropbox, iCloud Drive)
```

**Tip:** The SQLite databases are indexes derived from the markdown files. If you lose them, Bartleby rebuilds them on startup from the files in `garden/`.

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
