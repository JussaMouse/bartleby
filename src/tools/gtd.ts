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

export const processInbox: Tool = {
  name: 'processInbox',
  description: 'Process inbox items',

  routing: {
    patterns: [
      /^process\s+inbox$/i,
      /^(show|view|list)\s+inbox$/i,
      /^inbox$/i,
    ],
    keywords: {
      verbs: ['process', 'show', 'view', 'review'],
      nouns: ['inbox'],
    },
    examples: ['process inbox', 'show inbox', 'inbox'],
    priority: 95,
  },

  execute: async (args, context) => {
    const tasks = context.services.garden.getTasks({ status: 'active', context: '@inbox' });

    if (tasks.length === 0) {
      return '📥 Inbox is empty! Nothing to process.\n\nCapture something with: capture <thought>';
    }

    const lines = [`📥 **Inbox** (${tasks.length} item${tasks.length === 1 ? '' : 's'} to process)\n`];

    tasks.forEach((task, i) => {
      const age = Math.floor((Date.now() - new Date(task.created_at).getTime()) / (1000 * 60 * 60 * 24));
      const ageStr = age === 0 ? 'today' : age === 1 ? 'yesterday' : `${age} days ago`;
      lines.push(`${i + 1}. ${task.title}`);
      lines.push(`   captured ${ageStr}`);
    });

    lines.push('\n**For each item, decide:**');
    lines.push('• Is it actionable? → `new action <text> @context`');
    lines.push('• Multiple steps? → `new project <name>`');
    lines.push('• Not now? → Mark someday or delete');
    lines.push('• Done already? → `done <number>`');

    return lines.join('\n');
  },
};

export const addTask: Tool = {
  name: 'addTask',
  description: 'Add a new action',

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
    examples: ['new action buy milk', 'new action call dentist @phone', 'new action report due:friday', 'new action: drive home (due 5pm)'],
    priority: 90,
  },

  parseArgs: (input, match) => {
    let description = '';

    if (match) {
      description = match[match.length - 1] || '';
    } else {
      description = input.replace(/^(add|create|new)\s+(task|action|todo|to\s+list)\s*/i, '').trim();
    }

    // Strip surrounding quotes from description
    description = description.replace(/^["'](.*)["']$/, '$1').trim();

    // Parse inline context (@) and project (+)
    let context: string | undefined;
    let project: string | undefined;
    let dueDate: string | undefined;

    const contextMatch = description.match(/@(\w+)/);
    if (contextMatch) {
      context = `@${contextMatch[1]}`;
      description = description.replace(/@\w+/, '').trim();
    }

    const projectMatch = description.match(/\+([\w-]+)/);
    if (projectMatch) {
      project = projectMatch[1];
      description = description.replace(/\+[\w-]+/, '').trim();
    }

    // Parse due date - multiple formats supported:
    // due:today, due:tomorrow, due:2026-01-15, due:tomorrow am
    // (due today), (due 8pm), (due tomorrow)
    // by tomorrow, by friday, by 5pm
    // Handle due:WORD or due:WORD TIME (e.g., due:tomorrow am, due:friday 5pm)
    let dueMatch = description.match(/due:(\S+)(?:\s+(am|pm|\d{1,2}(?::\d{2})?(?:am|pm)?))?/i);
    let dueStr: string | null = null;
    
    if (dueMatch) {
      dueStr = dueMatch[1].toLowerCase();
      if (dueMatch[2]) {
        dueStr += ' ' + dueMatch[2].toLowerCase(); // Include time modifier
      }
      // Remove the full match from description
      description = description.replace(/due:\S+(?:\s+(?:am|pm|\d{1,2}(?::\d{2})?(?:am|pm)?))?/i, '').trim();
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
      return 'Please provide an action description. Example: new action buy milk @errands';
    }

    // Auto-create project if it doesn't exist
    let projectCreated = false;
    if (project) {
      const existingProjects = context.services.garden.getByType('project');
      const projectSlug = project.toLowerCase();
      const projectExists = existingProjects.some(p => 
        p.title.toLowerCase() === projectSlug || 
        p.title.toLowerCase().replace(/\s+/g, '-') === projectSlug
      );
      
      if (!projectExists) {
        context.services.garden.create({
          type: 'project',
          title: project.charAt(0).toUpperCase() + project.slice(1), // Capitalize
          status: 'active',
        });
        projectCreated = true;
      }
    }

    const task = context.services.garden.addTask(description, ctx || '@inbox', project, dueDate);

    let response = `✓ Added: "${task.title}"`;
    if (task.context) response += ` (${task.context})`;
    if (task.project) response += ` [${task.project}]`;
    if (task.due_date) response += ` [due: ${task.due_date}]`;
    if (projectCreated) response += `\n✓ Created project: "${project}"`;

    return response;
  },
};

export const markDone: Tool = {
  name: 'markDone',
  description: 'Mark an action as complete',

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
      return 'Please specify which action to complete. Example: done 1';
    }

    const completed = context.services.garden.completeTask(identifier);

    if (!completed) {
      return `Action not found: "${identifier}". Try "show next actions" to see the list.`;
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

export const addProject: Tool = {
  name: 'addProject',
  description: 'Create a new project',

  routing: {
    patterns: [
      /^(new|create|add)\s+project\s*:?\s*(.+)$/i,
      /^project\s*:?\s*(.+)$/i,
    ],
    keywords: {
      verbs: ['add', 'create', 'new', 'start'],
      nouns: ['project'],
    },
    examples: ['new project 2025 taxes', 'create project website redesign', 'add project home renovation'],
    priority: 95,  // Higher than addTask to catch "new project X"
  },

  parseArgs: (input, match) => {
    let title = '';
    if (match) {
      title = match[match.length - 1] || '';
    } else {
      title = input.replace(/^(new|create|add)\s+project\s*:?\s*/i, '').trim();
    }
    return { title };
  },

  execute: async (args, context) => {
    const { title } = args as { title: string };

    if (!title) {
      return 'Please provide a project name. Example: new project website redesign';
    }

    const project = context.services.garden.create({
      type: 'project',
      title,
      status: 'active',
    });

    return `✓ Created project: "${project.title}"\n\nAdd actions with: new action <text> +${project.title.toLowerCase().replace(/\s+/g, '-')}`;
  },
};

export const showProjects: Tool = {
  name: 'showProjects',
  description: 'List all projects',

  routing: {
    patterns: [
      /^(show|list|view)\s+(my\s+)?projects?$/i,
      /^projects?$/i,
    ],
    keywords: {
      verbs: ['show', 'list', 'view'],
      nouns: ['projects', 'project'],
    },
    examples: ['show projects', 'list projects', 'projects'],
    priority: 85,
  },

  execute: async (args, context) => {
    const allProjects = context.services.garden.getByType('project');
    const projects = allProjects.filter(r => r.status === 'active');

    if (projects.length === 0) {
      return 'No active projects.\n\nCreate one with: new project <name>';
    }

    const lines = [`**Projects** (${projects.length})\n`];

    for (const project of projects) {
      // Count actions for this project
      const projectSlug = project.title.toLowerCase().replace(/\s+/g, '-');
      const actions = context.services.garden.getTasks({ status: 'active' })
        .filter(a => a.project === projectSlug || a.project === project.title);
      
      const actionCount = actions.length;
      const nextAction = actions[0];
      
      lines.push(`• **${project.title}**`);
      if (actionCount > 0) {
        lines.push(`  ${actionCount} action(s) — Next: ${nextAction?.title || 'none'}`);
      } else {
        lines.push(`  ⚠️ No actions — add one with: new action <text> +${projectSlug}`);
      }
    }

    return lines.join('\n');
  },
};

export const createNote: Tool = {
  name: 'createNote',
  description: 'Create a new note and prompt for content',

  routing: {
    patterns: [
      /^(new|create|add)\s+note\s*:?\s*(.+)$/i,
      /^note\s*:?\s*(.+)$/i,
    ],
    keywords: {
      verbs: ['new', 'create', 'add', 'start'],
      nouns: ['note', 'notes'],
    },
    examples: ['new note meeting with Scott', 'create note project ideas', 'note: daily standup'],
    priority: 90,  // Higher than capture
  },

  parseArgs: (input, match) => {
    let title = '';
    if (match) {
      title = match[match.length - 1] || '';
    } else {
      title = input.replace(/^(new|create|add)\s+note\s*:?\s*/i, '').trim();
    }
    return { title };
  },

  execute: async (args, context) => {
    const { title } = args as { title: string };

    if (!title) {
      return 'Please provide a note title. Example: new note meeting with Scott';
    }

    // Create note with just the title
    const note = context.services.garden.create({
      type: 'note',
      title,
      status: 'active',
      content: '',
    });

    // Set pending note in session for follow-up content
    await context.services.context.setFact('system', 'pending_note_id', note.id);

    return `📝 **Note: ${note.title}**

What would you like to add to this note?
(Type your content, or "done" to finish)`;
  },
};

export const appendToNote: Tool = {
  name: 'appendToNote',
  description: 'Append content to a pending note',

  routing: {
    patterns: [],  // No patterns - checked via pending state
    keywords: { verbs: [], nouns: [] },
    examples: [],
    priority: 100,  // Very high - check first if there's a pending note
  },

  // Custom check: only match if there's a pending note
  shouldHandle: async (input: string, context) => {
    const fact = context.services.context.getFact('system', 'pending_note_id');
    const pendingNoteId = fact?.value as string | null;
    if (!pendingNoteId) return false;
    
    // "done" finishes the note
    if (input.toLowerCase().trim() === 'done') return true;
    
    // Any other input is content to append
    return true;
  },

  execute: async (args, context) => {
    const input = (args as any).__raw_input || '';
    const fact = context.services.context.getFact('system', 'pending_note_id');
    const pendingNoteId = fact?.value as string | null;
    
    if (!pendingNoteId) {
      return '';  // Shouldn't happen, but safety check
    }

    // "done" finishes the note
    if (input.toLowerCase().trim() === 'done') {
      await context.services.context.setFact('system', 'pending_note_id', null);
      const note = context.services.garden.get(pendingNoteId);
      return `✓ Note saved: "${note?.title}"`;
    }

    // Append content to note
    const note = context.services.garden.get(pendingNoteId);
    if (!note) {
      await context.services.context.setFact('system', 'pending_note_id', null);
      return 'Note not found. Starting fresh.';
    }

    const newContent = note.content ? `${note.content}\n${input}` : input;
    context.services.garden.update(note.id, { content: newContent });

    return `Added to note. Continue typing, or say "done" to finish.`;
  },
};

// === Navigation Tools ===

export const showByType: Tool = {
  name: 'showByType',
  description: 'List pages of a specific type',

  routing: {
    patterns: [
      /^show\s+(notes?|contacts?|entries?|items?|daily|lists?|media)$/i,
      /^(notes|contacts|entries)$/i,
    ],
    keywords: {
      verbs: ['show', 'list', 'view'],
      nouns: ['notes', 'contacts', 'entries', 'items', 'daily', 'lists', 'media'],
    },
    examples: ['show notes', 'show contacts', 'list entries', 'contacts'],
    priority: 80,
  },

  parseArgs: (input) => {
    const match = input.match(/(notes?|contacts?|entries?|items?|daily|lists?|media)/i);
    const typeMap: Record<string, string> = {
      note: 'note', notes: 'note',
      contact: 'contact', contacts: 'contact',
      entry: 'entry', entries: 'entry',
      item: 'item', items: 'item',
      daily: 'daily',
      list: 'list', lists: 'list',
      media: 'media',
    };
    const type = match ? typeMap[match[1].toLowerCase()] : 'note';
    return { type };
  },

  execute: async (args, context) => {
    const { type } = args as { type: string };
    const records = context.services.garden.getByType(type as any);
    
    if (records.length === 0) {
      return `No ${type}s found.\n\nCreate one with: new ${type} <title>`;
    }

    const lines = [`**${type.charAt(0).toUpperCase() + type.slice(1)}s** (${records.length})\n`];
    
    for (const record of records.slice(0, 20)) {
      const tags = record.tags?.length ? ` [${record.tags.join(', ')}]` : '';
      lines.push(`• ${record.title}${tags}`);
    }
    
    if (records.length > 20) {
      lines.push(`\n... and ${records.length - 20} more`);
    }

    return lines.join('\n');
  },
};

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export const showRecent: Tool = {
  name: 'showRecent',
  description: 'Show recently modified pages',

  routing: {
    patterns: [/^recent$/i, /^show\s+recent$/i, /^recently?\s+modified$/i],
    keywords: { verbs: ['show'], nouns: ['recent'] },
    examples: ['recent', 'show recent'],
    priority: 85,
  },

  execute: async (args, context) => {
    const records = context.services.garden.getRecent(10);
    
    if (records.length === 0) {
      return 'No recent pages.';
    }

    const lines = ['**Recently Modified**\n'];
    
    for (const record of records) {
      const ago = timeAgo(new Date(record.updated_at));
      lines.push(`• ${record.title} (${record.type}) — ${ago}`);
    }

    return lines.join('\n');
  },
};

export const openPage: Tool = {
  name: 'openPage',
  description: 'Display a page inline',

  routing: {
    patterns: [
      /^open\s+(.+)$/i,
      /^view\s+page\s+(.+)$/i,
      /^read\s+(.+)$/i,
    ],
    keywords: { verbs: ['open', 'read'], nouns: [] },
    examples: ['open 2025 taxes', 'read meeting notes'],
    priority: 75,
  },

  parseArgs: (input, match) => {
    const title = match ? match[1] : input.replace(/^(open|view\s+page|read)\s+/i, '');
    return { title };
  },

  execute: async (args, context) => {
    const { title } = args as { title: string };
    
    // Try exact match first
    let record = context.services.garden.getByTitle(title);
    
    // Try partial match across all types
    if (!record) {
      const all = context.services.garden.getRecent(100);
      record = all.find(r => 
        r.title.toLowerCase().includes(title.toLowerCase())
      ) || null;
    }
    
    if (!record) {
      return `Page not found: "${title}"\n\nTry: recent (to see recent pages)`;
    }

    const lines = [
      `**${record.title}** (${record.type})`,
      '─'.repeat(40),
    ];
    
    if (record.content) {
      lines.push(record.content);
    } else {
      lines.push('(no content)');
    }
    
    lines.push('─'.repeat(40));
    
    const meta: string[] = [];
    if (record.context) meta.push(`Context: ${record.context}`);
    if (record.project) meta.push(`Project: ${record.project}`);
    if (record.due_date) meta.push(`Due: ${record.due_date}`);
    if (record.tags?.length) meta.push(`Tags: ${record.tags.join(', ')}`);
    if (record.email) meta.push(`Email: ${record.email}`);
    if (record.phone) meta.push(`Phone: ${record.phone}`);
    
    if (meta.length > 0) {
      lines.push(meta.join(' | '));
    }

    return lines.join('\n');
  },
};

export const showTagged: Tool = {
  name: 'showTagged',
  description: 'Show pages with a specific tag',

  routing: {
    patterns: [
      /^show\s+tagged\s+(.+)$/i,
      /^tagged\s+(.+)$/i,
      /^#(\w+)$/,
    ],
    keywords: { verbs: ['show', 'find'], nouns: ['tagged', 'tag'] },
    examples: ['show tagged urgent', 'tagged work', '#taxes'],
    priority: 80,
  },

  parseArgs: (input, match) => {
    const tag = match ? match[1] : input.replace(/^(show\s+)?tagged\s+/i, '').replace(/^#/, '');
    return { tag };
  },

  execute: async (args, context) => {
    const { tag } = args as { tag: string };
    const records = context.services.garden.getByTag(tag);
    
    if (records.length === 0) {
      return `No pages tagged "${tag}".`;
    }

    const lines = [`**Tagged: ${tag}** (${records.length})\n`];
    
    for (const record of records) {
      lines.push(`• ${record.title} (${record.type})`);
    }

    return lines.join('\n');
  },
};

export const gtdTools: Tool[] = [
  appendToNote,  // Must be first - highest priority contextual check
  viewNextActions,
  processInbox,
  addTask,
  addProject,
  showProjects,
  createNote,
  showByType,
  showRecent,
  openPage,
  showTagged,
  markDone,
  capture,
  showWaitingFor,
  showOverdue,
];
