# Bartleby

A local-first AI assistant that runs entirely on your machine. Privacy-respecting, offline-capable, and designed for personal productivity.

## What is Bartleby?

Bartleby is a personal assistant that combines:
- **GTD task management** with contexts, projects, and inbox capture
- **Personal knowledge base** (the "Garden") synced as markdown files
- **Document library** (the "Shed") with semantic search and RAG
- **Context** that remembers your conversations, preferences, and follow-ups
- **Presence** — Bartleby's initiative layer that decides when to speak unprompted

All powered by local LLMs. Your data stays on your machine.

### Not Just Reactive

Most assistants only respond to commands. Bartleby is **present** — aware of your context, noticing opportunities to help, and occasionally speaking first:

```
📋 Bartleby is ready. Type "help" for commands, "quit" to exit.

──────────────────────────────────────────────────
📅 4 event(s) today
📝 Pending: "follow up with Sarah about the proposal"
⚠️ 2 overdue task(s)
💭 Last: "review the Q3 budget numbers..."
──────────────────────────────────────────────────

> 
```

This "session opener" isn't scripted — Bartleby checks your calendar, tasks, follow-ups, and recent conversations to surface what's relevant *right now*.

## Quick Start

### Prerequisites

- **Node.js** 22+ 
- **pnpm** (or npm/yarn)
- **Local LLM server** - MLX, Ollama, llama.cpp, or any OpenAI-compatible API

### Installation

```bash
# Clone
git clone https://github.com/yourusername/bartleby.git
cd bartleby

# Install
pnpm install
pnpm approve-builds   # Approve native module compilation (hnswlib, sqlite)

# Configure
cp .env.example .env
# Edit .env with your model endpoints (see Configuration below)

# Build & Run
pnpm build
pnpm start
```

### First Commands

```
> help                    # See all commands
> add task buy groceries  # Add a task
> show next actions       # View tasks
> done 1                  # Complete task #1
> capture call dentist    # Quick capture to inbox
> status                  # Check system health
> quit                    # Exit
```

## Configuration

The `.env` file is Bartleby's **source of truth** for all configuration—like how the Garden's markdown files are the source of truth for your tasks and notes.

### The Settings Flow

Instead of manually editing `.env`, talk to Bartleby about what you want to change:

```
> change calendar settings
```

Bartleby walks you through each option, then outputs the `.env` values:

```
✓ Calendar configured!

Your settings:
• Timezone: America/Los_Angeles
• Default duration: 30 minutes
• Week starts: Monday
• Reminders: 15m before

───────────────────────────────────────────
Copy to .env:

CALENDAR_DEFAULT_DURATION=30
CALENDAR_WEEK_START=monday
CALENDAR_REMINDER_MINUTES=15
───────────────────────────────────────────
```

**You copy these values to `.env`** — Bartleby can't write to files himself, but he'll generate the correct config for you.

### Bidirectional Trust

This works like the Garden's bidirectional sync:
- **`.env` is authoritative** — Bartleby reads it on startup and respects whatever's there
- **You can edit `.env` directly** anytime — Bartleby will use your changes on next restart  
- **Bartleby helps you configure** — through conversation, outputting values ready to copy
- **Bartleby may suggest changes** — if he notices something that could improve your experience

### Initial LLM Setup

The one thing you *do* need to configure manually is your LLM endpoints. Copy `.env.example` to `.env` and set your model URLs:

#### For Ollama (Most Common)

```env
# Router: Tiny model for SIMPLE/COMPLEX classification
ROUTER_MODEL=qwen2:0.5b
ROUTER_URL=http://localhost:11434/v1

# Fast: 7B-class model for simple queries
FAST_MODEL=qwen2.5:7b
FAST_URL=http://localhost:11434/v1

# Thinking: Large model for complex reasoning
THINKING_MODEL=qwen2.5:32b
THINKING_URL=http://localhost:11434/v1

# Embeddings
EMBEDDINGS_MODEL=nomic-embed-text
EMBEDDINGS_URL=http://localhost:11434/v1
EMBEDDINGS_DIMENSIONS=768
```

### For MLX (Apple Silicon)

```env
ROUTER_MODEL=mlx-community/Qwen3-0.6B-4bit
ROUTER_URL=http://127.0.0.1:8080/v1

FAST_MODEL=mlx-community/Qwen3-30B-A3B-4bit
FAST_URL=http://127.0.0.1:8081/v1

THINKING_MODEL=mlx-community/Qwen3-30B-A3B-Thinking-2507-4bit
THINKING_URL=http://127.0.0.1:8083/v1

EMBEDDINGS_MODEL=Qwen/Qwen3-Embedding-8B
EMBEDDINGS_URL=http://127.0.0.1:8084/v1
EMBEDDINGS_DIMENSIONS=4096
```

### Paths & Integrations (Manual)

```env
# Paths (defaults work for most setups)
GARDEN_PATH=./garden          # Your markdown notes
SHED_PATH=./shed              # Document library
DATABASE_PATH=./database      # SQLite databases
LOG_DIR=./logs

# Optional: Weather
WEATHER_CITY=Seattle
OPENWEATHERMAP_API_KEY=your-key

# Optional: Signal notifications
SIGNAL_ENABLED=false
SIGNAL_CLI_PATH=/usr/local/bin/signal-cli
SIGNAL_NUMBER=+1234567890
SIGNAL_RECIPIENT=+0987654321
```

### Changing Settings

Talk to Bartleby about what you want to change:

| Say this... | Bartleby will... |
|-------------|------------------|
| `change calendar settings` | Walk through calendar preferences, output `.env` values |
| `I prefer 30 minute meetings` | Suggest the config change and output the `.env` line |
| `my week starts on Monday` | Same — conversation → `.env` output |
| `reset calendar` | Clear settings and re-trigger onboarding (suggests backup first) |

Copy the output to your `.env` file. On next startup, Bartleby uses the new values.

### Resetting Settings

If you want to start fresh or re-run onboarding:

```
> reset calendar
⚠️ Reset Calendar

This will:
• Clear calendar settings (timezone, duration, reminders, etc.)
• Trigger onboarding again on your next event

💾 Backup first! Your current settings are in .env.
Copy the CALENDAR_* lines somewhere safe to restore later.

→ yes - reset settings only
→ yes delete events - reset settings AND clear all events  
→ cancel - abort
```

Your events are preserved unless you explicitly say "yes delete events".

## Command Reference

### GTD / Tasks

| Command | Description |
|---------|-------------|
| `show next actions` | List active tasks grouped by context |
| `add task <text>` | Add task (use `@context` and `+project`) |
| `done <n>` | Complete task by number |
| `capture <text>` | Quick capture to inbox |
| `waiting for` | Show delegated items |

**Examples:**
```
> add task buy milk @errands
> add task review PR +website @computer
> done 3
```

### Calendar

| Command | Description |
|---------|-------------|
| `calendar` | Show upcoming events |
| `today` | Today's schedule |
| `add event <title> at <time>` | Create event |

**Examples:**
```
> add event dentist tomorrow at 2pm
> add event team standup at 9am
```

### Contacts

| Command | Description |
|---------|-------------|
| `add contact <name>` | Create contact |
| `find <name>` | Search contacts |

**Examples:**
```
> add contact Sarah Chen, email sarah@example.com, phone 555-1234
> find sarah
```

### Context

Bartleby learns about you over time from natural conversation.

| Command | Description |
|---------|-------------|
| `I am a <type> person` | Tell Bartleby about yourself |
| `I prefer <preference>` | Set a preference |
| `I like/love/hate <thing>` | Express preferences |
| `my <relation> <name>` | Share relationships |
| `what do you know about me` | View your profile |
| `what did we talk about <topic>` | Search past conversations |

**Examples:**
```
> I am a morning person
> I prefer short meetings
> my wife Sarah is a doctor
> what do you know about me
```

### Shed (Document Library)

| Command | Description |
|---------|-------------|
| `ingest <filepath>` | Add document (.md, .txt, .pdf) |
| `list sources` | Show ingested documents |
| `ask shed <question>` | Query your documents (RAG) |

**Examples:**
```
> ingest ~/Documents/meeting-notes.md
> ask shed what were the key decisions from the planning meeting
```

### Reminders

| Command | Description |
|---------|-------------|
| `remind me <msg> at <time>` | Set reminder |
| `show reminders` | List scheduled reminders |
| `cancel reminder <n>` | Cancel by number |
| `daily at <hour> <msg>` | Recurring daily reminder |

**Examples:**
```
> remind me to call mom at 5pm
> remind me about standup in 30 minutes
> daily at 9am check email
```

### System

| Command | Description |
|---------|-------------|
| `help` | Show all commands |
| `status` | System health check |
| `weather` | Current weather (if configured) |
| `quit` | Exit Bartleby |

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                          REPL                                     │
│   Startup ──► Presence.getStartupMessage()                       │
│   Loop    ──► Router → Agent → Tools                             │
│   Quit    ──► Presence.getShutdownMessage()                      │
└──────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                      User Input                                   │
└─────────────────────────┬────────────────────────────────────────┘
                          ▼
┌──────────────────────────────────────────────────────────────────┐
│              Router Model: SIMPLE or COMPLEX?                     │
│                    (0.5B parameter model)                         │
└─────────────────────────┬────────────────────────────────────────┘
                          │
          ┌───────────────┴───────────────┐
          ▼                               ▼
┌─────────────────────┐       ┌─────────────────────────────┐
│       SIMPLE        │       │          COMPLEX            │
│                     │       │                             │
│  Command Router:    │       │  Thinking Model:            │
│  1. Pattern Match   │       │  - Multi-step reasoning     │
│  2. Keyword Match   │       │  - Function calling         │
│  3. Semantic Match  │       │  - Agentic loop             │
│  4. Fast LLM        │       │  (30B+ parameter model)     │
│     (7B model)      │       │                             │
└─────────────────────┘       └─────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                        Services                                   │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│   │   Garden    │  │  Scheduler  │  │      Context            │  │
│   │  (tasks)    │  │ (reminders) │  │  (memory, profile)      │  │
│   └──────┬──────┘  └──────┬──────┘  └───────────┬─────────────┘  │
│          │                │                     │                │
│          ▼                ▼                     │                │
│   ┌───────────────────────────────┐            │                │
│   │         Calendar              │            │                │
│   │    (Temporal Index)           │            │                │
│   │  events + deadlines +         │            │                │
│   │  reminders unified            │            │                │
│   └───────────────┬───────────────┘            │                │
│                   └────────────────────────────┘                │
│                           ▼                                      │
│                  ┌─────────────────┐                             │
│                  │    Presence     │  ← "What should B say?"     │
│                  │   (initiative)  │                             │
│                  └─────────────────┘                             │
└──────────────────────────────────────────────────────────────────┘
```

**Why 4 Models?**

| Tier | Model Size | Purpose | Latency |
|------|------------|---------|---------|
| Router | 0.5-1B | Classify simple vs complex | ~50ms |
| Fast | 7-30B | Single tool calls, simple chat | ~500ms |
| Thinking | 30B+ | Multi-step reasoning, code | 2-10s |
| Embeddings | 1B | Vector generation | ~100ms |

Most requests hit the deterministic router (layers 1-3) and never need an LLM at all.

### The Time System

Bartleby has a **Time System** — a unified way of handling everything temporal. Instead of events, reminders, and deadlines living in separate silos, they all flow into one place.

**The Principle:** *"When" is a dimension, not a destination.*

A task has a *what* (the thing to do) and optionally a *when* (due date).  
A reminder has a *what* (the message) and a *when* (fire time).  
An event has a *what* (title/notes) and a *when* (start/end time).

The Time System collects all the "whens" into a single view:

| Type | Where it comes from | Example |
|------|---------------------|---------|
| **Event** | You create it | "Team meeting at 3pm" |
| **Deadline** | Task with due date | "Report due Friday" |
| **Reminder** | Scheduled notification | "remind me in 30 min" |

When you say `today` or `calendar`, the Time System shows them all:

```
**Today's Schedule**

**📅 Events**
  3:00 PM - Team meeting
  5:30 PM - Gym

**⚠️ Due Today**
  Finish quarterly report

**🔔 Reminders**
  4:00 PM - stretch break
```

**Why it matters:** You never miss something because it's in the "wrong system." Everything temporal is unified.

### Context & Presence

Bartleby has two complementary systems for understanding and assisting you:

**Context Service** — The memory layer
- Records every conversation as "episodes" with summaries, topics, and actions
- Tracks facts about you: preferences, habits, goals, relationships
- Enables recall: "What did we talk about last week?"

**Presence Service** — The initiative layer
- Queries Context, Calendar, and Garden
- Decides what (if anything) to surface at key moments
- Configurable: enable/disable different "moments"

| Moment | When | Example |
|--------|------|---------|
| **Startup** | REPL starts | "📅 4 events today, 📝 follow up with Sarah pending" |
| **Shutdown** | Before quit | "📅 Tomorrow: 2 events. Anything to capture?" |
| **Morning** | Scheduled (8am) | "☀️ Morning Review: 3 events, 12 tasks" |
| **Evening** | Scheduled (6pm) | "🌙 5 tasks done today, 2 events tomorrow" |
| **Weekly** | Scheduled (Sun 9am) | "📋 Weekly Review: 15/20 tasks completed" |

Configure in `.env`:

```env
PRESENCE_STARTUP=true
PRESENCE_SHUTDOWN=true
PRESENCE_SCHEDULED=true
PRESENCE_MORNING_HOUR=8
PRESENCE_EVENING_HOUR=18
PRESENCE_WEEKLY_DAY=0    # Sunday
PRESENCE_WEEKLY_HOUR=9
```

This is what makes Bartleby feel like a companion rather than just a command processor.

## Data Storage

```
bartleby/
├── garden/           # Your markdown notes (synced bidirectionally)
│   ├── buy-milk.md
│   └── project-website.md
├── shed/
│   └── sources/      # Ingested documents
├── database/
│   ├── garden.sqlite3
│   ├── calendar.sqlite3
│   ├── memory/
│   │   ├── episodes.json
│   │   └── profile.json
│   └── ...
└── logs/
    └── bartleby.log
```

**The Garden**: Your personal wiki. Edit markdown files directly—Bartleby syncs changes bidirectionally. Each file has YAML frontmatter for metadata.

**The Shed**: Reference documents you want to query. Bartleby chunks them, generates embeddings, and answers questions using RAG.

## Troubleshooting

### "LLM tier health check failed"

Your LLM server isn't reachable. Check:
1. Is your LLM server running? (`ollama serve` or equivalent)
2. Are the URLs in `.env` correct?
3. Try `curl http://localhost:11434/v1/models` to test connectivity

### "Embedding failed"

The embedding model isn't available. For Ollama:
```bash
ollama pull nomic-embed-text
```

### "hnswlib-node compilation failed"

You need build tools:
- **macOS**: `xcode-select --install`
- **Ubuntu**: `apt install build-essential`
- **Windows**: Install Visual Studio Build Tools

### Slow first response

Models may need to load into memory on first use. Subsequent requests are faster. You can "warm up" models by running them before starting Bartleby.

## Development

```bash
# Dev mode (auto-reload)
pnpm dev

# Type check
pnpm typecheck

# Build
pnpm build
```

## License

MIT

---

*"I would prefer not to." — Bartleby, but this Bartleby actually helps.*
