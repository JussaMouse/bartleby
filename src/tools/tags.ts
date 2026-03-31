// src/tools/tags.ts
// Garden tools for tags.

import { Tool } from './types.js';
import type { GardenService } from '../garden/GardenService.js';
import type { ViewService } from '../garden/ViewService.js';
import { ReplRenderer } from '../garden/renderers/ReplRenderer.js';
import { resolveRecordByTypeAndTitle } from './record-resolution.js';

function getServices(context: any) {
  const garden = context.services.garden as GardenService;
  const views  = context.services.views  as ViewService;
  return { garden, views };
}

const renderer = new ReplRenderer();

export const createTag: Tool = {
  name: 'createTag',
  description: 'Create a new tag / subject category',

  routing: {
    patterns: [
      /^(create|add|new) tag\s+(.+)/i,
    ],
    keywords: {
      verbs: ['create', 'add', 'new'],
      nouns: ['tag', 'category'],
    },
    examples: ['create tag Recipes', 'new tag World War II'],
    priority: 72,
  },

  parseArgs: (input) => {
    const title = input.replace(/^(create|add|new)\s*tag\s+/i, '').trim();
    return { title };
  },

  execute: async (args, context) => {
    const { title, content } = args as { title: string; content?: string };
    if (!title) return 'What is the tag name?';

    const { garden } = getServices(context);

    // Don't create duplicates
    const existing = resolveRecordByTypeAndTitle(context, 'tag', title);
    if (existing && existing.type === 'tag') {
      return `Tag already exists: **${existing.title}**`;
    }

    const tag = garden.create({ type: 'tag', title, content });
    return `Created tag: **${tag.title}**`;
  },
};

export const listTags: Tool = {
  name: 'listTags',
  description: 'List all tags',

  routing: {
    patterns: [
      /^(list|show|view) (all\s+)?tags?/i,
    ],
    keywords: {
      verbs: ['list', 'show', 'view'],
      nouns: ['tags', 'categories'],
    },
    examples: ['list tags', 'show all tags'],
    priority: 72,
  },

  parseArgs: () => ({}),

  execute: async (_args, context) => {
    const { garden } = getServices(context);
    const tags = garden.getByType('tag', { status: 'active' });

    if (tags.length === 0) return 'No tags yet.';

    const lines = [`**Tags** (${tags.length})\n`];
    for (const tag of tags) {
      lines.push(`• **${tag.title}**${tag.content ? `  — ${tag.content}` : ''}`);
    }
    return lines.join('\n');
  },
};

export const showTag: Tool = {
  name: 'showTag',
  description: 'Show a tag and all notes tagged with it',

  routing: {
    patterns: [
      /^(show|open|view) tag\s+(.+)/i,
    ],
    keywords: {
      verbs: ['show', 'open', 'view'],
      nouns: ['tag'],
    },
    examples: ['show tag Recipes', 'view tag World War II'],
    priority: 73,
  },

  parseArgs: (input) => {
    const title = input.replace(/^(show|open|view)\s*(tag)?\s+/i, '').trim();
    return { title };
  },

  execute: async (args, context) => {
    const { title, id } = args as { title?: string; id?: string };
    const { views } = getServices(context);

    const viewData = id ? views.openRecord(id) : (title ? views.openRecordByTitle(title) : null);
    if (!viewData) return `Tag not found: "${title ?? id}"`;
    return renderer.render(viewData);
  },
};
