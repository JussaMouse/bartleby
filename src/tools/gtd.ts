// src/tools/gtd.ts
import { Tool } from './types.js';
import { loadConfig } from '../config.js';

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
      /^add\s+(task|action|todo)\s*:?\s*(.+)$/i,
      /^(new|create)\s+(task|action|todo)\s*:?\s*(.+)$/i,
      /^add\s+to\s+(tasks?|actions?|list)\s*:?\s*(.+)$/i,
    ],
    keywords: {
      verbs: ['add', 'create', 'new', 'make'],
      nouns: ['task', 'action', 'todo', 'item'],
    },
    examples: ['add task buy milk', 'new action call dentist', 'add task report due:friday', 'new action: drive home (due 5pm)'],
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
    let dueDate: string | undefined;

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

    // Parse due date - multiple formats supported:
    // due:today, due:tomorrow, due:2026-01-15
    // (due today), (due 8pm), (due tomorrow)
    // by tomorrow, by friday, by 5pm
    let dueMatch = description.match(/due:(\S+)/i);
    let dueStr: string | null = null;
    
    if (dueMatch) {
      dueStr = dueMatch[1].toLowerCase();
      description = description.replace(/due:\S+/i, '').trim();
    } else {
      // Try parenthetical format: (due TODAY), (due 8pm), (due: 8pm)
      const parenMatch = description.match(/\(due:?\s*([^)]+)\)/i);
      if (parenMatch) {
        dueStr = parenMatch[1].toLowerCase().trim();
        description = description.replace(/\(due\s+[^)]+\)/i, '').trim();
      } else {
        // Try "by DATE" format
        const byMatch = description.match(/\bby\s+(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}(?:am|pm)?)\b/i);
        if (byMatch) {
          dueStr = byMatch[1].toLowerCase();
          description = description.replace(/\bby\s+(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}(?:am|pm)?)\b/i, '').trim();
        }
      }
    }
    
    if (dueStr) {
      const today = new Date();
      
      // Handle relative dates
      if (dueStr === 'today' || /^\d{1,2}(?::\d{2})?(?:am|pm)?$/.test(dueStr)) {
        // Today or a time today (8pm, 8:33pm)
        dueDate = today.toISOString().split('T')[0];
      } else if (dueStr === 'tomorrow') {
        today.setDate(today.getDate() + 1);
        dueDate = today.toISOString().split('T')[0];
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(dueStr)) {
        // ISO date format
        dueDate = dueStr;
      } else {
        // Try day of week
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const dayIndex = days.indexOf(dueStr);
        if (dayIndex !== -1) {
          const currentDay = today.getDay();
          let daysUntil = dayIndex - currentDay;
          if (daysUntil <= 0) daysUntil += 7; // Next week if today or past
          today.setDate(today.getDate() + daysUntil);
          dueDate = today.toISOString().split('T')[0];
        } else {
          // Try MM/DD or DD/MM format based on config (assume current year)
          const slashMatch = dueStr.match(/^(\d{1,2})\/(\d{1,2})$/);
          if (slashMatch) {
            const config = loadConfig();
            const dateFormat = config.calendar.dateFormat;
            
            let month: number, day: number;
            if (dateFormat === 'dmy') {
              // DD/MM format (international)
              day = parseInt(slashMatch[1], 10);
              month = parseInt(slashMatch[2], 10) - 1; // 0-indexed
            } else {
              // MM/DD format (US default)
              month = parseInt(slashMatch[1], 10) - 1; // 0-indexed
              day = parseInt(slashMatch[2], 10);
            }
            
            const year = today.getFullYear();
            const parsed = new Date(year, month, day);
            // If date is in the past, assume next year
            if (parsed < today) {
              parsed.setFullYear(year + 1);
            }
            dueDate = parsed.toISOString().split('T')[0];
          } else {
            // Try to parse as generic date string with current year context
            const parsed = new Date(dueStr);
            if (!isNaN(parsed.getTime())) {
              // Fix year if it defaulted to something weird
              if (parsed.getFullYear() < 2020) {
                parsed.setFullYear(today.getFullYear());
              }
              dueDate = parsed.toISOString().split('T')[0];
            }
          }
        }
      }
    }

    return { description, context, project, dueDate };
  },

  execute: async (args, context) => {
    const { description, context: ctx, project, dueDate } = args as {
      description: string;
      context?: string;
      project?: string;
      dueDate?: string;
    };

    if (!description) {
      return 'Please provide a task description. Example: add task buy milk @errands';
    }

    const task = context.services.garden.addTask(description, ctx || '@inbox', project, dueDate);

    let response = `✓ Added: "${task.title}"`;
    if (task.context) response += ` (${task.context})`;
    if (task.project) response += ` [${task.project}]`;
    if (task.due_date) response += ` [due: ${task.due_date}]`;

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
      /^remember\s+(?!that\s+i\s)(.+)$/i,  // "remember X" but NOT "remember that i..."
      /^note\s+to\s+self\s*:?\s*(.+)$/i,
    ],
    keywords: {
      verbs: ['capture', 'note', 'jot'],  // Removed 'remember' - too ambiguous
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

export const showOverdue: Tool = {
  name: 'showOverdue',
  description: 'Show actions that are past their due date',

  routing: {
    patterns: [
      /^(show|list|view)\s+overdue(\s+actions?)?$/i,
      /^overdue(\s+actions?)?$/i,
      /^what('s| is)\s+overdue/i,
    ],
    keywords: {
      verbs: ['show', 'list', 'view'],
      nouns: ['overdue', 'late', 'past due'],
    },
    priority: 85,
  },

  execute: async (args, context) => {
    const overdue = context.services.garden.getOverdueTasks();

    if (overdue.length === 0) {
      return '✓ No overdue actions. You\'re all caught up!';
    }

    // Get all active tasks to find the correct global numbering
    const allTasks = context.services.garden.getTasks({ status: 'active' });
    const taskIdToNumber = new Map<string, number>();
    allTasks.forEach((t, i) => taskIdToNumber.set(t.id, i + 1));

    const lines = [`**Overdue Actions** (${overdue.length})\n`];
    const today = new Date();
    
    overdue.forEach((t) => {
      const globalNum = taskIdToNumber.get(t.id) || '?';
      const dueDate = new Date(t.due_date!);
      const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
      const daysStr = daysOverdue === 1 ? '1 day' : `${daysOverdue} days`;
      
      lines.push(`  ${globalNum}. ${t.title}`);
      lines.push(`     ⚠️ Due: ${t.due_date} (${daysStr} ago)`);
      if (t.context && t.context !== '@inbox') {
        lines.push(`     ${t.context}`);
      }
    });

    lines.push('\n💡 Mark done: `done <number>` (numbers match "show next actions")');
    
    return lines.join('\n');
  },
};

export const gtdTools: Tool[] = [
  viewNextActions,
  addTask,
  markDone,
  capture,
  showWaitingFor,
  showOverdue,
];
