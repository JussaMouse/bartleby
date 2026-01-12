# Bartleby

A local-first AI assistant that runs entirely on your machine. Privacy-respecting, offline-capable, and designed for personal productivity.

## What is Bartleby?

Bartleby is a personal assistant that combines:
- **GTD task management** with contexts, projects, and inbox capture
- **Personal knowledge base** (the "Garden") synced as markdown files
- **Document library** (the "Shed") with semantic search and RAG
- **Conversational memory** that remembers past discussions
- **Proactive intelligence** that surfaces relevant info at session start

All powered by local LLMs. Your data stays on your machine.

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

Edit `.env` to match your LLM setup:

### For Ollama (Most Common)

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

### Other Options

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

### Memory

| Command | Description |
|---------|-------------|
| `what did we talk about <topic>` | Search past conversations |
| `I prefer <preference>` | Set a preference |
| `what do you know about me` | View your profile |

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
┌─────────────────────────────────────────────────────────┐
│                      User Input                         │
└─────────────────────────┬───────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────┐
│              Router Model: SIMPLE or COMPLEX?           │
│                    (0.5B parameter model)               │
└─────────────────────────┬───────────────────────────────┘
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
```

**Why 4 Models?**

| Tier | Model Size | Purpose | Latency |
|------|------------|---------|---------|
| Router | 0.5-1B | Classify simple vs complex | ~50ms |
| Fast | 7-30B | Single tool calls, simple chat | ~500ms |
| Thinking | 30B+ | Multi-step reasoning, code | 2-10s |
| Embeddings | 1B | Vector generation | ~100ms |

Most requests hit the deterministic router (layers 1-3) and never need an LLM at all.

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
