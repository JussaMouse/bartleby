// src/tools/index.ts
import { Tool } from './types.js';
import { promptHandler }                                                         from './prompt-handler.js';
import { captureItem, showInbox, processItem, addAction,
         completeAction, editAction, listActions }                               from './actions.js';
import { createProject, showProject, completeProject, listProjects }            from './projects.js';
import { createNote, showNote, editNote, deleteNote, listNotes, tagNote }        from './notes.js';
import { addContact, showContact, editContact, listContacts, findContact }       from './contacts.js';
import { createEvent, showEvent, editEvent, listEvents, showCalendar }           from './events.js';
import { importMedia, showMedia }                                                from './media.js';
import { createTag, listTags, showTag }                                          from './tags.js';
import { listViews, openView, createView, deleteView }                           from './garden-views.js';
import { contextTools }                                                          from './context.js';
import { memoryTools }                                                           from './memory.js';
import { historyTools }                                                          from './history.js';
import { weatherTools }                                                          from './weather.js';
import { ocrTools }                                                              from './ocr.js';
import { dataTools }                                                             from './data.js';
import { settingsTools }                                                         from './settings.js';
import { firstRunTools }                                                         from './first-run-wizard.js';
import { settingsMigrationTools }                                                from './settings-migration.js';

// Aggregate all tools.
// promptHandler MUST be first for Layer 0 contextual routing.
export const allTools: Tool[] = [
  promptHandler,

  // Garden: items and actions
  captureItem,
  showInbox,
  processItem,
  addAction,
  completeAction,
  editAction,
  listActions,

  // Garden: projects
  createProject,
  showProject,
  completeProject,
  listProjects,

  // Garden: notes
  createNote,
  showNote,
  editNote,
  deleteNote,
  listNotes,
  tagNote,

  // Garden: contacts
  addContact,
  showContact,
  editContact,
  listContacts,
  findContact,

  // Garden: events
  createEvent,
  showEvent,
  editEvent,
  listEvents,
  showCalendar,

  // Garden: media
  importMedia,
  showMedia,

  // Garden: tags
  createTag,
  listTags,
  showTag,

  // Garden: views
  listViews,
  openView,
  createView,
  deleteView,

  // Context and memory
  ...contextTools,
  ...memoryTools,

  // History
  ...historyTools,

  // Weather
  ...weatherTools,

  // Utilities
  ...ocrTools,
  ...dataTools,
  ...settingsTools,
  ...firstRunTools,
  ...settingsMigrationTools,
];

export function getToolByName(name: string): Tool | undefined {
  return allTools.find(t => t.name === name);
}

export function getToolsByPriority(): Tool[] {
  return [...allTools].sort((a, b) => {
    const pa = a.routing?.priority ?? 0;
    const pb = b.routing?.priority ?? 0;
    return pb - pa;
  });
}

export function getToolDescriptions(): string {
  return allTools.map(t => `- ${t.name}: ${t.description}`).join('\n');
}

// Re-export
export * from './types.js';
