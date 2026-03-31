// src/tools/contacts.ts
// Garden tools for contacts.

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

export const addContact: Tool = {
  name: 'addContact',
  description: 'Add a new contact',

  routing: {
    patterns: [
      /^(add|create|new) contact\s+(.+)/i,
    ],
    keywords: {
      verbs: ['add', 'create', 'new'],
      nouns: ['contact', 'person'],
    },
    examples: ['add contact Alice Chen', 'new contact Bob Smith'],
    priority: 78,
    intentClass: 'mutation_create',
  },

  parseArgs: (input) => {
    const title = input.replace(/^(add|create|new)\s*contact\s+/i, '').trim();
    return { title };
  },

  execute: async (args, context) => {
    const { title, email, phone, company, address, birthday } = args as {
      title: string;
      email?: string;
      phone?: string;
      company?: string;
      address?: string;
      birthday?: string;
    };

    if (!title) return 'What is the contact\'s name?';
    const { garden } = getServices(context);

    const contact = garden.create({ type: 'contact', title, email, phone, company, address, birthday });
    return `Added contact: **${contact.title}**`;
  },
};

export const showContact: Tool = {
  name: 'showContact',
  description: 'Show a contact\'s details and relationships',

  routing: {
    patterns: [
      /^(show|open|view) contact\s+(.+)/i,
    ],
    keywords: {
      verbs: ['show', 'open', 'view'],
      nouns: ['contact'],
    },
    examples: ['show contact Alice Chen', 'view contact Bob Smith'],
    priority: 74,
    intentClass: 'record_open',
  },

  parseArgs: (input) => {
    const title = input.replace(/^(show|open|view)\s*(contact)?\s+/i, '').trim();
    return { title };
  },

  execute: async (args, context) => {
    const { title, id } = args as { title?: string; id?: string };
    const { views } = getServices(context);

    const viewData = id ? views.openRecord(id) : (title ? views.openRecordByTitle(title) : null);
    if (!viewData) return `Contact not found: "${title ?? id}"`;
    return renderer.render(viewData);
  },
};

export const editContact: Tool = {
  name: 'editContact',
  description: 'Edit a contact\'s details',

  routing: {
    keywords: {
      verbs: ['edit', 'update', 'change'],
      nouns: ['contact'],
    },
    examples: ['edit contact Alice Chen'],
    priority: 60,
    intentClass: 'mutation_update',
  },

  parseArgs: (input) => ({ input }),

  execute: async (args, context) => {
    const { id, title, email, phone, company, address, birthday, content } = args as {
      id?: string;
      title?: string;
      email?: string;
      phone?: string;
      company?: string;
      address?: string;
      birthday?: string;
      content?: string;
    };

    const { garden } = getServices(context);
    const record = resolveRecordByTypeAndTitle(context, 'contact', title, id);
    if (!record) return 'Contact not found.';

    const updates: Record<string, unknown> = {};
    if (email    !== undefined) updates.email    = email;
    if (phone    !== undefined) updates.phone    = phone;
    if (company  !== undefined) updates.company  = company;
    if (address  !== undefined) updates.address  = address;
    if (birthday !== undefined) updates.birthday = birthday;
    if (content  !== undefined) updates.content  = content;

    const updated = garden.update(record.id, updates as any);
    return `Updated contact: **${updated?.title}**`;
  },
};

export const listContacts: Tool = {
  name: 'listContacts',
  description: 'List all active contacts',

  routing: {
    patterns: [
      /^(list|show|view) (all\s+)?contacts?/i,
    ],
    keywords: {
      verbs: ['list', 'show', 'view'],
      nouns: ['contacts'],
    },
    examples: ['list contacts', 'show all contacts'],
    priority: 77,
    intentClass: 'collection_list',
  },

  parseArgs: () => ({}),

  execute: async (_args, context) => {
    const { views } = getServices(context);
    const viewData = views.resolve('Contacts');
    if (!viewData) return 'No contacts found.';
    return renderer.render(viewData);
  },
};

export const findContact: Tool = {
  name: 'findContact',
  description: 'Find a contact by name or details',

  routing: {
    patterns: [
      /^find contact\s+(.+)/i,
      /^search contacts?\s+(.+)/i,
    ],
    keywords: {
      verbs: ['find', 'search', 'look up'],
      nouns: ['contact'],
    },
    examples: ['find contact Alice', 'search contacts Bob'],
    priority: 74,
    intentClass: 'record_open',
  },

  parseArgs: (input) => {
    const query = input.replace(/^(find contact|search contacts?)\s+/i, '').trim();
    return { query };
  },

  execute: async (args, context) => {
    const { query } = args as { query: string };
    if (!query) return 'What contact are you looking for?';

    const { garden } = getServices(context);
    const results = garden.search(query).filter(r => r.type === 'contact');

    if (results.length === 0) return `No contacts found matching "${query}".`;

    const lines = [`Found ${results.length} contact(s):\n`];
    for (const c of results) {
      const details = [c.email, c.phone, c.company].filter(Boolean).join(' · ');
      lines.push(`• **${c.title}**${details ? `  ${details}` : ''}`);
    }
    return lines.join('\n');
  },
};
