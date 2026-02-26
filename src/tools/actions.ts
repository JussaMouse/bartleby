// src/tools/actions.ts
// Garden tools for items (inbox captures) and actions.
// Tools are thin adapters — no business logic here.

import { Tool } from './types.js';
import type { GardenService } from '../garden/GardenService.js';
import type { RelationshipService } from '../garden/RelationshipService.js';
import type { ViewService } from '../garden/ViewService.js';
import { ReplRenderer } from '../garden/renderers/ReplRenderer.js';

function getServices(context: any) {
  const garden = context.services.garden as GardenService;
  const rels   = context.services.rels   as RelationshipService;
  const views  = context.services.views  as ViewService;
  return { garden, rels, views };
}

const renderer = new ReplRenderer();

// ── captureItem ───────────────────────────────────────────────────────────────

export const captureItem: Tool = {
  name: 'captureItem',
  description: 'Capture a quick item into the inbox for later processing',

  routing: {
    patterns: [
      /^(capture|add to inbox|inbox)\s+(.+)/i,
      /^jot(?: down)?\s+(.+)/i,
    ],
    keywords: {
      verbs: ['capture', 'jot', 'inbox'],
      nouns: ['item', 'inbox', 'capture'],
    },
    examples: ['capture buy milk', 'add to inbox call dentist', 'jot down meeting prep'],
    priority: 80,
  },

  parseArgs: (input) => {
    const text = input.replace(/^(capture|add to inbox|inbox|jot(?: down)?)\s+/i, '').trim();
    return { title: text };
  },

  execute: async (args, context) => {
    const { title } = args as { title: string };
    if (!title) return 'What should I capture?';

    const { garden } = getServices(context);
    const record = garden.create({ type: 'item', title, source: 'typed' });
    return `Captured: **${record.title}**`;
  },
};

// ── showInbox ─────────────────────────────────────────────────────────────────

export const showInbox: Tool = {
  name: 'showInbox',
  description: 'Show all unprocessed inbox items',

  routing: {
    patterns: [
      /^(show|open|view|list)?\s*(inbox|my inbox)/i,
      /^what'?s? in (my )?inbox/i,
    ],
    keywords: {
      verbs: ['show', 'open', 'view', 'list'],
      nouns: ['inbox'],
    },
    examples: ['show inbox', 'open inbox', "what's in my inbox"],
    priority: 85,
  },

  parseArgs: () => ({}),

  execute: async (_args, context) => {
    const { views } = getServices(context);
    const viewData = views.resolve('Inbox');
    if (!viewData) return 'Inbox not found.';
    return renderer.render(viewData);
  },
};

// ── processItem ───────────────────────────────────────────────────────────────

export const processItem: Tool = {
  name: 'processItem',
  description: 'Process an inbox item — convert it to an action, project, or note',

  routing: {
    patterns: [
      /^process(?: item)?\s+(.+)/i,
      /^convert\s+(.+?)\s+to\s+(action|project|note)/i,
    ],
    keywords: {
      verbs: ['process', 'convert'],
      nouns: ['item', 'inbox'],
    },
    examples: ['process buy milk', 'convert buy milk to action'],
    priority: 78,
  },

  parseArgs: (input) => {
    const toMatch = input.match(/convert\s+(.+?)\s+to\s+(action|project|note)/i);
    if (toMatch) {
      return { title: toMatch[1].trim(), targetType: toMatch[2].toLowerCase() };
    }
    const title = input.replace(/^process(?: item)?\s+/i, '').trim();
    return { title, targetType: 'action' };
  },

  execute: async (args, context) => {
    const { title, targetType = 'action' } = args as { title: string; targetType: string };
    const { garden } = getServices(context);

    // Find the item
    const item = garden.getByTitle(title) ?? garden.search(title)[0];
    if (!item || item.type !== 'item') {
      return `No inbox item found matching "${title}".`;
    }

    // Mark item as processed
    garden.update(item.id, { status: 'processed' });

    // Create the new record
    const created = garden.create({
      type: targetType as any,
      title: item.title,
      content: item.content ?? undefined,
    });

    return `Processed: **${item.title}** → created as ${targetType} **${created.title}**`;
  },
};

// ── addAction ─────────────────────────────────────────────────────────────────

export const addAction: Tool = {
  name: 'addAction',
  description: 'Add a next action',

  routing: {
    patterns: [
      /^(add|create|new) action\s+(.+)/i,
      /^add next action\s+(.+)/i,
    ],
    keywords: {
      verbs: ['add', 'create', 'new'],
      nouns: ['action', 'task', 'next action'],
    },
    examples: ['add action call dentist', 'create action review contract @computer'],
    priority: 82,
  },

  parseArgs: (input) => {
    const text = input.replace(/^(add|create|new)\s*(next\s*)?action\s+/i, '').trim();
    // Parse optional @context
    const contextMatch = text.match(/@(\w+)/);
    const title = text.replace(/@\w+/g, '').trim();
    return { title, context: contextMatch ? `@${contextMatch[1]}` : undefined };
  },

  execute: async (args, context) => {
    const { title, context: ctx, project: projectTitle, due_date } = args as {
      title: string;
      context?: string;
      project?: string;
      due_date?: string;
    };

    if (!title) return 'What action should I add?';

    const { garden, rels } = getServices(context);
    const record = garden.create({ type: 'action', title, context: ctx, due_date });

    // Link to project if specified
    if (projectTitle) {
      const project = garden.getByTitle(projectTitle);
      if (project) {
        rels.add(record.id, project.id, 'belongs_to');
      }
    }

    const projectInfo = projectTitle ? ` → ${projectTitle}` : '';
    const contextInfo = ctx ? `  ${ctx}` : '';
    return `Added action: **${record.title}**${contextInfo}${projectInfo}`;
  },
};

// ── completeAction ────────────────────────────────────────────────────────────

export const completeAction: Tool = {
  name: 'completeAction',
  description: 'Mark an action as completed',

  routing: {
    patterns: [
      /^(complete|done|finish|mark( done| complete))\s+(.+)/i,
      /^(.+)\s+is done/i,
    ],
    keywords: {
      verbs: ['complete', 'done', 'finish'],
      nouns: ['action', 'task'],
    },
    examples: ['complete call dentist', 'done with review contract', 'finish order supplies'],
    priority: 83,
  },

  parseArgs: (input) => {
    const text = input
      .replace(/^(complete|done|finish|mark( done| complete))\s+/i, '')
      .replace(/\s+is done$/i, '')
      .trim();
    return { title: text };
  },

  execute: async (args, context) => {
    const { title } = args as { title: string };
    const { garden } = getServices(context);

    const record = garden.getByTitle(title) ?? garden.search(title)[0];
    if (!record || record.type !== 'action') {
      return `No action found matching "${title}".`;
    }

    garden.update(record.id, { status: 'completed' });
    return `✓ Completed: **${record.title}**`;
  },
};

// ── editAction ────────────────────────────────────────────────────────────────

export const editAction: Tool = {
  name: 'editAction',
  description: 'Edit an action\'s fields',

  routing: {
    keywords: {
      verbs: ['edit', 'update', 'change'],
      nouns: ['action'],
    },
    examples: ['edit action call dentist', 'update action context'],
    priority: 60,
  },

  parseArgs: (input) => ({ input }),

  execute: async (args, context) => {
    const { id, title, context: ctx, status, due_date, energy, time_estimate } = args as {
      id?: string;
      title?: string;
      context?: string;
      status?: string;
      due_date?: string;
      energy?: string;
      time_estimate?: string;
    };

    const { garden } = getServices(context);

    let record;
    if (id) {
      record = garden.get(id);
    } else if (title) {
      record = garden.getByTitle(title);
    }

    if (!record) return 'Action not found.';

    const updates: Record<string, unknown> = {};
    if (ctx !== undefined)           updates.context = ctx;
    if (status !== undefined)        updates.status = status;
    if (due_date !== undefined)      updates.due_date = due_date;
    if (energy !== undefined)        updates.energy = energy;
    if (time_estimate !== undefined) updates.time_estimate = time_estimate;

    const updated = garden.update(record.id, updates as any);
    return `Updated: **${updated?.title}**`;
  },
};

// ── listActions ───────────────────────────────────────────────────────────────

export const listActions: Tool = {
  name: 'listActions',
  description: 'List next actions, optionally filtered by context or project',

  routing: {
    patterns: [
      /^(list|show|view) (next )?actions?/i,
      /^what('?s| are) (my )?next actions?/i,
    ],
    keywords: {
      verbs: ['list', 'show', 'view'],
      nouns: ['actions', 'next actions'],
    },
    examples: ['list actions', 'show next actions', "what's my next action"],
    priority: 82,
  },

  parseArgs: (input) => {
    const ctxMatch = input.match(/@(\w+)/);
    return {
      context: ctxMatch ? `@${ctxMatch[1]}` : undefined,
      status: 'active',
    };
  },

  execute: async (args, context) => {
    const { context: ctx, status = 'active', project: projectTitle } = args as {
      context?: string;
      status?: string;
      project?: string;
    };

    const { garden, rels, views } = getServices(context);

    if (projectTitle) {
      // Show project view which includes actions
      const viewData = views.resolve(projectTitle);
      if (viewData) return renderer.render(viewData);
    }

    const viewData = views.resolve('Next Actions');
    if (!viewData) return 'No actions found.';

    // If context filter, apply it
    if (ctx) {
      const list = viewData.sections.find(s => s.kind === 'list') as any;
      if (list) {
        list.items = list.items.filter((i: any) => i.context === ctx);
        list.count = list.items.length;
      }
    }

    return renderer.render(viewData);
  },
};
