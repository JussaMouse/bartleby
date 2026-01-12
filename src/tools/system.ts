// src/tools/system.ts
import { Tool } from './types.js';

// === Help Subsections ===

const HELP_OVERVIEW = `
**Bartleby Commands**

Type \`help <topic>\` for details on any section.

**GTD** — Task management (help gtd)
**Calendar** — Events & scheduling (help calendar)
**Contacts** — People you know (help contacts)
**Memory** — What Bartleby remembers (help memory)
**Shed** — Document library (help shed)
**Reminders** — Scheduled notifications (help reminders)
**Settings** — Configuration (help settings)
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

**Tips**
• Process your inbox regularly — items waiting > 2 days appear at startup
• Use contexts to batch similar tasks (@calls, @errands, @computer)
• Projects group related tasks but aren't actionable themselves
• "capture" is fastest for quick thoughts — sort later
`.trim();

const HELP_CALENDAR = `
**Calendar — Events & Scheduling**

Manage your schedule with natural language.

**Commands**
  calendar                Show upcoming events
  today                   Today's schedule
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
  add event quarterly review 3pm next monday

**Time Formats**
  2pm, 2:30pm, 14:00, noon, midnight
  tomorrow, monday, wed, next friday

**Settings** (via "change calendar settings")
  • Timezone — detected automatically, confirm or change
  • Default duration — 30m, 1h, or 90m
  • Ambiguous times — when you say "3" without am/pm
  • Week starts — Sunday or Monday
  • Reminders — Signal notification before events

**Tips**
• Bartleby shows today's events at startup
• If you have Signal configured, set reminders for notifications
• Say "today" anytime to see your schedule
• Events without am/pm use your "ambiguous time" preference
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

**Tips**
• Contacts are stored in your Garden as markdown files
• You can edit contact files directly in garden/
• Bartleby learns relationships: "my sister Sarah" → remembers
`.trim();

const HELP_MEMORY = `
**Memory — Personal Context**

Bartleby remembers your conversations and learns about you.

**Commands**
  what did we talk about <topic>   Search past conversations
  I prefer <preference>            Tell Bartleby a preference
  what do you know about me        View your profile
  done checking <followup>         Clear a pending follow-up

**What's Remembered**
• **Episodes** — summaries of past conversations
• **Facts** — preferences, habits, goals, relationships
• **Follow-ups** — things you said you'd do

**Examples**
  what did we talk about the budget
  I prefer morning meetings
  remember that I like tea not coffee
  what do you know about me

**Tips**
• Pending follow-ups appear at startup
• Say "my wife Sarah" and Bartleby remembers the relationship
• Preferences affect how Bartleby helps you
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

**Notifications**
• Console: Always shown in terminal
• Signal: If configured, sends to your phone

**Tips**
• Calendar events can auto-schedule reminders (see help calendar)
• Daily reminders repeat until cancelled
• Check "show reminders" to see what's pending
`.trim();

const HELP_SETTINGS = `
**Settings — Configuration**

Bartleby's settings live in the \`.env\` file — it's the source of truth.

**Conversational Setup**
Instead of editing .env directly, talk to Bartleby:
  change calendar settings    Walk through calendar preferences
  reset calendar              Clear and restart calendar setup

Bartleby asks questions, then outputs the .env values to copy.

**Manual Configuration**
Edit \`.env\` directly for:
  • LLM model endpoints
  • File paths
  • Signal notifications
  • Weather API

**Current Config Sections**
  LLM — Model URLs for router/fast/thinking/embeddings
  Paths — garden/, shed/, database/, logs/
  Calendar — timezone, duration, reminders
  Presence — startup/shutdown messages, scheduled moments
  Signal — Mobile notifications
  Weather — OpenWeatherMap API

**Tips**
• After editing .env, restart Bartleby to apply changes
• "status" shows which LLM tiers are connected
• Calendar/Presence settings have conversational setup
`.trim();

const HELP_SECTIONS: Record<string, string> = {
  gtd: HELP_GTD,
  tasks: HELP_GTD,
  calendar: HELP_CALENDAR,
  events: HELP_CALENDAR,
  contacts: HELP_CONTACTS,
  people: HELP_CONTACTS,
  memory: HELP_MEMORY,
  remember: HELP_MEMORY,
  context: HELP_MEMORY,
  shed: HELP_SHED,
  documents: HELP_SHED,
  docs: HELP_SHED,
  rag: HELP_SHED,
  reminders: HELP_REMINDERS,
  reminder: HELP_REMINDERS,
  schedule: HELP_REMINDERS,
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
  Memory: ${episodes} conversation(s)
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
