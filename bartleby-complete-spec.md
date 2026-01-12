# Bartleby: Complete Specification

> **Purpose**: This document captures everything needed to build Bartleby from scratch. It is the single source of truth for the builder. Read this entire document before writing any code.

---

## Table of Contents

1. [Vision & Philosophy](#1-vision--philosophy)
2. [Architecture Overview](#2-architecture-overview)
3. [The 4-Tier Model System](#3-the-4-tier-model-system)
4. [The Command Router](#4-the-command-router)
5. [The Garden (Personal Wiki)](#5-the-garden-personal-wiki)
6. [The Shed (Reference Library)](#6-the-shed-reference-library)
7. [The Memory System](#7-the-memory-system)
8. [The Proactive Service](#8-the-proactive-service)
9. [The Scheduler Service](#9-the-scheduler-service)
10. [Vector Storage (HNSW)](#10-vector-storage-hnsw)
11. [Tool Design Patterns](#11-tool-design-patterns)
12. [GTD Implementation](#12-gtd-implementation)
13. [Configuration & Environment](#13-configuration--environment)
14. [Error Handling & Graceful Degradation](#14-error-handling--graceful-degradation)
15. [File Structure](#15-file-structure)
16. [Database Schemas](#16-database-schemas)
17. [Critical Implementation Notes](#17-critical-implementation-notes)

---

## 1. Vision & Philosophy

### What is Bartleby?

Bartleby is a **personal AI assistant** that runs locally on your machine. It is:

- **Your second brain**: A personal exocortex that remembers everything, retrieves relevant knowledge, and helps you think
- **Your productivity system**: A full GTD (Getting Things Done) implementation with inbox, next actions, projects, contexts, and reviews
- **Your personal wiki**: A living document of your life - contacts, notes, projects, and knowledge, all interconnected
- **Your reference library**: A place to ingest documents, articles, and books, and ask questions about them
- **Your proactive assistant**: Not just reactive - it reminds you, nudges you, detects patterns, and offers suggestions

### Why Local-First?

1. **Privacy**: Your thoughts, tasks, contacts, and documents never leave your machine
2. **Ownership**: Your data is in SQLite databases and markdown files you control
3. **Speed**: No network latency for most operations
4. **Reliability**: Works offline, no API rate limits, no subscription fees
5. **Customization**: You can see and modify everything

### Design Principles

1. **Deterministic when possible, LLM when necessary**: The Command Router handles 95% of requests without touching an LLM. Fast, reliable, predictable.

2. **Memory always**: Every interaction is recorded, patterns are extracted, context is maintained. Bartleby remembers.

3. **Data as files**: While SQLite is the source of truth, everything has a markdown representation you can read and edit.

4. **Graceful degradation**: If a model tier is down, fall back to the next best option. If all LLMs are down, deterministic routing still works.

5. **Proactive, not just reactive**: Bartleby doesn't wait to be asked. It surfaces relevant information, reminds you of commitments, and coaches you toward your goals.

### The Personal Exocortex

Bartleby implements a two-layer knowledge system:

```
┌─────────────────────────────────────────────────────────────────┐
│                     THE SHED (Library)                          │
│  ─────────────────────────────────────────────────────────────  │
│  Bartleby-managed reference materials                           │
│  • Ingested documents, articles, PDFs, books                    │
│  • Chunked and embedded for semantic search                     │
│  • Knowledge graph of concepts and relationships                │
│  • RAG queries: "What did that paper say about X?"              │
│  • You DROP things in, Bartleby organizes them                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ retrieval
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    THE GARDEN (Wiki)                            │
│  ─────────────────────────────────────────────────────────────  │
│  User-owned personal knowledge base                             │
│  • GTD system: inbox, actions, projects, contexts               │
│  • Contacts with full relationship context                      │
│  • Notes, ideas, meeting notes, daily logs                      │
│  • Linked markdown files you can edit directly                  │
│  • Bidirectional sync: edit file ↔ update database              │
│  • YOU own this, Bartleby helps maintain it                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Architecture Overview

### High-Level Data Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           USER INPUT                                    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      ROUTER MODEL (0.6B)                                │
│                   "Is this SIMPLE or COMPLEX?"                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
            ┌───────────────┐               ┌───────────────┐
            │    SIMPLE     │               │    COMPLEX    │
            └───────────────┘               └───────────────┘
                    │                               │
                    ▼                               ▼
┌─────────────────────────────────┐   ┌─────────────────────────────────┐
│       COMMAND ROUTER            │   │     THINKING MODEL (30B)        │
│  ───────────────────────────    │   │  ─────────────────────────────  │
│  Layer 1: Pattern (regex)       │   │  Agentic loop with tool calls:  │
│  Layer 2: Keyword (verb+noun)   │   │                                 │
│  Layer 3: Semantic (embeddings) │   │  Plan → Tool 1 → Tool 2 → ...   │
│  Layer 4: Fast Model (7-30B)    │   │       ↓         ↓               │
└─────────────────────────────────┘   │     Result → Result → Synthesize│
                    │                   └─────────────────────────────────┘
                    ▼                               │
            ┌───────────────┐                       │
            │  TOOL EXECUTE │◄──────────────────────┘
            └───────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          SERVICES                                       │
│  ─────────────────────────────────────────────────────────────────────  │
│  Garden │ Shed │ Calendar │ Memory │ Proactive │ Scheduler │ ...       │
└─────────────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     PERSISTENT STORAGE                                  │
│  ─────────────────────────────────────────────────────────────────────  │
│  SQLite Databases          │  Markdown Files        │  Vector Index     │
│  • garden.sqlite3          │  • garden/*.md         │  • vectors.hnsw   │
│  • calendar.sqlite3        │  • shed/sources/*.md   │                   │
│  • memory.sqlite3          │                        │                   │
│  • shed.sqlite3            │                        │                   │
└─────────────────────────────────────────────────────────────────────────┘
```

### Service Container

All services are initialized once at startup and passed to tools via context:

```typescript
interface ServiceContainer {
  // Core data
  garden: GardenService;      // GTD, contacts, notes (wiki)
  shed: ShedService;          // Document ingestion, RAG (library)
  calendar: CalendarService;  // Events and scheduling
  
  // Intelligence
  memory: MemoryService;      // Episodic memory, semantic profile
  proactive: ProactiveService; // Pattern detection, suggestions
  
  // Infrastructure
  llm: LLMService;            // 4-tier model management
  embeddings: EmbeddingService; // Text → vectors
  vectors: VectorService;     // HNSW index for similarity search
  scheduler: SchedulerService; // Background task scheduling
  
  // Optional integrations
  weather: WeatherService;
  signal: SignalService;
}
```

---

## 3. The 4-Tier Model System

### Why 4 Tiers?

Different tasks need different models:

| Tier | Model Size | Latency | Use Case |
|------|------------|---------|----------|
| **Router** | 0.5-1B | ~100ms | Classification: "Is this simple or complex?" |
| **Fast** | 7-30B (MoE) | ~1-2s | Single tool selection, simple answers |
| **Thinking** | 30B+ (extended thinking) | ~5-30s | Multi-step reasoning, planning, code |
| **Embedding** | ~1B | ~50ms | Text → vector for semantic search |

### Model Selection Flow

```
Every user input:
    │
    ▼
Router Model: "SIMPLE or COMPLEX?"
    │
    ├─→ COMPLEX
    │       │
    │       ▼
    │   Thinking Model
    │   (agentic loop, function calling)
    │
    └─→ SIMPLE
            │
            ▼
        Command Router tries:
        1. Pattern match (no LLM)
        2. Keyword match (no LLM)
        3. Semantic match (Embedding model only)
        4. Fast Model (if nothing matched)
```

### Complexity Classification

The Router model uses this prompt:

```
Classify this request as SIMPLE or COMPLEX.

SIMPLE: Single action, direct command, one tool needed
- "show my tasks"
- "add milk to list"
- "weather"

COMPLEX: Multiple steps, references needing lookup, code, planning
- "email Sarah about tomorrow's meeting" (needs contact + calendar lookup)
- "write a function to parse CSV"
- "help me plan my week"
- "compare my tasks with my calendar"

Request: "{input}"

Answer with one word (SIMPLE or COMPLEX):
```

### Heuristic Fallback

If the Router model is unavailable, use pattern-based classification:

```typescript
const COMPLEX_PATTERNS = [
  /\b(and then|after that|first|next|finally)\b/i,           // Chaining
  /\b(email|message|text|send)\b.*\b(about|regarding)\b/i,   // Communication + context
  /\b(write|create|build|implement)\b.*\b(code|function|script)\b/i, // Code
  /\b(plan|schedule|organize|prepare|help me with)\b/i,      // Planning
  /\b(compare|analyze|review|summarize)\b/i,                 // Analysis
  /\b(if|when|based on|depending)\b/i,                       // Conditional
];

// Complex if 2+ patterns match, or multiple proper nouns, or very long
```

### Graceful Degradation

```
Router unavailable → Use heuristics
Thinking unavailable → Use Fast model for everything
Fast unavailable → Use Thinking model for everything  
All LLMs unavailable → Deterministic router only (pattern/keyword/semantic)
Embeddings unavailable → Skip semantic matching layer
```

---

## 4. The Command Router

### Purpose

Handle 95% of requests without an LLM. Fast, reliable, predictable.

### Four Layers

**Layer 1: Pattern Matching (Regex)**
```typescript
// Exact structural matches
/^(show|list|view)\s+(my\s+)?(next\s+)?actions?$/i → viewNextActions
/^add\s+task\s+(.+)$/i → addTask
/^done\s+(\d+)$/i → markDone
```
- Fastest (~1ms)
- Most reliable
- Captures groups for argument extraction

**Layer 2: Keyword Matching (Verb + Noun)**
```typescript
// Combinatorial matching
verbs: ['show', 'list', 'view', 'display']
nouns: ['tasks', 'actions', 'todo', 'to-do list']

// Match if verb AND noun found in input
"display my todo list" → verb 'display' + noun 'todo list' → match
```
- Fast (~5ms)
- Handles paraphrasing
- Score: verb+noun=0.9, noun_only=0.7, verb_only=0.5

**Layer 3: Semantic Matching (Embeddings)**
```typescript
// Pre-computed embeddings for example phrases
examples: [
  "show next actions",
  "what's on my plate",
  "what do I need to do",
]

// At runtime: embed user input, find closest example
similarity = cosine(embed(input), embed(example))
if similarity >= 0.75 → match
```
- Medium speed (~50-100ms)
- Handles novel phrasing
- Requires embedding model

**Layer 4: LLM Fallback**
- Only reached if layers 1-3 don't match
- For SIMPLE requests: Fast model, single tool call
- For COMPLEX requests: Thinking model, agentic loop

### Tool Definition Pattern

Every tool is a self-describing object:

```typescript
const addTask: Tool = {
  name: 'addTask',
  description: 'Add a new task to the GTD system',
  
  routing: {
    patterns: [
      /^add\s+task\s+(.+)$/i,
      /^new\s+action\s+(.+)$/i,
    ],
    keywords: {
      verbs: ['add', 'create', 'new'],
      nouns: ['task', 'action', 'todo'],
    },
    examples: [
      'add task buy milk',
      'create action call dentist',
      'new todo review proposal',
    ],
    priority: 90,  // Higher = checked first
  },
  
  // For LLM function calling (agentic loop)
  parameters: {
    type: 'object',
    properties: {
      description: { type: 'string', description: 'Task description' },
      context: { type: 'string', description: 'GTD context (@home, @work, etc)' },
      project: { type: 'string', description: 'Project name' },
      dueDate: { type: 'string', description: 'Due date (ISO 8601)' },
    },
    required: ['description'],
  },
  
  parseArgs: (input, match) => {
    // Extract from regex match or parse from natural language
  },
  
  execute: async (args, context) => {
    return context.services.garden.addTask(args);
  },
};
```

---

## 5. The Garden (Personal Wiki)

### Concept

The Garden is your personal wiki - a flat directory of interconnected markdown files that Bartleby keeps synchronized with a SQLite database.

### Key Principles

1. **Database is source of truth**: All operations go through the database first
2. **Markdown files are views**: Automatically generated from database state
3. **Bidirectional sync**: User edits to markdown files are parsed back into database
4. **Flat structure**: All files in one directory, linked by wiki-style links
5. **YAML frontmatter**: Metadata in frontmatter, content in markdown body

### Record Types

```typescript
type RecordType = 
  | 'action'    // GTD next action
  | 'project'   // GTD project (has sub-actions)
  | 'context'   // GTD context (@home, @work, etc)
  | 'contact'   // Person with contact info
  | 'note'      // Freeform note
  | 'daily'     // Daily log entry
  | 'list'      // Generic list (inbox, someday/maybe, etc)
  | 'area'      // Area of responsibility
  ;

type RecordStatus = 
  | 'active'    // Current, actionable
  | 'completed' // Done
  | 'archived'  // Kept for reference
  | 'someday'   // Someday/maybe
  | 'waiting'   // Waiting for someone/something
  ;
```

### Database Schema

```sql
CREATE TABLE garden_records (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  
  -- GTD fields
  context TEXT,           -- @home, @work, @errands, etc
  project TEXT,           -- Parent project ID or name
  due_date TEXT,          -- ISO 8601 date
  scheduled_date TEXT,    -- When to start working on it
  
  -- Contact fields
  email TEXT,
  phone TEXT,
  birthday TEXT,
  company TEXT,
  relationship TEXT,      -- friend, colleague, family, etc
  
  -- Content
  content TEXT,           -- Markdown body
  tags TEXT,              -- JSON array of tags
  metadata TEXT,          -- JSON object for extensibility
  
  -- Links (stored separately for indexing)
  -- See garden_links table
  
  -- Timestamps
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE TABLE garden_links (
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  link_text TEXT,         -- Display text of the link
  PRIMARY KEY (source_id, target_id)
);

-- Indexes for common queries
CREATE INDEX idx_garden_type ON garden_records(type);
CREATE INDEX idx_garden_status ON garden_records(status);
CREATE INDEX idx_garden_context ON garden_records(context);
CREATE INDEX idx_garden_project ON garden_records(project);
CREATE INDEX idx_garden_due ON garden_records(due_date);
```

### Markdown File Format

```markdown
---
id: 550e8400-e29b-41d4-a716-446655440000
type: action
status: active
context: "@errands"
project: "Home Renovation"
due: 2026-01-15
tags: [shopping, urgent]
---

# Buy paint samples

Need to get samples for the living room. Sarah suggested looking at
[[Benjamin Moore]] for the warm gray tones.

See [[Home Renovation]] project for color scheme ideas.
```

### Bidirectional Sync

**Database → Markdown (on record change):**
```typescript
function syncToFile(record: GardenRecord): void {
  const frontmatter = {
    id: record.id,
    type: record.type,
    status: record.status,
    // ... other fields
  };
  
  const body = `# ${record.title}\n\n${record.content || ''}`;
  const markdown = generateMarkdown(frontmatter, body);
  
  const filename = sanitizeFilename(record.title) + '.md';
  fs.writeFileSync(path.join(gardenPath, filename), markdown);
}
```

**Markdown → Database (on file change):**
```typescript
// Using chokidar to watch for file changes
watcher.on('change', (filepath) => {
  const content = fs.readFileSync(filepath, 'utf-8');
  const { frontmatter, content: body } = parseMarkdown(content);
  
  const title = extractTitle(body) || path.basename(filepath, '.md');
  const existingId = frontmatter.id;
  
  if (existingId) {
    // Update existing record
    garden.update(existingId, { ...frontmatter, content: body, title });
  } else {
    // Create new record (user created file manually)
    garden.create({ ...frontmatter, content: body, title });
  }
});
```

### Wiki Links

Links between records use `[[Title]]` syntax:

```markdown
This task is part of the [[Home Renovation]] project.
I should ask [[Sarah Chen]] about paint colors.
```

When syncing:
1. Parse `[[...]]` patterns from content
2. Resolve to record IDs
3. Store in `garden_links` table
4. Enable backlink queries ("What links to this?")

---

## 6. The Shed (Reference Library)

### Concept

The Shed is your reference library - a place to drop documents, articles, and books that Bartleby indexes for retrieval. Unlike the Garden (which you maintain), the Shed is Bartleby-managed.

### Architecture

```
shed/
├── sources/              # Original documents (user drops files here)
│   ├── article-on-llms.md
│   ├── research-paper.pdf
│   └── book-notes.txt
├── chunks/               # Processed chunks (Bartleby-managed)
│   └── (generated, not user-edited)
└── index/                # Vector index
    └── vectors.hnsw
```

### Database Schema

```sql
-- Original documents
CREATE TABLE shed_sources (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  filepath TEXT NOT NULL,
  title TEXT,
  author TEXT,
  source_type TEXT,       -- 'article', 'book', 'paper', 'note', etc
  source_url TEXT,        -- Original URL if applicable
  ingested_at TEXT DEFAULT (datetime('now')),
  metadata TEXT           -- JSON for extensibility
);

-- Processed chunks
CREATE TABLE shed_chunks (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES shed_sources(id),
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  token_count INTEGER,
  embedding_id TEXT,      -- Reference to vector index
  metadata TEXT,          -- JSON: page number, section, etc
  
  UNIQUE(source_id, chunk_index)
);

-- Knowledge graph (optional but powerful)
CREATE TABLE shed_concepts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  embedding_id TEXT
);

CREATE TABLE shed_concept_mentions (
  chunk_id TEXT NOT NULL REFERENCES shed_chunks(id),
  concept_id TEXT NOT NULL REFERENCES shed_concepts(id),
  relevance REAL,         -- 0-1 score
  PRIMARY KEY (chunk_id, concept_id)
);
```

### Document Ingestion Pipeline

```typescript
async function ingestDocument(filepath: string): Promise<void> {
  // 1. Read and parse document
  const content = await readDocument(filepath); // Handle .md, .txt, .pdf
  
  // 2. Create source record
  const source = await shed.createSource({
    filename: path.basename(filepath),
    filepath,
    title: extractTitle(content),
    // ... metadata extraction
  });
  
  // 3. Chunk the document
  const chunks = chunkDocument(content, {
    maxTokens: 512,
    overlap: 50,
    preserveParagraphs: true,
  });
  
  // 4. Embed and store chunks
  for (let i = 0; i < chunks.length; i++) {
    const embedding = await embeddings.embed(chunks[i]);
    const embeddingId = await vectors.add(embedding, {
      type: 'shed_chunk',
      sourceId: source.id,
      chunkIndex: i,
    });
    
    await shed.createChunk({
      sourceId: source.id,
      chunkIndex: i,
      content: chunks[i],
      embeddingId,
    });
  }
  
  // 5. Extract concepts (optional)
  const concepts = await extractConcepts(content);
  // ... store concept mentions
}
```

### Chunking Strategy

```typescript
function chunkDocument(content: string, options: ChunkOptions): string[] {
  const chunks: string[] = [];
  const paragraphs = content.split(/\n\n+/);
  
  let currentChunk = '';
  let currentTokens = 0;
  
  for (const para of paragraphs) {
    const paraTokens = estimateTokens(para);
    
    if (currentTokens + paraTokens > options.maxTokens) {
      // Save current chunk
      if (currentChunk) chunks.push(currentChunk.trim());
      
      // Start new chunk with overlap
      const overlapText = getLastNTokens(currentChunk, options.overlap);
      currentChunk = overlapText + '\n\n' + para;
      currentTokens = estimateTokens(currentChunk);
    } else {
      currentChunk += '\n\n' + para;
      currentTokens += paraTokens;
    }
  }
  
  if (currentChunk) chunks.push(currentChunk.trim());
  return chunks;
}
```

### RAG Query

```typescript
async function askShed(query: string, topK: number = 5): Promise<string> {
  // 1. Embed the query
  const queryEmbedding = await embeddings.embed(query);
  
  // 2. Find similar chunks
  const results = await vectors.search(queryEmbedding, topK, {
    filter: { type: 'shed_chunk' },
  });
  
  // 3. Retrieve chunk content
  const chunks = await Promise.all(
    results.map(r => shed.getChunk(r.metadata.chunkId))
  );
  
  // 4. Build context for LLM
  const context = chunks.map((chunk, i) => {
    const source = await shed.getSource(chunk.sourceId);
    return `[Source: ${source.title}]\n${chunk.content}`;
  }).join('\n\n---\n\n');
  
  // 5. Generate answer with citations
  const answer = await llm.chat([
    {
      role: 'system',
      content: `Answer the question based on the provided context. Cite sources using [Source: title] format. If the context doesn't contain the answer, say so.`
    },
    {
      role: 'user',
      content: `Context:\n${context}\n\nQuestion: ${query}`
    }
  ], { tier: 'thinking' });
  
  return answer;
}
```

---

## 7. The Memory System

### Purpose

Bartleby remembers. Every interaction is recorded, patterns are extracted, and context is maintained across sessions.

### Three Components

```
┌─────────────────────────────────────────────────────────────────┐
│                     MEMORY SYSTEM                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │ EPISODIC MEMORY │  │ SEMANTIC PROFILE│  │  SESSION STATE  │ │
│  │                 │  │                 │  │                 │ │
│  │ Past sessions   │  │ User facts      │  │ Current context │ │
│  │ Conversations   │  │ Preferences     │  │ Message history │ │
│  │ Actions taken   │  │ Relationships   │  │ Pending actions │ │
│  │ Follow-ups      │  │ Habits/Goals    │  │ Active topics   │ │
│  │                 │  │ Schedule        │  │                 │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
│           │                   │                    │            │
│           └───────────────────┴────────────────────┘            │
│                              │                                  │
│                              ▼                                  │
│                    ┌─────────────────┐                          │
│                    │   getContext()  │                          │
│                    │  For LLM calls  │                          │
│                    └─────────────────┘                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Episodic Memory

Stores summaries of past conversations:

```typescript
interface Episode {
  id: string;
  timestamp: string;
  
  // Summary of the session
  summary: string;
  topics: string[];
  
  // What happened
  actionsTaken: string[];      // Tasks added, events created, etc.
  questionsAsked: string[];    // User's questions
  
  // Open loops
  pendingFollowups: string[];  // "I'll check on that tomorrow"
  commitments: string[];       // "I will..."
  
  // For retrieval
  messageCount: number;
  embedding?: string;          // Vector ID for semantic search
}
```

**Key operations:**
- `recordEpisode(session)` - Save session summary when user exits
- `recallRelevant(query, limit)` - Find past conversations related to a topic
- `getPendingFollowups()` - Return all open loops
- `clearFollowup(id, text)` - Mark a follow-up as resolved

### Semantic Profile

Stores structured facts about the user:

```typescript
interface UserFact {
  category: 'preference' | 'habit' | 'goal' | 'relationship' | 'schedule' | 'interest' | 'health';
  key: string;
  value: unknown;
  confidence: number;         // 0-1, how sure we are
  lastUpdated: string;
  source: 'explicit' | 'inferred';  // User told us vs. we figured it out
}
```

**Extraction patterns:**
```typescript
// Explicit statements
"I prefer morning meetings" → { category: 'preference', key: 'meeting_time', value: 'morning' }
"My wife is Sarah" → { category: 'relationship', key: 'wife', value: 'Sarah' }

// Inferred from behavior
User always adds @home tasks on weekends → { category: 'habit', key: 'weekend_context', value: '@home' }
```

### Session State

Tracks the current conversation:

```typescript
interface SessionState {
  startTime: Date;
  messages: Array<{ role: 'user' | 'assistant'; content: string; timestamp: Date }>;
  
  // Extracted during conversation
  topicsMentioned: string[];
  entitiesReferenced: string[];  // Contacts, projects, etc.
  actionsPerformed: string[];
  
  // For context continuity
  lastTopic: string | null;
  pendingQuestion: string | null;
}
```

### Database Schema

```sql
-- Episodic memory
CREATE TABLE memory_episodes (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  summary TEXT,
  topics TEXT,              -- JSON array
  actions_taken TEXT,       -- JSON array
  pending_followups TEXT,   -- JSON array
  message_count INTEGER,
  embedding_id TEXT
);

-- Semantic profile
CREATE TABLE memory_facts (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT,               -- JSON-encoded value
  confidence REAL DEFAULT 0.7,
  source TEXT DEFAULT 'inferred',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  
  UNIQUE(category, key)
);

-- Indexes
CREATE INDEX idx_episodes_timestamp ON memory_episodes(timestamp);
CREATE INDEX idx_facts_category ON memory_facts(category);
```

### Context Building

When calling an LLM, include relevant memory:

```typescript
function buildContext(input: string): string {
  const parts: string[] = [];
  
  // 1. User profile summary
  const profile = memory.getProfileSummary();
  if (profile) {
    parts.push(`## About the User\n${profile}`);
  }
  
  // 2. Relevant past conversations
  const relevant = memory.recallRelevant(input, 3);
  if (relevant.length > 0) {
    parts.push(`## Relevant Past Conversations`);
    for (const ep of relevant) {
      parts.push(`- ${formatTimeAgo(ep.timestamp)}: ${ep.summary}`);
    }
  }
  
  // 3. Pending follow-ups
  const followups = memory.getPendingFollowups();
  if (followups.length > 0) {
    parts.push(`## Pending Follow-ups`);
    for (const f of followups) {
      parts.push(`- ${f.text}`);
    }
  }
  
  // 4. Current session context
  const session = memory.getCurrentSession();
  if (session.topicsMentioned.length > 0) {
    parts.push(`## This Session\nTopics: ${session.topicsMentioned.join(', ')}`);
  }
  
  return parts.join('\n\n');
}
```

---

## 8. The Proactive Service

### Purpose

Bartleby doesn't just wait to be asked. It proactively surfaces relevant information, reminds you of commitments, and helps you stay on track.

### Session Opener

When a session starts:

```typescript
async function getSessionOpener(): Promise<string | null> {
  const insights: string[] = [];
  
  // 1. Pending follow-ups from past conversations
  const followups = memory.getPendingFollowups();
  if (followups.length > 0) {
    insights.push(`📝 You mentioned: "${followups[0].text}"`);
  }
  
  // 2. Stale inbox items (unfiled for >2 days)
  const stale = garden.getStaleInboxItems(2);
  if (stale.length > 0) {
    insights.push(`📥 ${stale.length} inbox item(s) need attention`);
  }
  
  // 3. Overdue tasks
  const overdue = garden.getOverdueTasks();
  if (overdue.length > 0) {
    insights.push(`⚠️ ${overdue.length} overdue task(s)`);
  }
  
  // 4. Today's calendar
  const todayEvents = calendar.getForDay(new Date());
  if (todayEvents.length > 0) {
    insights.push(`📅 ${todayEvents.length} event(s) today`);
  }
  
  // 5. Last session context (if recent)
  const lastSession = memory.getLastSession();
  if (lastSession && hoursAgo(lastSession.timestamp) < 24) {
    insights.push(`💭 Last time: "${lastSession.summary.slice(0, 50)}..."`);
  }
  
  // 6. Weekly task completion rate
  const stats = garden.getTaskStats(7);
  if (stats.added > 5 && stats.completed / stats.added < 0.3) {
    insights.push(`📊 Only ${stats.completed}/${stats.added} tasks completed this week`);
  }
  
  // 7. Upcoming birthdays (from contacts)
  const birthdays = garden.getUpcomingBirthdays(7);
  if (birthdays.length > 0) {
    insights.push(`🎂 ${birthdays[0].title}'s birthday in ${birthdays[0].daysUntil} days`);
  }
  
  return insights.length > 0 ? insights.join('\n') : null;
}
```

### Contextual Reminders

During a conversation, surface related information:

```typescript
async function getContextualReminder(input: string): Promise<string | null> {
  // Check if input mentions entities we know about
  const mentioned = extractEntities(input);
  
  for (const entity of mentioned) {
    // Check for related follow-ups
    const related = memory.recallRelevant(entity, 3);
    for (const ep of related) {
      if (ep.pendingFollowups.length > 0) {
        return `💭 Related: You mentioned "${ep.pendingFollowups[0]}"`;
      }
    }
    
    // Check for related tasks
    const tasks = garden.search(entity);
    if (tasks.some(t => t.status === 'waiting')) {
      return `⏳ Reminder: You're waiting on something related to ${entity}`;
    }
  }
  
  return null;
}
```

### Pattern Detection

Track user behavior and offer insights:

```typescript
// Detected patterns
interface Pattern {
  type: 'productivity' | 'habit' | 'schedule' | 'communication';
  description: string;
  confidence: number;
  suggestion?: string;
}

function detectPatterns(): Pattern[] {
  const patterns: Pattern[] = [];
  
  // Example: Most productive time of day
  const tasksByHour = garden.getCompletionsByHour();
  const peakHour = findPeakHour(tasksByHour);
  if (peakHour && confidence > 0.7) {
    patterns.push({
      type: 'productivity',
      description: `You complete most tasks around ${peakHour}`,
      suggestion: 'Consider scheduling important work during this time',
    });
  }
  
  // Example: Neglected project
  const projects = garden.getProjects();
  for (const p of projects) {
    const daysSinceActivity = daysSince(p.updated_at);
    if (daysSinceActivity > 14 && p.status === 'active') {
      patterns.push({
        type: 'productivity',
        description: `"${p.title}" hasn't had activity in ${daysSinceActivity} days`,
        suggestion: 'Consider reviewing or moving to Someday/Maybe',
      });
    }
  }
  
  return patterns;
}
```

---

## 9. The Scheduler Service

### Purpose

Run background tasks on a schedule. Enable truly proactive behavior - Bartleby can remind you even when you haven't opened a session.

### Architecture

```typescript
interface ScheduledTask {
  id: string;
  type: 'reminder' | 'recurring' | 'check';
  
  // When to run
  schedule: {
    type: 'once' | 'interval' | 'cron';
    value: string;  // ISO date, interval ms, or cron expression
  };
  
  // What to do
  action: {
    type: 'notify' | 'execute';
    payload: unknown;  // Notification text or tool call
  };
  
  // State
  lastRun?: string;
  nextRun: string;
  enabled: boolean;
  
  // Metadata
  createdAt: string;
  createdBy: 'user' | 'system';
  relatedRecord?: string;  // Link to Garden record
}
```

### Database Schema

```sql
CREATE TABLE scheduled_tasks (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  schedule_type TEXT NOT NULL,
  schedule_value TEXT NOT NULL,
  action_type TEXT NOT NULL,
  action_payload TEXT,
  last_run TEXT,
  next_run TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  created_by TEXT DEFAULT 'user',
  related_record TEXT
);

CREATE INDEX idx_scheduled_next ON scheduled_tasks(next_run);
CREATE INDEX idx_scheduled_enabled ON scheduled_tasks(enabled);
```

### Scheduler Loop

```typescript
class SchedulerService {
  private intervalId?: NodeJS.Timeout;
  private checkInterval = 60000; // Check every minute
  
  start(): void {
    this.intervalId = setInterval(() => this.tick(), this.checkInterval);
    info('Scheduler started');
  }
  
  private async tick(): Promise<void> {
    const now = new Date().toISOString();
    
    // Get due tasks
    const dueTasks = this.db.prepare(`
      SELECT * FROM scheduled_tasks 
      WHERE enabled = 1 AND next_run <= ?
      ORDER BY next_run
    `).all(now);
    
    for (const task of dueTasks) {
      try {
        await this.executeTask(task);
        this.updateNextRun(task);
      } catch (err) {
        error('Scheduled task failed', { taskId: task.id, error: String(err) });
      }
    }
  }
  
  private async executeTask(task: ScheduledTask): Promise<void> {
    switch (task.action.type) {
      case 'notify':
        await this.notify(task.action.payload as string);
        break;
      case 'execute':
        // Execute a tool
        const { tool, args } = task.action.payload as { tool: string; args: unknown };
        await executeTool(tool, args);
        break;
    }
  }
  
  private async notify(message: string): Promise<void> {
    // Try Signal first
    if (services.signal.isEnabled()) {
      await services.signal.send(message);
    } else {
      // Fall back to console log (or system notification)
      console.log(`\n🔔 Reminder: ${message}\n`);
    }
  }
  
  private updateNextRun(task: ScheduledTask): void {
    if (task.schedule.type === 'once') {
      // One-time task - disable it
      this.db.prepare('UPDATE scheduled_tasks SET enabled = 0, last_run = ? WHERE id = ?')
        .run(new Date().toISOString(), task.id);
    } else {
      // Calculate next run
      const nextRun = this.calculateNextRun(task);
      this.db.prepare('UPDATE scheduled_tasks SET last_run = ?, next_run = ? WHERE id = ?')
        .run(new Date().toISOString(), nextRun, task.id);
    }
  }
  
  private calculateNextRun(task: ScheduledTask): string {
    const now = new Date();
    
    switch (task.schedule.type) {
      case 'interval':
        return new Date(now.getTime() + parseInt(task.schedule.value)).toISOString();
      case 'cron':
        return parseCron(task.schedule.value).next().toISOString();
      default:
        return now.toISOString();
    }
  }
}
```

### Common Use Cases

```typescript
// 1. One-time reminder
scheduler.create({
  type: 'reminder',
  schedule: { type: 'once', value: '2026-01-15T10:00:00Z' },
  action: { type: 'notify', payload: 'Call the dentist!' },
});

// 2. Daily review prompt
scheduler.create({
  type: 'recurring',
  schedule: { type: 'cron', value: '0 9 * * *' }, // 9am daily
  action: { type: 'notify', payload: 'Time for your daily review! What are your priorities today?' },
});

// 3. Weekly GTD review
scheduler.create({
  type: 'recurring',
  schedule: { type: 'cron', value: '0 10 * * 0' }, // 10am Sunday
  action: { type: 'notify', payload: 'Weekly review time! Check your inbox, review projects, and plan the week.' },
});

// 4. Follow-up check
scheduler.create({
  type: 'check',
  schedule: { type: 'once', value: '2026-01-20T09:00:00Z' },
  action: { type: 'notify', payload: 'Did you hear back from Sarah about the proposal?' },
  relatedRecord: '<contact-id>',
});
```

---

## 10. Vector Storage (HNSW)

### Why HNSW?

When you have thousands of embeddings (from Shed documents, episodic memories, etc.), brute-force cosine similarity becomes slow. HNSW (Hierarchical Navigable Small Worlds) provides approximate nearest neighbor search in O(log n) time.

### Using hnswlib-node

```bash
pnpm add hnswlib-node
pnpm approve-builds  # Required for native module compilation
```

### VectorService Implementation

```typescript
import { HierarchicalNSW } from 'hnswlib-node';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';

interface VectorMetadata {
  id: string;
  type: string;      // 'shed_chunk', 'episode', 'garden_record', etc.
  recordId: string;  // Reference to source record
  [key: string]: unknown;
}

export class VectorService {
  private index: HierarchicalNSW;
  private metadata: Map<number, VectorMetadata> = new Map();
  private idToLabel: Map<string, number> = new Map();
  private nextLabel = 0;
  private dimensions: number;
  private indexPath: string;
  private metadataPath: string;
  
  constructor(config: Config) {
    this.dimensions = config.embeddings.dimensions;
    this.indexPath = path.join(config.paths.database, 'vectors.hnsw');
    this.metadataPath = path.join(config.paths.database, 'vectors-meta.json');
  }
  
  async initialize(): Promise<void> {
    // Create new index
    this.index = new HierarchicalNSW('cosine', this.dimensions);
    
    // Load existing index if available
    if (fs.existsSync(this.indexPath)) {
      try {
        this.index.readIndexSync(this.indexPath);
        this.loadMetadata();
        info('Vector index loaded', { vectors: this.metadata.size });
      } catch (err) {
        warn('Failed to load vector index, creating new', { error: String(err) });
        this.initializeNewIndex();
      }
    } else {
      this.initializeNewIndex();
    }
  }
  
  private initializeNewIndex(): void {
    // Initialize with capacity for 100k vectors (can grow)
    this.index.initIndex(100000, 16, 200, 100);
    this.metadata.clear();
    this.idToLabel.clear();
    this.nextLabel = 0;
  }
  
  async add(embedding: number[], metadata: Omit<VectorMetadata, 'id'>): Promise<string> {
    const id = uuidv4();
    const label = this.nextLabel++;
    
    // Add to HNSW index
    this.index.addPoint(embedding, label);
    
    // Store metadata
    const fullMetadata: VectorMetadata = { ...metadata, id };
    this.metadata.set(label, fullMetadata);
    this.idToLabel.set(id, label);
    
    // Persist periodically (or on shutdown)
    if (this.nextLabel % 100 === 0) {
      this.save();
    }
    
    return id;
  }
  
  async search(
    queryEmbedding: number[],
    k: number,
    filter?: { type?: string; [key: string]: unknown }
  ): Promise<Array<{ id: string; score: number; metadata: VectorMetadata }>> {
    // HNSW search returns more candidates for filtering
    const searchK = filter ? k * 3 : k;
    const result = this.index.searchKnn(queryEmbedding, searchK);
    
    const matches: Array<{ id: string; score: number; metadata: VectorMetadata }> = [];
    
    for (let i = 0; i < result.neighbors.length && matches.length < k; i++) {
      const label = result.neighbors[i];
      const distance = result.distances[i];
      const meta = this.metadata.get(label);
      
      if (!meta) continue;
      
      // Apply filter
      if (filter) {
        let pass = true;
        for (const [key, value] of Object.entries(filter)) {
          if (meta[key] !== value) {
            pass = false;
            break;
          }
        }
        if (!pass) continue;
      }
      
      // Convert distance to similarity score
      // HNSW with cosine returns 1 - cosine_similarity
      const score = 1 - distance;
      
      matches.push({
        id: meta.id,
        score,
        metadata: meta,
      });
    }
    
    return matches;
  }
  
  async delete(id: string): Promise<boolean> {
    const label = this.idToLabel.get(id);
    if (label === undefined) return false;
    
    // HNSW doesn't support deletion, but we can mark as deleted
    // and filter out in search results
    this.index.markDelete(label);
    this.metadata.delete(label);
    this.idToLabel.delete(id);
    
    return true;
  }
  
  save(): void {
    this.index.writeIndexSync(this.indexPath);
    this.saveMetadata();
  }
  
  private saveMetadata(): void {
    const data = {
      nextLabel: this.nextLabel,
      metadata: Array.from(this.metadata.entries()),
      idToLabel: Array.from(this.idToLabel.entries()),
    };
    fs.writeFileSync(this.metadataPath, JSON.stringify(data));
  }
  
  private loadMetadata(): void {
    const data = JSON.parse(fs.readFileSync(this.metadataPath, 'utf-8'));
    this.nextLabel = data.nextLabel;
    this.metadata = new Map(data.metadata);
    this.idToLabel = new Map(data.idToLabel);
  }
  
  close(): void {
    this.save();
  }
}
```

### Integration with EmbeddingService

```typescript
// EmbeddingService caches recent embeddings in memory
// VectorService stores all embeddings persistently

class EmbeddingService {
  private cache = new Map<string, number[]>();  // LRU cache for recent
  private vectors: VectorService;
  
  async embed(text: string): Promise<number[]> {
    // Check cache first
    const cached = this.cache.get(text);
    if (cached) return cached;
    
    // Call embedding model
    const embedding = await this.callEmbeddingModel(text);
    
    // Cache
    this.cache.set(text, embedding);
    if (this.cache.size > 1000) {
      // Simple LRU: delete oldest entries
      const keys = Array.from(this.cache.keys());
      for (let i = 0; i < 100; i++) {
        this.cache.delete(keys[i]);
      }
    }
    
    return embedding;
  }
  
  // For permanent storage, use VectorService directly
  async embedAndStore(text: string, metadata: { type: string; recordId: string }): Promise<string> {
    const embedding = await this.embed(text);
    return this.vectors.add(embedding, metadata);
  }
}
```

---

## 11. Tool Design Patterns

### Complete Tool Definition

Every tool should include all of these:

```typescript
interface Tool {
  // Identity
  name: string;          // Unique identifier: 'addTask'
  description: string;   // For LLM: 'Add a new task to the GTD system'
  
  // Routing metadata
  routing: {
    // Layer 1: Regex patterns (fastest, most precise)
    patterns: RegExp[];
    
    // Layer 2: Keyword matching (handles paraphrasing)
    keywords: {
      verbs: string[];    // Action words: ['add', 'create', 'new']
      nouns: string[];    // Target words: ['task', 'action', 'todo']
    };
    
    // Layer 3: Semantic matching (handles novel phrasing)
    examples: string[];   // Example phrases to embed
    
    // Routing priority (higher = checked first)
    priority: number;
  };
  
  // LLM function calling schema (for agentic loop)
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required: string[];
  };
  
  // Argument extraction (from regex match or natural language)
  parseArgs: (input: string, match: RegExpMatchArray | null) => Record<string, unknown>;
  
  // Execution
  execute: (args: Record<string, unknown>, context: ToolContext) => Promise<string>;
}
```

### Tool Categories

```typescript
// src/tools/index.ts
export const allTools: Tool[] = [
  // GTD Tools
  ...gtdTools,       // viewNextActions, addTask, markDone, capture, etc.
  
  // Calendar Tools
  ...calendarTools,  // showCalendar, showToday, addEvent, etc.
  
  // Contact Tools
  ...contactTools,   // addContact, findContact, updateContact, etc.
  
  // Shed Tools
  ...shedTools,      // ingestDocument, askShed, listSources, etc.
  
  // Memory Tools
  ...memoryTools,    // recallConversation, setPreference, viewProfile, etc.
  
  // Scheduler Tools
  ...schedulerTools, // scheduleReminder, showScheduled, cancelReminder, etc.
  
  // System Tools
  ...systemTools,    // help, status, quit, etc.
  
  // Optional Integrations
  ...weatherTools,   // getWeather
  ...signalTools,    // sendMessage
];
```

### Argument Extraction Pattern

```typescript
// Example: addTask with inline context and project
parseArgs: (input, match) => {
  // If regex matched, use captured groups
  let description = match ? match[1] : input;
  
  // Remove command prefix
  description = description.replace(/^(add|create|new)\s+(task|action)\s*/i, '');
  
  // Parse inline context (@)
  let context: string | undefined;
  const contextMatch = description.match(/@(\w+)/);
  if (contextMatch) {
    context = `@${contextMatch[1]}`;
    description = description.replace(/@\w+/, '').trim();
  }
  
  // Parse inline project (+)
  let project: string | undefined;
  const projectMatch = description.match(/\+(\w+)/);
  if (projectMatch) {
    project = projectMatch[1];
    description = description.replace(/\+\w+/, '').trim();
  }
  
  // Parse inline due date
  let dueDate: string | undefined;
  const duePatterns = [
    /\bdue\s+(\d{4}-\d{2}-\d{2})\b/i,
    /\bby\s+(\w+day)\b/i,  // "by Friday"
    /\btomorrow\b/i,
  ];
  // ... date parsing logic
  
  return { description, context, project, dueDate };
}
```

---

## 12. GTD Implementation

### The GTD Workflow

```
                    CAPTURE
                       │
                       ▼
                   ┌───────┐
                   │ INBOX │
                   └───────┘
                       │
              ┌────────┼────────┐
              │        │        │
              ▼        ▼        ▼
          Is it    Is it     Is it
        actionable?  ref?   trash?
              │        │        │
              ▼        ▼        ▼
        ┌─────────┐ ┌─────┐ ┌───────┐
        │ PROCESS │ │SHED │ │DELETE │
        └─────────┘ └─────┘ └───────┘
              │
    ┌─────────┼─────────┐
    │         │         │
    ▼         ▼         ▼
 < 2 min?  Delegate?  Defer?
    │         │         │
    ▼         ▼         ▼
┌──────┐ ┌─────────┐ ┌──────────────┐
│ DO IT│ │WAITING  │ │ NEXT ACTION  │
│ NOW  │ │  FOR    │ │ or PROJECT   │
└──────┘ └─────────┘ └──────────────┘
```

### Garden Record Types for GTD

```typescript
// Inbox item (unprocessed)
{
  type: 'action',
  status: 'active',
  context: '@inbox',
  title: 'Something I captured',
}

// Next action (processed, actionable)
{
  type: 'action',
  status: 'active',
  context: '@work',       // Where/when it can be done
  project: 'Project X',   // Optional: parent project
  due_date: '2026-01-15', // Optional: deadline
  title: 'Call vendor about pricing',
}

// Project (has multiple actions)
{
  type: 'project',
  status: 'active',
  title: 'Launch new website',
  content: '## Outcome\nWebsite live and functioning\n\n## Next Actions\n- See linked actions',
}

// Context (grouping)
{
  type: 'context',
  title: '@home',
  content: 'Tasks that can only be done at home',
}

// Waiting For
{
  type: 'action',
  status: 'waiting',
  title: 'Response from Sarah on proposal',
  metadata: { waitingFor: 'Sarah', since: '2026-01-10' },
}

// Someday/Maybe
{
  type: 'action',
  status: 'someday',
  title: 'Learn to play guitar',
}
```

### GTD Tools

```typescript
// Core GTD tools
const gtdTools: Tool[] = [
  // Capture
  capture,           // Quick add to inbox
  
  // Organize
  viewInbox,         // Show inbox items
  addTask,           // Add with context/project
  moveToContext,     // Change context
  moveToProject,     // Assign to project
  moveToSomeday,     // Defer to someday/maybe
  
  // Action
  viewNextActions,   // Show actionable tasks
  viewByContext,     // Show tasks for a context
  viewByProject,     // Show tasks for a project
  markDone,          // Complete a task
  
  // Review
  viewWaitingFor,    // Show waiting items
  viewSomeday,       // Show someday/maybe
  viewProjects,      // Show all projects
  weeklyReview,      // Guided review process
];
```

---

## 13. Configuration & Environment

### Environment Variables

```bash
# ============================================
# Bartleby Configuration
# ============================================

# --- LLM (any OpenAI-compatible API) ---

# Router tier: Complexity classification (tiny, fast)
ROUTER_MODEL=mlx-community/Qwen3-0.6B-4bit
ROUTER_URL=http://127.0.0.1:8080/v1
ROUTER_MAX_TOKENS=100

# Fast tier: Simple queries, single tool calls
FAST_MODEL=mlx-community/Qwen3-30B-A3B-4bit
FAST_URL=http://127.0.0.1:8081/v1
FAST_MAX_TOKENS=4096

# Thinking tier: Complex reasoning, multi-step tasks
THINKING_MODEL=mlx-community/Qwen3-30B-A3B-Thinking-2507-4bit
THINKING_URL=http://127.0.0.1:8083/v1
THINKING_MAX_TOKENS=8192
THINKING_BUDGET=4096

# Agent settings
AGENT_MAX_ITERATIONS=10

# Health check timeout (ms) - increase for cold starts
HEALTH_TIMEOUT=35000

# --- Embeddings ---
EMBEDDINGS_MODEL=Qwen/Qwen3-Embedding-8B
EMBEDDINGS_URL=http://127.0.0.1:8084/v1
EMBEDDINGS_DIMENSIONS=4096

# --- Paths ---
GARDEN_PATH=./garden
SHED_PATH=./shed
DATABASE_PATH=./database
LOG_DIR=./logs

# --- Scheduler ---
SCHEDULER_ENABLED=true
SCHEDULER_CHECK_INTERVAL=60000

# --- Weather (optional) ---
WEATHER_CITY=
WEATHER_UNITS=F
OPENWEATHERMAP_API_KEY=

# --- Signal Notifications (optional) ---
SIGNAL_ENABLED=false
SIGNAL_CLI_PATH=/usr/local/bin/signal-cli
SIGNAL_NUMBER=
SIGNAL_RECIPIENT=
SIGNAL_TIMEOUT=20000

# --- Logging ---
LOG_LEVEL=info
LOG_FILE=./logs/bartleby.log
LOG_CONSOLE=true
```

### Config Schema

```typescript
const ConfigSchema = z.object({
  llm: z.object({
    router: TierSchema,
    fast: TierSchema,
    thinking: ThinkingTierSchema,
    healthTimeout: z.number().positive(),
    agentMaxIterations: z.number().positive(),
  }),
  
  embeddings: z.object({
    url: z.string().url(),
    model: z.string(),
    dimensions: z.number().positive(),
  }),
  
  paths: z.object({
    garden: z.string(),
    shed: z.string(),
    database: z.string(),
    logs: z.string(),
  }),
  
  scheduler: z.object({
    enabled: z.boolean(),
    checkInterval: z.number().positive(),
  }),
  
  weather: z.object({
    city: z.string().optional(),
    apiKey: z.string().optional(),
    units: z.enum(['C', 'F']),
  }),
  
  signal: z.object({
    enabled: z.boolean(),
    cliPath: z.string(),
    number: z.string().optional(),
    recipient: z.string().optional(),
    timeout: z.number().positive(),
  }),
  
  logging: z.object({
    level: z.enum(['debug', 'info', 'warn', 'error']),
    file: z.string(),
    console: z.boolean(),
  }),
});
```

---

## 14. Error Handling & Graceful Degradation

### LLM Tier Fallbacks

```typescript
class LLMService {
  getBestAvailableTier(preferred: Tier): Tier {
    if (this.healthy[preferred]) return preferred;
    
    const fallbacks: Record<Tier, Tier[]> = {
      'router': [],                // Use heuristics instead
      'thinking': ['fast'],        // Complex → Fast (reduced capability)
      'fast': ['thinking'],        // Simple → Thinking (overkill but works)
    };
    
    for (const fallback of fallbacks[preferred] || []) {
      if (this.healthy[fallback]) {
        warn(`${preferred} unavailable, falling back to ${fallback}`);
        return fallback;
      }
    }
    
    throw new Error(`No LLM tiers available`);
  }
}
```

### Service Initialization Errors

```typescript
async function initServices(config: Config): Promise<ServiceContainer> {
  const services: Partial<ServiceContainer> = {};
  const errors: string[] = [];
  
  // Critical services - fail if these don't work
  try {
    services.garden = new GardenService(config);
    await services.garden.initialize();
  } catch (err) {
    throw new Error(`Garden service failed: ${err}`);
  }
  
  // Optional services - log warning and continue
  try {
    services.weather = new WeatherService(config);
    await services.weather.initialize();
  } catch (err) {
    warn('Weather service unavailable', { error: String(err) });
    services.weather = createNullWeatherService();
  }
  
  // ...
}
```

### Tool Execution Errors

```typescript
async function executeTool(tool: Tool, args: unknown, context: ToolContext): Promise<string> {
  try {
    return await tool.execute(args as Record<string, unknown>, context);
  } catch (err) {
    error('Tool execution failed', { tool: tool.name, args, error: String(err) });
    
    // Return user-friendly error
    return `Sorry, I couldn't complete that action. Error: ${err instanceof Error ? err.message : 'Unknown error'}`;
  }
}
```

---

## 15. File Structure

```
bartleby/
├── package.json
├── tsconfig.json
├── .env.example
├── .env
├── .gitignore
│
├── src/
│   ├── index.ts              # Entry point
│   ├── config.ts             # Configuration loading and validation
│   ├── repl.ts               # Interactive REPL
│   │
│   ├── utils/
│   │   ├── logger.ts         # Logging utility
│   │   ├── markdown.ts       # Markdown parsing (gray-matter)
│   │   └── math.ts           # Cosine similarity, etc.
│   │
│   ├── services/
│   │   ├── index.ts          # Service container
│   │   ├── garden.ts         # Personal wiki (GTD, contacts, notes)
│   │   ├── shed.ts           # Document library (RAG)
│   │   ├── calendar.ts       # Events and scheduling
│   │   ├── memory.ts         # Episodic + semantic memory
│   │   ├── proactive.ts      # Pattern detection, suggestions
│   │   ├── scheduler.ts      # Background task scheduling
│   │   ├── llm.ts            # 4-tier model management
│   │   ├── embeddings.ts     # Text → vectors
│   │   ├── vectors.ts        # HNSW index
│   │   ├── weather.ts        # Weather API (optional)
│   │   └── signal.ts         # Signal notifications (optional)
│   │
│   ├── tools/
│   │   ├── index.ts          # Tool registry
│   │   ├── types.ts          # Tool interface definitions
│   │   ├── gtd.ts            # GTD tools
│   │   ├── calendar.ts       # Calendar tools
│   │   ├── contacts.ts       # Contact tools
│   │   ├── shed.ts           # Shed/RAG tools
│   │   ├── memory.ts         # Memory tools
│   │   ├── scheduler.ts      # Scheduler tools
│   │   ├── weather.ts        # Weather tool
│   │   ├── signal.ts         # Signal tool
│   │   └── system.ts         # Help, status, quit
│   │
│   ├── router/
│   │   ├── index.ts          # Command router (4 layers)
│   │   └── semantic.ts       # Semantic matching
│   │
│   └── agent/
│       ├── index.ts          # LLM agent (simple + complex)
│       └── prompts.ts        # System prompts
│
├── garden/                   # User's personal wiki
│   ├── inbox.md
│   ├── buy-milk.md
│   └── ...
│
├── shed/
│   ├── sources/              # Original documents
│   └── index/                # Vector index
│
├── database/
│   ├── garden.sqlite3
│   ├── shed.sqlite3
│   ├── calendar.sqlite3
│   ├── memory.sqlite3
│   ├── scheduler.sqlite3
│   ├── vectors.hnsw
│   └── vectors-meta.json
│
└── logs/
    └── bartleby.log
```

---

## 16. Database Schemas

### garden.sqlite3

```sql
CREATE TABLE garden_records (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  context TEXT,
  project TEXT,
  due_date TEXT,
  scheduled_date TEXT,
  email TEXT,
  phone TEXT,
  birthday TEXT,
  company TEXT,
  relationship TEXT,
  content TEXT,
  tags TEXT,
  metadata TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE TABLE garden_links (
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  link_text TEXT,
  PRIMARY KEY (source_id, target_id)
);

CREATE INDEX idx_garden_type ON garden_records(type);
CREATE INDEX idx_garden_status ON garden_records(status);
CREATE INDEX idx_garden_context ON garden_records(context);
CREATE INDEX idx_garden_project ON garden_records(project);
CREATE INDEX idx_garden_due ON garden_records(due_date);
```

### calendar.sqlite3

```sql
CREATE TABLE events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  all_day INTEGER DEFAULT 0,
  location TEXT,
  linked_record TEXT,
  recurrence TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_events_start ON events(start_time);
```

### memory.sqlite3

```sql
CREATE TABLE episodes (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  summary TEXT,
  topics TEXT,
  actions_taken TEXT,
  pending_followups TEXT,
  message_count INTEGER,
  embedding_id TEXT
);

CREATE TABLE facts (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT,
  confidence REAL DEFAULT 0.7,
  source TEXT DEFAULT 'inferred',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(category, key)
);

CREATE INDEX idx_episodes_timestamp ON episodes(timestamp);
CREATE INDEX idx_facts_category ON facts(category);
```

### shed.sqlite3

```sql
CREATE TABLE sources (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  filepath TEXT NOT NULL,
  title TEXT,
  author TEXT,
  source_type TEXT,
  source_url TEXT,
  ingested_at TEXT DEFAULT (datetime('now')),
  metadata TEXT
);

CREATE TABLE chunks (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id),
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  token_count INTEGER,
  embedding_id TEXT,
  metadata TEXT,
  UNIQUE(source_id, chunk_index)
);

CREATE INDEX idx_chunks_source ON chunks(source_id);
```

### scheduler.sqlite3

```sql
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  schedule_type TEXT NOT NULL,
  schedule_value TEXT NOT NULL,
  action_type TEXT NOT NULL,
  action_payload TEXT,
  last_run TEXT,
  next_run TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  created_by TEXT DEFAULT 'user',
  related_record TEXT
);

CREATE INDEX idx_tasks_next ON tasks(next_run);
CREATE INDEX idx_tasks_enabled ON tasks(enabled);
```

---

## 17. Critical Implementation Notes

### Things That MUST Work Right

1. **Bidirectional sync must not loop**: Use a `syncing` flag to prevent file watcher from triggering when we're writing
   ```typescript
   private syncing = false;
   
   syncToFile(record) {
     if (this.syncing) return;
     this.syncing = true;
     // ... write file
     this.syncing = false;
   }
   ```

2. **Complexity classification must happen FIRST**: Before pattern matching, otherwise "email Sarah about tomorrow" matches `sendEmail` pattern

3. **Memory must persist across crashes**: Call `save()` after each episode, not just on clean shutdown

4. **HNSW index must be saved**: Call `vectors.save()` periodically and on shutdown

5. **Scheduler must survive restarts**: Store scheduled tasks in database, not just memory

### Common Pitfalls

1. **Don't use LLM for everything**: The deterministic router handles 95% of requests faster and more reliably

2. **Don't over-chunk documents**: 512 tokens with 50 overlap is a good starting point. Too small = lost context, too big = irrelevant results

3. **Don't ignore embeddings unavailability**: If embeddings are down, skip Layer 3 (semantic matching), don't crash

4. **Don't hardcode model names**: Always read from config, users will have different setups

5. **Don't forget to extract facts from conversation**: The memory system only learns if you run extraction patterns

### Testing Checklist

Before considering complete:

- [ ] Can add, view, and complete tasks
- [ ] Can create and search contacts
- [ ] Can ingest a document and query it
- [ ] Can recall past conversations
- [ ] Session opener shows relevant insights
- [ ] Scheduled reminders fire correctly
- [ ] Complex requests use agentic loop
- [ ] All 4 model tiers are healthy
- [ ] Garden markdown files stay in sync
- [ ] System survives restart with data intact

---

## Final Notes

This document is the complete specification. Everything Bartleby should do is described here. The implementation guide (`bartleby-greenfield.md`) will be updated to include all these features.

**Build order:**
1. Foundation (config, logger, utils)
2. Services (garden, shed, calendar, memory, proactive, scheduler, llm, embeddings, vectors)
3. Tools (gtd, calendar, contacts, shed, memory, scheduler, system)
4. Router (pattern, keyword, semantic, complexity classification)
5. Agent (simple, complex/agentic)
6. Application (REPL, entry point)

**Do not cut corners. Build it right.**

---

*Document version: Complete Specification v1.0*
*Created: January 12, 2026*
