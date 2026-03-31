// src/tools/projects.ts
// Garden tools for projects.

import { Tool } from './types.js';
import type { GardenService } from '../garden/GardenService.js';
import type { RelationshipService } from '../garden/RelationshipService.js';
import type { ViewService } from '../garden/ViewService.js';
import { ReplRenderer } from '../garden/renderers/ReplRenderer.js';
import { resolveRecordByTypeAndTitle } from './record-resolution.js';

function getServices(context: any) {
  const garden = context.services.garden as GardenService;
  const rels   = context.services.rels   as RelationshipService;
  const views  = context.services.views  as ViewService;
  return { garden, rels, views };
}

const renderer = new ReplRenderer();

export const createProject: Tool = {
  name: 'createProject',
  description: 'Create a new project',

  routing: {
    patterns: [
      /^(create|start|new|add) project\s+(.+)/i,
    ],
    keywords: {
      verbs: ['create', 'start', 'new', 'add'],
      nouns: ['project'],
    },
    examples: ['create project Home Renovation', 'new project Website Redesign'],
    priority: 80,
    intentClass: 'mutation_create',
  },

  parseArgs: (input) => {
    const title = input.replace(/^(create|start|new|add)\s*project\s+/i, '').trim();
    return { title };
  },

  execute: async (args, context) => {
    const { title, content, due_date } = args as { title: string; content?: string; due_date?: string };
    if (!title) return 'What is the project name?';
    const { garden } = getServices(context);
    const project = garden.create({ type: 'project', title, content, due_date });
    return `Created project: **${project.title}**`;
  },
};

export const showProject: Tool = {
  name: 'showProject',
  description: 'Show a project with all its actions, notes, and related items',

  routing: {
    patterns: [
      /^(show|open|view) project\s+(.+)/i,
      /^open\s+(.+)/i,
    ],
    keywords: {
      verbs: ['show', 'open', 'view'],
      nouns: ['project'],
    },
    examples: ['show project Home Renovation', 'open Home Renovation'],
    priority: 75,
    intentClass: 'record_open',
  },

  parseArgs: (input) => {
    const title = input.replace(/^(show|open|view)\s*(project)?\s+/i, '').trim();
    return { title };
  },

  execute: async (args, context) => {
    const { title, id } = args as { title?: string; id?: string };
    const { garden, views } = getServices(context);

    let viewData;
    if (id) {
      viewData = views.openRecord(id);
    } else if (title) {
      viewData = views.openRecordByTitle(title);
    }

    if (!viewData) return `Project not found: "${title ?? id}"`;
    return renderer.render(viewData);
  },
};

export const completeProject: Tool = {
  name: 'completeProject',
  description: 'Mark a project as completed',

  routing: {
    keywords: {
      verbs: ['complete', 'finish', 'close'],
      nouns: ['project'],
    },
    examples: ['complete project Home Renovation', 'finish project Website Redesign'],
    priority: 72,
    intentClass: 'mutation_update',
  },

  parseArgs: (input) => {
    const title = input.replace(/^(complete|finish|close)\s*(project)?\s+/i, '').trim();
    return { title };
  },

  execute: async (args, context) => {
    const { title } = args as { title: string };
    const { garden } = getServices(context);

    const project = resolveRecordByTypeAndTitle(context, 'project', title);
    if (!project || project.type !== 'project') {
      return `No project found matching "${title}".`;
    }

    garden.update(project.id, { status: 'completed' });
    return `✓ Completed project: **${project.title}**`;
  },
};

export const listProjects: Tool = {
  name: 'listProjects',
  description: 'List all active projects',

  routing: {
    patterns: [
      /^(list|show|view) (all\s+)?projects?/i,
      /^what('?s| are) my projects?/i,
    ],
    keywords: {
      verbs: ['list', 'show', 'view'],
      nouns: ['projects'],
    },
    examples: ['list projects', 'show all projects', 'what are my projects'],
    priority: 79,
    intentClass: 'collection_list',
  },

  parseArgs: () => ({}),

  execute: async (_args, context) => {
    const { views } = getServices(context);
    const viewData = views.resolve('All Projects');
    if (!viewData) return 'No projects found.';
    return renderer.render(viewData);
  },
};
