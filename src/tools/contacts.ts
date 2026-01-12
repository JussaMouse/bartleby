// src/tools/contacts.ts
import { Tool } from './types.js';

export const addContact: Tool = {
  name: 'addContact',
  description: 'Create a new contact',

  routing: {
    patterns: [
      /^add\s+contact\s+(.+)$/i,
      /^new\s+contact\s+(.+)$/i,
      /^create\s+contact\s+(.+)$/i,
    ],
    keywords: {
      verbs: ['add', 'create', 'new'],
      nouns: ['contact'],  // Removed 'person' - too generic, causes false matches
    },
    priority: 85,
  },

  parseArgs: (input) => {
    let text = input.replace(/^(add|new)\s+contact\s*/i, '');

    // Parse "name, email xxx, phone xxx"
    const parts = text.split(/,\s*/);
    const name = parts[0]?.trim();

    let email: string | undefined;
    let phone: string | undefined;
    let notes: string[] = [];

    for (let i = 1; i < parts.length; i++) {
      const part = parts[i].trim().toLowerCase();
      if (part.startsWith('email ')) {
        email = parts[i].replace(/^email\s*/i, '').trim();
      } else if (part.startsWith('phone ')) {
        phone = parts[i].replace(/^phone\s*/i, '').trim();
      } else {
        notes.push(parts[i].trim());
      }
    }

    return { name, email, phone, content: notes.join('\n') };
  },

  execute: async (args, context) => {
    const { name, email, phone, content } = args as {
      name: string;
      email?: string;
      phone?: string;
      content?: string;
    };

    if (!name) {
      return 'Please provide a name. Example: add contact Sarah Chen, email sarah@example.com';
    }

    const contact = context.services.garden.addContact(name, { email, phone, content });

    let response = `✓ Created contact: ${contact.title}`;
    if (email) response += `\n  Email: ${email}`;
    if (phone) response += `\n  Phone: ${phone}`;

    return response;
  },
};

export const findContact: Tool = {
  name: 'findContact',
  description: 'Search for a contact',

  routing: {
    patterns: [
      /^find\s+(contact\s+)?(.+)$/i,
      /^search\s+(contact|contacts)\s+(.+)$/i,
      /^who\s+is\s+(.+)$/i,
    ],
    keywords: {
      verbs: ['find', 'search', 'lookup', 'who'],
      nouns: ['contact', 'person'],
    },
    priority: 80,
  },

  parseArgs: (input) => {
    const query = input
      .replace(/^(find|search|who\s+is)\s+(contact\s+)?/i, '')
      .trim();
    return { query };
  },

  execute: async (args, context) => {
    const { query } = args as { query: string };

    if (!query) {
      return 'Please provide a name to search. Example: find sarah';
    }

    const contacts = context.services.garden.searchContacts(query);

    if (contacts.length === 0) {
      return `No contacts found matching "${query}"`;
    }

    const lines = [`Found ${contacts.length} contact(s):`];
    for (const c of contacts) {
      lines.push(`\n**${c.title}**`);
      if (c.email) lines.push(`  Email: ${c.email}`);
      if (c.phone) lines.push(`  Phone: ${c.phone}`);
    }

    return lines.join('\n');
  },
};

export const deleteContact: Tool = {
  name: 'deleteContact',
  description: 'Remove a contact',

  routing: {
    patterns: [
      /^(delete|remove)\s+contact\s+(.+)$/i,
    ],
    keywords: {
      verbs: ['delete', 'remove'],
      nouns: ['contact'],
    },
    priority: 90,  // Higher than addContact to catch "remove contact" first
  },

  parseArgs: (input) => {
    const query = input.replace(/^(delete|remove)\s+contact\s*/i, '').trim();
    return { query };
  },

  execute: async (args, context) => {
    const { query } = args as { query: string };

    if (!query) {
      return 'Please provide a contact name to remove. Example: remove contact John';
    }

    // Find the contact first
    const contacts = context.services.garden.searchContacts(query);

    if (contacts.length === 0) {
      return `No contact found matching "${query}"`;
    }

    if (contacts.length > 1) {
      const names = contacts.map(c => c.title).join(', ');
      return `Multiple contacts match "${query}": ${names}\nPlease be more specific.`;
    }

    // Delete the single match
    const contact = contacts[0];
    const deleted = context.services.garden.delete(contact.id);

    if (deleted) {
      return `✓ Removed contact: ${contact.title}`;
    }
    return `Failed to remove contact: ${contact.title}`;
  },
};

export const contactTools: Tool[] = [addContact, findContact, deleteContact];
