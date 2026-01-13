# Bartleby

The personal exocortex, locally.

- [What is Bartleby?](#what-is-bartleby)
- [Quick Start](#quick-start)
- [Your Data](#your-data)
- [GTD Workflow](#gtd-workflow)
- [The Time System](#the-time-system)
- [Configuration](#configuration)
- [Troubleshooting](#troubleshooting)

---

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

---

## Your Data

Everything lives on your machine in three places.

### The Garden

Your personal wiki — plain markdown files you own forever.

The Garden is where everything lives: actions and projects, notes on topics you're researching, encyclopedia entries for concepts you want to remember, contacts, daily journals, reading lists. Over time it becomes your external brain — a comprehensive, searchable map of everything you know and everything you're working on.

**Page types:** actions, projects, notes, entries (wiki pages), contacts, daily journals, lists, and media references.

**Common commands:**
```
new action <text>       Create an action
new note <title>        Create a note (prompts for content)
new project <name>      Create a project
add contact <name>      Create a contact
capture <text>          Quick inbox capture
show next actions       List actions by context
show projects           List active projects
recent                  Last 10 modified pages
open <title>            View any page
```

**Files are the source of truth.** Edit them in any text editor — Bartleby watches for changes and syncs automatically.

Location: `./garden/`

### The Shed

Your document library. Ingest files, query them with natural language.

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

Bartleby implements Getting Things Done (GTD).

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
For each item: Is it actionable? What's the next action?

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

Contexts tell you *where* or *how* you can do something:

| Context | Meaning |
|---------|---------|
| `@phone` | Calls to make |
| `@computer` | At your desk |
| `@errands` | Out and about |
| `@home` | Around the house |
| `@office` | At work |
| `@waiting` | Delegated, waiting for response |

Use any context that makes sense for you.

### Projects

Projects are outcomes requiring multiple actions:

```
> new project 2025 taxes
> new action gather W2 forms +2025-taxes
> new action find last year's return +2025-taxes
> new action schedule accountant call +2025-taxes @phone
```

The `+project-name` links actions to their project.

---

## The Time System

Everything with a "when" shows up in one place.

### What it tracks

| Symbol | Type | Source |
|--------|------|--------|
| 📅 | Events | Calendar |
| ⚠️ | Deadlines | Actions with due dates |
| ⚙️ | Scheduled | Reminders and recurring items |

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

**Setup:**
1. Install [signal-cli](https://github.com/AsamK/signal-cli)
2. Register/link your number
3. Configure the settings above
4. Test: `remind me test in 1 min`

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
