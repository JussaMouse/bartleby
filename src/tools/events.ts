// src/tools/events.ts
// Garden tools for events.

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

export const createEvent: Tool = {
  name: 'createEvent',
  description: 'Create a new event',

  routing: {
    patterns: [
      /^(create|add|new|schedule) event\s+(.+)/i,
      /^schedule\s+(.+)/i,
    ],
    keywords: {
      verbs: ['create', 'add', 'new', 'schedule'],
      nouns: ['event', 'meeting', 'appointment'],
    },
    examples: ['create event Team Meeting', 'schedule dentist appointment', 'new event Conference 2026'],
    priority: 78,
    intentClass: 'mutation_create',
  },

  parseArgs: (input) => {
    const title = input.replace(/^(create|add|new|schedule)\s*(event)?\s+/i, '').trim();
    return { title };
  },

  execute: async (args, context) => {
    const { title, starts_at, ends_at, all_day, location, content } = args as {
      title: string;
      starts_at?: string;
      ends_at?: string;
      all_day?: number;
      location?: string;
      content?: string;
    };

    if (!title) return 'What is the event called?';
    const { garden } = getServices(context);

    const event = garden.create({ type: 'event', title, starts_at, ends_at, all_day, location, content });
    const when = starts_at ? `  ${starts_at}` : '';
    return `Created event: **${event.title}**${when}`;
  },
};

export const showEvent: Tool = {
  name: 'showEvent',
  description: 'Show an event with its attendees and details',

  routing: {
    patterns: [
      /^(show|open|view) event\s+(.+)/i,
    ],
    keywords: {
      verbs: ['show', 'open', 'view'],
      nouns: ['event', 'meeting'],
    },
    examples: ['show event Team Meeting', 'view event Conference 2026'],
    priority: 74,
    intentClass: 'record_open',
  },

  parseArgs: (input) => {
    const title = input.replace(/^(show|open|view)\s*(event)?\s+/i, '').trim();
    return { title };
  },

  execute: async (args, context) => {
    const { title, id } = args as { title?: string; id?: string };
    const { views } = getServices(context);

    const viewData = id ? views.openRecord(id) : (title ? views.openRecordByTitle(title) : null);
    if (!viewData) return `Event not found: "${title ?? id}"`;
    return renderer.render(viewData);
  },
};

export const editEvent: Tool = {
  name: 'editEvent',
  description: 'Edit an event',

  routing: {
    keywords: {
      verbs: ['edit', 'update', 'change', 'reschedule'],
      nouns: ['event', 'meeting'],
    },
    examples: ['edit event Team Meeting', 'reschedule dentist'],
    priority: 60,
    intentClass: 'mutation_update',
  },

  parseArgs: (input) => ({ input }),

  execute: async (args, context) => {
    const { id, title, starts_at, ends_at, location, content } = args as {
      id?: string;
      title?: string;
      starts_at?: string;
      ends_at?: string;
      location?: string;
      content?: string;
    };

    const { garden } = getServices(context);
    const record = resolveRecordByTypeAndTitle(context, 'event', title, id);
    if (!record) return 'Event not found.';

    const updates: Record<string, unknown> = {};
    if (starts_at !== undefined) updates.starts_at = starts_at;
    if (ends_at   !== undefined) updates.ends_at   = ends_at;
    if (location  !== undefined) updates.location  = location;
    if (content   !== undefined) updates.content   = content;

    const updated = garden.update(record.id, updates as any);
    return `Updated event: **${updated?.title}**`;
  },
};

export const listEvents: Tool = {
  name: 'listEvents',
  description: 'List upcoming events',

  routing: {
    patterns: [
      /^(list|show|view) (all\s+)?(upcoming\s+)?events?/i,
    ],
    keywords: {
      verbs: ['list', 'show', 'view'],
      nouns: ['events', 'calendar'],
    },
    examples: ['list events', 'show upcoming events', 'view all events'],
    priority: 77,
    intentClass: 'collection_list',
  },

  parseArgs: () => ({}),

  execute: async (_args, context) => {
    const { views } = getServices(context);
    const viewData = views.resolve('All Events');
    if (!viewData) return 'No events found.';
    return renderer.render(viewData);
  },
};

export const showCalendar: Tool = {
  name: 'showCalendar',
  description: 'Show calendar view of upcoming events',

  routing: {
    patterns: [
      /^(show|open|view) calendar/i,
      /^calendar/i,
    ],
    keywords: {
      verbs: ['show', 'open', 'view'],
      nouns: ['calendar'],
    },
    examples: ['show calendar', 'open calendar', 'calendar'],
    priority: 80,
    intentClass: 'collection_list',
  },

  parseArgs: () => ({}),

  execute: async (_args, context) => {
    const { views } = getServices(context);
    // Calendar is a computed view; fall back to All Events for now
    const viewData = views.resolve('All Events');
    if (!viewData) return 'No events found.';
    return renderer.render(viewData);
  },
};
