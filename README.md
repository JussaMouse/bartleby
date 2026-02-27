# Bartleby

A local-first personal assistant. Runs on your machine with local LLMs, no cloud required.

- [Quick Start](#quick-start)
- [First 10 Minutes](#first-10-minutes)
- [The Garden](#the-garden)
- [GTD Workflow](#gtd-workflow)
- [Events & Calendar](#events--calendar)
- [The Shed](#the-shed)
- [Memory & Learning](#memory--learning)
- [Data Tools](#data-tools)
- [Dashboard](#dashboard)
- [Running on a Server](#running-on-a-server)
- [Configuration](#configuration)
- [Backups](#backups)
- [Security](#security)
- [Troubleshooting](#troubleshooting)

---

## Quick Start

**1. Install**

```bash
git clone https://github.com/JussaMouse/bartleby.git
cd bartleby
pnpm install && pnpm approve-builds && pnpm build
```

**2. Configure**

```bash
cp .env.example .env
```

Edit `.env` with your LLM endpoint (e.g., [MLX](https://github.com/ml-explore/mlx), [Ollama](https://ollama.ai), or [llama.cpp](https://github.com/ggerganov/llama.cpp)):

```env
LLM_URL=http://127.0.0.1:8080/v1

# Optional paths (defaults shown)
DATABASE_PATH=./database
LOG_LEVEL=info
```

All other settings (models, calendar, weather, OCR, etc.) are configured via the interactive wizard on first run or the `settings` command.

For remote access, also set:
```env
BARTLEBY_API_TOKEN=<openssl rand -hex 32>
DASHBOARD_HOST=localhost    # or your Tailscale IP
```

**3. Run**

```bash
pnpm start
```

On first run, a setup wizard asks your name and configures defaults. After that:

```
📋 Bartleby is ready. Type "help" for commands, "quit" to exit.
📊 Dashboard: http://localhost:3333
```

---

## First 10 Minutes

### 1) Capture anything

```
> capture call insurance about claim
> capture idea for blog post
> capture look into that thing Jake mentioned
```

### 2) Create an action

```
> new action call mom @phone
> new action buy batteries @errands
```

### 3) Make a project and link actions

```
> new project 2025 taxes
> new action gather W2 forms +2025-taxes
> new action call accountant +2025-taxes @phone
```

### 4) Create a note

```
> new note house rules
> new note meeting notes jan 24 +q1-planning
```

### 5) Add an event

```
> new event dentist tomorrow 2pm
> new event team meeting next Tuesday 3pm with sarah
```

### 6) Import a file

Drag and drop onto the dashboard at http://localhost:3333, or:

```
> import ~/Desktop/receipt.png
```

**Tip:** Hit `TAB` to autocomplete commands, record titles, `@contexts`, and `+projects`.

---

## The Garden

All garden data lives in `bartleby.db`. Records are typed:

| Type | Purpose |
|------|---------|
| `item` | Inbox capture — unprocessed |
| `action` | A single doable next step |
| `project` | An outcome requiring multiple actions |
| `note` | Notes, reference material, wiki pages |
| `contact` | Person with contact details |
| `event` | Calendar event with start/end time |
| `tag` | Label for organizing notes |
| `media` | Imported image or document |

**System views** (always available):

| View | Shows |
|------|-------|
| Inbox | Unprocessed items |
| Next Actions | All active actions |
| Waiting For | Delegated actions |
| Someday Maybe | Future possibilities |
| All Events | Calendar events |
| All Notes | All notes |
| All Projects | All projects |
| Contacts | People directory |

**Custom views:**

```
> create view "Phone Calls" showing actions @phone
> list views
> open view Phone Calls
> delete view "Phone Calls"
```

**Relationship graph:** When you use `[[wiki links]]`, `+projects`, and `with person`, these become typed edges. Opening a record shows related items automatically — a project shows its linked actions and notes; a contact shows linked events and actions.

---

## GTD Workflow

Capture everything. Process later. Work from lists.

### Core Types

| Type | What it is | Example |
|------|------------|---------|
| **Item** | Raw capture, not yet processed | "look into that thing Jake mentioned" |
| **Action** | A single, concrete next step | "call Dr. Smith to schedule checkup @phone" |
| **Project** | An outcome requiring multiple actions | "2025 Taxes" |

The key insight: an **action** is something you can actually *do* right now. "Do taxes" is a project. "Find last year's W2" is an action.

### The GTD Loop

**Capture** — Get it out of your head:
```
> capture call insurance about claim
> capture idea for blog post
```

**Clarify** — Process your inbox:
```
> show inbox
> new action call insurance claims dept @phone
> done 2
```

**Organize** — Add contexts and projects:
```
> new action write blog outline @computer +side-projects
> new project home renovation
```

**Review** — Weekly:
```
> list projects
> show next actions
```

**Do** — Filter by context and pick something:
```
> show next actions @phone
> complete call mom
```

### Contexts

Contexts answer: *where or how can I do this?*

| Context | Use when |
|---------|----------|
| `@phone` | Need to make a call |
| `@computer` | Need your laptop |
| `@errands` | Out and about |
| `@home` | Need to be home |
| `@office` | Need to be at work |
| `@waiting` | Delegated, waiting for response |
| `@focus` | Need uninterrupted time |

### Projects

Every project needs at least one next action in your list, or it stalls.

```
> new project 2025 taxes
> new action gather W2 forms +2025-taxes
> new action call accountant +2025-taxes @phone with jamie
> show project 2025 taxes
```

### Contacts

```
> add contact Sarah Chen email sarah@example.com phone 555-1234
> show contact sarah
> find contact sarah
```

Link actions and events to contacts with `with`:
```
> new action call accountant @phone with jamie
> new event coffee friday 10am with sarah
```

Contact names are fuzzy-matched — "sarah" finds "Sarah Chen". Using an unknown contact name creates it automatically.

### Linking Operators

| Operator | Meaning |
|----------|---------|
| `@context` | Where/how to do it |
| `+project` | Which outcome it belongs to |
| `with name` | Who's involved |

These can appear anywhere in a command and in any order:
```
> new action call accountant @phone +2025-taxes with sarah
```

Using an unknown `+project` or `with name` creates it automatically.

### Tips

**Tab completion:**
```
edit scr[TAB] @ho[TAB] +20[TAB]  →  edit screenshot-notes @home +2025-taxes
new action call with sar[TAB]    →  new action call with sarah chen
```

**Command history:** `↑` / `↓` cycle through previous commands (persists across sessions). `Ctrl+R` for reverse search. History is saved to `database/history.txt`.

---

## Events & Calendar

Events are garden records with `starts_at` and `ends_at` fields.

### Commands

```
new event <details>     Create event
show calendar           Upcoming events and actions with due dates
list events             All events
show event <name>       View event details
edit event <name>       Edit event fields
```

### Creating Events

Natural language works:
```
> new event dentist tomorrow at 2pm
> new event team meeting next Tuesday 3pm with sarah
> new event conference March 22 at 10am
> new event picnic when sunday noon who nicole where lakeside
```

Omit the time for all-day events:
```
> new event company holiday friday
> new event tax deadline april 15
```

Date parsing handles: month names, relative dates ("in 3 days", "next Monday"), week references ("this Friday morning"). Past dates automatically advance to next year.

### Editing Events

```
> reschedule team meeting to tomorrow 3pm
> edit event team meeting
```

`reschedule` preserves the event's original duration.

---

## The Shed

The Shed is your reference library. Ingest documents and web pages, then query them with natural language.

```
> ingest ~/Documents/contract.pdf
> ingest https://example.com/article
> ask shed what are the contract termination terms?
> list sources
```

During first-run, README, COMMANDS, and TECH_SPEC are imported as searchable notes. You can also ingest them manually for natural-language queries:

```
> ingest README.md
> ask shed how do I create a contact?
```

Location: `./shed/`

---

## Memory & Learning

Bartleby learns from every conversation and maintains persistent memory across sessions using an Entity-Observation-Relationship (EOR) system.

### What It Learns Automatically

- Your name, preferences, and habits
- Relationships ("my wife Sarah", "my boss Mike")
- Goals and working context
- Patterns from command history

### Soft Preferences

Tell Bartleby things naturally:
```
> my name is Lon
> I prefer short responses
> my wife is Nicole
```

These inform responses without enforcing them.

### Standing Instructions

Mandatory rules injected into every system prompt — the model must follow them:
```
> always use bullet points (remember this)
> never use markdown headers (remember this)
> remember this: keep responses under 100 words
> rule: respond in plain text only
```

Accepted patterns: `<text> (remember this)`, `remember this: <text>`, `rule: <text>`, `new rule: <text>`

Manage your rules:
```
> /rules              # View all rules numbered
> delete rule 2       # Remove rule #2
> delete rule all     # Clear all rules
```

Rules are stored with `confidence: 1.0` and no expiry. Deleting one supersedes it — history is preserved but it's no longer active.

### Memory Commands

```
> what do you know about me     # Show learned facts
> /rules                        # View standing instructions
> show history                  # Recent command history
> search history <query>        # Search past commands
```

Maintenance:
```
pnpm monitor                 # Database stats and health
pnpm optimize                # Clean expired observations and optimize
pnpm profile export          # Export learning data to JSON
pnpm profile import <file>   # Restore from export
```

### Temporary Memory

Observations can have a time-to-live:
```
> remember for 7 days that I'm working from home
> forget that I'm working from home
```

Updates create a superseding chain — the old value is kept as history, the latest wins.

**Data location:** `database/bartleby.db`

---

## Data Tools

Import, query, and analyze CSV data with SQL. Useful for financial data cleanup.

```
> ingest csv ~/Downloads/data.csv as mytable
> sql SELECT * FROM mytable LIMIT 10
> sql SELECT type, COUNT(*), SUM(value) FROM mytable GROUP BY type
> tables
> describe mytable
> export "SELECT * FROM mytable" to output.csv
```

**Ingest options:** `--replace`, `--append`, `--no-header`, `--skip-lines N`

**Safe mutations — always preview before changing data:**
```
> preview UPDATE mytable SET type = 'Buy' WHERE id = '123'
> snapshot mytable
> sql UPDATE mytable SET type = 'Buy' WHERE id = '123'
> snapshots                                    # List saved snapshots
> restore mytable_snapshot_2026_01_24 to mytable
```

Data lives in `database/data.sqlite3`, separate from your garden.

---

## Dashboard

Web UI at http://localhost:3333. Same data as the CLI, live-updating.

### Panels

Click view buttons in the footer to open panels. Each panel displays a named view. Click × to close. Layout persists across reloads.

Available views: Inbox, Next Actions, All Projects, All Notes, All Events, Contacts, REPL

### Using the Dashboard

- **Click any item** → opens its detail view as a new panel
- **✎ button** → edit modal (title, status, other fields)
- **✓ button** → complete an action
- **Footer input** → capture to inbox (press Enter)
- **Drag and drop** → import a file as a media record
- **REPL panel** → full command line, same as CLI

### Authentication

When `DASHBOARD_HOST` is not `localhost`, you'll be prompted for your `BARTLEBY_API_TOKEN` on first use. The token is cached in browser localStorage.

---

## Running on a Server

### Setup

```bash
git clone https://github.com/JussaMouse/bartleby.git
cd bartleby
pnpm install && pnpm approve-builds && pnpm build
cp .env.example .env
# Set LLM_URL, BARTLEBY_API_TOKEN, and DASHBOARD_HOST in .env
pnpm start
```

Run in the background with tmux: `tmux new -s bartleby`, detach with `Ctrl+B D`.

### Remote Access Options

**SSH tunnel (simplest)**

```bash
ssh -L 3333:localhost:3333 user@your-server
```

Open http://localhost:3333 locally. Add to `~/.ssh/config` for convenience:

```
Host bartleby
    HostName your-server-ip
    User your-user
    LocalForward 3333 localhost:3333
```

**Tailscale VPN (recommended for mobile)**

```bash
brew install tailscale
sudo tailscaled &
sudo tailscale up
```

Set in `.env`:
```env
DASHBOARD_HOST=100.x.x.x      # Your Tailscale IP: tailscale ip -4
BARTLEBY_API_TOKEN=<token>    # Required: openssl rand -hex 32
```

Install Tailscale on iPhone → sign in with the same account → open `http://<tailscale-ip>:3333`.

**Multi-device access with IP whitelisting:**
```env
DASHBOARD_HOST=0.0.0.0
BARTLEBY_ALLOWED_IPS=127.0.0.1,100.x.x.x    # Localhost + device Tailscale IPs
BARTLEBY_API_TOKEN=<token>
```

### Siri Shortcuts

Voice capture via iOS Shortcuts. Speech recognition happens on-device.

**Quick Capture:**

1. Shortcuts app → **+**
2. **Dictate Text**
3. **Get Contents of URL**
   - URL: `http://<tailscale-ip>:3333/api/capture`
   - Method: POST
   - Headers: `Content-Type: application/json`, `Authorization: Bearer <token>`
   - Body (JSON): `text` → Dictated Text variable
4. **Get Dictionary Value** → key: `reply`
5. **Speak Text**

Say "Hey Siri, Capture" → speak → hear confirmation.

**Long Note** (unlimited dictation length):

1. **Dictate Text** (stop: After Pause) → Set Variable `Title`
2. **Dictate Text** (stop: **On Tap**) → Set Variable `Content`
3. **Get Contents of URL**: `POST /api/note`, JSON body `{title, content}`
4. **Speak Text** → "Saved [Title]"

**Any command:** Use `POST /api/chat?voice=true`. The `voice=true` parameter strips markdown from responses for cleaner text-to-speech.

**OCR a photo:**

1. **Select Photos**
2. **Get Contents of URL**: `POST /api/ocr`, form body with field `file`
3. **Get Dictionary Value** → key: `text`
4. **Copy to Clipboard**

### Tunnel to Remote MLX Server

To use models running on a more powerful remote machine:

```bash
ssh -p <port> \
    -L 8080:127.0.0.1:8080 \
    -L 8081:127.0.0.1:8081 \
    user@<tailscale-ip>
```

Keep the tunnel open while Bartleby is running. Local `.env` stays unchanged.

---

## Configuration

Bartleby uses a two-tier system: `.env` for bootstrap settings, database for everything else.

### .env (Bootstrap)

Only what's needed to start. Everything else lives in the database.

```env
# LLM (required)
LLM_URL=http://127.0.0.1:8080/v1
EMBEDDINGS_URL=http://127.0.0.1:8081/v1    # Optional separate endpoint

# Storage
DATABASE_PATH=./database
SHED_PATH=./shed
LOG_DIR=./logs

# Dashboard
DASHBOARD_PORT=3333
DASHBOARD_HOST=localhost
BARTLEBY_API_TOKEN=                         # Required for remote access
BARTLEBY_ALLOWED_IPS=                       # Optional: comma-separated IPs

# Logging
LOG_LEVEL=info
LOG_LLM_VERBOSE=false
```

### Runtime Settings

Changes take effect immediately without restarting:

```
> settings                   # Show all settings
> settings llm               # Show one category
> set llm.fast-model to qwen3:7b
> set calendar.timezone to America/New_York
> set weather.city to London
> reset settings calendar    # Reset a category to defaults
> setup wizard               # Re-run first-launch wizard
```

### LLM Models

Bartleby uses three model tiers:

| Tier | Size | Purpose | Typical latency |
|------|------|---------|-----------------|
| Router | 0.5–1B | Classify request complexity | ~50ms |
| Fast | 7–30B | Simple queries, single tool calls | ~500ms |
| Thinking | 30B+ | Multi-step reasoning | 2–10s |

```
> set llm.router-model to qwen3:0.6b
> set llm.fast-model to qwen3:7b
> set llm.thinking-model to qwen3:32b
```

### OCR

```
> set ocr.enabled to true
> set ocr.url to http://127.0.0.1:8085/v1
> set ocr.model to olmocr
```

Recommended model: `olmOCR-2-7B-1025-MLX-8bit` (Apple Silicon).

### Calendar

```
> set calendar.timezone to America/Los_Angeles
> set calendar.default-duration to 60        # Event duration in minutes
> set calendar.week-start to sunday          # or monday
> set calendar.date-format to mdy            # or dmy
```

### Weather

```
> set weather.city to London
> set weather.api-key to <key>
```

Free API key at [openweathermap.org](https://openweathermap.org/api).

### Signal Notifications

```
> set signal.enabled to true
> set signal.cli-path to /usr/local/bin/signal-cli
> set signal.number to +1234567890
> set signal.recipient to +0987654321
```

Requires [signal-cli](https://github.com/AsamK/signal-cli) installed and registered.

**Inbound commands (optional):** add to `.env` to let Bartleby respond to Signal messages as if they were REPL commands.

```env
SIGNAL_RECEIVE_ENABLED=true
SIGNAL_ALLOWED_SENDERS=+1234567890
```

Only allow numbers you trust. Group messages are ignored by default.

---

## Backups

All garden data lives in one file:

| Path | Priority | Contents |
|------|----------|----------|
| `database/bartleby.db` | **Critical** | All records, notes, contacts, events, learning |
| `.env` | **Critical** | Configuration and API keys |
| `shed/` | Optional | Reference documents (expensive to re-ingest) |

```bash
# Quick backup
cp database/bartleby.db backups/bartleby-$(date +%Y%m%d).db

# Full backup
tar -czvf bartleby-$(date +%Y%m%d).tar.gz database/bartleby.db shed/ .env

# Export just the learning/memory system
pnpm profile export
```

---

## Security

Bartleby stores personal notes, contacts, calendar, and financial data. Take a few minutes to harden your setup.

### Quick Checklist

- [ ] Full-disk encryption enabled (FileVault on macOS, LUKS on Linux)
- [ ] `.env` permissions are `600`: `chmod 600 .env`
- [ ] `DASHBOARD_HOST` is `localhost` or a Tailscale IP — never `0.0.0.0` without `BARTLEBY_ALLOWED_IPS`
- [ ] `LOG_LEVEL=info` (debug logs full conversations)
- [ ] `LOG_LLM_VERBOSE=false`
- [ ] All LLM endpoints point to `127.0.0.1` (not a remote service)
- [ ] `.env` is not tracked by git
- [ ] Backups exist

Run the automated audit:
```bash
./scripts/security-audit.sh
```

### Authentication

| `DASHBOARD_HOST` | Who can access | Safe? |
|------------------|----------------|-------|
| `localhost` | Local machine only | ✓ Default |
| `100.x.x.x` (Tailscale) | VPN devices only | ✓ |
| `0.0.0.0` + `BARTLEBY_ALLOWED_IPS` | Whitelisted IPs only | ✓ |
| `0.0.0.0` without whitelist | Everyone | ✗ Blocked at startup |

All non-localhost API requests require `Authorization: Bearer <token>`. Browser sessions cache the token in localStorage after first entry.

---

## Troubleshooting

### "Cannot find module" errors

```bash
pnpm build
```

### Native module errors (hnswlib-node)

```bash
pnpm rebuild hnswlib-node
# or full reinstall:
rm -rf node_modules && pnpm install && pnpm approve-builds && pnpm build
```

### NODE_MODULE_VERSION errors after updating Node.js

```bash
pnpm rebuild better-sqlite3
```

### LLM not responding

```bash
curl http://127.0.0.1:8080/v1/models    # Check model is running
```

Then check `.env` URLs and run `status` inside Bartleby.

### Signal not working

```bash
which signal-cli
signal-cli -u +YOUR_NUMBER receive
```

### Logs

```bash
tail -f logs/bartleby.log
```

Set `LOG_LEVEL=debug` in `.env` for verbose output.

---

## More

- [COMMANDS.md](COMMANDS.md) — Full command reference
- [TECH_SPEC.md](TECH_SPEC.md) — Architecture, database schemas, developer docs

---

MIT — see [LICENSE](LICENSE)
