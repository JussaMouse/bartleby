// src/tools/notes.ts
// Garden tools for notes and tags.

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

export const createNote: Tool = {
  name: 'createNote',
  description: 'Create a new note',

  routing: {
    patterns: [
      /^(create|write|add|new) note\s+(.+)/i,
      /^note:\s+(.+)/i,
    ],
    keywords: {
      verbs: ['create', 'write', 'add', 'new'],
      nouns: ['note'],
    },
    examples: ['create note Deployment checklist', 'write note Meeting notes for Q1', 'note: interesting observation'],
    priority: 78,
  },

  parseArgs: (input) => {
    const text = input
      .replace(/^(create|write|add|new)\s*note\s+/i, '')
      .replace(/^note:\s+/i, '')
      .trim();
    return { title: text };
  },

  execute: async (args, context) => {
    const { title, content, project: projectTitle } = args as {
      title: string;
      content?: string;
      project?: string;
    };
    if (!title) return 'What should the note be called?';

    const { garden, rels } = getServices(context);
    const note = garden.create({ type: 'note', title, content });

    if (projectTitle) {
      const project = garden.getByTitle(projectTitle);
      if (project) {
        rels.add(note.id, project.id, 'belongs_to');
      }
    }

    // Sync backlinks if content has wiki links
    if (content) rels.syncBacklinks(note);

    return `Created note: **${note.title}**`;
  },
};

export const showNote: Tool = {
  name: 'showNote',
  description: 'Show a note with its content, tags, and backlinks',

  routing: {
    patterns: [
      /^(show|open|view) note\s+(.+)/i,
    ],
    keywords: {
      verbs: ['show', 'open', 'view'],
      nouns: ['note'],
    },
    examples: ['show note Deployment checklist', 'open note Meeting notes'],
    priority: 75,
  },

  parseArgs: (input) => {
    const title = input.replace(/^(show|open|view)\s*(note)?\s+/i, '').trim();
    return { title };
  },

  execute: async (args, context) => {
    const { title, id } = args as { title?: string; id?: string };
    const { views } = getServices(context);

    const viewData = id ? views.openRecord(id) : (title ? views.resolve(title) : null);
    if (!viewData) return `Note not found: "${title ?? id}"`;
    return renderer.render(viewData);
  },
};

export const editNote: Tool = {
  name: 'editNote',
  description: 'Edit a note\'s title or content',

  routing: {
    keywords: {
      verbs: ['edit', 'update', 'change'],
      nouns: ['note'],
    },
    examples: ['edit note Deployment checklist'],
    priority: 60,
  },

  parseArgs: (input) => ({ input }),

  execute: async (args, context) => {
    const { id, title, newTitle, content } = args as {
      id?: string;
      title?: string;
      newTitle?: string;
      content?: string;
    };

    const { garden, rels } = getServices(context);

    let record;
    if (id) {
      record = garden.get(id);
    } else if (title) {
      record = garden.getByTitle(title);
    }
    if (!record) return 'Note not found.';

    const updates: Record<string, unknown> = {};
    if (newTitle !== undefined) updates.title = newTitle;
    if (content  !== undefined) updates.content = content;

    const updated = garden.update(record.id, updates as any);
    if (!updated) return 'Failed to update note.';

    if (content !== undefined) rels.syncBacklinks(updated);

    return `Updated note: **${updated.title}**`;
  },
};

export const deleteNote: Tool = {
  name: 'deleteNote',
  description: 'Delete a note',

  routing: {
    keywords: {
      verbs: ['delete', 'remove'],
      nouns: ['note'],
    },
    examples: ['delete note Old meeting notes'],
    priority: 60,
  },

  parseArgs: (input) => {
    const title = input.replace(/^(delete|remove)\s*(note)?\s+/i, '').trim();
    return { title };
  },

  execute: async (args, context) => {
    const { title, id } = args as { title?: string; id?: string };
    const { garden } = getServices(context);

    let record;
    if (id) {
      record = garden.get(id);
    } else if (title) {
      record = garden.getByTitle(title);
    }
    if (!record) return 'Note not found.';

    garden.delete(record.id);
    return `Deleted note: **${record.title}**`;
  },
};

export const listNotes: Tool = {
  name: 'listNotes',
  description: 'List all active notes',

  routing: {
    patterns: [
      /^(list|show|view) (all\s+)?notes?/i,
    ],
    keywords: {
      verbs: ['list', 'show', 'view'],
      nouns: ['notes'],
    },
    examples: ['list notes', 'show all notes'],
    priority: 77,
  },

  parseArgs: () => ({}),

  execute: async (_args, context) => {
    const { views } = getServices(context);
    const viewData = views.resolve('All Notes');
    if (!viewData) return 'No notes found.';
    return renderer.render(viewData);
  },
};

export const tagNote: Tool = {
  name: 'tagNote',
  description: 'Tag a note with a subject category',

  routing: {
    patterns: [
      /^tag\s+(.+?)\s+(?:with\s+)?(.+)/i,
    ],
    keywords: {
      verbs: ['tag'],
      nouns: ['note', 'tag'],
    },
    examples: ['tag Deployment checklist with DevOps', 'tag Meeting notes with Work'],
    priority: 76,
  },

  parseArgs: (input) => {
    const match = input.match(/^tag\s+(.+?)\s+(?:with\s+)?(.+)/i);
    if (match) return { noteTitle: match[1].trim(), tagTitle: match[2].trim() };
    return {};
  },

  execute: async (args, context) => {
    const { noteTitle, tagTitle, noteId, tagId } = args as {
      noteTitle?: string;
      tagTitle?: string;
      noteId?: string;
      tagId?: string;
    };

    const { garden, rels } = getServices(context);

    const note = noteId ? garden.get(noteId) : (noteTitle ? garden.getByTitle(noteTitle) : null);
    if (!note) return `Note not found: "${noteTitle ?? noteId}"`;

    // Find or create tag
    let tag = tagId ? garden.get(tagId) : (tagTitle ? garden.getByTitle(tagTitle) : null);
    if (!tag && tagTitle) {
      tag = garden.create({ type: 'tag', title: tagTitle });
    }
    if (!tag) return 'Tag not found or created.';

    rels.add(note.id, tag.id, 'tagged_with');
    return `Tagged **${note.title}** with **${tag.title}**`;
  },
};
