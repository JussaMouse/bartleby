# Bartleby

**Your local-first AI assistant that remembers.**

Bartleby is a personal AI assistant that runs entirely on your machine. It manages your tasks, projects, calendar, contacts, and knowledge—all stored locally in markdown files and SQLite databases that you own completely.

What makes Bartleby different: **it builds a relationship with you over time.** It remembers your conversations, learns your preferences, tracks your commitments, and proactively helps you stay organized.

```
$ bartleby

──────────────────────────────────────────────────
📝 Pending follow-up: "check if Sarah sent the designs"
📥 3 inbox items waiting > 2 days
📅 2 events today: 9am standup, 2pm dentist
🏃 You usually run at 7am—it's been 3 days
──────────────────────────────────────────────────

> show next actions

@home
  1. Fix leaky faucet (home-maintenance)
  2. Water plants

@work
  3. Review PR from Sarah (website-redesign)
  4. Prep slides for Monday standup

> I prefer morning meetings

Got it! I'll remember that you prefer morning meetings.

> done 1

✓ Marked done: Fix leaky faucet

> what did we talk about last week regarding the website?

Found 2 related conversations:

**3 days ago**: Discussed website redesign timeline. Sarah to send mockups by Friday.
  Topics: website, sarah, design, deadline

**6 days ago**: Reviewed competitor sites with John. Identified 3 patterns to adopt.
  Topics: website, competitors, design
```

---

## Philosophy

### Local-First

Everything runs on your machine:

- **Models**: Local LLMs via any OpenAI-compatible server (Ollama, llama.cpp, vLLM, LM Studio, etc.)
- **Data**: SQLite databases and markdown files you can read, edit, and backup
- **Privacy**: Nothing leaves your computer unless you explicitly ask

### The Shed & The Garden

Bartleby organizes your knowledge into two complementary layers:

| Layer | Name | What It Is | Who Manages It |
|-------|------|------------|----------------|
| **Library** | The Shed 🏠 | Reference materials—books, articles, PDFs | Bartleby indexes and retrieves |
| **Wiki** | The Garden 🌱 | Your thoughts, tasks, projects, contacts, notes | You cultivate, Bartleby helps |

**The Shed** stores external knowledge you've collected. Bartleby chunks, embeds, and retrieves them when you ask questions.

**The Garden** is your personal wiki. Everything is a markdown page: projects, contacts, daily notes, concepts. Pages link to each other with `[[wiki links]]`. GTD (Getting Things Done) lives here naturally—contexts are pages, projects are pages, contacts are pages.

### Memory: Building a Relationship

Unlike typical assistants that start fresh every session, Bartleby **remembers**:

| Without Memory | With Memory |
|----------------|-------------|
| "What tasks do you have?" | "You mentioned finishing the report—how did that go?" |
| Generic scheduling suggestions | "You prefer meeting-free Fridays" |
| "Would you like to exercise?" | "You usually run at 7am—it's been 3 days" |
| No context on people | "Sarah from Acme Corp—you're waiting on her designs" |
| Treats you as a stranger | Understands your habits, preferences, goals |

Bartleby's memory has three components:

- **Episodic Memory**: Remembers your conversations—summaries, topics, actions taken, follow-ups
- **Semantic Profile**: Learns structured facts—preferences, habits, goals, relationships
- **Session State**: Combines both for "where we left off" context

### Deterministic When Possible

Bartleby uses a **Command Router** to handle common requests without touching the LLM:

```
"show next actions"      → Pattern match: instant (0ms)
"what's on my plate"     → Semantic match: instant (50ms)  
"help me plan my week"   → LLM reasoning: thoughtful (2-5s)
```

95% of daily commands are fast and 100% reliable. Complex requests get full AI reasoning.

---

## Features

### GTD (Getting Things Done)

Full GTD workflow support:

- **Inbox**: Quick capture, process later
- **Next Actions**: Tasks organized by context (@home, @work, @phone)
- **Projects**: Multi-step outcomes with linked tasks
- **Waiting For**: Delegated items you're tracking
- **Someday/Maybe**: Ideas for the future
- **Weekly Review**: Guided review process

```
> capture call mom about birthday

✓ Added to inbox

> process inbox

Inbox item: "call mom about birthday"
Actionable? (y/n): y
Context? (home/work/errands/phone): phone
Project? (none or name): none

✓ Moved to Next Actions (@phone)
```

### Calendar

Local calendar with no cloud dependencies:

```
> what's on my calendar this week

This Week:

Monday, Jan 13
  09:00 Team standup (30m)
  14:00 Call with Sarah Chen

Tuesday, Jan 14
  (nothing scheduled)

Wednesday, Jan 15
  14:00 Dentist appointment (1h)

> add event "Coffee with John" tomorrow at 10am

✓ Created: Coffee with John
  Tuesday, Jan 14 at 10:00 AM
```

### Contacts

Contacts are Garden pages—rich, linkable, yours:

```
> add contact Sarah Chen, email sarah@acme.com, works at Acme Corp

✓ Created contact: Sarah Chen
  garden/Sarah Chen.md

> find sarah

Sarah Chen
  Email: sarah@acme.com
  Last contact: Jan 10, 2026
  Notes: Senior designer at Acme Corp

  Related:
    • Waiting for: design assets (website-redesign)
    • Event: Call with Sarah (Jan 13, 2pm)
```

### Memory

Bartleby remembers your conversations and learns about you:

```
> what do you know about me

## What I Know About You

Preferences: morning meetings, meeting-free Fridays
Habits: reviews inbox Monday mornings, runs at 7am
Goals: launch website by Q2, learn Spanish
Relationships: wife: Sarah, works with: John at Acme

*Based on 47 past conversations.*
```

**Memory Commands:**

| Command | Description |
|---------|-------------|
| `what did we talk about <topic>` | Search past conversations |
| `remember that I prefer <preference>` | Explicitly set a preference |
| `what do you know about me` | View your profile |
| `done <followup>` | Mark a follow-up complete |

### Health & Habits

Track health metrics and build better habits:

```
> I ran 3 miles this morning

✓ Logged: Running - 3 miles
  This week: 3 runs, 9 miles total

> I want to meditate every morning

✓ New habit: Morning meditation
  I'll check in and track your streak.

> how's my running streak?

Running this month: 12 sessions
Current streak: 4 days 🔥
```

### Proactive Intelligence

Bartleby doesn't just respond—it anticipates, reminds, and coaches:

```
$ bartleby

──────────────────────────────────────────────────
📝 Pending follow-up: "check if Sarah sent the designs"
📥 3 inbox items waiting > 2 days
📅 2 events today
🏃 You usually run at 7am—it's been 3 days
──────────────────────────────────────────────────

> 
```

**Proactive behaviors:**

| Behavior | Example |
|----------|---------|
| **Follow-up Questions** | "How did the presentation go?" |
| **Stale Item Reminders** | "3 inbox items waiting > 2 days" |
| **Pattern Coaching** | "Task backlog growing: 8 added, 2 completed" |
| **Habit Nudges** | "You usually run at 7am—it's been 3 days" |
| **Context Continuity** | "Last time you mentioned waiting on Sarah" |

### Knowledge Base (The Shed)

Add documents, ask questions:

```
> ingest ~/Documents/books/getting-things-done.pdf

Processing: getting-things-done.pdf
  Extracted 342 pages
  Created 1,247 chunks
  Generated embeddings
✓ Added to Shed

> what does David Allen say about the weekly review?

Based on "Getting Things Done" (David Allen):

The Weekly Review is the critical success factor for GTD. Allen recommends:
1. Get clear: Process all inboxes to zero
2. Get current: Review all lists and calendar
3. Get creative: Brainstorm new ideas and projects

[Source: Getting Things Done, Chapter 8]
```

### Scheduling

Schedule tasks and reminders:

```
> remind me to call the bank tomorrow at 9am

✓ Scheduled: call the bank
  Tomorrow (Jan 12) at 9:00 AM

> schedule weekly review every sunday at 5pm

✓ Recurring task: weekly review
  Every Sunday at 5:00 PM
```

### Signal Notifications

Get notifications on your phone via Signal:

```
> signal me when the dentist reminder fires

✓ Will send Signal notification for: dentist (Jan 15)
```

### Weather

Quick weather checks:

```
> weather

New York, US - Currently 42°F, partly cloudy
Today: High 48°F, Low 35°F
Tomorrow: High 52°F, Low 38°F, 30% chance of rain
```

### Web Search

Search the internet when needed:

```
> search best practices for typescript monorepos

Searching... found 5 relevant results:

1. "Turborepo Handbook" - vercel.com
   Comprehensive guide to TypeScript monorepos...

2. "Monorepo Tools Comparison 2026" - dev.to
   Comparing Nx, Turborepo, and Lerna...
```

---

## Architecture

### How Bartleby Works

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│   SESSION START                                                          │
│   ─────────────                                                          │
│   ProactiveService → MemoryService                                       │
│     ↓                                                                    │
│   Display insights: follow-ups, stale items, patterns                    │
│                                                                          │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   USER INPUT                                                             │
│   ──────────                                                             │
│       ↓                                                                  │
│   Router Model: "Simple or complex?"  (~100ms)                           │
│       ↓                                                                  │
│   ├─→ COMPLEX (multi-step, code, planning)                               │
│   │       ↓                                                              │
│   │   MemoryService enriches prompt with context                         │
│   │       ↓                                                              │
│   │   Thinking Model (agentic loop)                                      │
│   │       ↓                                                              │
│   │   ┌─────────────────────────────────┐                                │
│   │   │ Plan: identify tools needed     │                                │
│   │   │ Execute Tool 1 → get result     │                                │
│   │   │ Execute Tool 2 → get result     │ ← Loop until done              │
│   │   │ ...                             │                                │
│   │   │ Synthesize final answer         │                                │
│   │   └─────────────────────────────────┘                                │
│   │                                                                      │
│   └─→ SIMPLE (single action)                                             │
│           ↓                                                              │
│       CommandRouter (deterministic)                                      │
│           ↓                                                              │
│       Layer 1: Pattern Match (instant)                                   │
│           ↓                                                              │
│       Layer 2: Keyword Match (instant)                                   │
│           ↓                                                              │
│       Layer 3: Semantic Match (Embedding model, ~50ms)                   │
│           ↓                                                              │
│       Layer 4: Fast Model (single tool, ~1-2s)                           │
│           ↓                                                              │
│       Tool.execute() → Response                                          │
│                                                                          │
│       ↓ (all paths)                                                      │
│   MemoryService.recordMessage()                                          │
│                                                                          │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   SESSION END                                                            │
│   ───────────                                                            │
│   MemoryService.endSession()                                             │
│     • Summarize conversation                                             │
│     • Extract facts → SemanticProfile                                    │
│     • Extract follow-ups → EpisodicMemory                                │
│     • Generate embedding for future recall                               │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Memory System

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           MemoryService                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────┐  │
│  │   EpisodicMemory    │  │   SemanticProfile   │  │   SessionState  │  │
│  │                     │  │                     │  │                 │  │
│  │  "What happened?"   │  │  "Who is the user?" │  │  "Right now"    │  │
│  │                     │  │                     │  │                 │  │
│  │  • Conversations    │  │  • Preferences      │  │  • Messages     │  │
│  │  • Summaries        │  │  • Habits           │  │  • Duration     │  │
│  │  • Topics           │  │  • Goals            │  │  • Context      │  │
│  │  • Actions taken    │  │  • Relationships    │  │                 │  │
│  │  • Follow-ups       │  │  • Schedules        │  │  Combines both  │  │
│  │                     │  │  • Interests        │  │  for prompts    │  │
│  │  Semantic search    │  │                     │  │                 │  │
│  │  for recall         │  │  Pattern-based      │  │                 │  │
│  │                     │  │  extraction         │  │                 │  │
│  └─────────────────────┘  └─────────────────────┘  └─────────────────┘  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

**How facts are learned:**

| You say... | Bartleby learns... |
|------------|-------------------|
| "I prefer morning meetings" | `preference:meeting_time = "morning"` |
| "My wife Sarah..." | `relationship:spouse = "Sarah"` |
| "I want to learn Spanish" | `goal:learn_spanish = true` |
| "Every Monday I review my inbox" | `habit:inbox_review = "Monday"` |
| "I usually run at 7am" | `habit:exercise_time = "7:00 AM"` |

### Directory Structure

```
bartleby/
├── garden/                     # Your personal wiki (The Garden)
│   ├── inbox.md                # Quick capture
│   ├── Home.md                 # Context page (type: context)
│   ├── Work.md                 # Context page (type: context)
│   ├── Website Redesign.md     # Project page (type: project)
│   ├── Sarah Chen.md           # Contact page (type: contact)
│   └── 2026-01-11.md           # Daily note (type: daily)
│
├── shed/                       # Reference library (The Shed)
│   ├── inbox/                  # Drop files here for processing
│   └── sources/                # Processed documents (markdown)
│
├── database/
│   ├── garden.sqlite3          # Garden index (pages, links, tasks)
│   ├── calendar.sqlite3        # Calendar events
│   ├── scheduler.sqlite3       # Scheduled tasks
│   └── memory/                 # Conversation memory
│       ├── episodic/           # Episode summaries + HNSW index
│       └── profile/            # Semantic profile (user facts)
│
└── logs/
    └── bartleby.log
```

### Services

| Service | Purpose | Storage |
|---------|---------|---------|
| **GardenService** | All wiki pages (notes, contacts, projects, tasks) | garden.sqlite3 + Markdown |
| **ShedService** | Reference library (RAG) | shed/ + embeddings |
| **CalendarService** | Events, reminders | calendar.sqlite3 |
| **SchedulerService** | Future task execution | scheduler.sqlite3 |
| **MemoryService** | Conversation history, user profile | memory/ |
| **ProactiveService** | Insights, reminders, pattern detection | Uses Memory + Garden |
| **LLMService** | Chat completions | HTTP (configurable) |
| **EmbeddingService** | Vector generation | HTTP (configurable) |

### Tools

| File | Tools |
|------|-------|
| `gtd.ts` | viewNextActions, capture, markDone, processInbox, showWaitingFor |
| `calendar.ts` | showCalendar, addEvent, today, thisWeek |
| `contacts.ts` | addContact, findContact, showContact |
| `health.ts` | logExercise, createHabit, showHabits |
| `garden.ts` | searchGarden, createPage, linkPages |
| `shed.ts` | askShed, ingestDocument |
| `memory.ts` | recallConversation, setPreference, viewProfile, clearFollowup |
| `weather.ts` | getWeather |
| `signal.ts` | sendSignal, scheduleSignal |
| `system.ts` | help, status, quit, scheduleTask |

### Model Architecture

Bartleby uses a 4-tier model system:

| Tier | Example Model | Purpose | When Used |
|------|---------------|---------|-----------|
| **Embedding** | Qwen3-Embedding-8B | Vector similarity | Semantic matching, memory recall |
| **Router** | Qwen3-0.6B | Complexity classification | Every input: "simple or complex?" |
| **Fast** | Qwen3-30B-A3B (MoE) | Single tool execution | Simple tasks, quick answers |
| **Thinking** | Qwen3-30B-A3B-Thinking | Multi-step reasoning | Complex chains, planning, code |

> **Note**: The specific models are configurable. Use whatever models and inference server fit your hardware. The examples above use Qwen3 models, but Llama, Mistral, Phi, Gemma, etc. all work.

### Routing Flow

```
User Input
    ↓
Router Model: "Is this simple or complex?"
    ↓
├─→ COMPLEX (multi-step, planning, code)
│       ↓
│   Thinking Model (agentic loop)
│       ↓
│   Plan → Tool 1 → Tool 2 → ... → Answer
│
└─→ SIMPLE (single action)
        ↓
    Command Router (deterministic)
        ↓
    Layer 1: Pattern Match (instant, no model)
        ↓
    Layer 2: Keyword Match (instant, no model)
        ↓
    Layer 3: Semantic Match (Embedding model, ~50ms)
        ↓
    Layer 4: Fast Model (single tool call, ~1-2s)
```

**Why this matters:**

| Input | Route | Time |
|-------|-------|------|
| "show next actions" | Pattern → Tool | ~10ms |
| "what's on my plate" | Semantic → Tool | ~50ms |
| "email Sarah about tomorrow's meeting" | Router → Thinking → Multi-tool chain | ~5-10s |
| "write a function to parse CSV" | Router → Thinking → Code generation | ~10-20s |

95% of daily commands take the fast path. Complex tasks get full reasoning power.

### Multi-Step Example

**Input**: "Email Sarah about our meeting tomorrow"

**Router Model classifies**: COMPLEX (references contact, calendar, email)

**Thinking Model plans and executes**:
```
Plan:
  1. Look up Sarah in contacts → sarah@acme.com
  2. Look up tomorrow's calendar → "Project review, 2pm"
  3. Draft email with context
  4. Send to user for review

Execution:
  Tool: contacts.lookup("Sarah")
  → { name: "Sarah Chen", email: "sarah@acme.com" }
  
  Tool: calendar.tomorrow()
  → [{ title: "Project review", time: "2pm", with: "Sarah" }]
  
  Tool: email.draft({ 
    to: "sarah@acme.com",
    subject: "Re: Project review tomorrow",
    body: "Hi Sarah, looking forward to our project review at 2pm..."
  })
  → Draft created

Response: "I've drafted an email to Sarah about your project review 
at 2pm tomorrow. Want me to send it?"
```

This multi-step behavior is **impossible** without the Thinking model's agentic loop.

---

## Installation

### Prerequisites

- **Node.js 22 LTS** (required for native modules)
- **Sufficient RAM** for your chosen models (8GB minimum, 32GB+ recommended)
- **A local LLM server** (Ollama, llama.cpp, vLLM, LM Studio, etc.) OR cloud API keys

### Step 1: Install Node.js 22

```bash
# Using nvm (recommended)
nvm install 22
nvm use 22

# Verify
node --version  # Should show v22.x.x
```

### Step 2: Clone and Install

```bash
git clone https://github.com/yourusername/bartleby.git
cd bartleby

# Install dependencies
pnpm install

# Approve native module builds (required for vector search)
pnpm approve-builds

# Build
pnpm build
```

### Step 3: Set Up Your LLM Server

Bartleby works with any OpenAI-compatible API. Choose your preferred setup:

Bartleby works with any OpenAI-compatible inference server. Choose what fits your setup:

**Option A: Ollama (easiest)**
```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama pull qwen2.5:0.5b      # Router
ollama pull qwen2.5:7b        # Fast  
ollama pull qwen2.5:32b       # Thinking
ollama pull nomic-embed-text  # Embeddings
```

**Option B: MLX (Apple Silicon optimized)**
```bash
# Using mlx-lm or mlx-box for local inference
# Each model runs on a separate port for parallel access

# Example setup with Qwen3 models:
# Port 8080: mlx-community/Qwen3-0.6B-4bit (Router)
# Port 8081: mlx-community/Qwen3-30B-A3B-4bit (Fast)
# Port 8083: mlx-community/Qwen3-30B-A3B-Thinking-2507-4bit (Thinking)
# Port 8084: Qwen/Qwen3-Embedding-8B (Embeddings)
```

**Option C: Any OpenAI-compatible API**
```bash
# vLLM, llama.cpp, LocalAI, LM Studio, etc.
# Or cloud: OpenAI, Anthropic, Together, Groq, etc.
```

> **Note**: The MoE models (like Qwen3-30B-A3B) only activate ~3B parameters per query despite having 30B total, making them fast and efficient.

**Option B: llama.cpp server**
```bash
./llama-server -m your-model.gguf --port 8080
```

**Option C: LM Studio**
- Download from lmstudio.ai
- Load your preferred models
- Start the local server

**Option D: Cloud APIs**
- Set `OPENAI_API_KEY` for OpenAI
- Or configure other providers

### Step 4: Configure Bartleby

```bash
cp .env.example .env
```

Edit `.env`:

```bash
# === LLM (any OpenAI-compatible API) ===

# Router tier (complexity classification - tiny & fast)
ROUTER_MODEL=mlx-community/Qwen3-0.6B-4bit
ROUTER_URL=http://127.0.0.1:8080/v1

# Fast tier (single tool execution)
FAST_MODEL=mlx-community/Qwen3-30B-A3B-4bit
FAST_URL=http://127.0.0.1:8081/v1

# Thinking tier (multi-step reasoning, code)
THINKING_MODEL=mlx-community/Qwen3-30B-A3B-Thinking-2507-4bit
THINKING_URL=http://127.0.0.1:8083/v1

# Embeddings (semantic matching, memory)
EMBEDDINGS_MODEL=Qwen/Qwen3-Embedding-8B
EMBEDDINGS_URL=http://127.0.0.1:8084/v1
EMBEDDINGS_DIMENSIONS=4096

# === Paths ===
GARDEN_PATH=./garden
SHED_PATH=./shed
DATABASE_PATH=./database

# === Optional ===
WEATHER_CITY=New York,US
OPENWEATHERMAP_API_KEY=
TAVILY_API_KEY=
SIGNAL_ENABLED=false
```

### Step 5: Initialize and Run

```bash
# Create directory structure
pnpm run init

# Start Bartleby
pnpm start
```

---

## Quick Start

### First Run

```
$ bartleby

Bartleby initialized.
Garden: ~/bartleby/garden/ (0 pages)
Shed: ~/bartleby/shed/ (0 sources)
Models: ✓ Fast ✓ Embeddings

> help

Available commands:

GTD:
  show next actions     - List current tasks
  capture <text>        - Quick capture to inbox
  done <number>         - Mark task complete
  process inbox         - Process inbox items

Calendar:
  calendar              - Show upcoming events
  add event <details>   - Create new event

Memory:
  what did we talk about <topic>  - Search past conversations
  what do you know about me       - View your profile

System:
  help                  - Show this help
  status                - System status
  quit                  - Exit Bartleby
```

### Capture Your First Tasks

```
> capture buy groceries
> capture call mom  
> capture finish quarterly report

✓ Added 3 items to inbox

> process inbox

Item 1: "buy groceries"
Actionable? (y/n): y
Context? (home/work/errands/phone): errands
✓ Moved to @errands

Item 2: "call mom"
Context?: phone
✓ Moved to @phone

Item 3: "finish quarterly report"
Context?: work
Project?: Q1-reports
✓ Created project: Q1-reports
✓ Moved to @work (Q1-reports)

Inbox clear!
```

### Add a Contact

```
> add contact Sarah Chen, email sarah@acme.com, works at Acme Corp

✓ Created: Sarah Chen
  garden/Sarah Chen.md
```

### Set Some Preferences

```
> I prefer morning meetings
Got it! I'll remember that you prefer morning meetings.

> remember that I take Fridays off
Got it! I'll remember that you take Fridays off.

> what do you know about me

## What I Know About You

Preferences: morning meetings
Schedule: Fridays off

*Based on 3 conversations.*
```

---

## Command Reference

### GTD

| Command | Description |
|---------|-------------|
| `show next actions` | List all current tasks |
| `show @<context>` | Tasks for context (`show @home`) |
| `capture <text>` | Add to inbox |
| `done <n>` or `done <text>` | Mark complete |
| `process inbox` | Process inbox items |
| `show waiting for` | Delegated items |
| `show someday` | Someday/maybe list |
| `weekly review` | Start weekly review |

### Calendar

| Command | Description |
|---------|-------------|
| `calendar` | Show upcoming events |
| `today` | Today's schedule |
| `this week` | This week's events |
| `add event <details>` | Create event |

### Contacts

| Command | Description |
|---------|-------------|
| `add contact <details>` | Create contact |
| `find <name>` | Search contacts |
| `list contacts` | List all contacts |

### Memory

| Command | Description |
|---------|-------------|
| `what did we talk about <topic>` | Search conversations |
| `remind me about <topic>` | Recall related context |
| `I prefer <preference>` | Set preference |
| `remember that <fact>` | Explicitly store fact |
| `what do you know about me` | View profile |

### Health & Habits

| Command | Description |
|---------|-------------|
| `log <exercise>` | Track workout |
| `habit <description>` | Create habit tracker |
| `show habits` | View habit streaks |

### Knowledge

| Command | Description |
|---------|-------------|
| `ingest <file>` | Add to Shed |
| `ask <question>` | Query Shed |
| `search <query>` | Web search |

### System

| Command | Description |
|---------|-------------|
| `help` | Show help |
| `status` | System status |
| `weather` | Weather forecast |
| `quit` | Exit |

---

## Garden Pages

Everything in the Garden is a markdown page with YAML frontmatter:

### Project

```markdown
---
type: project
status: active
area: work
---

# Website Redesign

Redesign the company website by Q2.

## Next Actions
- [ ] Review competitor sites @computer
- [ ] Meet with [[Sarah Chen]] about requirements

## Waiting For
- [ ] Design assets from [[Mike Johnson]]

## Notes
See [[shed:brand-guidelines.pdf]] for reference.
```

### Contact

```markdown
---
type: contact
email: sarah@example.com
phone: 555-1234
birthday: 1990-03-15
tags: [work, design]
---

# Sarah Chen

Senior designer at Acme Corp.

## Notes
- Prefers morning meetings
- Working on the rebrand project

## Interactions
- 2026-01-10: Discussed website redesign
```

### Context

```markdown
---
type: context
---

# Home

Tasks I can do at home.
```

### Daily Note

```markdown
---
type: daily
date: 2026-01-11
---

# Saturday, January 11, 2026

## Morning
- Reviewed inbox
- Planned the week

## Notes
Had a good idea about [[Learn Spanish]]...
```

Pages link to each other with `[[Page Name]]` syntax. Bartleby understands these links.

---

## Configuration Reference

```bash
# === LLM (any OpenAI-compatible API) ===

# Router: Complexity classification (tiny model, ~0.6B)
ROUTER_MODEL=mlx-community/Qwen3-0.6B-4bit
ROUTER_URL=http://127.0.0.1:8080/v1
ROUTER_MAX_TOKENS=100

# Fast: Single tool execution (MoE recommended, ~3B active)
FAST_MODEL=mlx-community/Qwen3-30B-A3B-4bit
FAST_URL=http://127.0.0.1:8081/v1
FAST_MAX_TOKENS=4096

# Thinking: Multi-step reasoning, code (extended thinking)
THINKING_MODEL=mlx-community/Qwen3-30B-A3B-Thinking-2507-4bit
THINKING_URL=http://127.0.0.1:8083/v1
THINKING_MAX_TOKENS=8192
THINKING_BUDGET=4096

# Health check timeout (ms) - increase for cold starts
HEALTH_TIMEOUT=35000

# === Embeddings ===
EMBEDDINGS_MODEL=Qwen/Qwen3-Embedding-8B
EMBEDDINGS_URL=http://127.0.0.1:8084/v1
EMBEDDINGS_DIMENSIONS=4096

# === Paths ===
GARDEN_PATH=./garden
SHED_PATH=./shed
DATABASE_PATH=./database
LOG_FILE=./logs/bartleby.log

# === Optional ===
WEATHER_CITY=New York,US
OPENWEATHERMAP_API_KEY=

TAVILY_API_KEY=

SIGNAL_ENABLED=false
SIGNAL_CLI_PATH=/usr/local/bin/signal-cli
SIGNAL_NUMBER=

LOG_LEVEL=info
```

---

## Troubleshooting

### Models Not Loading

```
Error: Could not connect to model at http://localhost:11434
```

Make sure your LLM server is running:
```bash
# For Ollama
ollama serve

# Check it's responding
curl http://localhost:11434/v1/models
```

### Slow First Response

First request may be slow (10-30s) as models load into memory.

Increase the health timeout:
```bash
HEALTH_TIMEOUT=60000
```

### Native Module Errors

```
Error: hnswlib-node binding not found
```

1. Ensure Node.js 22: `node --version`
2. Run `pnpm approve-builds`
3. Rebuild: `pnpm rebuild`

---

## Development

### Code Structure

```
src/
├── index.ts              # Entry: config → services → router → repl
├── config.ts             # Load .env, validate config
├── repl.ts               # Interactive loop
│
├── router/
│   └── index.ts          # CommandRouter (pattern → keyword → semantic → LLM)
│
├── tools/
│   ├── index.ts          # Tool registry
│   ├── types.ts          # Tool interface
│   ├── gtd.ts            # GTD + project tools
│   ├── calendar.ts       # Calendar tools
│   ├── contacts.ts       # Contact tools
│   ├── health.ts         # Exercise, habits
│   ├── garden.ts         # Garden wiki search
│   ├── shed.ts           # RAG/Shed queries
│   ├── memory.ts         # Memory tools (recall, profile, preferences)
│   ├── weather.ts        # Weather tools
│   ├── signal.ts         # Signal notifications
│   └── system.ts         # help, status, quit, scheduler
│
├── services/
│   ├── index.ts          # ServiceContainer
│   ├── garden.ts         # GardenService (unified wiki)
│   ├── shed.ts           # ShedService (RAG)
│   ├── calendar.ts       # CalendarService
│   ├── scheduler.ts      # SchedulerService
│   ├── memory.ts         # MemoryService (episodic + semantic profile)
│   ├── proactive.ts      # ProactiveService (insights, nudges)
│   ├── llm.ts            # LLMService
│   ├── embeddings.ts     # EmbeddingService
│   ├── weather.ts        # WeatherService
│   └── signal.ts         # SignalService
│
└── utils/
    ├── logger.ts
    ├── markdown.ts       # Parse frontmatter
    └── math.ts           # Cosine similarity
```

### Adding a Tool

1. Create in `src/tools/`:

```typescript
import { Tool } from './types';

export const myTool: Tool = {
  name: 'myTool',
  description: 'What this tool does',
  
  routing: {
    patterns: [/^my command$/i],
    keywords: { verbs: ['my'], nouns: ['command'] },
    examples: ['my command', 'do my thing'],
  },
  
  execute: async (args, context) => {
    // Use context.services.garden, memory, etc.
    return 'Result';
  },
};
```

2. Register in `src/tools/index.ts`

### Building & Testing

```bash
pnpm build        # Compile TypeScript
pnpm build:watch  # Watch mode
pnpm test         # Run tests
pnpm lint         # Check linting
```

---

## Why "Bartleby"?

Named after Bertie Bartleby's incomparable valet Jeeves—the gentleman's personal gentleman who anticipates needs, remembers preferences, and handles everything with quiet efficiency.

*"Very good, sir. I shall endeavor to give satisfaction."*

---

## License

MIT License - see [LICENSE](LICENSE) for details.
