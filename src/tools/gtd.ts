// src/tools/gtd.ts
import { Tool } from './types.js';
import { loadConfig } from '../config.js';

/**
 * Parse a time string like "5pm", "5:30pm", "17:30" into "HH:MM" format
 */
function parseTime(timeStr: string): string | null {
  const lower = timeStr.toLowerCase().trim();
  
  // Match formats: 5pm, 5:30pm, 17:30, 5:30, 5 pm
  const match = lower.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!match) return null;
  
  let hours = parseInt(match[1], 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  const meridiem = match[3];
  
  // Convert to 24-hour format
  if (meridiem === 'pm' && hours < 12) hours += 12;
  if (meridiem === 'am' && hours === 12) hours = 0;
  
  // Validate
  if (hours > 23 || minutes > 59) return null;
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

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

    // Store the list context so `done <number>` works correctly
    context.services.context.setFact('system', 'last_displayed_list', {
      type: 'next_actions',
      ids: tasks.map(t => t.id),
    }, { source: 'explicit' });

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

    // Store the list context so `done <number>` works correctly
    context.services.context.setFact('system', 'last_displayed_list', {
      type: 'inbox',
      ids: tasks.map(t => t.id),
    }, { source: 'explicit' });

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

    // Parse "with <person>" for contact linking
    let contactNames: string[] = [];
    const withMatches = description.match(/\bwith\s+([a-zA-Z][a-zA-Z\s]*?)(?=\s*$|\s*,|\s+(?:@|\+|due:|by\s))/gi);
    if (withMatches) {
      for (const match of withMatches) {
        const person = match.replace(/^with\s+/i, '').trim();
        if (person) {
          contactNames.push(person);
        }
      }
      description = description.replace(/\bwith\s+([a-zA-Z][a-zA-Z\s]*?)(?=\s*$|\s*,|\s+(?:@|\+|due:|by\s))/gi, '').trim();
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
      let dateOnly: string | null = null;
      let timeOnly: string | null = null;
      
      // Check if dueStr is just a time (e.g., "5pm", "17:30")
      const pureTime = parseTime(dueStr);
      if (pureTime) {
        dateOnly = today.toISOString().split('T')[0];
        timeOnly = pureTime;
      } else if (dueStr === 'today') {
        dateOnly = today.toISOString().split('T')[0];
      } else if (dueStr === 'tomorrow') {
        today.setDate(today.getDate() + 1);
        dateOnly = today.toISOString().split('T')[0];
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(dueStr)) {
        // ISO date format
        dateOnly = dueStr;
      } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(dueStr)) {
        // ISO datetime format - use as-is
        dueDate = dueStr;
      } else {
        // Check for "date time" format (e.g., "tomorrow 5pm", "friday 3:30pm")
        const parts = dueStr.split(/\s+/);
        if (parts.length >= 2) {
          const possibleTime = parseTime(parts[parts.length - 1]);
          if (possibleTime) {
            timeOnly = possibleTime;
            dueStr = parts.slice(0, -1).join(' '); // Remove time part
          }
        }
        
        // Try day of week
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const dayIndex = days.indexOf(dueStr);
        if (dayIndex !== -1) {
          const currentDay = today.getDay();
          let daysUntil = dayIndex - currentDay;
          if (daysUntil <= 0) daysUntil += 7; // Next week if today or past
          today.setDate(today.getDate() + daysUntil);
          dateOnly = today.toISOString().split('T')[0];
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
            dateOnly = parsed.toISOString().split('T')[0];
          } else {
            // Try to parse as generic date string with current year context
            const parsed = new Date(dueStr);
            if (!isNaN(parsed.getTime())) {
              // Fix year if it defaulted to something weird
              if (parsed.getFullYear() < 2020) {
                parsed.setFullYear(today.getFullYear());
              }
              dateOnly = parsed.toISOString().split('T')[0];
            }
          }
        }
      }
      
      // Combine date and time
      if (dateOnly && !dueDate) {
        dueDate = timeOnly ? `${dateOnly}T${timeOnly}` : dateOnly;
      }
    }

    return { description, context, project, dueDate, contactNames };
  },

  execute: async (args, context) => {
    const { description, context: ctx, project, dueDate, contactNames } = args as {
      description: string;
      context?: string;
      project?: string;
      dueDate?: string;
      contactNames?: string[];
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

    // Resolve contact names to IDs
    let contactIds: string[] = [];
    let contactsCreated: string[] = [];
    let contactsAmbiguous: string[] = [];
    
    if (contactNames && contactNames.length > 0) {
      const resolution = context.services.garden.resolveContacts(contactNames);
      
      // Add resolved contacts
      contactIds = resolution.resolved.map(c => c.id);
      
      // Auto-create unresolved contacts
      for (const name of resolution.unresolved) {
        const newContact = context.services.garden.addContact(name);
        contactIds.push(newContact.id);
        contactsCreated.push(name);
      }
      
      // Report ambiguous (don't auto-resolve, let user clarify)
      for (const { name, matches } of resolution.ambiguous) {
        contactsAmbiguous.push(`${name} (${matches.map(m => m.title).join(', ')})`);
      }
    }

    // Determine context:
    // - If explicitly set, use it
    // - If project or due date is set (action is "processed"), no context needed
    // - Otherwise, default to @inbox (unprocessed capture)
    const finalContext = ctx || (project || dueDate ? undefined : '@inbox');
    
    // Create task with contacts
    const task = context.services.garden.create({
      type: 'action',
      title: description,
      status: 'active',
      context: finalContext,
      project,
      due_date: dueDate,
      contacts: contactIds.length > 0 ? contactIds : undefined,
    });

    let response = `✓ Added: "${task.title}"`;
    if (task.context) response += ` (${task.context})`;
    if (task.project) response += ` +${task.project}`;
    if (task.due_date) response += ` [due: ${task.due_date}]`;
    if (contactIds.length > 0) {
      const contactNames = contactIds.map(id => {
        const c = context.services.garden.get(id);
        return c?.title || id;
      });
      response += `\n  👤 ${contactNames.join(', ')}`;
    }
    if (projectCreated) response += `\n✓ Created project: "${project}"`;
    if (contactsCreated.length > 0) response += `\n✓ Created contact(s): ${contactsCreated.join(', ')}`;
    if (contactsAmbiguous.length > 0) response += `\n⚠️ Ambiguous contact(s): ${contactsAmbiguous.join('; ')}`;

    return response;
  },
};

export const markDone: Tool = {
  name: 'markDone',
  description: 'Mark an action as complete',

  routing: {
    patterns: [
      /^(done|complete|finish|finished|check)\s+(\d+(?:\s+\d+)*)$/i,  // done 1 2 3
      /^(done|complete|finish|finished)\s+(.+)$/i,
      /^(\d+)\s+(done|complete|finished)$/i,
    ],
    keywords: {
      verbs: ['done', 'complete', 'finish', 'mark', 'check'],
      nouns: ['task', 'action', 'item'],
    },
    examples: ['done 1', 'done 1 2 3', 'complete 3', 'mark done buy milk'],
    priority: 95,
  },

  parseArgs: (input, match) => {
    const cleaned = input.replace(/^(done|complete|finish|finished|check)\s*/i, '').trim();
    
    // Check for space-separated numbers
    const numbers = cleaned.split(/\s+/).map(s => parseInt(s)).filter(n => !isNaN(n));
    if (numbers.length > 1) {
      return { identifiers: numbers };
    }
    
    // Single identifier (number or text)
    const num = parseInt(cleaned);
    return { identifiers: isNaN(num) ? [cleaned] : [num] };
  },

  execute: async (args, context) => {
    const { identifiers } = args as { identifiers: (string | number)[] };

    if (!identifiers || identifiers.length === 0) {
      return 'Please specify which action to complete. Example: done 1';
    }

    // Get list context for numeric lookups
    const lastList = context.services.context.getFact('system', 'last_displayed_list');
    const listData = lastList?.value as { type?: string; ids?: string[] } | null;

    const completed: string[] = [];
    const notFound: (string | number)[] = [];

    for (const identifier of identifiers) {
      let resolvedId: string | number = identifier;
      
      if (typeof identifier === 'number' && listData?.ids) {
        if (identifier > 0 && identifier <= listData.ids.length) {
          resolvedId = listData.ids[identifier - 1];
        }
      }

      const result = context.services.garden.completeTask(resolvedId);
      if (result) {
        completed.push(result.title);
      } else {
        notFound.push(identifier);
      }
    }

    // Clear the stored list context after processing
    context.services.context.setFact('system', 'last_displayed_list', null, { source: 'explicit' });

    const lines: string[] = [];
    if (completed.length > 0) {
      lines.push(`✓ Completed ${completed.length} item${completed.length > 1 ? 's' : ''}:`);
      completed.forEach(title => lines.push(`  • ${title}`));
    }
    if (notFound.length > 0) {
      lines.push(`⚠️ Not found: ${notFound.join(', ')}`);
    }

    return lines.join('\n');
  },
};

export const editAction: Tool = {
  name: 'editAction',
  description: 'Edit an existing action (context, project, due date)',

  routing: {
    patterns: [
      /^edit\s+(?:action\s+)?(\d+)\s+(.+)$/i,
      /^edit\s+(?:action\s+)?(.+?)\s+(@[\w-]+|\+[\w-]+|due:\S+)(.*)$/i,
      /^move\s+(\d+)\s+(@\w+)$/i,
    ],
    keywords: {
      verbs: ['edit', 'move', 'change', 'update'],
      nouns: ['action', 'task', 'context'],
    },
    examples: ['edit 1 @phone', 'edit 1 +new-project', 'edit screenshot @home', 'move 1 @errands'],
    priority: 92,
  },

  parseArgs: (input, match) => {
    if (!match) return { identifier: null, changes: '' };
    
    // Pattern 1: edit 1 @phone (number + changes)
    // Pattern 2: edit screenshot @home (name + changes)
    // Pattern 3: move 1 @phone
    if (match[0].toLowerCase().startsWith('move')) {
      return { identifier: match[1], changes: match[2] };
    }
    
    const identifier = match[1];
    const changes = (match[2] + (match[3] || '')).trim();
    return { identifier, changes };
  },

  execute: async (args, context) => {
    const { identifier, changes } = args as { identifier: string; changes: string };

    if (!identifier || !changes) {
      return 'Usage: edit <number or name> <@context | +project | due:date>\nExample: edit 1 @phone';
    }

    // Find the action
    const tasks = context.services.garden.getTasks({ status: 'active' });
    let record = null;

    const num = parseInt(identifier);
    if (!isNaN(num) && num > 0 && num <= tasks.length) {
      record = tasks[num - 1];
    } else {
      // Search by partial title match
      const search = identifier.toLowerCase();
      record = tasks.find(t => t.title.toLowerCase().includes(search));
    }

    if (!record) {
      return `Action not found: "${identifier}". Try "show next actions" to see the list.`;
    }

    // Parse changes
    const updates: Record<string, string | undefined> = {};
    
    const contextMatch = changes.match(/@([\w-]+)/);
    if (contextMatch) {
      updates.context = `@${contextMatch[1]}`;
    }

    const projectMatch = changes.match(/\+([\w-]+)/);
    if (projectMatch) {
      updates.project = projectMatch[1];
    }

    const dueMatch = changes.match(/due:(\S+)/i);
    if (dueMatch) {
      // Simple due date handling - could reuse the full parser later
      const dueStr = dueMatch[1].toLowerCase();
      const today = new Date();
      
      if (dueStr === 'today') {
        updates.due_date = today.toISOString().split('T')[0];
      } else if (dueStr === 'tomorrow') {
        today.setDate(today.getDate() + 1);
        updates.due_date = today.toISOString().split('T')[0];
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(dueStr)) {
        updates.due_date = dueStr;
      } else {
        // Day of week
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const dayIndex = days.indexOf(dueStr);
        if (dayIndex !== -1) {
          const currentDay = today.getDay();
          let daysUntil = dayIndex - currentDay;
          if (daysUntil <= 0) daysUntil += 7;
          today.setDate(today.getDate() + daysUntil);
          updates.due_date = today.toISOString().split('T')[0];
        }
      }
    }

    if (Object.keys(updates).length === 0) {
      return 'No valid changes detected. Use @context, +project, or due:date';
    }

    context.services.garden.update(record.id, updates);

    const parts = [`✓ Updated: "${record.title}"`];
    if (updates.context) parts.push(`context → ${updates.context}`);
    if (updates.project) parts.push(`project → +${updates.project}`);
    if (updates.due_date) parts.push(`due → ${updates.due_date}`);

    return parts.join('\n');
  },
};

export const editPage: Tool = {
  name: 'editPage',
  description: 'Edit any page (tags, project, metadata)',

  routing: {
    patterns: [
      /^edit\s+(?!action\s)(?!\d+\s)(.+?)(?:\s+(@[\w-]+|\+[\w-]+|#\w+).*)?$/i,
    ],
    keywords: {
      verbs: ['edit'],
      nouns: ['page', 'media', 'note', 'entry'],
    },
    examples: ['edit vacation photo', 'edit house rules +family', 'edit northside'],
    priority: 85,  // Lower than editAction
  },

  parseArgs: (input, match) => {
    if (!match) return { title: '', changes: '' };
    
    const title = match[1].trim();
    const changes = match[2] ? input.slice(input.indexOf(match[2])) : '';
    return { title, changes };
  },

  execute: async (args, context) => {
    const { title, changes } = args as { title: string; changes: string };

    if (!title) {
      return 'Usage: edit <page name> [+project #tag]\nExample: edit vacation photo +thailand #travel';
    }

    // Find the page by partial match
    const all = context.services.garden.getRecent(200);
    const search = title.toLowerCase();
    const record = all.find(r => r.title.toLowerCase().includes(search));

    if (!record) {
      return `Page not found: "${title}"\nTry: recent`;
    }

    // If changes provided inline, apply them directly
    if (changes) {
      const updates: { project?: string; tags?: string[] } = {};
      
      // Parse +project
      const projectMatch = changes.match(/\+([^\s#]+)/);
      if (projectMatch) {
        const projectName = projectMatch[1];
        const projects = context.services.garden.getByType('project');
        let project = projects.find(p => p.title.toLowerCase() === projectName.toLowerCase());
        if (!project) {
          project = context.services.garden.create({
            type: 'project',
            title: projectName,
            status: 'active',
          });
        }
        updates.project = project.id;
      }
      
      // Parse #tags
      const tagMatches = changes.match(/#(\w+)/g);
      if (tagMatches) {
        const newTags = tagMatches.map((t: string) => t.slice(1));
        const existingTags = record.tags || [];
        updates.tags = [...new Set([...existingTags, ...newTags])];
      }
      
      if (Object.keys(updates).length > 0) {
        context.services.garden.update(record.id, updates);
        
        let response = `✓ Updated: "${record.title}"`;
        if (updates.project) response += `\n  +${projectMatch![1]}`;
        if (updates.tags) response += `\n  ${updates.tags.map(t => '#' + t).join(' ')}`;
        return response;
      }
    }

    // No inline changes - show current state and prompt
    const meta = record.metadata as Record<string, unknown> | undefined;
    let response = `📝 **${record.title}** (${record.type})\n`;
    
    if (record.project) {
      const proj = context.services.garden.get(record.project);
      response += `  Project: +${proj?.title || record.project}\n`;
    }
    if (record.tags && record.tags.length > 0) {
      response += `  Tags: ${record.tags.map(t => '#' + t).join(' ')}\n`;
    }
    if (meta?.filePath) {
      response += `  File: ${meta.filePath}\n`;
    }
    
    // Set pending edit state
    context.services.context.setFact('system', 'pending_edit_page', record.id, { source: 'explicit' });
    
    response += '\nType new tags/project (e.g., +project #tag1 #tag2) or ENTER to cancel:';
    return response;
  },
};

export const handleEditPage: Tool = {
  name: 'handleEditPage',
  description: 'Handle pending page edit input',

  routing: {
    patterns: [],
    keywords: { verbs: [], nouns: [] },
    examples: [],
    priority: 99,  // High priority to intercept
  },

  shouldHandle: async (input: string, context) => {
    const fact = context.services.context.getFact('system', 'pending_edit_page');
    return !!fact?.value;
  },

  execute: async (args, context) => {
    const input = (args as any).__raw_input || '';
    const fact = context.services.context.getFact('system', 'pending_edit_page');
    const recordId = fact?.value as string | null;
    
    // Clear pending state
    context.services.context.setFact('system', 'pending_edit_page', null, { source: 'explicit' });
    
    if (!recordId) return '';
    
    const record = context.services.garden.get(recordId);
    if (!record) return 'Page not found.';
    
    // Empty input = cancel
    if (!input.trim()) {
      return 'Edit cancelled.';
    }
    
    const updates: { project?: string; tags?: string[] } = {};
    
    // Parse +project
    const projectMatch = input.match(/\+([^\s#]+)/);
    if (projectMatch) {
      const projectName = projectMatch[1];
      const projects = context.services.garden.getByType('project');
      let project = projects.find(p => p.title.toLowerCase() === projectName.toLowerCase());
      if (!project) {
        project = context.services.garden.create({
          type: 'project',
          title: projectName,
          status: 'active',
        });
      }
      updates.project = project.id;
    }
    
    // Parse #tags (add to existing)
    const tagMatches = input.match(/#(\w+)/g);
    if (tagMatches) {
      const newTags = tagMatches.map((t: string) => t.slice(1));
      const existingTags = record.tags || [];
      updates.tags = [...new Set([...existingTags, ...newTags])];
    }
    
    if (Object.keys(updates).length === 0) {
      return 'No changes. Use +project or #tag format.';
    }
    
    context.services.garden.update(record.id, updates);
    
    let response = `✓ Updated: "${record.title}"`;
    if (updates.project) response += `\n  +${projectMatch![1]}`;
    if (updates.tags) response += `\n  ${updates.tags.map(t => '#' + t).join(' ')}`;
    return response;
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

    // Store the list context so `done <number>` works correctly
    context.services.context.setFact('system', 'last_displayed_list', {
      type: 'overdue',
      ids: overdue.map(t => t.id),
    }, { source: 'explicit' });

    const lines = [`**Overdue Actions** (${overdue.length})\n`];
    const today = new Date();
    
    overdue.forEach((t, i) => {
      const dueDate = new Date(t.due_date!);
      const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
      const daysStr = daysOverdue === 1 ? '1 day' : `${daysOverdue} days`;
      
      lines.push(`  ${i + 1}. ${t.title}`);
      lines.push(`     ⚠️ Due: ${t.due_date} (${daysStr} ago)`);
      if (t.context && t.context !== '@inbox') {
        lines.push(`     ${t.context}`);
      }
    });

    lines.push('\n💡 Mark done: `done <number>` or reschedule the due date.');
    
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
      // Set pending state so next input becomes the title
      await context.services.context.setFact('system', 'pending_note_title', true);
      return 'What would you like to call this note?';
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

// Handler for when we're waiting for a note title
export const provideNoteTitle: Tool = {
  name: 'provideNoteTitle',
  description: 'Provide a title for a new note',

  routing: {
    patterns: [],
    keywords: { verbs: [], nouns: [] },
    examples: [],
    priority: 100,  // High priority - check before other handlers
  },

  shouldHandle: async (input: string, context) => {
    const fact = context.services.context.getFact('system', 'pending_note_title');
    return !!fact?.value;
  },

  execute: async (args, context) => {
    const input = ((args as any).__raw_input || '').trim();
    
    // Clear the pending state
    await context.services.context.setFact('system', 'pending_note_title', null);
    
    if (!input) {
      return 'Note cancelled.';
    }

    // Create the note with the provided title
    const note = context.services.garden.create({
      type: 'note',
      title: input,
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

    // "done" or empty input finishes the note - ask for project/tags
    if (input.toLowerCase().trim() === 'done' || input.trim() === '') {
      const note = context.services.garden.get(pendingNoteId);
      if (!note) {
        await context.services.context.setFact('system', 'pending_note_id', null);
        return 'Note not found.';
      }
      
      // Move to tagging step
      await context.services.context.setFact('system', 'pending_note_id', null);
      await context.services.context.setFact('system', 'pending_note_tagging', note.id);
      
      return `📝 **${note.title}**\n\nAny metadata? (e.g., +project @context #tag with person, or ENTER to skip)`;
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

export const tagNote: Tool = {
  name: 'tagNote',
  description: 'Add project/tags to a note being created',

  routing: {
    patterns: [],
    keywords: { verbs: [], nouns: [] },
    examples: [],
    priority: 100,
  },

  shouldHandle: async (input: string, context) => {
    const fact = context.services.context.getFact('system', 'pending_note_tagging');
    return !!fact?.value;
  },

  execute: async (args, context) => {
    const input = (args as any).__raw_input || '';
    const fact = context.services.context.getFact('system', 'pending_note_tagging');
    const noteId = fact?.value as string | null;
    
    await context.services.context.setFact('system', 'pending_note_tagging', null);
    
    if (!noteId) return '';
    
    const note = context.services.garden.get(noteId);
    if (!note) return 'Note not found.';
    
    // Parse operators from input:
    // +project (everything after + until @, #, "with", or end)
    // @context
    // #tags
    // with contact (everything after "with" until +, @, #, or end)
    
    const projectMatch = input.match(/\+([^@#]+?)(?=\s*(?:@|#|with\s|$))/i);
    const contextMatch = input.match(/@(\w+)/);
    const tagMatches = input.match(/#(\w+)/g);
    const withMatch = input.match(/\bwith\s+([^@#+]+?)(?=\s*(?:@|#|\+|$))/i);
    
    const updates: { project?: string; context?: string; tags?: string[]; contacts?: string[] } = {};
    const feedback: string[] = [];
    
    // Handle project
    if (projectMatch) {
      const projectName = projectMatch[1].trim();
      const projects = context.services.garden.getByType('project');
      let project = projects.find(p => p.title.toLowerCase() === projectName.toLowerCase());
      if (!project) {
        project = context.services.garden.create({
          type: 'project',
          title: projectName,
          status: 'active',
        });
        feedback.push(`+${projectName} (created)`);
      } else {
        feedback.push(`+${projectName}`);
      }
      updates.project = project.id;
    }
    
    // Handle context
    if (contextMatch) {
      updates.context = '@' + contextMatch[1];
      feedback.push(updates.context);
    }
    
    // Handle tags
    if (tagMatches) {
      const tags = tagMatches.map((t: string) => t.slice(1));
      updates.tags = tags;
      feedback.push(tags.map((t: string) => '#' + t).join(' '));
    }
    
    // Handle contact (with)
    if (withMatch) {
      const contactName = withMatch[1].trim();
      // Find or create contact
      const contacts = context.services.garden.getByType('contact');
      let contact = contacts.find(c => c.title.toLowerCase().includes(contactName.toLowerCase()));
      if (!contact) {
        contact = context.services.garden.create({
          type: 'contact',
          title: contactName,
          status: 'active',
        });
        feedback.push(`with ${contactName} (created)`);
      } else {
        feedback.push(`with ${contact.title}`);
      }
      // Link contact to note
      updates.contacts = [...(note.contacts || []), contact.id];
    }
    
    if (Object.keys(updates).length > 0) {
      context.services.garden.update(note.id, updates);
    }
    
    let response = `✓ Note saved: "${note.title}"`;
    if (feedback.length > 0) {
      response += '\n  ' + feedback.join(' ');
    }
    
    return response;
  },
};

// === Entry (Wiki) Tools ===

export const createEntry: Tool = {
  name: 'createEntry',
  description: 'Create a wiki-like entry page',

  routing: {
    patterns: [
      /^(new|create|add)\s+entry\s*:?\s*(.*)$/i,
      /^entry\s*:?\s*(.+)$/i,
    ],
    keywords: {
      verbs: ['new', 'create', 'add'],
      nouns: ['entry', 'wiki', 'page'],
    },
    examples: ['new entry house rules', 'create entry vacation packing list #travel', 'entry: project guidelines +work'],
    priority: 90,
  },

  parseArgs: (input, match) => {
    let rest = '';
    if (match) {
      rest = match[match.length - 1] || '';
    } else {
      rest = input.replace(/^(new|create|add)\s+entry\s*:?\s*/i, '').trim();
    }
    
    // Extract project
    const projectMatch = rest.match(/\+([^\s#]+)/);
    const project = projectMatch ? projectMatch[1] : undefined;
    rest = rest.replace(/\+[^\s#]+/g, '').trim();
    
    // Extract tags
    const tagMatches = rest.match(/#(\w+)/g);
    const tags = tagMatches ? tagMatches.map(t => t.slice(1)) : [];
    rest = rest.replace(/#\w+/g, '').trim();
    
    return { title: rest, project, tags };
  },

  execute: async (args, context) => {
    const { title, project, tags } = args as { title: string; project?: string; tags: string[] };

    if (!title) {
      return 'Please provide an entry title. Example: new entry house rules #family';
    }

    // Check if entry already exists
    const existing = context.services.garden.getByTitle(title);
    if (existing && existing.type === 'entry') {
      return `Entry "${title}" already exists. Use "open ${title}" to view it.`;
    }

    // Auto-create project if specified
    let projectId: string | undefined;
    if (project) {
      const projects = context.services.garden.getByType('project');
      let proj = projects.find(p => p.title.toLowerCase() === project.toLowerCase());
      if (!proj) {
        proj = context.services.garden.create({
          type: 'project',
          title: project,
          status: 'active',
        });
      }
      projectId = proj.id;
    }

    const entry = context.services.garden.create({
      type: 'entry',
      title,
      status: 'active',
      content: '',
      project: projectId,
      tags: tags.length > 0 ? tags : undefined,
    });

    let response = `📖 **Entry: ${entry.title}**`;
    if (project) response += `\n  +${project}`;
    if (tags.length > 0) response += `\n  ${tags.map(t => '#' + t).join(' ')}`;
    response += `\n\nEdit: \`${context.services.garden.getFilePath(entry)}\``;

    return response;
  },
};

// === Media Tools ===

export const importMedia: Tool = {
  name: 'importMedia',
  description: 'Import an image or file into the garden',

  routing: {
    patterns: [
      /^import\s+(.+)$/i,
      /^(new|add|create)\s+media\s+(.+)$/i,
    ],
    keywords: {
      verbs: ['import', 'add', 'new', 'create'],
      nouns: ['media', 'image', 'file', 'photo', 'picture'],
    },
    examples: [
      'import /path/to/image.jpg vacation photo +thailand',
      'new media /path/to/doc.pdf project specs +work',
    ],
    priority: 85,
  },

  parseArgs: (input, match) => {
    let rest = '';
    if (match) {
      rest = match[match.length - 1] || '';
    } else {
      rest = input.replace(/^import\s+/i, '').replace(/^(new|add|create)\s+media\s+/i, '').trim();
    }
    
    // Extract project
    const projectMatch = rest.match(/\+([^\s#]+)/);
    const project = projectMatch ? projectMatch[1] : undefined;
    rest = rest.replace(/\+[^\s#]+/g, '').trim();
    
    // Extract tags
    const tagMatches = rest.match(/#(\w+)/g);
    const tags = tagMatches ? tagMatches.map(t => t.slice(1)) : [];
    rest = rest.replace(/#\w+/g, '').trim();
    
    // First part should be path, rest is title
    // Handle quoted paths: "path with spaces" title
    let filePath = '';
    let title = '';
    
    if (rest.startsWith('"')) {
      const endQuote = rest.indexOf('"', 1);
      if (endQuote > 0) {
        filePath = rest.slice(1, endQuote);
        title = rest.slice(endQuote + 1).trim();
      }
    } else if (rest.startsWith("'")) {
      const endQuote = rest.indexOf("'", 1);
      if (endQuote > 0) {
        filePath = rest.slice(1, endQuote);
        title = rest.slice(endQuote + 1).trim();
      }
    } else {
      // Space-separated: first token is path
      const parts = rest.split(/\s+/);
      filePath = parts[0] || '';
      title = parts.slice(1).join(' ');
    }
    
    // If no title, use filename without extension
    if (!title && filePath) {
      const basename = filePath.split('/').pop() || '';
      title = basename.replace(/\.[^.]+$/, '');
    }
    
    return { filePath, title, project, tags };
  },

  execute: async (args, context) => {
    const { filePath, title, project, tags } = args as { 
      filePath: string; 
      title: string; 
      project?: string; 
      tags: string[];
    };

    if (!filePath) {
      return `Please provide a file path. Example:
  import /path/to/image.jpg vacation photo +thailand
  import "/path with spaces/doc.pdf" my document`;
    }

    // Resolve path (handle ~ and relative paths)
    const fs = await import('fs');
    const path = await import('path');
    
    let resolvedPath = filePath;
    if (filePath.startsWith('~')) {
      resolvedPath = filePath.replace('~', process.env.HOME || '');
    } else if (!path.default.isAbsolute(filePath)) {
      resolvedPath = path.default.resolve(process.cwd(), filePath);
    }

    // Check file exists
    if (!fs.default.existsSync(resolvedPath)) {
      return `File not found: ${filePath}`;
    }

    // Auto-create project if specified
    let projectId: string | undefined;
    if (project) {
      const projects = context.services.garden.getByType('project');
      let proj = projects.find(p => p.title.toLowerCase() === project.toLowerCase());
      if (!proj) {
        proj = context.services.garden.create({
          type: 'project',
          title: project,
          status: 'active',
        });
      }
      projectId = proj.id;
    }

    // Import the media
    const media = context.services.garden.importMedia(resolvedPath, title, projectId);

    // Add tags if specified
    if (tags.length > 0) {
      context.services.garden.update(media.id, { tags });
    }

    const metadata = media.metadata as { fileName?: string; filePath?: string; mimeType?: string } | undefined;
    let response = `📎 **Media imported: ${media.title}**`;
    if (project) response += `\n  +${project}`;
    if (tags.length > 0) response += `\n  ${tags.map(t => '#' + t).join(' ')}`;
    response += `\n  📁 ${metadata?.fileName || 'saved'}`;

    // Run OCR on images if available
    if (context.services.ocr.isAvailable() && context.services.ocr.isOCRableImage(resolvedPath)) {
      const ocrText = await context.services.ocr.extractText(resolvedPath);
      if (ocrText) {
        // Store OCR text in content and metadata
        const currentContent = media.content || '';
        const updatedContent = currentContent 
          ? `${currentContent}\n\n---\n**OCR Text:**\n${ocrText}`
          : `**OCR Text:**\n${ocrText}`;
        context.services.garden.update(media.id, { 
          content: updatedContent,
          metadata: { ...metadata, ocrText: ocrText.slice(0, 500) }, // Store preview in metadata
        });
        response += `\n  🔍 OCR: ${ocrText.length} characters extracted`;
      }
    }

    return response;
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
      /^show\s+(?!next|projects?|notes?|contacts?|inbox|overdue|waiting|someday|tagged|reminders?)(.+)$/i,
    ],
    keywords: { verbs: ['open', 'read'], nouns: [] },
    examples: ['open 2025 taxes', 'read meeting notes', 'show 2025 taxes'],
    priority: 80,  // Higher than addProject (95) after pattern match
  },

  parseArgs: (input, match) => {
    const title = match ? match[1] : input.replace(/^(open|view\s+page|read|show)\s+/i, '');
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
    }
    
    // Special handling for projects: show linked actions and notes
    if (record.type === 'project') {
      const projectSlug = record.title.toLowerCase().replace(/\s+/g, '-');
      const projectTitle = record.title.toLowerCase();
      
      // Get linked actions
      const actions = context.services.garden.getTasks({ status: 'active' })
        .filter(a => 
          a.project?.toLowerCase() === projectSlug || 
          a.project?.toLowerCase() === projectTitle
        );
      
      if (actions.length > 0) {
        lines.push('\n**Next Actions:**');
        actions.forEach((a, i) => {
          const ctx = a.context ? ` ${a.context}` : '';
          const due = a.due_date ? ` [due: ${a.due_date}]` : '';
          lines.push(`  ${i + 1}. ${a.title}${ctx}${due}`);
        });
      } else {
        lines.push('\n⚠️ No actions — add one with:');
        lines.push(`  new action <text> +${projectSlug}`);
      }
      
      // Get linked notes
      const notes = context.services.garden.getByType('note')
        .filter(n => n.project?.toLowerCase() === projectSlug || n.project?.toLowerCase() === projectTitle);
      
      if (notes.length > 0) {
        lines.push('\n**Notes:**');
        notes.forEach(n => lines.push(`  • ${n.title}`));
      }
      
      // Get linked media
      const media = context.services.garden.getByType('media')
        .filter(m => m.project?.toLowerCase() === projectSlug || m.project?.toLowerCase() === projectTitle);
      
      if (media.length > 0) {
        lines.push('\n**Media:**');
        media.forEach(m => {
          const meta = m.metadata as { fileName?: string; filePath?: string } | undefined;
          const fileName = meta?.fileName || 'file';
          const filePath = meta?.filePath || '';
          lines.push(`  📎 ${m.title} → ${filePath}`);
        });
      }
    } else if (record.type === 'contact') {
      // Show contact info and linked records
      if (record.email) lines.push(`📧 ${record.email}`);
      if (record.phone) lines.push(`📱 ${record.phone}`);
      if (record.birthday) lines.push(`🎂 ${record.birthday}`);
      
      // Get all records linked to this contact
      const linkedRecords = context.services.garden.getByContact(record.id);
      
      // Get calendar events linked to this contact
      const calendarEvents = context.services.calendar.getUpcoming(30);
      const linkedEvents = calendarEvents.filter(e => {
        if (!e.metadata) return false;
        try {
          const meta = JSON.parse(e.metadata);
          return meta.contactIds?.includes(record.id);
        } catch {
          return false;
        }
      });
      
      const linkedActions = linkedRecords.filter(r => r.type === 'action');
      const linkedProjects = linkedRecords.filter(r => r.type === 'project');
      const linkedNotes = linkedRecords.filter(r => r.type === 'note');
      
      if (linkedActions.length > 0) {
        lines.push('\n**Actions:**');
        linkedActions.forEach(a => {
          const ctx = a.context ? ` ${a.context}` : '';
          const due = a.due_date ? ` [due: ${a.due_date}]` : '';
          lines.push(`  • ${a.title}${ctx}${due}`);
        });
      }
      
      if (linkedEvents.length > 0) {
        lines.push('\n**Events:**');
        linkedEvents.forEach(e => {
          const d = new Date(e.start_time);
          const dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
          const timeStr = e.all_day ? '' : ` ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
          lines.push(`  • ${e.title} — ${dateStr}${timeStr}`);
        });
      }
      
      if (linkedProjects.length > 0) {
        lines.push('\n**Projects:**');
        linkedProjects.forEach(p => lines.push(`  • ${p.title}`));
      }
      
      if (linkedNotes.length > 0) {
        lines.push('\n**Notes:**');
        linkedNotes.forEach(n => lines.push(`  • ${n.title}`));
      }
      
      if (linkedRecords.length === 0 && linkedEvents.length === 0) {
        lines.push('\n(no linked items)');
      }
    } else if (!record.content) {
      lines.push('(no content)');
    }
    
    lines.push('─'.repeat(40));
    
    const meta: string[] = [];
    if (record.context) meta.push(`Context: ${record.context}`);
    if (record.project) meta.push(`Project: ${record.project}`);
    if (record.due_date) meta.push(`Due: ${record.due_date}`);
    if (record.tags?.length) meta.push(`Tags: ${record.tags.join(', ')}`);
    if (record.contacts?.length) {
      // Look up contact names
      const contactNames = record.contacts.map(id => {
        const c = context.services.garden.get(id);
        return c?.title || id;
      });
      meta.push(`With: ${contactNames.join(', ')}`);
    }
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

export const deleteProject: Tool = {
  name: 'deleteProject',
  description: 'Delete a project',

  routing: {
    patterns: [
      /^(delete|remove)\s+project\s+(.+)$/i,
    ],
    keywords: {
      verbs: ['delete', 'remove'],
      nouns: ['project'],
    },
    examples: ['delete project 2025 taxes', 'remove project thailand trip'],
    priority: 96,  // Higher than addProject (95) to catch "delete project" first
  },

  parseArgs: (input) => {
    const query = input.replace(/^(delete|remove)\s+project\s*/i, '').trim();
    return { query };
  },

  execute: async (args, context) => {
    const { query } = args as { query: string };

    if (!query) {
      return 'Please provide a project name. Example: delete project 2025 taxes';
    }

    // Find the project
    const allProjects = context.services.garden.getByType('project');
    const queryLower = query.toLowerCase();
    
    const matches = allProjects.filter(p => 
      p.title.toLowerCase() === queryLower ||
      p.title.toLowerCase().includes(queryLower) ||
      p.title.toLowerCase().replace(/\s+/g, '-') === queryLower
    );

    if (matches.length === 0) {
      return `Project not found: "${query}"\n\nTry: show projects`;
    }

    if (matches.length > 1) {
      const names = matches.map(p => p.title).join(', ');
      return `Multiple projects match "${query}": ${names}\nPlease be more specific.`;
    }

    const project = matches[0];
    
    // Find associated actions
    const projectSlug = project.title.toLowerCase().replace(/\s+/g, '-');
    const projectTitle = project.title.toLowerCase();
    const actions = context.services.garden.getTasks({ status: 'active' })
      .filter(a => 
        a.project?.toLowerCase() === projectSlug || 
        a.project?.toLowerCase() === projectTitle
      );
    
    // Remove project tag from all associated actions
    for (const action of actions) {
      context.services.garden.update(action.id, { project: undefined });
    }
    
    // Delete the project
    const deleted = context.services.garden.delete(project.id);

    if (deleted) {
      let response = `✓ Removed project: "${project.title}"`;
      if (actions.length > 0) {
        response += `\n✓ Unlinked ${actions.length} action(s) from project`;
      }
      return response;
    }
    return `Failed to remove project: "${project.title}"`;
  },
};

export const deletePage: Tool = {
  name: 'deletePage',
  description: 'Delete any Garden page',

  routing: {
    patterns: [
      /^(delete|remove)\s+(?!project\s|contact\s)(.+)$/i,
    ],
    keywords: {
      verbs: ['delete', 'remove'],
      nouns: ['page', 'note', 'entry'],
    },
    examples: ['delete meeting notes', 'remove old entry'],
    priority: 85,
  },

  parseArgs: (input) => {
    const query = input.replace(/^(delete|remove)\s*/i, '').trim();
    return { query };
  },

  execute: async (args, context) => {
    const { query } = args as { query: string };

    if (!query) {
      return 'Please provide a page title. Example: delete old meeting notes';
    }

    // Find the page
    let record = context.services.garden.getByTitle(query);
    
    // Try partial match
    if (!record) {
      const all = context.services.garden.getRecent(100);
      const queryLower = query.toLowerCase();
      const matches = all.filter(r => r.title.toLowerCase().includes(queryLower));
      
      if (matches.length === 0) {
        return `Page not found: "${query}"\n\nTry: recent`;
      }
      
      if (matches.length > 1) {
        const names = matches.slice(0, 5).map(p => `${p.title} (${p.type})`).join('\n  ');
        return `Multiple pages match "${query}":\n  ${names}\nPlease be more specific.`;
      }
      
      record = matches[0];
    }

    // Special handling for different types
    if (record.type === 'project') {
      return `Use "delete project ${record.title}" to remove projects.`;
    }
    
    if (record.type === 'contact') {
      return `Use "delete contact ${record.title}" to remove contacts.`;
    }

    const deleted = context.services.garden.delete(record.id);

    if (deleted) {
      return `✓ Removed ${record.type}: "${record.title}"`;
    }
    return `Failed to remove: "${record.title}"`;
  },
};

export const gtdTools: Tool[] = [
  provideNoteTitle, // First - waiting for note title
  appendToNote,     // Second - pending note content
  tagNote,          // Third - for note tagging step
  handleEditPage,   // Fourth - for page edit step
  viewNextActions,
  processInbox,
  addTask,
  addProject,
  deleteProject,  // Higher priority than deletePage
  showProjects,
  createNote,
  createEntry,
  importMedia,
  showByType,
  showRecent,
  openPage,
  showTagged,
  markDone,
  editAction,
  editPage,       // After editAction (lower priority)
  capture,
  showWaitingFor,
  showOverdue,
  deletePage,
];
