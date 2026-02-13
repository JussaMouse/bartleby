# Bartleby Memory Architecture Analysis

**Date**: 2026-02-12
**Status**: ✅ **CORE IMPLEMENTED** - See unified-learning-system.md for details
**Author**: Claude Code

**Implementation Update**: The unified learning system has been implemented! See [unified-learning-system.md](./unified-learning-system.md) for current status and remaining work.

---

## Executive Summary

Bartleby's effectiveness as an AI assistant depends on three complementary memory systems:

1. **Episodes** - Conversation memory (what we discussed)
2. **Facts** - Knowledge memory (what the system knows about you)
3. **Command History** - Action memory (what you actually did) ← **MISSING**

This document analyzes the current implementation of Episodes and Facts, identifies gaps and inefficiencies, and proposes a unified memory architecture including the new Command History system.

**Key Findings:**
- Command history is the missing "action memory" layer - critically needed
- Episodes use basic regex extraction, no LLM-powered analysis despite being an AI assistant
- Facts has confusing dual meaning: user profile facts vs record metadata facts
- No unified memory querying or correlation across systems
- Limited context awareness in agent responses

---

## Part 1: Command History (Action Memory)

### Problem Statement

Bartleby currently lacks persistent command history. Each command execution is ephemeral:
- No record of what commands users actually run
- Cannot surface frequently used workflows
- Cannot provide "you did this before" context to LLM
- No analytics on usage patterns
- No foundation for smart autocomplete or command suggestions

This is the **action memory** gap - we remember conversations (Episodes) and learn facts (Facts), but don't track what users actually DO.

### Solution Design

#### Storage Schema (SQLite)

```sql
CREATE TABLE command_history (
  id TEXT PRIMARY KEY,              -- UUID
  timestamp TEXT NOT NULL,          -- ISO 8601
  user_id TEXT,                     -- For multi-user support (future)

  -- Input
  raw_input TEXT NOT NULL,          -- Original command string
  intent_type TEXT NOT NULL,        -- create_note, show_panel, etc.

  -- Parse results
  parsed_metadata TEXT,             -- JSON: projects, tags, contexts extracted
  confidence TEXT,                  -- high, medium, low

  -- Execution results
  success BOOLEAN NOT NULL,
  action_taken TEXT,                -- created, opened, marked_done, etc.
  result_id TEXT,                   -- ID of created/modified record
  panels_refreshed TEXT,            -- JSON array

  -- Context
  source TEXT NOT NULL,             -- cli, dashboard, api
  session_id TEXT,                  -- Links to episode
  error_message TEXT,               -- If failed
  execution_time_ms INTEGER
);

CREATE INDEX idx_timestamp ON command_history(timestamp DESC);
CREATE INDEX idx_intent ON command_history(intent_type);
CREATE INDEX idx_result ON command_history(result_id);
CREATE INDEX idx_session ON command_history(session_id);
```

#### Service API

```typescript
export class CommandHistoryService {
  // Record command execution
  async recordCommand(entry: {
    rawInput: string;
    intent: CommandIntent;
    result: CommandResult;
    source: 'cli' | 'dashboard' | 'api';
    sessionId?: string;
  }): Promise<string>;

  // Query history
  async getRecent(limit: number): Promise<HistoryEntry[]>;
  async getByIntent(intentType: string, limit: number): Promise<HistoryEntry[]>;
  async getBySession(sessionId: string): Promise<HistoryEntry[]>;
  async search(query: string, limit: number): Promise<HistoryEntry[]>;

  // Analytics
  async getFrequentCommands(limit: number): Promise<CommandFrequency[]>;
  async getCommandStats(): Promise<CommandStats>;

  // LLM context
  async getRelevantHistory(context: string, limit: number): Promise<HistoryEntry[]>;
}
```

#### Integration Points

**1. Command Execution Pipeline**
```typescript
// In command-executor.ts
export function executeCommand(
  intent: CommandIntent,
  garden: GardenService,
  history: CommandHistoryService,  // NEW
  sessionId?: string                // NEW
): CommandResult {
  const startTime = Date.now();
  const result = executeCommandInternal(intent, garden);

  // Record to history
  history.recordCommand({
    rawInput: intent.rawInput,
    intent,
    result,
    source: 'api',  // or cli, dashboard
    sessionId,
  }).catch(err => error('Failed to record command history', err));

  return result;
}
```

**2. LLM Context Enhancement**
```typescript
// In agent/index.ts
async buildContext() {
  const episodes = await this.context.getRecentEpisodes(5);
  const facts = await this.context.getUserFacts();
  const recentCommands = await this.history.getRecent(10);  // NEW

  return {
    conversationHistory: episodes,
    knownFacts: facts,
    recentActions: recentCommands.map(cmd => ({
      when: cmd.timestamp,
      what: cmd.rawInput,
      result: cmd.success ? cmd.action_taken : 'failed'
    }))
  };
}
```

**3. Smart Autocomplete**
```typescript
// In server/index.ts - command suggestions
getCommandSuggestions(input: string): Suggestion[] {
  const parsed = parseCommand(input);

  // Combine static templates with learned patterns
  const templates = getStaticTemplates(parsed.type);
  const frequent = this.history.getFrequentCommands(5);  // NEW
  const similar = this.history.search(input, 3);         // NEW

  return [...templates, ...frequent, ...similar]
    .sort(by relevance)
    .slice(0, 10);
}
```

### Benefits

1. **Better LLM Context**: "You created a similar note yesterday about the same project"
2. **Workflow Discovery**: "You often create actions right after project notes - want to add one?"
3. **Smart Autocomplete**: Learn user's patterns and vocabulary
4. **Usage Analytics**: Understand which features are valuable
5. **Debugging**: Full audit trail of user actions
6. **Session Correlation**: Link commands to conversation episodes

### Upgrade Plan

**Phase 1: Foundation (1-2 hours)**
- Create `src/services/command-history.ts` with SQLite schema
- Add basic record/query methods
- Unit tests for service

**Phase 2: Integration (1-2 hours)**
- Wire into command executor pipeline
- Add to services initialization
- Update API endpoints to pass sessionId
- Integration tests

**Phase 3: LLM Context (1 hour)**
- Add history to agent context building
- Format action memory for LLM prompts
- Test that agent uses history in responses

**Phase 4: Smart Features (2-3 hours)**
- Implement frequent command analysis
- Enhance autocomplete with learned patterns
- Add /history command to CLI
- Dashboard history panel

**Total: 5-8 hours** for full command history implementation

---

## Part 2: Episodes Analysis (Conversation Memory)

### Current Implementation

**File**: `src/services/context.ts` (lines 1-200)

```typescript
export interface Episode {
  id: string;
  timestamp: string;
  summary: string;           // First user message as summary
  topics: string[];          // Keyword extraction
  actionsTaken: string[];    // Hardcoded patterns
  pendingFollowups: string[];
  messageCount: number;
}
```

**Storage**: `database/memory/episodes.json` (JSON file)

**Key Methods**:
- `startSession()` - Creates new episode
- `addMessage()` - Accumulates messages
- `endSession()` - Finalizes episode with basic extraction
- `getRecentEpisodes()` - Loads from JSON

### Problems Identified

#### 1. Naive Summarization
```typescript
// Current implementation (context.ts:147)
const summary = messages.find((m) => m.role === 'user')?.content || 'No user input';
```
**Issue**: Summary is literally the first user message. For a 50-message conversation about refactoring authentication, the summary might be "how do i add login?" - not useful.

**Impact**: LLM cannot understand conversation context from history.

#### 2. Regex-Based Extraction
```typescript
// Topic extraction (context.ts:152-161)
const topicKeywords = ['note', 'action', 'project', 'schedule', 'reminder'];
const topics = new Set<string>();
for (const msg of userMessages) {
  for (const keyword of topicKeywords) {
    if (msg.content.toLowerCase().includes(keyword)) {
      topics.add(keyword);
    }
  }
}
```
**Issue**: Hardcoded keyword matching. Misses:
- Domain concepts ("authentication", "database migration")
- Technical topics ("debugging TypeScript errors")
- User-specific patterns

**Impact**: Cannot cluster related episodes or find relevant past conversations.

#### 3. No LLM-Powered Analysis

**Issue**: Bartleby is an AI assistant with access to powerful LLMs, yet episode analysis uses 2005-era regex. We should be using the LLM to:
- Generate meaningful summaries
- Extract key decisions made
- Identify unresolved questions
- Recognize conversation patterns

**Impact**: Massively underutilizing available intelligence.

#### 4. JSON File Storage

**Issue**: Episodes stored in flat JSON file, not SQLite.

**Problems**:
- Cannot query by topic, date range, or content
- No full-text search
- Poor performance as history grows
- No indexing for LLM context retrieval

### Recommendations

#### R1: LLM-Powered Episode Analysis

When ending a session, use the LLM to analyze the conversation:

```typescript
async endSession(): Promise<void> {
  const messages = this.currentSession.messages;

  // Use LLM to analyze conversation
  const analysis = await this.llm.analyze({
    messages,
    prompt: `Analyze this conversation between a user and Bartleby assistant.

    Provide:
    1. A 1-2 sentence summary of what was accomplished
    2. Key topics discussed (technical concepts, not just keywords)
    3. Decisions made or problems solved
    4. Any unresolved questions or follow-ups needed

    Format as JSON.`
  });

  const episode = {
    id: this.currentSession.id,
    timestamp: new Date().toISOString(),
    summary: analysis.summary,           // Real summary
    topics: analysis.topics,             // Meaningful topics
    decisions: analysis.decisions,       // NEW
    unresolvedQuestions: analysis.unresolved,  // NEW
    messageCount: messages.length
  };

  await this.saveEpisode(episode);
}
```

**Benefits**:
- Meaningful summaries for LLM context
- Better topic clustering
- Explicit decision tracking
- Follow-up reminders

**Cost**: ~$0.01 per episode (assuming 1000 tokens per conversation). Totally worth it.

#### R2: Migrate to SQLite

```sql
CREATE TABLE episodes (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  summary TEXT NOT NULL,
  topics TEXT,              -- JSON array
  decisions TEXT,           -- JSON array
  unresolved_questions TEXT, -- JSON array
  message_count INTEGER,

  -- Full content for search
  full_transcript TEXT      -- All messages as JSON
);

CREATE VIRTUAL TABLE episodes_fts USING fts5(
  summary,
  topics,
  decisions,
  content=episodes
);

CREATE INDEX idx_timestamp ON episodes(timestamp DESC);
```

**Benefits**:
- Query by date, topic, keyword
- Full-text search across all episodes
- Efficient retrieval for LLM context
- Scales to thousands of episodes

#### R3: Semantic Episode Retrieval

Use vector embeddings to find relevant past episodes:

```typescript
// When building LLM context, find semantically similar conversations
async getRelevantEpisodes(currentContext: string): Promise<Episode[]> {
  // Embed current context
  const contextVector = await this.embeddings.embed(currentContext);

  // Retrieve similar episodes by summary embedding
  const similar = await this.vector.search(contextVector, {
    collection: 'episode_summaries',
    limit: 5
  });

  return similar.map(s => this.getEpisode(s.id));
}
```

**Benefits**:
- Find relevant past conversations even with different wording
- "You solved a similar authentication issue last month"
- Better continuity across sessions

---

## Part 3: Facts Analysis (Knowledge Memory)

### Current Implementation - DUAL SYSTEM

Bartleby has **TWO separate "Facts" systems** with confusing naming:

#### System A: User Facts (in ContextService)

**File**: `src/services/context.ts` (lines 200-352)

```typescript
export interface UserFact {
  key: string;
  value: string;
  source: string;      // Which episode learned this
  confidence: number;  // 0-1
  lastUpdated: string;
}
```

**Storage**: `database/memory/episodes.json` (embedded in same file as episodes)

**Purpose**: Learn facts about the USER ("prefers camelCase", "works on web project")

**Extraction**: Regex patterns on user messages
```typescript
// Pattern matching (context.ts:242-270)
if (/my name is (\w+)/i.test(msg.content)) {
  facts.push({ key: 'name', value: match[1], ... });
}
```

#### System B: Record Facts (FactsService)

**File**: `src/services/facts.ts` (complete separate service)

```typescript
export interface FactEntry {
  recordId: string;    // Links to garden record
  key: string;
  value: any;
  updatedAt: string;
  expiresAt?: string;  // TTL support
}
```

**Storage**: SQLite (`database/data.sqlite3`)

**Purpose**: Track metadata about GARDEN RECORDS (view counts, AI insights, editing patterns)

**Usage**: Well-designed with querying, TTL, event tracking

### Problems Identified

#### 1. Confusing Dual Meaning

**Issue**: "Facts" means two completely different things:
- User profile facts (in ContextService)
- Record metadata facts (in FactsService)

**Impact**: Developer confusion, poor discoverability

#### 2. User Facts in Wrong File

**Issue**: User facts stored in `episodes.json` alongside episodes

**Problem**: Breaks separation of concerns. User profile should persist independently of conversation history.

#### 3. Regex-Based User Fact Extraction

Same issue as Episodes - using naive pattern matching instead of LLM.

```typescript
// Current patterns (context.ts:242)
if (/my name is (\w+)/i.test(msg.content)) { ... }
if (/i prefer (\w+)/i.test(msg.content)) { ... }
```

**Misses**:
- Implicit preferences ("I always use tabs")
- Context-dependent facts ("In this project, routes go in /api")
- Nuanced information

#### 4. No User Fact Schema

**Issue**: User facts are unstructured key-value pairs

**Problem**: Cannot enforce types, validate, or provide smart defaults

### Recommendations

#### R1: Rename for Clarity

```typescript
// Old (confusing)
FactsService  // Actually for record metadata

// New (clear)
RecordMetadataService  // Metadata about garden records
UserProfileService     // Facts about the user
```

#### R2: Separate User Profile Storage

Move user facts to dedicated SQLite table:

```sql
CREATE TABLE user_profile (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  value_type TEXT,      -- string, number, boolean, json
  category TEXT,        -- preferences, context, identity
  source_episode TEXT,  -- Which conversation learned this
  confidence REAL,      -- 0.0 to 1.0
  last_updated TEXT,

  -- Allow facts to evolve
  history TEXT          -- JSON array of past values
);

CREATE INDEX idx_category ON user_profile(category);
```

**Benefits**:
- User profile persists independently
- Can export/import user profile
- Type-safe fact storage
- Track how facts change over time

#### R3: LLM-Powered Fact Extraction

```typescript
async extractUserFacts(messages: Message[]): Promise<UserFact[]> {
  const response = await this.llm.analyze({
    messages,
    prompt: `Extract facts about the user from this conversation.

    Look for:
    - Name, preferences, work context
    - Technical preferences (languages, tools, conventions)
    - Project-specific context
    - Communication style preferences

    Only extract facts explicitly stated or strongly implied.
    Provide confidence score for each fact.

    Return as JSON array.`
  });

  return response.facts;
}
```

#### R4: Structured Fact Schema

Define known fact categories with validation:

```typescript
export interface UserProfileSchema {
  // Identity
  'user.name'?: string;
  'user.timezone'?: string;

  // Technical preferences
  'code.style'?: 'camelCase' | 'snake_case' | 'kebab-case';
  'code.indent'?: 'tabs' | 'spaces';
  'code.language_primary'?: string;

  // Workflow preferences
  'cli.auto_commit'?: boolean;
  'cli.verbose'?: boolean;

  // Project context
  'project.main'?: string;
  'project.structure'?: Record<string, string>;

  // Communication
  'communication.verbosity'?: 'concise' | 'detailed';
  'communication.use_emojis'?: boolean;
}
```

**Benefits**:
- Type-safe fact access
- IDE autocomplete for fact keys
- Validation of fact values
- Documentation of available facts

---

## Part 4: Unified Memory Architecture

### Vision: Three Pillars

```
┌─────────────────────────────────────────────────────────┐
│                    Bartleby Agent                       │
│                                                         │
│  "Tell me what we discussed, what you know about me,   │
│   and what I've been working on lately"                │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
        ┌─────────────────────────────────────┐
        │      Memory Context Builder         │
        │   (Retrieves relevant memories)     │
        └─────────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
        ▼                 ▼                 ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│   Episodes   │  │ User Profile │  │Command History│
│              │  │              │  │              │
│ "Last week   │  │ "You prefer  │  │ "Today you   │
│  we refac-   │  │  TypeScript  │  │  created 3   │
│  tored auth" │  │  and tabs"   │  │  new notes"  │
│              │  │              │  │              │
│ Conversation │  │ Knowledge    │  │ Action       │
│ Memory       │  │ Memory       │  │ Memory       │
└──────────────┘  └──────────────┘  └──────────────┘
      SQLite           SQLite           SQLite
      + FTS5           + Schema         + Analytics
      + LLM            + LLM            + Search
      Summaries        Extraction       + Patterns
```

### Integration: Context Builder

```typescript
export class MemoryContextBuilder {
  constructor(
    private episodes: EpisodesService,
    private profile: UserProfileService,
    private history: CommandHistoryService,
    private embeddings: EmbeddingService
  ) {}

  async buildContext(currentPrompt: string): Promise<MemoryContext> {
    // 1. Find relevant past conversations
    const relevantEpisodes = await this.episodes.getRelevant(currentPrompt, 5);

    // 2. Get user preferences
    const userFacts = await this.profile.getAllFacts();

    // 3. Get recent actions
    const recentCommands = await this.history.getRecent(10);

    // 4. Search for related actions
    const relatedCommands = await this.history.search(currentPrompt, 5);

    return {
      // What we discussed
      conversationContext: relevantEpisodes.map(ep => ({
        when: ep.timestamp,
        summary: ep.summary,
        decisions: ep.decisions,
        unresolved: ep.unresolvedQuestions
      })),

      // What I know about you
      userContext: {
        preferences: userFacts.filter(f => f.category === 'preferences'),
        projectContext: userFacts.filter(f => f.category === 'context'),
        technicalPrefs: userFacts.filter(f => f.category === 'technical')
      },

      // What you've been doing
      actionContext: {
        recentCommands: recentCommands.map(cmd => ({
          when: cmd.timestamp,
          what: cmd.rawInput,
          result: cmd.success ? cmd.actionTaken : 'failed'
        })),
        relatedCommands: relatedCommands
      }
    };
  }
}
```

### Example: Enhanced LLM Prompt

```typescript
async buildAgentPrompt(userMessage: string): Promise<string> {
  const memory = await this.memoryBuilder.buildContext(userMessage);

  return `You are Bartleby, a personal knowledge assistant.

CONVERSATION HISTORY:
${memory.conversationContext.map(ep =>
  `- ${ep.when}: ${ep.summary}`
).join('\n')}
${memory.conversationContext.some(ep => ep.unresolved?.length) ?
  `\nUnresolved from past: ${memory.conversationContext
    .flatMap(ep => ep.unresolved)
    .join(', ')}` : ''}

USER PREFERENCES:
${memory.userContext.preferences.map(f =>
  `- ${f.key}: ${f.value}`
).join('\n')}

RECENT ACTIVITY:
${memory.actionContext.recentCommands.slice(0, 5).map(cmd =>
  `- ${cmd.what} (${cmd.result})`
).join('\n')}

Current request: ${userMessage}

Respond with awareness of:
1. Past conversations and unresolved issues
2. User's preferences and working style
3. Recent work and patterns
`;
}
```

### Benefits of Unified Architecture

1. **Rich Context**: LLM sees complete picture of user interaction
2. **Continuity**: "Remember last week when we..." actually works
3. **Personalization**: Respects preferences without being told
4. **Proactive Assistance**: "You usually add an action after creating project notes - want to?"
5. **Better Debugging**: Full audit trail of conversations + actions
6. **Learning**: System gets smarter about user's patterns over time

---

## Part 5: Implementation Roadmap

### Phase 1: Command History (Priority 1)
**Duration**: 5-8 hours
**Impact**: High - Closes critical gap in memory architecture

- [ ] Create CommandHistoryService with SQLite schema
- [ ] Integrate into command execution pipeline
- [ ] Add to LLM context building
- [ ] Update API endpoints
- [ ] Build history query UI
- [ ] Test & commit

### Phase 2: Improve Episodes (Priority 2)
**Duration**: 8-12 hours
**Impact**: High - Makes conversation memory actually useful

- [ ] Migrate episodes to SQLite with FTS5
- [ ] Implement LLM-powered episode analysis
- [ ] Add decisions and unresolved questions tracking
- [ ] Build semantic episode retrieval
- [ ] Migrate existing episodes.json data
- [ ] Test & commit

### Phase 3: Refactor User Facts (Priority 2)
**Duration**: 6-8 hours
**Impact**: Medium - Improves code clarity and fact quality

- [ ] Rename FactsService → RecordMetadataService
- [ ] Create UserProfileService with SQLite schema
- [ ] Implement LLM-powered fact extraction
- [ ] Define structured fact schema
- [ ] Migrate existing user facts
- [ ] Test & commit

### Phase 4: Unified Memory Context (Priority 3)
**Duration**: 4-6 hours
**Impact**: High - Brings it all together

- [ ] Create MemoryContextBuilder
- [ ] Integrate all three memory systems
- [ ] Update agent prompt building
- [ ] Add memory-aware routing
- [ ] Test improved assistant responses
- [ ] Document memory architecture

### Total Estimated Time: 23-34 hours

### Success Metrics

After implementation, Bartleby should be able to:

1. **Remember Actions**: "You created a similar project note yesterday"
2. **Recall Conversations**: "Last week we discussed authentication - that's still unresolved, want to tackle it?"
3. **Respect Preferences**: Automatically use user's code style without being told
4. **Suggest Workflows**: "You often create actions after project notes - want to add one?"
5. **Provide Continuity**: Feel like talking to someone who knows your work

---

## Conclusion

Bartleby's memory architecture has a solid foundation but is underutilizing available AI capabilities. Key improvements:

1. **Add Command History** - Critical missing piece (action memory)
2. **Use LLM for Analysis** - We're an AI assistant, use AI intelligence
3. **Migrate to SQLite** - Proper querying and indexing
4. **Clarify Architecture** - Separate concerns, clear naming
5. **Unify Context** - Build rich memory context for agent

These changes will transform Bartleby from a tool that forgets what you do into an assistant that learns from every interaction and provides genuinely helpful, context-aware assistance.

The investment (23-34 hours) is justified by the dramatic improvement in user experience and assistant effectiveness.
