/**
 * Query Parser for System Views
 *
 * Parses natural language queries into an AST (Abstract Syntax Tree)
 * and executes them against garden records.
 *
 * Supported query patterns:
 * - Type filtering: "actions", "notes", "events"
 * - Status filtering: "active", "waiting", "completed"
 * - Context filtering: "@phone", "@computer"
 * - Project filtering: "in project-name", "+project"
 * - Priority filtering: "urgent", "important"
 * - Date ranges: "this week", "next month", "due in 7 days"
 * - Multiple types: "actions and notes"
 * - Full-text search: "containing keyword"
 */

import type { GardenRecord } from './garden.js';

// Query AST Node Types
export type QueryNode =
  | TypeFilter
  | StatusFilter
  | ContextFilter
  | ProjectFilter
  | PriorityFilter
  | DateRangeFilter
  | SearchFilter
  | AndOperator
  | OrOperator;

export interface TypeFilter {
  type: 'type';
  value: string | string[]; // 'action' or ['action', 'note']
}

export interface StatusFilter {
  type: 'status';
  value: string; // 'active', 'waiting', 'completed', 'someday'
}

export interface ContextFilter {
  type: 'context';
  value: string; // 'phone', 'computer', 'work'
}

export interface ProjectFilter {
  type: 'project';
  value: string; // project slug or title
}

export interface PriorityFilter {
  type: 'priority';
  value: string; // 'urgent', 'important', 'high'
}

export interface DateRangeFilter {
  type: 'dateRange';
  field: 'created_at' | 'updated_at' | 'start_time' | 'due_date';
  range: 'today' | 'tomorrow' | 'this week' | 'next week' | 'this month' | 'next month';
  days?: number; // For "in next N days"
}

export interface SearchFilter {
  type: 'search';
  field: 'title' | 'content' | 'any';
  value: string; // search term
}

export interface AndOperator {
  type: 'and';
  children: QueryNode[];
}

export interface OrOperator {
  type: 'or';
  children: QueryNode[];
}

// Query specification returned by parser
export interface QuerySpec {
  ast: QueryNode[];
  description?: string;
}

/**
 * Parse natural language query into AST
 */
export function parseQuery(queryText: string): QuerySpec {
  const ast: QueryNode[] = [];
  let remaining = queryText.toLowerCase().trim();

  // Extract type (can be multiple: "actions and notes")
  const types = extractTypes(remaining);
  if (types.length > 0) {
    ast.push({
      type: 'type',
      value: types.length === 1 ? types[0] : types,
    });
    // Remove type keywords from remaining text
    types.forEach(t => {
      remaining = remaining.replace(new RegExp(`\\b${t}s?\\b`, 'gi'), '');
    });
  }

  // Extract status
  const status = extractStatus(remaining);
  if (status) {
    ast.push({
      type: 'status',
      value: status,
    });
    remaining = remaining.replace(new RegExp(`\\b${status}\\b`, 'gi'), '');
  }

  // Extract context (@phone, @computer)
  const contextMatch = remaining.match(/@(\w+)/);
  if (contextMatch) {
    ast.push({
      type: 'context',
      value: contextMatch[1],
    });
    remaining = remaining.replace(contextMatch[0], '');
  }

  // Extract project (in project-name or +project)
  const projectInMatch = remaining.match(/\bin\s+([a-z0-9-]+)/i);
  const projectPlusMatch = remaining.match(/\+([a-z0-9-]+)/i);
  if (projectInMatch) {
    ast.push({
      type: 'project',
      value: projectInMatch[1],
    });
    remaining = remaining.replace(projectInMatch[0], '');
  } else if (projectPlusMatch) {
    ast.push({
      type: 'project',
      value: projectPlusMatch[1],
    });
    remaining = remaining.replace(projectPlusMatch[0], '');
  }

  // Extract priority
  const priority = extractPriority(remaining);
  if (priority) {
    ast.push({
      type: 'priority',
      value: priority,
    });
    remaining = remaining.replace(new RegExp(`\\b${priority}\\b`, 'gi'), '');
  }

  // Extract date range
  const dateRange = extractDateRange(remaining);
  if (dateRange) {
    ast.push(dateRange);
    if (dateRange.range) {
      remaining = remaining.replace(new RegExp(dateRange.range, 'gi'), '');
    }
  }

  // Extract search terms (containing "keyword")
  const searchMatch = remaining.match(/containing\s+["']?([^"']+)["']?/i);
  if (searchMatch) {
    ast.push({
      type: 'search',
      field: 'any',
      value: searchMatch[1].trim(),
    });
    remaining = remaining.replace(searchMatch[0], '');
  }

  return {
    ast,
    description: queryText,
  };
}

/**
 * Extract record types from query text
 */
function extractTypes(text: string): string[] {
  const types: string[] = [];

  // Check for multiple types with "and"
  const multiMatch = text.match(/\b(\w+)\s+and\s+(\w+)\b/i);
  if (multiMatch) {
    const type1 = normalizeType(multiMatch[1]);
    const type2 = normalizeType(multiMatch[2]);
    if (type1) types.push(type1);
    if (type2) types.push(type2);
    return types;
  }

  // Single type
  const typeMap: Record<string, string> = {
    'action': 'action',
    'actions': 'action',
    'task': 'action',
    'tasks': 'action',
    'todo': 'action',
    'todos': 'action',
    'note': 'note',
    'notes': 'note',
    'project': 'project',
    'projects': 'project',
    'event': 'event',
    'events': 'event',
    'meeting': 'event',
    'meetings': 'event',
    'contact': 'contact',
    'contacts': 'contact',
    'person': 'contact',
    'people': 'contact',
    'page': 'page',
    'pages': 'page',
    'item': 'item',
    'items': 'item',
  };

  for (const [key, value] of Object.entries(typeMap)) {
    if (new RegExp(`\\b${key}\\b`, 'i').test(text)) {
      types.push(value);
      break;
    }
  }

  return types;
}

/**
 * Normalize type name
 */
function normalizeType(text: string): string | null {
  const typeMap: Record<string, string> = {
    'action': 'action',
    'actions': 'action',
    'task': 'action',
    'tasks': 'action',
    'note': 'note',
    'notes': 'note',
    'project': 'project',
    'projects': 'project',
    'event': 'event',
    'events': 'event',
    'contact': 'contact',
    'contacts': 'contact',
    'page': 'page',
    'pages': 'page',
    'item': 'item',
    'items': 'item',
  };

  return typeMap[text.toLowerCase()] || null;
}

/**
 * Extract status from query text
 */
function extractStatus(text: string): string | null {
  if (/\bactive\b/i.test(text)) return 'active';
  if (/\bwaiting\b/i.test(text)) return 'waiting';
  if (/\bcompleted?\b/i.test(text)) return 'completed';
  if (/\bsomeday\b/i.test(text)) return 'someday';
  return null;
}

/**
 * Extract priority from query text
 */
function extractPriority(text: string): string | null {
  if (/\burgent\b/i.test(text)) return 'urgent';
  if (/\bimportant\b/i.test(text)) return 'important';
  if (/\bhigh\b/i.test(text)) return 'high';
  return null;
}

/**
 * Extract date range from query text
 */
function extractDateRange(text: string): DateRangeFilter | null {
  // Field detection
  let field: 'created_at' | 'updated_at' | 'start_time' | 'due_date' = 'start_time';
  if (/\bcreated\b/i.test(text)) field = 'created_at';
  if (/\bmodified\b/i.test(text) || /\bupdated\b/i.test(text)) field = 'updated_at';
  if (/\bdue\b/i.test(text)) field = 'due_date';

  // Range detection
  if (/\btoday\b/i.test(text)) {
    return { type: 'dateRange', field, range: 'today' };
  }
  if (/\btomorrow\b/i.test(text)) {
    return { type: 'dateRange', field, range: 'tomorrow' };
  }
  if (/\bthis\s+week\b/i.test(text)) {
    return { type: 'dateRange', field, range: 'this week' };
  }
  if (/\bnext\s+week\b/i.test(text)) {
    return { type: 'dateRange', field, range: 'next week' };
  }
  if (/\bthis\s+month\b/i.test(text)) {
    return { type: 'dateRange', field, range: 'this month' };
  }
  if (/\bnext\s+month\b/i.test(text)) {
    return { type: 'dateRange', field, range: 'next month' };
  }

  // "in next N days" or "due in N days"
  const daysMatch = text.match(/\bin\s+(?:next\s+)?(\d+)\s+days?\b/i);
  if (daysMatch) {
    return {
      type: 'dateRange',
      field,
      range: 'this week', // placeholder
      days: parseInt(daysMatch[1], 10),
    };
  }

  return null;
}

/**
 * Execute query against records
 */
export function executeQuery(records: GardenRecord[], querySpec: QuerySpec): GardenRecord[] {
  let results = records;

  for (const node of querySpec.ast) {
    results = applyFilter(results, node);
  }

  return results;
}

/**
 * Apply a single filter node to records
 */
function applyFilter(records: GardenRecord[], node: QueryNode): GardenRecord[] {
  switch (node.type) {
    case 'type':
      if (Array.isArray(node.value)) {
        // Multiple types (OR logic)
        return records.filter(r => node.value.includes(r.type));
      } else {
        return records.filter(r => r.type === node.value);
      }

    case 'status':
      return records.filter(r => r.status === node.value);

    case 'context':
      return records.filter(r => {
        if (!r.context) return false;
        const contexts = Array.isArray(r.context) ? r.context : [r.context];
        return contexts.some((c: string) => c.toLowerCase().includes(node.value));
      });

    case 'project':
      return records.filter(r => {
        if (!r.project) return false;
        const projectLower = r.project.toLowerCase();
        const valueLower = node.value.toLowerCase();
        return projectLower === valueLower ||
               projectLower.replace(/\s+/g, '-') === valueLower;
      });

    case 'priority':
      return records.filter(r => {
        // Check metadata.priority
        if (r.metadata?.priority) {
          const priority = r.metadata.priority as string;
          return priority.toLowerCase() === node.value;
        }
        // Check metadata.urgent for backward compatibility
        if (r.metadata?.urgent === true && node.value === 'urgent') {
          return true;
        }
        return false;
      });

    case 'dateRange':
      return filterByDateRange(records, node);

    case 'search':
      return filterBySearch(records, node);

    case 'and':
      // Apply all children filters (AND logic)
      let andResults = records;
      for (const child of node.children) {
        andResults = applyFilter(andResults, child);
      }
      return andResults;

    case 'or':
      // Apply each child filter and combine results (OR logic)
      const orResults = new Set<GardenRecord>();
      for (const child of node.children) {
        const childResults = applyFilter(records, child);
        childResults.forEach(r => orResults.add(r));
      }
      return Array.from(orResults);

    default:
      return records;
  }
}

/**
 * Filter by date range
 */
function filterByDateRange(records: GardenRecord[], filter: DateRangeFilter): GardenRecord[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  return records.filter(r => {
    const fieldValue = r[filter.field];
    if (!fieldValue) return false;

    const date = new Date(fieldValue);

    // Handle "in next N days"
    if (filter.days) {
      const endDate = new Date(today);
      endDate.setDate(endDate.getDate() + filter.days);
      return date >= today && date <= endDate;
    }

    // Handle named ranges
    switch (filter.range) {
      case 'today':
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        return date >= today && date < tomorrow;

      case 'tomorrow':
        const tomorrowStart = new Date(today);
        tomorrowStart.setDate(tomorrowStart.getDate() + 1);
        const tomorrowEnd = new Date(today);
        tomorrowEnd.setDate(tomorrowEnd.getDate() + 2);
        return date >= tomorrowStart && date < tomorrowEnd;

      case 'this week':
        const weekStart = new Date(today);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Sunday
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 7);
        return date >= weekStart && date < weekEnd;

      case 'next week':
        const nextWeekStart = new Date(today);
        nextWeekStart.setDate(nextWeekStart.getDate() - nextWeekStart.getDay() + 7);
        const nextWeekEnd = new Date(nextWeekStart);
        nextWeekEnd.setDate(nextWeekEnd.getDate() + 7);
        return date >= nextWeekStart && date < nextWeekEnd;

      case 'this month':
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        return date >= monthStart && date < monthEnd;

      case 'next month':
        const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        const nextMonthEnd = new Date(now.getFullYear(), now.getMonth() + 2, 1);
        return date >= nextMonthStart && date < nextMonthEnd;

      default:
        return false;
    }
  });
}

/**
 * Filter by search term
 */
function filterBySearch(records: GardenRecord[], filter: SearchFilter): GardenRecord[] {
  const searchTerm = filter.value.toLowerCase();

  return records.filter(r => {
    switch (filter.field) {
      case 'title':
        return r.title?.toLowerCase().includes(searchTerm);

      case 'content':
        return r.content?.toLowerCase().includes(searchTerm);

      case 'any':
        return (
          r.title?.toLowerCase().includes(searchTerm) ||
          r.content?.toLowerCase().includes(searchTerm)
        );

      default:
        return false;
    }
  });
}

/**
 * Convert query AST back to human-readable description
 */
export function describeQuery(querySpec: QuerySpec): string {
  const parts: string[] = [];

  for (const node of querySpec.ast) {
    switch (node.type) {
      case 'type':
        if (Array.isArray(node.value)) {
          parts.push(`${node.value.join(' and ')}s`);
        } else {
          parts.push(`${node.value}s`);
        }
        break;

      case 'status':
        parts.push(node.value);
        break;

      case 'context':
        parts.push(`@${node.value}`);
        break;

      case 'project':
        parts.push(`in ${node.value}`);
        break;

      case 'priority':
        parts.push(node.value);
        break;

      case 'dateRange':
        if (node.days) {
          parts.push(`in next ${node.days} days`);
        } else {
          parts.push(node.range);
        }
        break;

      case 'search':
        parts.push(`containing "${node.value}"`);
        break;
    }
  }

  return parts.join(' ');
}
