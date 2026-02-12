/**
 * Command Parser
 *
 * Parses natural language commands into structured CommandIntent objects.
 * This is the single source of truth for command parsing across CLI and dashboard.
 */

import type {
  CommandIntent,
  CreateNoteCommand,
  CreateActionCommand,
  CreateProjectCommand,
  CreateEventCommand,
  CreateContactCommand,
  ShowPanelCommand,
  ShowProjectCommand,
  ShowNoteCommand,
  ShowActionCommand,
  ListItemsCommand,
  SearchCommand,
  MarkDoneCommand,
  DeleteItemCommand,
  UnknownCommand,
  ParsedMetadata,
  ConfidenceLevel,
} from './command-types.js';

// ============================================
// Utility Functions
// ============================================

/**
 * Extract metadata from text (+project #tag @context with person due:date)
 */
function extractMetadata(text: string): {
  cleanText: string;
  metadata: ParsedMetadata;
} {
  const metadata: ParsedMetadata = {};

  // Extract +project (non-greedy, stops at @ # with or end)
  const projectMatch = text.match(/\+([^@#\s]+?)(?=\s*(?:@|#|with\s|due:|$))/i);
  if (projectMatch) {
    metadata.project = projectMatch[1].trim();
  }

  // Extract @context
  const contextMatch = text.match(/@(\w+)/);
  if (contextMatch) {
    metadata.context = '@' + contextMatch[1];
  }

  // Extract #tags (multiple)
  const tagMatches = text.match(/#(\w+)/g);
  if (tagMatches) {
    metadata.tags = tagMatches.map((t) => t.slice(1));
  }

  // Extract "with person"
  const withMatch = text.match(/\bwith\s+([^@#+]+?)(?=\s*(?:@|#|\+|due:|$))/i);
  if (withMatch) {
    metadata.contact = withMatch[1].trim();
  }

  // Extract due:date
  const dueMatch = text.match(/due:(\S+)/i);
  if (dueMatch) {
    metadata.dueDate = dueMatch[1];
  }

  // Clean text: remove all metadata
  let cleanText = text
    .replace(/\+[^@#\s]+/g, '')
    .replace(/@\w+/g, '')
    .replace(/#\w+/g, '')
    .replace(/\bwith\s+[^@#+]+/gi, '')
    .replace(/due:\S+/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  return { cleanText, metadata };
}

/**
 * Determine confidence level based on parsing quality
 */
function determineConfidence(
  parsed: Partial<CommandIntent>,
  hasRequiredFields: boolean,
): ConfidenceLevel {
  if (!hasRequiredFields) return 'low';
  if (parsed.type === 'unknown') return 'low';
  return 'high';
}

// ============================================
// Command Parsers (by type)
// ============================================

/**
 * Parse "note" command
 * Examples: "note meeting", "note ideas +project #tag"
 */
function parseNoteCommand(input: string, rawInput: string): CreateNoteCommand | UnknownCommand {
  // Remove command prefix
  let text = input
    .replace(/^(new|create|add)?\s*note\s*:?\s*/i, '')
    .trim();

  // Extract metadata
  const { cleanText: title, metadata } = extractMetadata(text);

  if (!title) {
    return {
      type: 'unknown',
      confidence: 'low',
      rawInput,
      reason: 'Missing note title',
      suggestions: ['note <title> +project #tag', 'note meeting notes +project-x'],
    };
  }

  return {
    type: 'create_note',
    confidence: 'high',
    rawInput,
    title,
    metadata,
  };
}

/**
 * Parse "action" command
 * Examples: "action call bob", "action email team @work due:friday"
 */
function parseActionCommand(input: string, rawInput: string): CreateActionCommand | UnknownCommand {
  // Remove command prefix
  let text = input
    .replace(/^(new|create|add)?\s*action\s*:?\s*/i, '')
    .trim();

  // Extract metadata
  const { cleanText: title, metadata } = extractMetadata(text);

  if (!title) {
    return {
      type: 'unknown',
      confidence: 'low',
      rawInput,
      reason: 'Missing action title',
      suggestions: ['action <title> @context +project', 'action call bob @phone'],
    };
  }

  return {
    type: 'create_action',
    confidence: 'high',
    rawInput,
    title,
    metadata,
  };
}

/**
 * Parse "project" command
 * Examples: "project website redesign", "project launch #client"
 */
function parseProjectCommand(
  input: string,
  rawInput: string,
): CreateProjectCommand | UnknownCommand {
  // Remove command prefix
  let text = input
    .replace(/^(new|create|add)?\s*project\s*:?\s*/i, '')
    .trim();

  // Extract tags
  const tagMatches = text.match(/#(\w+)/g);
  const tags = tagMatches ? tagMatches.map((t) => t.slice(1)) : undefined;

  // Clean name
  const name = text.replace(/#\w+/g, '').replace(/\s+/g, ' ').trim();

  if (!name) {
    return {
      type: 'unknown',
      confidence: 'low',
      rawInput,
      reason: 'Missing project name',
      suggestions: ['project <name> #tag', 'project website redesign #client'],
    };
  }

  return {
    type: 'create_project',
    confidence: 'high',
    rawInput,
    name,
    tags,
  };
}

/**
 * Parse "event" command
 * Examples: "event standup at 10am tomorrow", "event launch at 2026-03-15 14:00"
 */
function parseEventCommand(input: string, rawInput: string): CreateEventCommand | UnknownCommand {
  // Remove command prefix
  let text = input
    .replace(/^(new|create|add)?\s*event\s*:?\s*/i, '')
    .trim();

  // Look for "at <time>"
  const atMatch = text.match(/^(.+?)\s+at\s+(.+)$/i);

  if (!atMatch) {
    return {
      type: 'unknown',
      confidence: 'low',
      rawInput,
      reason: 'Missing time (use "at <time>")',
      suggestions: [
        'event <title> at <time>',
        'event standup at 10am tomorrow',
        'event launch at 2026-03-15 14:00',
      ],
    };
  }

  const title = atMatch[1].trim();
  const dateStr = atMatch[2].trim();

  // Extract project if present
  const projectMatch = title.match(/\+([^\s]+)/);
  const cleanTitle = title.replace(/\+[^\s]+/g, '').trim();

  return {
    type: 'create_event',
    confidence: 'high',
    rawInput,
    title: cleanTitle,
    dateStr,
    project: projectMatch ? projectMatch[1] : undefined,
  };
}

/**
 * Parse "contact" command
 * Examples: "contact alice", "contact bob #client"
 */
function parseContactCommand(
  input: string,
  rawInput: string,
): CreateContactCommand | UnknownCommand {
  // Remove command prefix
  let text = input
    .replace(/^(new|create|add)?\s*contact\s*:?\s*/i, '')
    .trim();

  // Extract tags
  const tagMatches = text.match(/#(\w+)/g);
  const tags = tagMatches ? tagMatches.map((t) => t.slice(1)) : undefined;

  // Clean name
  const name = text.replace(/#\w+/g, '').replace(/\s+/g, ' ').trim();

  if (!name) {
    return {
      type: 'unknown',
      confidence: 'low',
      rawInput,
      reason: 'Missing contact name',
      suggestions: ['contact <name> #tag', 'contact alice #team'],
    };
  }

  return {
    type: 'create_contact',
    confidence: 'high',
    rawInput,
    name,
    tags,
  };
}

/**
 * Parse "show" command
 * Examples: "show inbox", "show notes", "show project foo"
 */
function parseShowCommand(
  input: string,
  rawInput: string,
): ShowPanelCommand | ShowProjectCommand | ShowNoteCommand | ShowActionCommand | UnknownCommand {
  // Remove command prefix
  let text = input.replace(/^show\s+/i, '').trim();

  // Check for panel names
  const panelNames = ['inbox', 'next-actions', 'today', 'calendar', 'projects', 'notes', 'recent'];
  const lowerText = text.toLowerCase();

  for (const panel of panelNames) {
    if (lowerText === panel || lowerText === panel.replace('-', ' ')) {
      return {
        type: 'show_panel',
        confidence: 'high',
        rawInput,
        panel: panel as any,
      };
    }
  }

  // Check for "show project <name>"
  const projectMatch = text.match(/^project\s+(.+)$/i);
  if (projectMatch) {
    return {
      type: 'show_project',
      confidence: 'high',
      rawInput,
      projectName: projectMatch[1].trim(),
    };
  }

  // Check for "show note <id>"
  const noteMatch = text.match(/^note\s+([a-z0-9-]+)$/i);
  if (noteMatch) {
    return {
      type: 'show_note',
      confidence: 'high',
      rawInput,
      noteId: noteMatch[1],
    };
  }

  // Check for "show action <id>"
  const actionMatch = text.match(/^action\s+([a-z0-9-]+)$/i);
  if (actionMatch) {
    return {
      type: 'show_action',
      confidence: 'high',
      rawInput,
      actionId: actionMatch[1],
    };
  }

  return {
    type: 'unknown',
    confidence: 'low',
    rawInput,
    reason: 'Unknown show command',
    suggestions: [
      'show inbox',
      'show notes',
      'show project <name>',
      'show note <id>',
    ],
  };
}

/**
 * Parse "list" command
 * Examples: "list notes", "list actions in project-x", "list overdue"
 */
function parseListCommand(input: string, rawInput: string): ListItemsCommand | UnknownCommand {
  // Remove command prefix
  let text = input.replace(/^list\s+/i, '').trim();

  // Determine item type
  let itemType: 'notes' | 'actions' | 'projects' | 'events' | undefined;
  if (/^notes?/i.test(text)) {
    itemType = 'notes';
    text = text.replace(/^notes?\s*/i, '');
  } else if (/^actions?/i.test(text)) {
    itemType = 'actions';
    text = text.replace(/^actions?\s*/i, '');
  } else if (/^projects?/i.test(text)) {
    itemType = 'projects';
    text = text.replace(/^projects?\s*/i, '');
  } else if (/^events?/i.test(text)) {
    itemType = 'events';
    text = text.replace(/^events?\s*/i, '');
  }

  // Extract filters
  const filters: any = {};

  const inProjectMatch = text.match(/in\s+([+]?[\w-]+)/i);
  if (inProjectMatch) {
    filters.project = inProjectMatch[1].replace(/^\+/, '');
  }

  if (/overdue/i.test(text)) {
    filters.status = 'overdue';
  }

  if (!itemType) {
    return {
      type: 'unknown',
      confidence: 'low',
      rawInput,
      reason: 'Specify what to list',
      suggestions: [
        'list notes',
        'list actions in project-x',
        'list overdue actions',
        'list projects',
      ],
    };
  }

  return {
    type: 'list_items',
    confidence: 'high',
    rawInput,
    itemType,
    filters: Object.keys(filters).length > 0 ? filters : undefined,
  };
}

/**
 * Parse "done" command
 * Examples: "done action-123", "done call bob"
 */
function parseDoneCommand(input: string, rawInput: string): MarkDoneCommand | UnknownCommand {
  // Remove command prefix
  let text = input.replace(/^(done|complete)\s+/i, '').trim();

  // Check if it looks like an ID
  if (/^[a-z0-9-]+$/i.test(text)) {
    return {
      type: 'mark_done',
      confidence: 'high',
      rawInput,
      actionId: text,
    };
  }

  // Otherwise it's probably a title - we'll need to look it up
  // For now, return medium confidence with the text
  return {
    type: 'mark_done',
    confidence: 'medium' as ConfidenceLevel,
    rawInput,
    actionId: text,  // Will be resolved to actual ID by executor
  };
}

/**
 * Parse "delete" command
 * Examples: "delete note-123", "delete project old-project"
 */
function parseDeleteCommand(input: string, rawInput: string): DeleteItemCommand | UnknownCommand {
  // Remove command prefix
  let text = input.replace(/^delete\s+/i, '').trim();

  // Try to extract item type
  let itemType: 'note' | 'action' | 'project' | 'event' | undefined;
  let identifier = text;

  const noteMatch = text.match(/^note\s+(.+)$/i);
  if (noteMatch) {
    itemType = 'note';
    identifier = noteMatch[1];
  }

  const actionMatch = text.match(/^action\s+(.+)$/i);
  if (actionMatch) {
    itemType = 'action';
    identifier = actionMatch[1];
  }

  const projectMatch = text.match(/^project\s+(.+)$/i);
  if (projectMatch) {
    itemType = 'project';
    identifier = projectMatch[1];
  }

  const eventMatch = text.match(/^event\s+(.+)$/i);
  if (eventMatch) {
    itemType = 'event';
    identifier = eventMatch[1];
  }

  // Check if identifier is an ID (alphanumeric with dashes)
  const isId = /^[a-z0-9-]+$/i.test(identifier);

  return {
    type: 'delete_item',
    confidence: isId ? 'high' : ('medium' as ConfidenceLevel),
    rawInput,
    itemType,
    itemId: isId ? identifier : undefined,
    itemTitle: !isId ? identifier : undefined,
  };
}

/**
 * Parse "search" or "find" command
 * Examples: "find notes about meeting", "search #important"
 */
function parseSearchCommand(input: string, rawInput: string): SearchCommand | UnknownCommand {
  // Remove command prefix
  let text = input.replace(/^(find|search)\s+/i, '').trim();

  // Try to extract item type
  let itemType: 'notes' | 'actions' | 'projects' | undefined;
  if (/^notes?\s+/i.test(text)) {
    itemType = 'notes';
    text = text.replace(/^notes?\s+/i, '');
  } else if (/^actions?\s+/i.test(text)) {
    itemType = 'actions';
    text = text.replace(/^actions?\s+/i, '');
  } else if (/^projects?\s+/i.test(text)) {
    itemType = 'projects';
    text = text.replace(/^projects?\s+/i, '');
  }

  // Remove filler words
  text = text.replace(/^(about|for|with)\s+/i, '').trim();

  if (!text) {
    return {
      type: 'unknown',
      confidence: 'low',
      rawInput,
      reason: 'Missing search query',
      suggestions: ['find notes about <query>', 'search #tag', 'find actions for alice'],
    };
  }

  return {
    type: 'search',
    confidence: 'high',
    rawInput,
    query: text,
    itemType,
  };
}

// ============================================
// Main Parser
// ============================================

/**
 * Parse a natural language command into a structured CommandIntent
 *
 * @param input - Raw command string from user
 * @returns Parsed command intent
 */
export function parseCommand(input: string): CommandIntent {
  const trimmed = input.trim();
  const lower = trimmed.toLowerCase();

  // Empty input
  if (!trimmed) {
    return {
      type: 'unknown',
      confidence: 'low',
      rawInput: input,
      reason: 'Empty command',
      suggestions: ['Try: note <title>', 'action <title>', 'show inbox'],
    };
  }

  // Note commands
  if (/^(new|create|add)?\s*note\s*:?\s*/i.test(lower)) {
    return parseNoteCommand(trimmed, input);
  }

  // Action commands
  if (/^(new|create|add)?\s*action\s*:?\s*/i.test(lower)) {
    return parseActionCommand(trimmed, input);
  }

  // Project commands
  if (/^(new|create|add)?\s*project\s*:?\s*/i.test(lower)) {
    return parseProjectCommand(trimmed, input);
  }

  // Event commands
  if (/^(new|create|add)?\s*event\s*:?\s*/i.test(lower)) {
    return parseEventCommand(trimmed, input);
  }

  // Contact commands
  if (/^(new|create|add)?\s*contact\s*:?\s*/i.test(lower)) {
    return parseContactCommand(trimmed, input);
  }

  // Show commands
  if (/^show\s+/i.test(lower)) {
    return parseShowCommand(trimmed, input);
  }

  // List commands
  if (/^list\s+/i.test(lower)) {
    return parseListCommand(trimmed, input);
  }

  // Done/complete commands
  if (/^(done|complete)\s+/i.test(lower)) {
    return parseDoneCommand(trimmed, input);
  }

  // Delete commands
  if (/^delete\s+/i.test(lower)) {
    return parseDeleteCommand(trimmed, input);
  }

  // Search/find commands
  if (/^(find|search)\s+/i.test(lower)) {
    return parseSearchCommand(trimmed, input);
  }

  // Unknown command
  return {
    type: 'unknown',
    confidence: 'low',
    rawInput: input,
    reason: 'Unrecognized command',
    suggestions: [
      'note <title> - Create a note',
      'action <title> - Create an action',
      'show inbox - Show inbox',
      'list notes - List all notes',
    ],
  };
}
