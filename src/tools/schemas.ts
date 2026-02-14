/**
 * Zod schemas for tool parameters
 *
 * Provides 100% reliable tool calls through:
 * - Type-safe parameter validation
 * - Automatic error messages
 * - JSON Schema generation for LLM
 * - Runtime type checking
 */

import { z } from 'zod';

// =============================================================================
// Memory Tools
// =============================================================================

export const StoreObservationSchema = z.object({
  entityId: z.string().describe('The entity to store the observation about (e.g., "user", "project-123")'),
  key: z.string().describe('The observation key (e.g., "preference.theme", "deadline")'),
  value: z.string().describe('The observation value'),
  confidence: z.number().min(0).max(1).optional().describe('Confidence level (0.0-1.0), defaults to 0.9'),
  expiresIn: z.string().optional().describe('Time-to-live duration (e.g., "7d", "30d", "1y")'),
  supersedes: z.string().optional().describe('ID of observation to replace'),
});

export const RetrieveContextSchema = z.object({
  entityId: z.string().describe('The entity to retrieve context for'),
  keys: z.array(z.string()).optional().describe('Filter by specific observation keys'),
  since: z.string().optional().describe('ISO date string to filter observations since'),
  limit: z.number().optional().describe('Maximum number of observations to return'),
});

export const UpdateObservationSchema = z.object({
  observationId: z.string().describe('The ID of the observation to update'),
  newValue: z.string().describe('The new value for the observation'),
  reason: z.string().optional().describe('Reason for the update'),
});

export const ForgetObservationSchema = z.object({
  observationId: z.string().describe('The ID of the observation to forget'),
  reason: z.string().optional().describe('Reason for forgetting'),
});

// =============================================================================
// GTD Tools
// =============================================================================

export const CreateActionSchema = z.object({
  title: z.string().describe('The action title'),
  project: z.string().optional().describe('Project tag (e.g., "+project-name")'),
  context: z.string().optional().describe('Context tag (e.g., "@phone", "@computer")'),
  contact: z.string().optional().describe('Contact association (e.g., "with john")'),
  due: z.string().optional().describe('Due date (natural language or ISO date)'),
  priority: z.enum(['urgent', 'important', 'normal']).optional().describe('Priority level'),
});

export const CreateProjectSchema = z.object({
  title: z.string().describe('The project title'),
  description: z.string().optional().describe('Project description'),
});

export const CompleteActionSchema = z.object({
  identifier: z.string().describe('Action title or ID to complete'),
});

// =============================================================================
// Calendar Tools
// =============================================================================

export const CreateEventSchema = z.object({
  title: z.string().describe('Event title'),
  start: z.string().describe('Start date/time (ISO or natural language)'),
  end: z.string().optional().describe('End date/time (optional for all-day events)'),
  allDay: z.boolean().optional().describe('Whether this is an all-day event'),
  location: z.string().optional().describe('Event location'),
  description: z.string().optional().describe('Event description'),
});

// =============================================================================
// Contact Tools
// =============================================================================

export const CreateContactSchema = z.object({
  name: z.string().describe('Contact name'),
  email: z.string().email().optional().describe('Email address'),
  phone: z.string().optional().describe('Phone number'),
  birthday: z.string().optional().describe('Birthday (ISO date or natural language)'),
  notes: z.string().optional().describe('Additional notes'),
});

// =============================================================================
// Garden Tools
// =============================================================================

export const CreatePageSchema = z.object({
  title: z.string().describe('Page title'),
  content: z.string().optional().describe('Page content (markdown)'),
});

export const CreateNoteSchema = z.object({
  title: z.string().describe('Note title'),
  content: z.string().optional().describe('Note content (markdown)'),
  project: z.string().optional().describe('Associated project tag'),
});

export const SearchPagesSchema = z.object({
  query: z.string().describe('Search query'),
  type: z.enum(['action', 'project', 'page', 'note', 'contact', 'event']).optional().describe('Filter by type'),
});

// =============================================================================
// Data Tools
// =============================================================================

export const IngestCSVSchema = z.object({
  filepath: z.string().describe('Path to CSV file'),
  tableName: z.string().describe('Name for the imported table'),
  skipLines: z.number().optional().describe('Number of header lines to skip'),
  replace: z.boolean().optional().describe('Replace existing table if exists'),
});

export const QueryDataSchema = z.object({
  sql: z.string().describe('SQL query to execute'),
  tableName: z.string().optional().describe('Table name for validation'),
});

// =============================================================================
// System Tools
// =============================================================================

export const SetPreferenceSchema = z.object({
  key: z.string().describe('Preference key (e.g., "theme", "name")'),
  value: z.string().describe('Preference value'),
});

export const GetPreferenceSchema = z.object({
  key: z.string().optional().describe('Preference key to retrieve (omit for all)'),
});

// =============================================================================
// Schema Registry
// =============================================================================

/**
 * Registry mapping tool names to their Zod schemas
 */
export const toolSchemas = {
  // Memory tools
  storeObservation: StoreObservationSchema,
  retrieveContext: RetrieveContextSchema,
  updateObservation: UpdateObservationSchema,
  forgetObservation: ForgetObservationSchema,

  // GTD tools
  createAction: CreateActionSchema,
  createProject: CreateProjectSchema,
  completeAction: CompleteActionSchema,

  // Calendar tools
  createEvent: CreateEventSchema,

  // Contact tools
  createContact: CreateContactSchema,

  // Garden tools
  createPage: CreatePageSchema,
  createNote: CreateNoteSchema,
  searchPages: SearchPagesSchema,

  // Data tools
  ingestCSV: IngestCSVSchema,
  queryData: QueryDataSchema,

  // System tools
  setPreference: SetPreferenceSchema,
  getPreference: GetPreferenceSchema,
} as const;

/**
 * Get schema for a tool by name
 */
export function getToolSchema(toolName: string): z.ZodSchema | undefined {
  return toolSchemas[toolName as keyof typeof toolSchemas];
}

/**
 * Validate tool parameters against schema
 */
export function validateToolParams<T>(
  toolName: string,
  params: unknown
): { success: true; data: T } | { success: false; error: string } {
  const schema = getToolSchema(toolName);

  if (!schema) {
    return { success: false, error: `No schema found for tool: ${toolName}` };
  }

  const result = schema.safeParse(params);

  if (result.success) {
    return { success: true, data: result.data as T };
  } else {
    const errorMessage = result.error.errors
      .map(e => `${e.path.join('.')}: ${e.message}`)
      .join('; ');
    return { success: false, error: errorMessage };
  }
}
