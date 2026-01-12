// src/tools/gtd.ts
import { Tool } from './types.js';

export const viewNextActions: Tool = {
  name: 'viewNextActions',
  description: 'Display the current list of next actions',

  routing: {
    patterns: [
      /^(show|list|view|display)\s+(my\s+)?(next\s+)?actions?$/i,
      /^next\s+actions?$/i,
      /^what('s| is| are)\s+(on\s+)?(my\s+)?(plate|list|todo)/i,
      /^tasks?$/i,
    ],
    keywords: {
      verbs: ['show', 'list', 'view', 'display', 'see', 'get'],
      nouns: ['next actions', 'tasks', 'todos', 'to-dos', 'actions', 'todo list'],
    },
    examples: [
      'show next actions',
      "what's on my plate",
      'what do I need to do',
      'list my tasks',
    ],
    priority: 100,
  },

  execute: async (args, context) => {
    const tasks = context.services.garden.getTasks({ status: 'active' });

    if (tasks.length === 0) {
      return 'No next actions found. Your list is clear! 🎉';
    }

    // Group by context
    const byContext = new Map<string, typeof tasks>();
    for (const task of tasks) {
      const ctx = task.context || '@uncategorized';
      if (!byContext.has(ctx)) byContext.set(ctx, []);
      byContext.get(ctx)!.push(task);
    }

    const lines: string[] = [`**Next Actions** (${tasks.length})`];
    let num = 1;

    for (const [ctx, ctxTasks] of byContext) {
      lines.push(`\n${ctx}`);
      for (const task of ctxTasks) {
        const proj = task.project ? ` (${task.project})` : '';
        const due = task.due_date ? ` [due: ${task.due_date}]` : '';
        lines.push(`  ${num}. ${task.title}${proj}${due}`);
        num++;
      }
    }

    return lines.join('\n');
  },
};

export const addTask: Tool = {
  name: 'addTask',
  description: 'Add a new task',

  routing: {
    patterns: [
      /^add\s+(task|action|todo)\s+(.+)$/i,
      /^(new|create)\s+(task|action|todo)\s+(.+)$/i,
      /^add\s+to\s+(tasks?|actions?|list)\s*:?\s*(.+)$/i,
    ],
    keywords: {
      verbs: ['add', 'create', 'new', 'make'],
      nouns: ['task', 'action', 'todo', 'item'],
    },
    examples: ['add task buy milk', 'new action call dentist'],
    priority: 90,
  },

  parseArgs: (input, match) => {
    let description = '';

    if (match) {
      description = match[match.length - 1] || '';
    } else {
      description = input.replace(/^(add|create|new)\s+(task|action|todo|to\s+list)\s*/i, '').trim();
    }

    // Parse inline context (@) and project (+)
    let context: string | undefined;
    let project: string | undefined;

    const contextMatch = description.match(/@(\w+)/);
    if (contextMatch) {
      context = `@${contextMatch[1]}`;
      description = description.replace(/@\w+/, '').trim();
    }

    const projectMatch = description.match(/\+(\w+)/);
    if (projectMatch) {
      project = projectMatch[1];
      description = description.replace(/\+\w+/, '').trim();
    }

    return { description, context, project };
  },

  execute: async (args, context) => {
    const { description, context: ctx, project } = args as {
      description: string;
      context?: string;
      project?: string;
    };

    if (!description) {
      return 'Please provide a task description. Example: add task buy milk @errands';
    }

    const task = context.services.garden.addTask(description, ctx || '@inbox', project);

    let response = `✓ Added: "${task.title}"`;
    if (task.context) response += ` (${task.context})`;
    if (task.project) response += ` [${task.project}]`;

    return response;
  },
};

export const markDone: Tool = {
  name: 'markDone',
  description: 'Mark a task as complete',

  routing: {
    patterns: [
      /^(done|complete|finish|finished|check)\s+(\d+)$/i,
      /^(done|complete|finish|finished)\s+(.+)$/i,
      /^(\d+)\s+(done|complete|finished)$/i,
    ],
    keywords: {
      verbs: ['done', 'complete', 'finish', 'mark', 'check'],
      nouns: ['task', 'action', 'item'],
    },
    examples: ['done 1', 'complete 3', 'mark done buy milk'],
    priority: 95,
  },

  parseArgs: (input, match) => {
    if (match) {
      for (let i = match.length - 1; i >= 1; i--) {
        const val = match[i];
        if (val && !['done', 'complete', 'finish', 'finished', 'check'].includes(val.toLowerCase())) {
          const num = parseInt(val);
          if (!isNaN(num)) return { identifier: num };
          return { identifier: val };
        }
      }
    }

    const cleaned = input.replace(/^(done|complete|finish|finished|check)\s*/i, '').trim();
    const num = parseInt(cleaned);
    return { identifier: isNaN(num) ? cleaned : num };
  },

  execute: async (args, context) => {
    const { identifier } = args as { identifier: string | number };

    if (!identifier) {
      return 'Please specify which task to complete. Example: done 1';
    }

    const completed = context.services.garden.completeTask(identifier);

    if (!completed) {
      return `Task not found: "${identifier}". Try "show next actions" to see the list.`;
    }

    return `✓ Completed: "${completed.title}"`;
  },
};

export const capture: Tool = {
  name: 'capture',
  description: 'Quick capture to inbox',

  routing: {
    patterns: [
      /^capture\s+(.+)$/i,
      /^inbox\s+(.+)$/i,
      /^remember\s+(.+)$/i,
      /^note\s+to\s+self\s*:?\s*(.+)$/i,
    ],
    keywords: {
      verbs: ['capture', 'remember', 'note', 'jot'],
      nouns: ['inbox', 'self', 'down'],
    },
    examples: ['capture call mom', 'inbox review article'],
    priority: 85,
  },

  parseArgs: (input, match) => {
    if (match && match[1]) return { text: match[1].trim() };
    return { text: input.replace(/^(capture|inbox|remember|note\s+to\s+self)\s*:?\s*/i, '').trim() };
  },

  execute: async (args, context) => {
    const { text } = args as { text: string };

    if (!text) {
      return 'Please provide something to capture. Example: capture call dentist';
    }

    const task = context.services.garden.captureToInbox(text);
    return `✓ Captured: "${task.title}"`;
  },
};

export const showWaitingFor: Tool = {
  name: 'showWaitingFor',
  description: 'Show delegated items',

  routing: {
    patterns: [
      /^(show|list|view)\s+(waiting\s+for|delegated)/i,
      /^waiting\s+for$/i,
    ],
    keywords: {
      verbs: ['show', 'list'],
      nouns: ['waiting', 'delegated'],
    },
    priority: 80,
  },

  execute: async (args, context) => {
    const tasks = context.services.garden.getTasks({ status: 'waiting' });

    if (tasks.length === 0) {
      return 'No items in Waiting For.';
    }

    const lines = ['**Waiting For**'];
    tasks.forEach((t, i) => {
      lines.push(`  ${i + 1}. ${t.title}${t.project ? ` (${t.project})` : ''}`);
    });

    return lines.join('\n');
  },
};

export const gtdTools: Tool[] = [
  viewNextActions,
  addTask,
  markDone,
  capture,
  showWaitingFor,
];
