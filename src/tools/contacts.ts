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

export const showWithContact: Tool = {
  name: 'showWithContact',
  description: 'Show all items linked to a contact',

  routing: {
    patterns: [
      /^show\s+(all\s+)?with\s+(.+)$/i,
      /^(actions?|events?|projects?)\s+with\s+(.+)$/i,
      /^what.+with\s+(.+)\??$/i,
      /^do\s+i\s+have\s+anything\s+with\s+(.+)\??$/i,
    ],
    keywords: {
      verbs: ['show', 'list', 'find'],
      nouns: ['with'],
    },
    examples: ['show all with sarah', 'actions with mom', 'do i have anything with nicole?'],
    priority: 85,
  },

  parseArgs: (input) => {
    // Extract contact name from various patterns
    let contactName = '';
    let filterType: string | undefined;
    
    const allWithMatch = input.match(/^show\s+(?:all\s+)?with\s+(.+)$/i);
    if (allWithMatch) {
      contactName = allWithMatch[1].trim();
    }
    
    const typeWithMatch = input.match(/^(actions?|events?|projects?)\s+with\s+(.+)$/i);
    if (typeWithMatch) {
      filterType = typeWithMatch[1].toLowerCase().replace(/s$/, ''); // normalize to singular
      contactName = typeWithMatch[2].trim();
    }
    
    const whatWithMatch = input.match(/what.+with\s+(.+)\??$/i);
    if (whatWithMatch) {
      contactName = whatWithMatch[1].trim().replace(/\?$/, '');
    }
    
    const anythingMatch = input.match(/anything\s+with\s+(.+)\??$/i);
    if (anythingMatch) {
      contactName = anythingMatch[1].trim().replace(/\?$/, '');
    }
    
    // Clean up contact name
    contactName = contactName.replace(/[?.,!]$/, '').trim();
    
    return { contactName, filterType };
  },

  execute: async (args, context) => {
    const { contactName, filterType } = args as { contactName: string; filterType?: string };

    if (!contactName) {
      return 'Please specify a contact name. Example: show all with sarah';
    }

    // Resolve contact
    const resolution = context.services.garden.resolveContact(contactName);
    
    if (resolution === null) {
      return `No contact found matching "${contactName}"`;
    }
    
    if (Array.isArray(resolution)) {
      const names = resolution.map(c => c.title).join(', ');
      return `Multiple contacts match "${contactName}": ${names}\nPlease be more specific.`;
    }

    const contact = context.services.garden.get(resolution.id);
    if (!contact) {
      return `Contact not found: ${contactName}`;
    }

    // Get all records linked to this contact
    let records = context.services.garden.getByContact(resolution.id);
    
    // Filter by type if specified
    if (filterType) {
      records = records.filter(r => r.type === filterType);
    }

    // Also search calendar events for this contact
    const calendarEvents = context.services.calendar.getUpcoming(30);
    const linkedEvents = calendarEvents.filter(e => {
      if (!e.metadata) return false;
      try {
        const meta = JSON.parse(e.metadata);
        return meta.contactIds?.includes(resolution.id);
      } catch {
        return false;
      }
    });

    if (records.length === 0 && linkedEvents.length === 0) {
      return `No items linked to ${contact.title}`;
    }

    const lines: string[] = [`**Items with ${contact.title}**`];

    // Group records by type
    const actions = records.filter(r => r.type === 'action');
    const projects = records.filter(r => r.type === 'project');
    const notes = records.filter(r => r.type === 'note');
    const others = records.filter(r => !['action', 'project', 'note'].includes(r.type));

    if (actions.length > 0 && (!filterType || filterType === 'action')) {
      lines.push(`\n**Actions** (${actions.length})`);
      for (const a of actions) {
        const ctx = a.context ? ` ${a.context}` : '';
        const due = a.due_date ? ` [due: ${a.due_date}]` : '';
        lines.push(`• ${a.title}${ctx}${due}`);
      }
    }

    if (linkedEvents.length > 0 && (!filterType || filterType === 'event')) {
      lines.push(`\n**Events** (${linkedEvents.length})`);
      for (const e of linkedEvents) {
        const d = new Date(e.start_time);
        const dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        const timeStr = e.all_day ? '' : ` ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
        lines.push(`• ${e.title} — ${dateStr}${timeStr}`);
      }
    }

    if (projects.length > 0 && (!filterType || filterType === 'project')) {
      lines.push(`\n**Projects** (${projects.length})`);
      for (const p of projects) {
        lines.push(`• ${p.title}`);
      }
    }

    if (notes.length > 0) {
      lines.push(`\n**Notes** (${notes.length})`);
      for (const n of notes) {
        lines.push(`• ${n.title}`);
      }
    }

    if (others.length > 0) {
      lines.push(`\n**Other** (${others.length})`);
      for (const o of others) {
        lines.push(`• ${o.title} (${o.type})`);
      }
    }

    return lines.join('\n');
  },
};

export const contactTools: Tool[] = [addContact, findContact, deleteContact, showWithContact];
