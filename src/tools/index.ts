// src/tools/index.ts
import { Tool } from './types.js';
import { createNoteWorkflow, editNoteWorkflow }                               from './note-workflow.js';
import { setupWizardWorkflow, guidedSettingsWorkflow }                         from './setup-workflow.js';
import { workflowRouter }                                                        from './workflow-router.js';
import { processInboxStart }                                                    from './inbox-processing.js';
import { captureItem, showInbox, processItem, addAction,
         completeAction, editAction, listActions }                               from './actions.js';
import { createProject, showProject, completeProject, listProjects }            from './projects.js';
import { showNote, editNote, deleteNote, listNotes, tagNote }                    from './notes.js';
import { addContact, showContact, editContact, listContacts, findContact }       from './contacts.js';
import { createEvent, showEvent, editEvent, listEvents, showCalendar }           from './events.js';
import { importMedia, showMedia }                                                from './media.js';
import { createTag, listTags, showTag }                                          from './tags.js';
import { contextTools }                                                          from './context.js';
import { memoryTools }                                                           from './memory.js';
import { historyTools }                                                          from './history.js';
import { weatherTools }                                                          from './weather.js';
import { shedTools }                                                             from './shed.js';
import { ocrTools }                                                              from './ocr.js';
import { dataTools }                                                             from './data.js';
import { settingsTools }                                                         from './settings.js';
import { firstRunTools }                                                         from './first-run-wizard.js';
import { systemTools }                                                           from './system.js';
import { routerTrainingTools }                                                   from './router-training.js';

// Aggregate all tools.
export const allTools: Tool[] = [
  workflowRouter,
  processInboxStart,

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
  setupWizardWorkflow,
  guidedSettingsWorkflow,
  guidedSettingsWorkflow,
  createNoteWorkflow,
  showNote,
  editNoteWorkflow,
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


  // Context and memory
  ...contextTools,
  ...memoryTools,

  // History
  ...historyTools,

  // Weather
  ...weatherTools,

  // Shed
  ...shedTools,

  // Utilities
  ...ocrTools,
  ...dataTools,
  ...settingsTools,
  ...routerTrainingTools,
  ...firstRunTools,
  ...systemTools,
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
