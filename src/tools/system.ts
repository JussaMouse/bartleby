// src/tools/system.ts
import { Tool } from './types.js';

// === Help Subsections ===

const HELP_OVERVIEW = `
**Bartleby Commands**

Type \`help <topic>\` for details and .env settings.

**GTD** — Task management (help gtd)
**Calendar** — Events & scheduling (help calendar)
**Contacts** — People you know (help contacts)
**Context** — What Bartleby learns about you (help context)
**Shed** — Document library (help shed)
**Reminders** — Scheduled notifications (help reminders)
**Presence** — Proactive behaviors (help presence)
**LLM** — Model configuration (help llm)
**Weather** — Current conditions (help weather)
**Settings** — All configuration (help settings)
**System** — status, quit
`.trim();

const HELP_GTD = `
**GTD — Getting Things Done**

Bartleby implements David Allen's GTD methodology.

**Commands**
  show next actions       List active tasks by context
  tasks                   Same as above
  add task <text>         Add a new task
  done <n>                Complete task by number
  done <partial title>    Complete by partial match
  capture <text>          Quick capture to inbox
  waiting for             Show delegated items

**Inline Syntax**
  @context    Assign context (where/how to do it)
  +project    Assign to project

**Examples**
  add task buy milk @errands
  add task review PR @computer +website
  add task call Sarah @phone +hiring
  capture remember to check on the budget
  done 3
  done buy milk

**.env Settings**
  GARDEN_PATH=./garden    Where task markdown files are stored

**Tips**
• Process your inbox regularly — items waiting > 2 days appear at startup
• Use contexts to batch similar tasks (@calls, @errands, @computer)
• Projects group related tasks but aren't actionable themselves
• "capture" is fastest for quick thoughts — sort later
`.trim();

const HELP_CALENDAR = `
**Calendar — Unified Temporal View**

The calendar shows everything time-based in one place:
• **Events** — meetings, appointments, activities
• **Deadlines** — task due dates from GTD
• **Reminders** — scheduled notifications

**Commands**
  calendar                Show upcoming (events, deadlines, reminders)
  today                   Today's unified schedule
  add event <details>     Create an event
  change calendar settings   Configure preferences
  reset calendar          Clear settings, restart setup

**Event Syntax**
  add event <title> at <time>
  add event <title> <time> <day>
  add event <title> tomorrow at <time>

**Examples**
  add event dentist at 2pm
  add event team standup 9am tomorrow
  add event lunch with Sarah at noon wednesday

**Reminders** (see "help reminders")
  remind me to stretch in 30 min
  send me a msg in 5 min 'time to move'

**Task Due Dates** (from GTD)
When you add a task with a due date, it appears in calendar:
  add task finish report due friday

**Time Formats**
  2pm, 2:30pm, 14:00, noon, midnight
  tomorrow, monday, wed, next friday
  in 30 min, in 2 hours

**.env Settings**
  CALENDAR_TIMEZONE=America/Los_Angeles   Your timezone
  CALENDAR_DEFAULT_DURATION=60            Event length in minutes
  CALENDAR_AMBIGUOUS_TIME=afternoon       morning|afternoon|ask
  CALENDAR_WEEK_START=sunday              sunday|monday
  CALENDAR_REMINDER_MINUTES=15            0=off, or minutes before

**Tips**
• "today" shows events, deadlines, and reminders together
• Task due dates automatically appear in your calendar
• Reminders from "remind me" also show in calendar view
`.trim();

const HELP_CONTACTS = `
**Contacts — People You Know**

Store and search contact information.

**Commands**
  add contact <name>      Create a new contact
  find <name>             Search by name or email

**Adding Details**
  add contact Sarah Chen, email sarah@example.com, phone 555-1234

**Examples**
  add contact Mom
  add contact Dr. Smith, phone 555-0123
  find sarah
  find @example.com

**.env Settings**
  GARDEN_PATH=./garden    Contacts are stored as markdown in garden/

**Tips**
• Contacts are stored in your Garden as markdown files
• You can edit contact files directly in garden/
• Bartleby learns relationships: "my sister Sarah" → remembers
`.trim();

const HELP_CONTEXT = `
**Context — What Bartleby Learns About You**

Bartleby builds a profile of you over time: preferences, habits,
goals, relationships, and conversation history.

**Commands**
  I am a <type> person             Tell Bartleby about yourself
  I prefer <preference>            Set a preference
  I like/love/hate <thing>         Express preferences
  what do you know about me        View your profile
  what did we talk about <topic>   Search past conversations
  done checking <followup>         Clear a pending follow-up

**What's Tracked**
• **Preferences** — "I prefer morning meetings", "I'm a morning person"
• **Habits** — "I wake up at 6am", "I always drink tea"
• **Goals** — "I want to learn piano", "I'm trying to exercise more"
• **Relationships** — "my wife Sarah", "my boss Tom"
• **Episodes** — summaries of past conversations
• **Follow-ups** — things you said you'd do

**Examples**
  I am a morning person
  I prefer short meetings
  remember that I like tea not coffee
  my wife Sarah is a doctor
  what do you know about me
  what did we talk about the budget

**.env Settings**
  DATABASE_PATH=./database         Context stored in database/memory/

**Related: Presence** (see help presence)
Context feeds the Presence system, which surfaces relevant info:
  PRESENCE_STARTUP=true            Show follow-ups at startup
  PRESENCE_CONTEXTUAL=true         Surface related context during chat

**Tips**
• Just talk naturally — "I'm a vegetarian", "I hate mornings"
• Pending follow-ups appear at startup
• Say "my sister Sarah" and Bartleby remembers the relationship
• Your profile grows over time from conversations
`.trim();

const HELP_SHED = `
**Shed — Document Library**

Ingest documents and query them with semantic search (RAG).

**Commands**
  ingest <filepath>       Add a document to the library
  list sources            Show all ingested documents
  ask shed <question>     Query your documents

**Supported Formats**
  .md, .txt, .pdf

**Examples**
  ingest ~/Documents/meeting-notes.md
  ingest ./contracts/agreement.pdf
  list sources
  ask shed what were the key decisions from the planning meeting
  ask shed summarize the contract terms

**How It Works**
1. Documents are chunked into sections
2. Each chunk gets a vector embedding
3. Your question is matched to relevant chunks
4. Bartleby synthesizes an answer from the context

**.env Settings**
  SHED_PATH=./shed                Where documents are stored
  EMBEDDINGS_MODEL=...            Model for vector embeddings
  EMBEDDINGS_URL=...              Embedding API endpoint
  EMBEDDINGS_DIMENSIONS=4096      Vector dimensions

**Tips**
• Ingest meeting notes, articles, documentation, contracts
• More specific questions get better answers
• "ask shed" uses the Thinking model for complex reasoning
• Original files stay in shed/sources/
`.trim();

const HELP_REMINDERS = `
**Reminders — Scheduled Notifications**

Set one-time or recurring reminders.

**Commands**
  remind me <msg> at <time>    One-time reminder
  remind me <msg> in <duration>   Relative time
  show reminders               List all scheduled
  cancel reminder <n>          Cancel by number
  daily at <hour> <msg>        Recurring daily

**Time Formats**
  at 3pm, at 15:00, at noon
  in 30 minutes, in 2 hours
  tomorrow at 9am

**Examples**
  remind me to call mom at 5pm
  remind me about standup in 30 minutes
  remind me to take meds tomorrow at 8am
  daily at 9am check email
  show reminders
  cancel reminder 2

**.env Settings**
  SCHEDULER_ENABLED=true          Enable/disable reminder system
  SCHEDULER_CHECK_INTERVAL=60000  How often to check (ms)

**Signal Notifications** (optional)
  SIGNAL_ENABLED=true             Enable mobile notifications
  SIGNAL_CLI_PATH=/usr/local/bin/signal-cli
  SIGNAL_NUMBER=+1234567890       Your Signal number
  SIGNAL_RECIPIENT=+0987654321    Who receives notifications

**Tips**
• Console: Reminders always show in terminal
• Signal: If configured, also sends to your phone
• Calendar events can auto-schedule reminders (see help calendar)
• Daily reminders repeat until cancelled
`.trim();

const HELP_SETTINGS = `
**Settings — Configuration**

Bartleby's settings live in the \`.env\` file — it's the source of truth.

**Conversational Setup**
Instead of editing .env directly, talk to Bartleby:
  change calendar settings    Walk through calendar preferences
  reset calendar              Clear and restart calendar setup

Bartleby asks questions, then outputs the .env values to copy.

**All .env Sections**

*LLM Models* — see help llm
  ROUTER_MODEL, ROUTER_URL, ROUTER_MAX_TOKENS
  FAST_MODEL, FAST_URL, FAST_MAX_TOKENS
  THINKING_MODEL, THINKING_URL, THINKING_MAX_TOKENS
  EMBEDDINGS_MODEL, EMBEDDINGS_URL, EMBEDDINGS_DIMENSIONS

*Paths*
  GARDEN_PATH=./garden
  SHED_PATH=./shed
  DATABASE_PATH=./database
  LOG_DIR=./logs

*Calendar* — see help calendar
*Presence* — see help presence
*Reminders/Signal* — see help reminders
*Weather* — see help weather

**Tips**
• After editing .env, restart Bartleby to apply changes
• "status" shows which LLM tiers are connected
• Use "help <topic>" for settings specific to each area
`.trim();

const HELP_PRESENCE = `
**Presence — Bartleby's Initiative Layer**

Presence controls when Bartleby speaks unprompted.

**Moments**
• **Startup** — Context shown when you start Bartleby
• **Shutdown** — Shown before you quit (tomorrow preview)
• **Morning** — Scheduled morning review
• **Evening** — Scheduled evening wind-down
• **Weekly** — Scheduled weekly review
• **Contextual** — Related info surfaced during conversation

**.env Settings**
  PRESENCE_STARTUP=true           Show opener at startup
  PRESENCE_SHUTDOWN=true          Show tomorrow preview at quit
  PRESENCE_SCHEDULED=true         Enable morning/evening/weekly
  PRESENCE_CONTEXTUAL=true        Surface related follow-ups
  PRESENCE_IDLE=false             Nudge after idle period
  PRESENCE_IDLE_MINUTES=5         How long before idle nudge

**Scheduled Moment Times** (24h format)
  PRESENCE_MORNING_HOUR=8         Morning review hour
  PRESENCE_EVENING_HOUR=18        Evening wind-down hour
  PRESENCE_WEEKLY_DAY=0           Day for weekly (0=Sunday)
  PRESENCE_WEEKLY_HOUR=9          Weekly review hour

**What Gets Surfaced**
• Today's events (from Calendar)
• Pending follow-ups (from Context)
• Stale inbox items (from GTD)
• Overdue tasks (from GTD)
• Last conversation summary (from Context)
`.trim();

const HELP_LLM = `
**LLM — Language Model Configuration**

Bartleby uses a 4-tier model system for different tasks.

**Tiers**
  Router    0.5-1B    Classifies SIMPLE vs COMPLEX (~50ms)
  Fast      7-30B     Simple queries, single tool calls (~500ms)
  Thinking  30B+      Multi-step reasoning, code (2-10s)
  Embed     ~1B       Text to vectors for semantic search (~100ms)

**.env Settings**

*Router Tier* — Complexity classification
  ROUTER_MODEL=mlx-community/Qwen3-0.6B-4bit
  ROUTER_URL=http://127.0.0.1:8080/v1
  ROUTER_MAX_TOKENS=100

*Fast Tier* — Simple queries
  FAST_MODEL=mlx-community/Qwen3-30B-A3B-4bit
  FAST_URL=http://127.0.0.1:8081/v1
  FAST_MAX_TOKENS=4096

*Thinking Tier* — Complex reasoning
  THINKING_MODEL=mlx-community/Qwen3-30B-A3B-Thinking-2507-4bit
  THINKING_URL=http://127.0.0.1:8083/v1
  THINKING_MAX_TOKENS=8192
  THINKING_BUDGET=4096

*Embeddings* — Semantic search
  EMBEDDINGS_MODEL=Qwen/Qwen3-Embedding-8B
  EMBEDDINGS_URL=http://127.0.0.1:8084/v1
  EMBEDDINGS_DIMENSIONS=4096

*Other*
  HEALTH_TIMEOUT=35000            Connection timeout (ms)
  AGENT_MAX_ITERATIONS=10         Max steps in agentic loop

**Tips**
• Run "status" to see which tiers are connected
• Most requests use deterministic routing, not LLM
• Increase HEALTH_TIMEOUT for slow model cold starts
`.trim();

const HELP_WEATHER = `
**Weather — Current Conditions**

Get weather info (requires OpenWeatherMap API key).

**Commands**
  weather                 Show current weather

**.env Settings**
  WEATHER_CITY=Seattle            City name
  WEATHER_UNITS=F                 C or F
  OPENWEATHERMAP_API_KEY=...      API key from openweathermap.org

**Setup**
1. Get free API key at openweathermap.org
2. Add to .env: OPENWEATHERMAP_API_KEY=your-key
3. Set WEATHER_CITY=YourCity
4. Restart Bartleby

**Tips**
• Weather is optional — Bartleby works without it
• Free tier allows ~60 requests/minute
`.trim();

const HELP_SECTIONS: Record<string, string> = {
  gtd: HELP_GTD,
  tasks: HELP_GTD,
  calendar: HELP_CALENDAR,
  events: HELP_CALENDAR,
  contacts: HELP_CONTACTS,
  people: HELP_CONTACTS,
  memory: HELP_CONTEXT,
  remember: HELP_CONTEXT,
  context: HELP_CONTEXT,
  'personal context': HELP_CONTEXT,
  profile: HELP_CONTEXT,
  shed: HELP_SHED,
  documents: HELP_SHED,
  docs: HELP_SHED,
  rag: HELP_SHED,
  reminders: HELP_REMINDERS,
  reminder: HELP_REMINDERS,
  schedule: HELP_REMINDERS,
  presence: HELP_PRESENCE,
  proactive: HELP_PRESENCE,
  initiative: HELP_PRESENCE,
  llm: HELP_LLM,
  models: HELP_LLM,
  ai: HELP_LLM,
  weather: HELP_WEATHER,
  settings: HELP_SETTINGS,
  config: HELP_SETTINGS,
  configuration: HELP_SETTINGS,
};

export const help: Tool = {
  name: 'help',
  description: 'Show available commands',

  routing: {
    patterns: [
      /^help$/i,
      /^help\s+(\w+)$/i,
      /^commands?$/i,
      /^\?$/,
      /^\?\s*(\w+)$/i,
    ],
    keywords: { verbs: ['help'], nouns: ['commands'] },
    priority: 100,
  },

  parseArgs: (input) => {
    const match = input.match(/^(?:help|\?)\s+(\w+)$/i);
    return { topic: match ? match[1].toLowerCase() : null };
  },

  execute: async (args) => {
    const { topic } = args as { topic: string | null };

    if (topic && HELP_SECTIONS[topic]) {
      return HELP_SECTIONS[topic];
    }

    if (topic) {
      return `Unknown help topic: "${topic}"\n\n${HELP_OVERVIEW}`;
    }

    return HELP_OVERVIEW;
  },
};

export const status: Tool = {
  name: 'status',
  description: 'Show system status',

  routing: {
    patterns: [/^status$/i, /^sys(tem)?\s*status$/i],
    priority: 50,
  },

  execute: async (args, context) => {
    const tasks = context.services.garden.getTasks({ status: 'active' });
    const inbox = tasks.filter(t => t.context === '@inbox');
    const episodes = context.services.context.getEpisodeCount();
    const sources = context.services.shed.listSources?.() || [];

    const llmRouter = context.services.llm.isHealthy('router') ? '✓' : '✗';
    const llmFast = context.services.llm.isHealthy('fast') ? '✓' : '✗';
    const llmThinking = context.services.llm.isHealthy('thinking') ? '✓' : '✗';
    const embeddings = context.services.embeddings.isAvailable() ? '✓' : '✗';
    const signal = context.services.signal.isEnabled() ? '✓' : '✗';

    const todayEvents = context.services.calendar.getForDay(new Date());
    const presenceConfig = context.services.presence.getConfig();

    return `
**Bartleby Status**
─────────────────────────────────────
**Data**
  Tasks: ${tasks.length} active (${inbox.length} in inbox)
  Events today: ${todayEvents.length}
  Context: ${episodes} conversation(s)
  Shed: ${sources.length} document(s)

**LLM**
  Router: ${llmRouter}  Fast: ${llmFast}  Thinking: ${llmThinking}
  Embeddings: ${embeddings}

**Integrations**
  Signal: ${signal}

**Presence**
  Startup: ${presenceConfig.startup ? '✓' : '✗'}  Shutdown: ${presenceConfig.shutdown ? '✓' : '✗'}  Scheduled: ${presenceConfig.scheduled ? '✓' : '✗'}
─────────────────────────────────────
`.trim();
  },
};

export const quit: Tool = {
  name: 'quit',
  description: 'Exit Bartleby',

  routing: {
    patterns: [/^(quit|exit|bye|goodbye)$/i],
    priority: 100,
  },

  execute: async () => '__EXIT__',
};

export const systemTools: Tool[] = [help, status, quit];
