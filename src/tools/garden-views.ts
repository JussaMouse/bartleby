// src/tools/garden-views.ts
// Garden tools for managing views — list, create, delete, open.

import { Tool } from './types.js';
import type { GardenService } from '../garden/GardenService.js';
import type { ViewService } from '../garden/ViewService.js';
import { ReplRenderer } from '../garden/renderers/ReplRenderer.js';
import type { QuerySpec } from '../garden/types.js';

function getServices(context: any) {
  const garden = context.services.garden as GardenService;
  const views  = context.services.views  as ViewService;
  return { garden, views };
}

const renderer = new ReplRenderer();

export const listViews: Tool = {
  name: 'listViews',
  description: 'List all available garden views',

  routing: {
    patterns: [
      /^(list|show|view) (garden\s+)?views?/i,
      /^show garden view types?/i,
    ],
    keywords: {
      verbs: ['list', 'show', 'view'],
      nouns: ['views', 'garden views', 'view types'],
    },
    examples: ['list views', 'show garden views', 'show garden view types'],
    priority: 72,
  },

  parseArgs: () => ({}),

  execute: async (_args, context) => {
    const { views } = getServices(context);
    const catalogue = views.catalogue();

    const system = catalogue.filter(e => e.system);
    const user   = catalogue.filter(e => !e.system && e.kind !== 'record');
    const assemblers = catalogue.filter(e => e.kind === 'record');

    const lines = [`**Garden View Catalogue** (${catalogue.length})\n`];

    lines.push('**System Views**');
    for (const e of system) {
      lines.push(`  • ${e.name}${e.description ? `  — ${e.description}` : ''}`);
    }

    if (assemblers.length) {
      lines.push('\n**Record Views**');
      for (const e of assemblers) {
        lines.push(`  • ${e.name}${e.description ? `  — ${e.description}` : ''}`);
      }
    }

    if (user.length) {
      lines.push('\n**Your Views**');
      for (const e of user) {
        lines.push(`  • ${e.name}${e.description ? `  — ${e.description}` : ''}`);
      }
    }

    return lines.join('\n');
  },
};

export const openView: Tool = {
  name: 'openView',
  description: 'Open a named garden view or record',

  routing: {
    patterns: [
      /^open view\s+(.+)/i,
      /^show view\s+(.+)/i,
      /^view\s+(.+)/i,
    ],
    keywords: {
      verbs: ['open', 'show', 'view'],
      nouns: ['view'],
    },
    examples: ['open view Inbox', 'show view Next Actions', 'view Waiting For'],
    priority: 70,
  },

  parseArgs: (input) => {
    const name = input.replace(/^(open|show|view)\s*(view)?\s+/i, '').trim();
    return { name };
  },

  execute: async (args, context) => {
    const { name } = args as { name: string };
    if (!name) return 'Which view should I open?';

    const { views } = getServices(context);
    const viewData = views.resolve(name);

    if (!viewData) return `No view found matching "${name}".`;
    return renderer.render(viewData);
  },
};

export const createView: Tool = {
  name: 'createView',
  description: 'Create a new custom garden view',

  routing: {
    patterns: [
      /^(create|new|add) view\s+(.+)/i,
      /^new view\s+(.+)/i,
    ],
    keywords: {
      verbs: ['create', 'new', 'add'],
      nouns: ['view', 'garden view'],
    },
    examples: ['create view Urgent Actions', 'new view Notes from this week'],
    priority: 70,
  },

  parseArgs: (input) => {
    const name = input.replace(/^(create|new|add)\s*view\s+/i, '').trim();
    return { name };
  },

  execute: async (args, context) => {
    const { name, query_spec, description } = args as {
      name: string;
      query_spec?: QuerySpec;
      description?: string;
    };

    if (!name) return 'What should the view be called?';

    const { views } = getServices(context);

    const spec: QuerySpec = query_spec ?? {};
    const view = views.createUserView(name, spec, description);
    return `Created view: **${view.name}**`;
  },
};

export const deleteView: Tool = {
  name: 'deleteView',
  description: 'Delete a user-defined garden view',

  routing: {
    keywords: {
      verbs: ['delete', 'remove'],
      nouns: ['view', 'garden view'],
    },
    examples: ['delete view Urgent Actions'],
    priority: 65,
  },

  parseArgs: (input) => {
    const name = input.replace(/^(delete|remove)\s*(view)?\s+/i, '').trim();
    return { name };
  },

  execute: async (args, context) => {
    const { name, id } = args as { name?: string; id?: string };
    const { views, garden } = getServices(context);

    let viewId = id;
    if (!viewId && name) {
      const db = garden.getDB();
      const row = db.prepare('SELECT id FROM garden_view WHERE name = ? COLLATE NOCASE').get(name) as any;
      viewId = row?.id;
    }

    if (!viewId) return `No view found matching "${name}".`;

    const deleted = views.deleteUserView(viewId);
    if (!deleted) return `Cannot delete "${name}" — it may be a system view.`;
    return `Deleted view: **${name}**`;
  },
};
