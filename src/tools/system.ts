// src/tools/system.ts
import { Tool } from './types.js';

export const help: Tool = {
  name: 'help',
  description: 'Show available commands',

  routing: {
    patterns: [/^help$/i, /^commands?$/i, /^\?$/],
    keywords: { verbs: ['help'], nouns: ['commands'] },
    priority: 100,
  },

  execute: async () => {
    return `
**Bartleby Commands**

**GTD**
  show next actions     List tasks
  add task <text>       Add task (use @context +project)
  done <n>              Complete task by number
  capture <text>        Quick capture to inbox
  waiting for           Show delegated items

**Calendar**
  calendar              Upcoming events
  today                 Today's schedule
  add event <details>   Create event

**Contacts**
  add contact <name>    Create contact
  find <name>           Search contacts

**Memory**
  what did we talk about <topic>   Search conversations
  I prefer <preference>            Set preference
  what do you know about me        View profile

**Shed (Documents)**
  ingest <filepath>     Add document to library
  list sources          Show ingested documents
  ask shed <question>   Query your documents

**Reminders**
  remind me <msg> at <time>   Set reminder
  show reminders              List scheduled
  cancel reminder <n>         Cancel reminder

**System**
  help                  This help
  status                System status
  weather               Current weather
  quit                  Exit
`.trim();
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

    const llmRouter = context.services.llm.isHealthy('router') ? '✓' : '✗';
    const llmFast = context.services.llm.isHealthy('fast') ? '✓' : '✗';
    const llmThinking = context.services.llm.isHealthy('thinking') ? '✓' : '✗';
    const embeddings = context.services.embeddings.isAvailable() ? '✓' : '✗';

    return `
**Bartleby Status**
─────────────────
Tasks: ${tasks.length} active (${inbox.length} in inbox)
Memory: ${episodes} conversations
LLM: Router ${llmRouter} | Fast ${llmFast} | Thinking ${llmThinking}
Embeddings: ${embeddings}
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
