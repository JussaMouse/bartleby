# Bartleby

A local-first AI assistant that lives on your machine. Your data stays yours.

---

## The Big Idea

**Talk to Bartleby, not to files.**

Bartleby is your personal assistant who remembers everything, helps you get things done, and keeps your knowledge organized. Behind the scenes, everything is stored as simple markdown files you can edit, backup, or sync anywhere.

```
> add task call mom
✓ Added: "call mom" (@inbox)

> new note meeting with scott
📝 What would you like to add?
> discussed Q1 roadmap, agreed on timeline
> done
✓ Note saved

> what's on my plate?
Based on your calendar and actions:
- 3 events today (next: 2pm standup)
- 5 active actions (2 overdue)
...
```

### Notifications via Signal

Bartleby can message you outside the terminal:

```
remind me to call mom in 30 min     → Signal message at 3:30pm
add event dentist 2pm               → Signal alert 15 min before
```

Configure in `.env` with `SIGNAL_ENABLED=true`. See `help reminders`.

---

## Where Your Data Lives

**Garden** — Your personal wiki (markdown files):
- Actions, notes, contacts, projects
- `add task`, `new note`, `show next actions`

**Shed** — Documents you want to search (PDFs, articles):
- `ingest <file>`, `ask shed <question>`

**Context** — What Bartleby remembers about you:
- Preferences, past conversations, follow-ups
- `i prefer morning meetings`, `what do you know about me`

---

## Quick Start

```bash
# Clone and install
git clone https://github.com/JussaMouse/bartleby.git
cd bartleby
pnpm install
pnpm approve-builds

# Configure (edit .env with your LLM endpoints)
cp .env.example .env

# Run
pnpm build
pnpm start
```

### Requirements
- Node.js 22+
- pnpm
- Local LLM server (MLX, Ollama, or OpenAI-compatible)

---

## Common Commands

### Actions (GTD)
```
add task <text>              Add an action
add task <text> @phone       With context
add task <text> +project     With project
add task <text> due:friday   With due date
show next actions            List by context
show overdue                 Past-due actions
done <number>                Complete action
capture <text>               Quick inbox capture
```

### Notes & Pages
```
new note <title>             Create note (prompts for content)
add contact <name>           Create a contact
add contact Sarah, email sarah@example.com, phone 555-1234
show notes                   List all notes
show contacts                List contacts
recent                       Last 10 modified
open <title>                 Display a page
find <name>                  Search contacts
show tagged <tag>            Filter by tag
#urgent                      Shorthand for tagged
```

### Calendar & Time
```
today                        Today's schedule
calendar                     Upcoming events
add event <title> at <time>  Create event
remind me to X in 30 min     Set reminder
show reminders               List pending
```

### Navigation
```
help                         All commands
help <topic>                 Detailed help (calendar, garden, etc.)
status                       System health
quit                         Exit
```

---

## How It Works

```
┌─────────────────────────────────────────────────────────┐
│                     You ↔ Bartleby                      │
│         (Natural conversation in the terminal)          │
└─────────────────────────┬───────────────────────────────┘
                          │
┌─────────────────────────┴───────────────────────────────┐
│                     The Garden                          │
│           (Your personal wiki as markdown files)        │
│                                                         │
│  garden/                                                │
│  ├── call-mom.md           (action)                     │
│  ├── meeting-with-scott.md (note)                       │
│  ├── 2025-taxes.md         (project)                    │
│  └── sarah-chen.md         (contact)                    │
└─────────────────────────────────────────────────────────┘
```

**Key insight:** The markdown files are the truth. The database is just an index for fast queries. You can edit files directly — Bartleby syncs changes automatically.

### File Format (Backmatter)

Content first, metadata tucked at the bottom:

```markdown
# Call Mom

Ask about her doctor appointment.
Bring up the family reunion planning.

---
tags: [family, calls]
context: "@phone"
due: 2026-01-15
type: action
status: active
id: abc123
---
```

Human-readable content at the top. System metadata at the bottom.

---

## Configuration

The `.env` file controls everything. Bartleby reads it on startup.

### LLM Models (Required)

```env
# Fast model for simple commands (7-30B)
LLM_FAST_URL=http://localhost:1234/v1
LLM_FAST_MODEL=mlx-community/Qwen3-30B-A3B-4bit

# Router model for complexity classification (0.5-3B)  
LLM_ROUTER_URL=http://localhost:1235/v1
LLM_ROUTER_MODEL=mlx-community/Qwen3-0.6B-4bit

# Thinking model for complex reasoning (30B+)
LLM_THINKING_URL=http://localhost:1236/v1
LLM_THINKING_MODEL=mlx-community/Qwen3-30B-A3B-Thinking-4bit

# Embedding model for semantic search
EMBEDDING_URL=http://localhost:1237/v1
EMBEDDING_MODEL=nomic-ai/nomic-embed-text-v1.5
```

### Optional Features

```env
# Calendar
CALENDAR_TIMEZONE=America/Los_Angeles
CALENDAR_DEFAULT_DURATION=60
CALENDAR_REMINDER_MINUTES=15

# Signal notifications
SIGNAL_ENABLED=true
SIGNAL_CLI_PATH=/usr/local/bin/signal-cli
SIGNAL_NUMBER=+1234567890
SIGNAL_RECIPIENT=+0987654321

# Weather (OpenWeatherMap)
WEATHER_API_KEY=your_api_key
WEATHER_CITY=San Francisco
```

### Conversational Settings

Don't want to edit `.env` manually? Just ask Bartleby:

```
> change calendar settings
📅 Calendar Setup (1/5)
What's your timezone? ...

> change llm settings
🤖 Let's configure your models...
```

Bartleby will walk you through options and output the `.env` values to copy.

---

## For Developers

### Architecture

```
src/
├── services/           # Core services
│   ├── garden.ts       # Personal wiki (markdown ↔ SQLite)
│   ├── calendar.ts     # Events & Time System
│   ├── context.ts      # Memory & preferences
│   ├── scheduler.ts    # Reminders & recurring
│   ├── shed.ts         # Document library (RAG)
│   └── llm.ts          # Model management
├── tools/              # Command implementations
├── router/             # Input → tool routing
├── agent/              # LLM agent loop
└── utils/              # Helpers (logger, parser)

garden/                 # Your wiki (markdown files)
shed/                   # Reference documents
database/               # SQLite indexes
```

### Key Principles

1. **Markdown is truth** — Files are authoritative, database is index
2. **Bidirectional sync** — Edit files or talk to Bartleby, both work
3. **Local-first** — Everything runs on your machine
4. **Graceful degradation** — Works offline, handles errors smoothly

### The Type System

| Type | Has Workflow? | Description |
|------|---------------|-------------|
| `item` | ✓ | Inbox capture, unprocessed |
| `action` | ✓ | Next step (active → done) |
| `project` | ✓ | Multi-action outcome |
| `note` | — | Working notes |
| `entry` | — | Wiki page (permanent) |
| `contact` | — | Person |
| `daily` | — | Journal entry |
| `list` | — | Curated collection |
| `media` | — | File attachment |

### Development

```bash
pnpm dev          # Watch mode
pnpm build        # Compile TypeScript
pnpm typecheck    # Type check only
pnpm start        # Run compiled
```

---

## Troubleshooting

### "LLM tier health check failed"
Your LLM server isn't reachable:
1. Is your LLM server running?
2. Are the URLs in `.env` correct?
3. Test: `curl http://localhost:1234/v1/models`

### "hnswlib-node compilation failed"
Install build tools:
- **macOS**: `xcode-select --install`
- **Ubuntu**: `apt install build-essential`

### Slow first response
Models load into memory on first use. Subsequent requests are fast.

### Want verbose LLM output?
Set `LOG_LLM_VERBOSE=true` in `.env` to see chain-of-thought reasoning.

---

## Philosophy

Bartleby is named after the Melville character who "would prefer not to." But unlike that Bartleby, this one actually helps.

**Your data is yours.** Everything is markdown files and SQLite databases on your machine. No cloud, no subscriptions, no lock-in.

**Talk, don't click.** The interface is conversation. Tell Bartleby what you want in natural language.

**The Garden grows.** Every note, action, and thought you capture lives in one interconnected wiki. Over time, it becomes your second brain.

---

## License

MIT

---

*"I would prefer not to." — Bartleby, but this Bartleby actually helps.*
