// src/utils/garden-parser.ts
// Custom backmatter parser for Garden pages
// Content first, metadata at bottom

import yaml from 'yaml';

export interface ParsedPage {
  body: string;
  meta: Record<string, unknown>;
}

// Human-first field ordering
const FIELD_ORDER = [
  // What you care about
  'tags', 'context', 'project', 'due',
  // GTD details  
  'waiting_for', 'energy', 'time_estimate',
  // Contact fields
  'email', 'phone', 'birthday',
  // Classification
  'type', 'status',
  // System (last)
  'id', 'created_at', 'updated_at'
];

/**
 * Parse a Garden page with backmatter (or legacy frontmatter)
 * 
 * Backmatter format:
 * ```
 * # Title
 * 
 * Content here...
 * 
 * ---
 * tags: [urgent]
 * type: action
 * ---
 * ```
 */
export function parseGardenPage(content: string): ParsedPage {
  // Try backmatter first (new format): \n---\n...content...\n---$ or \n---\n...content...EOF
  const backMatch = content.match(/\n---\n([\s\S]+?)(?:\n---\s*)?$/);
  if (backMatch) {
    const body = content.slice(0, backMatch.index).trim();
    try {
      const meta = yaml.parse(backMatch[1]) || {};
      return { body, meta };
    } catch {
      // Invalid YAML in backmatter - treat as no metadata
      return { body: content.trim(), meta: {} };
    }
  }
  
  // Fall back to frontmatter (old format): ^---\n...content...\n---\n
  const frontMatch = content.match(/^---\n([\s\S]+?)\n---\n?([\s\S]*)$/);
  if (frontMatch) {
    try {
      return { 
        body: frontMatch[2].trim(), 
        meta: yaml.parse(frontMatch[1]) || {} 
      };
    } catch {
      // Invalid YAML in frontmatter - treat as no metadata
      return { body: content.trim(), meta: {} };
    }
  }
  
  // No metadata found - just content
  return { body: content.trim(), meta: {} };
}

/**
 * Generate a Garden page with backmatter
 * Fields are ordered: human-relevant first, system stuff last
 */
export function toGardenPage(body: string, meta: Record<string, unknown>): string {
  // Filter out null/undefined values
  const cleanMeta: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (value !== undefined && value !== null && value !== '') {
      cleanMeta[key] = value;
    }
  }
  
  // Don't write empty metadata
  if (Object.keys(cleanMeta).length === 0) {
    return body.trim() + '\n';
  }
  
  // Order fields: human-relevant first
  const ordered: Record<string, unknown> = {};
  
  for (const key of FIELD_ORDER) {
    if (key in cleanMeta) {
      ordered[key] = cleanMeta[key];
    }
  }
  
  // Include any fields not in our predefined list
  for (const [key, value] of Object.entries(cleanMeta)) {
    if (!(key in ordered)) {
      ordered[key] = value;
    }
  }
  
  const yamlStr = yaml.stringify(ordered, { lineWidth: 0 });
  return `${body.trim()}\n\n---\n${yamlStr}---\n`;
}

/**
 * Extract title from markdown body (first # heading)
 */
export function extractTitle(body: string, fallback: string): string {
  const match = body.match(/^#\s+(.+)/m);
  return match ? match[1].trim() : fallback;
}

/**
 * Check if content is in backmatter format (vs frontmatter or no metadata)
 */
export function isBackmatterFormat(content: string): boolean {
  return /\n---\n[\s\S]+?(?:\n---\s*)?$/.test(content);
}

/**
 * Check if content is in frontmatter format
 */
export function isFrontmatterFormat(content: string): boolean {
  return /^---\n[\s\S]+?\n---\n/.test(content);
}
