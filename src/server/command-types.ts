/**
 * Command System Type Definitions
 *
 * This file defines the TypeScript types for Bartleby's unified command system.
 * Commands can come from CLI, dashboard, or API and are parsed into structured intents.
 */

// ============================================
// Core Command Types
// ============================================

/**
 * Command intent types - what the user wants to do
 */
export type CommandIntentType =
  // Creation
  | 'create_note'
  | 'create_action'
  | 'create_project'
  | 'create_event'
  | 'create_contact'
  // Querying/Display
  | 'show_panel'
  | 'show_project'
  | 'show_note'
  | 'show_action'
  | 'list_items'
  | 'search'
  // Updates
  | 'update_note'
  | 'update_action'
  | 'move_item'
  | 'mark_done'
  // Deletion
  | 'delete_item'
  // Unknown/Ambiguous
  | 'unknown';

/**
 * Confidence level for parsed intent
 */
export type ConfidenceLevel = 'high' | 'medium' | 'low';

/**
 * Source of the command
 */
export type CommandSource = 'cli' | 'dashboard' | 'api';

// ============================================
// Parsed Command Structure
// ============================================

/**
 * Base interface for all parsed commands
 */
export interface ParsedCommand {
  type: CommandIntentType;
  confidence: ConfidenceLevel;
  rawInput: string;
}

/**
 * Parsed metadata common to many commands
 */
export interface ParsedMetadata {
  project?: string;
  tags?: string[];
  context?: string;
  contact?: string;
  dueDate?: string;
}

/**
 * Create note command
 */
export interface CreateNoteCommand extends ParsedCommand {
  type: 'create_note';
  title: string;
  content?: string;
  metadata: ParsedMetadata;
}

/**
 * Create action command
 */
export interface CreateActionCommand extends ParsedCommand {
  type: 'create_action';
  title: string;
  metadata: ParsedMetadata;
}

/**
 * Create project command
 */
export interface CreateProjectCommand extends ParsedCommand {
  type: 'create_project';
  name: string;
  tags?: string[];
}

/**
 * Create event command
 */
export interface CreateEventCommand extends ParsedCommand {
  type: 'create_event';
  title: string;
  dateStr: string;
  project?: string;
}

/**
 * Create contact command
 */
export interface CreateContactCommand extends ParsedCommand {
  type: 'create_contact';
  name: string;
  tags?: string[];
}

/**
 * Show panel command (opens a view)
 */
export interface ShowPanelCommand extends ParsedCommand {
  type: 'show_panel';
  panel: 'inbox' | 'next-actions' | 'today' | 'calendar' | 'projects' | 'notes' | 'recent';
}

/**
 * Show specific project
 */
export interface ShowProjectCommand extends ParsedCommand {
  type: 'show_project';
  projectName: string;
}

/**
 * Show specific note
 */
export interface ShowNoteCommand extends ParsedCommand {
  type: 'show_note';
  noteId: string;
}

/**
 * Show specific action
 */
export interface ShowActionCommand extends ParsedCommand {
  type: 'show_action';
  actionId: string;
}

/**
 * List items with filters
 */
export interface ListItemsCommand extends ParsedCommand {
  type: 'list_items';
  itemType: 'notes' | 'actions' | 'projects' | 'events';
  filters?: {
    project?: string;
    tag?: string;
    context?: string;
    status?: string;
  };
}

/**
 * Search command
 */
export interface SearchCommand extends ParsedCommand {
  type: 'search';
  query: string;
  itemType?: 'notes' | 'actions' | 'projects';
}

/**
 * Update note command
 */
export interface UpdateNoteCommand extends ParsedCommand {
  type: 'update_note';
  noteId: string;
  updates: {
    title?: string;
    content?: string;
    project?: string;
    tags?: string[];
  };
}

/**
 * Update action command
 */
export interface UpdateActionCommand extends ParsedCommand {
  type: 'update_action';
  actionId: string;
  updates: {
    title?: string;
    context?: string;
    project?: string;
    dueDate?: string;
  };
}

/**
 * Move item to different project
 */
export interface MoveItemCommand extends ParsedCommand {
  type: 'move_item';
  itemId: string;
  toProject: string;
}

/**
 * Mark action as done
 */
export interface MarkDoneCommand extends ParsedCommand {
  type: 'mark_done';
  actionId: string;
}

/**
 * Delete item command
 */
export interface DeleteItemCommand extends ParsedCommand {
  type: 'delete_item';
  itemId?: string;
  itemType?: 'note' | 'action' | 'project' | 'event';
  itemTitle?: string;  // If ID not provided, search by title
}

/**
 * Unknown command (couldn't parse)
 */
export interface UnknownCommand extends ParsedCommand {
  type: 'unknown';
  reason?: string;
  suggestions?: string[];
}

/**
 * Union type of all possible parsed commands
 */
export type CommandIntent =
  | CreateNoteCommand
  | CreateActionCommand
  | CreateProjectCommand
  | CreateEventCommand
  | CreateContactCommand
  | ShowPanelCommand
  | ShowProjectCommand
  | ShowNoteCommand
  | ShowActionCommand
  | ListItemsCommand
  | SearchCommand
  | UpdateNoteCommand
  | UpdateActionCommand
  | MoveItemCommand
  | MarkDoneCommand
  | DeleteItemCommand
  | UnknownCommand;

// ============================================
// Command Execution Results
// ============================================

/**
 * Action type returned after execution
 */
export type CommandActionType =
  | 'created'
  | 'updated'
  | 'deleted'
  | 'marked_done'
  | 'open_panel'
  | 'error';

/**
 * Panel information for show/list commands
 */
export interface PanelInfo {
  view: string;  // e.g., "notes", "project:foo", "note:123"
  title: string;
}

/**
 * Result of executing a command
 */
export interface CommandResult {
  success: boolean;
  action: CommandActionType;
  message: string;
  result?: any;  // Created/updated item
  panel?: PanelInfo;  // For show/list commands
  panelsToRefresh?: string[];  // Panels that should refresh their data
  error?: string;
}

// ============================================
// Command Preview (before execution)
// ============================================

/**
 * Preview field for display
 */
export interface PreviewField {
  label: string;
  value: string | string[];
}

/**
 * Command preview shown to user before execution
 */
export interface CommandPreview {
  action: string;  // e.g., "Create note", "Open panel"
  summary: string;  // e.g., "\"Meeting notes\" in project-x #important"
  fields: PreviewField[];
  warnings?: string[];
  suggestions?: string[];
}

/**
 * Full parse result (sent to client)
 */
export interface ParseResult {
  intent: CommandIntentType;
  confidence: ConfidenceLevel;
  parsed: CommandIntent;
  preview: CommandPreview;
  error?: string;
  hint?: string;
  suggestions?: string[];
}

// ============================================
// Command History
// ============================================

/**
 * Stored command record
 */
export interface CommandRecord {
  id: string;
  userId: string;
  input: string;
  parsed: CommandIntent;
  executed: boolean;
  success: boolean;
  source: CommandSource;
  createdAt: string;
  error?: string;
}

// ============================================
// Autocomplete Suggestions
// ============================================

/**
 * Suggestion type
 */
export type SuggestionType = 'completion' | 'history' | 'entity' | 'syntax';

/**
 * Suggestion category
 */
export type SuggestionCategory = 'command' | 'history' | 'project' | 'tag' | 'context' | 'contact';

/**
 * Autocomplete suggestion
 */
export interface CommandSuggestion {
  type: SuggestionType;
  text: string;
  description: string;
  category: SuggestionCategory;
}

/**
 * Autocomplete response
 */
export interface SuggestionsResult {
  input: string;
  suggestions: CommandSuggestion[];
}
