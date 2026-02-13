/**
 * Command Executor
 *
 * Executes parsed CommandIntent objects using the Garden service.
 * Returns CommandResult indicating success/failure and any created/updated items.
 *
 * Integrates with LearningService to record observations and relationships.
 */

import type { GardenService } from '../services/garden.js';
import type { LearningService } from '../services/learning.js';
import { debug } from '../utils/logger.js';
import type {
  CommandIntent,
  CommandResult,
  CreateNoteCommand,
  CreateActionCommand,
  CreateProjectCommand,
  CreateEventCommand,
  CreateContactCommand,
  ShowPanelCommand,
  ShowProjectCommand,
  ShowNoteCommand,
  ListItemsCommand,
  SearchCommand,
  MarkDoneCommand,
  DeleteItemCommand,
} from './command-types.js';

// ============================================
// Creation Commands
// ============================================

function executeCreateNote(cmd: CreateNoteCommand, garden: GardenService): CommandResult {
  try {
    const note = garden.create({
      type: 'note',
      title: cmd.title,
      content: cmd.content || '',
      project: cmd.metadata.project,
      // tags removed
      status: 'active',
    });

    // Also create relationships if contact specified
    if (cmd.metadata.contact) {
      // TODO: Link to contact (requires relationship support)
    }

    return {
      success: true,
      action: 'created',
      message: `Note created: "${note.title}"`,
      result: note,
      panelsToRefresh: ['notes', cmd.metadata.project ? `project:${cmd.metadata.project}` : null].filter(Boolean) as string[],
    };
  } catch (err) {
    return {
      success: false,
      action: 'error',
      message: 'Failed to create note',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function executeCreateAction(cmd: CreateActionCommand, garden: GardenService): CommandResult {
  try {
    const action = garden.create({
      type: 'action',
      title: cmd.title,
      context: cmd.metadata.context,
      project: cmd.metadata.project,
      due_date: cmd.metadata.dueDate,
      // tags removed
      status: 'active',
    });

    return {
      success: true,
      action: 'created',
      message: `Action created: "${action.title}"`,
      result: action,
      panelsToRefresh: [
        'next-actions',
        'inbox',
        cmd.metadata.project ? `project:${cmd.metadata.project}` : null,
      ].filter(Boolean) as string[],
    };
  } catch (err) {
    return {
      success: false,
      action: 'error',
      message: 'Failed to create action',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function executeCreateProject(cmd: CreateProjectCommand, garden: GardenService): CommandResult {
  try {
    const project = garden.create({
      type: 'project',
      title: cmd.name,
      // tags removed
      status: 'active',
    });

    return {
      success: true,
      action: 'created',
      message: `Project created: "${project.title}"`,
      result: project,
      panelsToRefresh: ['projects'],
    };
  } catch (err) {
    return {
      success: false,
      action: 'error',
      message: 'Failed to create project',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function executeCreateEvent(cmd: CreateEventCommand, garden: GardenService): CommandResult {
  try {
    // TODO: Parse dateStr into actual date
    // For now, store as-is in metadata
    const event = garden.create({
      type: 'entry',  // Events are stored as entries with event metadata
      title: cmd.title,
      project: cmd.project,
      status: 'active',
      metadata: {
        entryType: 'event',
        dateStr: cmd.dateStr,
      },
    });

    return {
      success: true,
      action: 'created',
      message: `Event created: "${event.title}" at ${cmd.dateStr}`,
      result: event,
      panelsToRefresh: ['calendar', 'today'],
    };
  } catch (err) {
    return {
      success: false,
      action: 'error',
      message: 'Failed to create event',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function executeCreateContact(cmd: CreateContactCommand, garden: GardenService): CommandResult {
  try {
    const contact = garden.create({
      type: 'contact',
      title: cmd.name,
      // tags removed
      status: 'active',
    });

    return {
      success: true,
      action: 'created',
      message: `Contact created: "${contact.title}"`,
      result: contact,
      panelsToRefresh: [],
    };
  } catch (err) {
    return {
      success: false,
      action: 'error',
      message: 'Failed to create contact',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ============================================
// Query Commands (Show/List)
// ============================================

function executeShowPanel(cmd: ShowPanelCommand): CommandResult {
  return {
    success: true,
    action: 'open_panel',
    message: `Opening ${cmd.panel} panel`,
    panel: {
      view: cmd.panel,
      title: cmd.panel.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    },
  };
}

function executeShowProject(cmd: ShowProjectCommand): CommandResult {
  return {
    success: true,
    action: 'open_panel',
    message: `Opening project: ${cmd.projectName}`,
    panel: {
      view: `project:${cmd.projectName}`,
      title: cmd.projectName,
    },
  };
}

function executeShowNote(cmd: ShowNoteCommand, garden: GardenService): CommandResult {
  const note = garden.get(cmd.noteId);

  if (!note) {
    return {
      success: false,
      action: 'error',
      message: `Note not found: ${cmd.noteId}`,
      error: 'Note not found',
    };
  }

  return {
    success: true,
    action: 'open_panel',
    message: `Opening note: "${note.title}"`,
    panel: {
      view: `note:${note.id}`,
      title: note.title,
    },
  };
}

function executeListItems(cmd: ListItemsCommand, garden: GardenService): CommandResult {
  // Determine panel view based on item type and filters
  let view: string = cmd.itemType;  // 'notes', 'actions', 'projects', 'events'

  if (cmd.filters?.project) {
    // List items in a specific project
    return {
      success: true,
      action: 'open_panel',
      message: `Listing ${cmd.itemType} in project ${cmd.filters.project}`,
      panel: {
        view: `project:${cmd.filters.project}`,
        title: cmd.filters.project,
      },
    };
  }

  if (cmd.filters?.status === 'overdue') {
    view = 'overdue' as string;
  }

  return {
    success: true,
    action: 'open_panel',
    message: `Listing ${cmd.itemType}`,
    panel: {
      view,
      title: view.replace(/\b\w/g, c => c.toUpperCase()),
    },
  };
}

function executeSearch(cmd: SearchCommand): CommandResult {
  // Search opens a special search-results panel
  return {
    success: true,
    action: 'open_panel',
    message: `Searching for: ${cmd.query}`,
    panel: {
      view: `search:${encodeURIComponent(cmd.query)}`,
      title: `Search: ${cmd.query}`,
    },
  };
}

// ============================================
// Update Commands
// ============================================

function executeMarkDone(cmd: MarkDoneCommand, garden: GardenService): CommandResult {
  try {
    // If actionId looks like an ID, get it directly
    let action = garden.get(cmd.actionId) || null;

    // If not found, try to find by title
    if (!action) {
      const actions = garden.getByType('action');
      action = actions.find(a =>
        a.title.toLowerCase() === cmd.actionId.toLowerCase() ||
        a.title.toLowerCase().includes(cmd.actionId.toLowerCase())
      ) || null;
    }

    if (!action) {
      return {
        success: false,
        action: 'error',
        message: `Action not found: ${cmd.actionId}`,
        error: 'Action not found',
      };
    }

    const updated = garden.update(action.id, {
      status: 'completed',
      completed_at: new Date().toISOString(),
    });

    if (!updated) {
      throw new Error('Failed to update action');
    }

    return {
      success: true,
      action: 'marked_done',
      message: `Completed: "${action.title}"`,
      result: updated,
      panelsToRefresh: ['next-actions', 'inbox', 'today'],
    };
  } catch (err) {
    return {
      success: false,
      action: 'error',
      message: 'Failed to mark action as done',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ============================================
// Delete Commands
// ============================================

function executeDeleteItem(cmd: DeleteItemCommand, garden: GardenService): CommandResult {
  try {
    let item = cmd.itemId ? garden.get(cmd.itemId) : null;

    // If not found by ID, try to find by title
    if (!item && cmd.itemTitle && cmd.itemType) {
      // Map command item types to RecordType
      const recordType = cmd.itemType as any;  // Type assertion needed
      const items = garden.getByType(recordType);
      const titleLower = cmd.itemTitle.toLowerCase();
      item = items.find(i =>
        i.title.toLowerCase() === titleLower ||
        i.title.toLowerCase().includes(titleLower)
      ) || null;
    }

    if (!item) {
      return {
        success: false,
        action: 'error',
        message: `Item not found: ${cmd.itemId || cmd.itemTitle}`,
        error: 'Item not found',
      };
    }

    const success = garden.delete(item.id);

    if (!success) {
      throw new Error('Failed to delete item');
    }

    return {
      success: true,
      action: 'deleted',
      message: `Deleted: "${item.title}"`,
      panelsToRefresh: [
        item.type === 'note' ? 'notes' : null,
        item.type === 'action' ? 'next-actions' : null,
        item.type === 'project' ? 'projects' : null,
        item.project ? `project:${item.project}` : null,
      ].filter(Boolean) as string[],
    };
  } catch (err) {
    return {
      success: false,
      action: 'error',
      message: 'Failed to delete item',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ============================================
// Observation Recording
// ============================================

/**
 * Record observations and relationships for a command execution
 */
async function recordCommandObservations(
  intent: CommandIntent,
  result: CommandResult,
  learning: LearningService,
  sessionId?: string
): Promise<void> {
  // Create command entity
  const commandId = learning.createEntity('command', {
    rawInput: intent.rawInput,
    intent: intent.type,
    success: result.success,
    timestamp: new Date().toISOString()
  });

  // Record basic observations about the command
  learning.recordObservation({
    entityId: commandId,
    key: 'intent_type',
    value: intent.type,
    sourceType: 'computed',
    sourceId: sessionId,
    confidence: 1.0
  });

  learning.recordObservation({
    entityId: commandId,
    key: 'success',
    value: result.success ? 'true' : 'false',
    valueType: 'boolean',
    sourceType: 'computed',
    sourceId: sessionId,
    confidence: 1.0
  });

  // If command created a result, record it
  if (result.success && result.result?.id) {
    learning.recordObservation({
      entityId: commandId,
      key: 'result.record_id',
      value: result.result.id,
      sourceType: 'computed',
      sourceId: sessionId,
      confidence: 1.0
    });

    // Create relationship: command created record
    learning.recordRelationship({
      fromEntity: commandId,
      toEntity: result.result.id,
      relationType: 'created',
      sourceId: sessionId
    });

    // Record observations about the created record
    if (result.result.project) {
      learning.recordObservation({
        entityId: result.result.id,
        key: 'project',
        value: result.result.project,
        sourceType: 'extracted',
        confidence: 1.0
      });
    }

    if (result.result.tags) {
      for (const tag of result.result.tags) {
        learning.recordObservation({
          entityId: result.result.id,
          key: 'topic',
          value: tag,
          sourceType: 'extracted',
          confidence: 0.9
        });
      }
    }
  }

  // Create relationships
  learning.recordRelationship({
    fromEntity: 'user',
    toEntity: commandId,
    relationType: 'executed',
    sourceId: sessionId
  });

  if (sessionId) {
    learning.recordRelationship({
      fromEntity: commandId,
      toEntity: sessionId,
      relationType: 'part_of',
      sourceId: sessionId
    });
  }

  debug('Command observations recorded', { commandId, intent: intent.type });
}

// ============================================
// Main Executor
// ============================================

/**
 * Execute a parsed command
 *
 * @param intent - Parsed command intent
 * @param garden - Garden service instance
 * @param learning - Learning service instance (optional)
 * @param sessionId - Current session ID (optional)
 * @returns Command result
 */
export function executeCommand(
  intent: CommandIntent,
  garden: GardenService,
  learning?: LearningService,
  sessionId?: string
): CommandResult {
  const startTime = Date.now();

  try {
    // Execute the command
    const result = executeCommandInternal(intent, garden);
    const executionTime = Date.now() - startTime;

    // Record command history in learning service
    if (learning) {
      const resultId = result.result?.id || undefined;
      learning.recordCommand({
        rawInput: intent.rawInput || '',
        intentType: intent.type,
        parsedMetadata: intent,
        success: true,
        resultId,
        executionTimeMs: executionTime,
        source: 'api', // Will be overridden by server if from dashboard/cli
        sessionId
      });

      // Also record legacy observations for backward compatibility
      recordCommandObservations(intent, result, learning, sessionId).catch(err => {
        debug('Failed to record legacy observations', { error: String(err) });
      });
    }

    return result;
  } catch (err) {
    const executionTime = Date.now() - startTime;

    // Record failed command
    if (learning) {
      learning.recordCommand({
        rawInput: intent.rawInput || '',
        intentType: intent.type,
        parsedMetadata: intent,
        success: false,
        errorMessage: String(err),
        executionTimeMs: executionTime,
        source: 'api',
        sessionId
      });
    }

    throw err;
  }
}

/**
 * Internal command execution (same logic as before, but without observation recording)
 */
function executeCommandInternal(intent: CommandIntent, garden: GardenService): CommandResult {
  switch (intent.type) {
    // Creation
    case 'create_note':
      return executeCreateNote(intent, garden);
    case 'create_action':
      return executeCreateAction(intent, garden);
    case 'create_project':
      return executeCreateProject(intent, garden);
    case 'create_event':
      return executeCreateEvent(intent, garden);
    case 'create_contact':
      return executeCreateContact(intent, garden);

    // Query/Display
    case 'show_panel':
      return executeShowPanel(intent);
    case 'show_project':
      return executeShowProject(intent);
    case 'show_note':
      return executeShowNote(intent, garden);
    case 'show_action':
      // Similar to show_note
      return {
        success: true,
        action: 'open_panel',
        message: `Opening action: ${intent.actionId}`,
        panel: { view: `action:${intent.actionId}`, title: 'Action' },
      };
    case 'list_items':
      return executeListItems(intent, garden);
    case 'search':
      return executeSearch(intent);

    // Updates
    case 'update_note':
    case 'update_action':
    case 'move_item':
      return {
        success: false,
        action: 'error',
        message: 'Update commands not yet implemented',
        error: 'Not implemented',
      };
    case 'mark_done':
      return executeMarkDone(intent, garden);

    // Deletion
    case 'delete_item':
      return executeDeleteItem(intent, garden);

    // Unknown
    case 'unknown':
      return {
        success: false,
        action: 'error',
        message: intent.reason || 'Unknown command',
        error: intent.reason,
      };

    default:
      // TypeScript exhaustiveness check
      const _exhaustive: never = intent;
      return {
        success: false,
        action: 'error',
        message: 'Unhandled command type',
        error: 'Unhandled command type',
      };
  }
}
