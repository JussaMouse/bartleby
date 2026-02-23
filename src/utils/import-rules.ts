// src/utils/import-rules.ts
import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { FileType } from './file-type-detection.js';
import { debug, warn } from './logger.js';

/**
 * Import rule for automatic file organization
 */
export interface ImportRule {
  name: string;
  description?: string;
  match: {
    filenamePattern?: string; // Regex pattern
    fileTypes?: FileType[];
    contentPattern?: string; // Regex to match in extracted content
  };
  actions: {
    project?: string;
    context?: string;
    privacy?: 'public' | 'private' | 'confidential';
    tags?: string[];
  };
  priority?: number; // Higher priority rules evaluated first
  enabled?: boolean;
}

/**
 * Rules configuration file format
 */
export interface ImportRulesConfig {
  rules: ImportRule[];
}

/**
 * Result of rule matching
 */
export interface RuleMatch {
  rule: ImportRule;
  confidence: number; // 0-1 score indicating match strength
}

/**
 * Zod schema for import rule validation
 */
export const ImportRuleSchema = z.object({
  name: z.string().min(1).max(100).describe('Rule name (unique identifier)'),
  description: z.string().optional().describe('Optional description of what this rule does'),
  match: z.object({
    filenamePattern: z.string().optional().describe('Regex pattern to match filename'),
    fileTypes: z.array(z.enum([
      'document', 'spreadsheet', 'image', 'text',
      'archive', 'email', 'web', 'other'
    ] as const)).optional().describe('File types to match'),
    contentPattern: z.string().optional().describe('Regex pattern to match in file content'),
  }).refine(
    (data) => data.filenamePattern || data.fileTypes || data.contentPattern,
    { message: 'At least one match criterion (filenamePattern, fileTypes, or contentPattern) must be provided' }
  ),
  actions: z.object({
    project: z.string().optional().describe('Project tag to apply (e.g., "+work")'),
    context: z.string().optional().describe('Context tag to apply (e.g., "@computer")'),
    privacy: z.enum(['public', 'private', 'confidential']).optional().describe('Privacy level'),
    tags: z.array(z.string()).optional().describe('Additional tags to apply'),
  }),
  priority: z.number().min(0).max(1000).default(50).describe('Rule priority (higher = evaluated first)'),
  enabled: z.boolean().default(true).describe('Whether the rule is active'),
});

/**
 * Validate an import rule
 */
export function validateRule(rule: unknown): { success: true; data: ImportRule } | { success: false; error: string } {
  const result = ImportRuleSchema.safeParse(rule);

  if (result.success) {
    return { success: true, data: result.data as ImportRule };
  } else {
    const errorMessage = result.error.errors
      .map(e => `${e.path.join('.')}: ${e.message}`)
      .join('; ');
    return { success: false, error: errorMessage };
  }
}

/**
 * Test if a regex pattern is valid
 */
export function validateRegexPattern(pattern: string): { valid: boolean; error?: string } {
  try {
    new RegExp(pattern);
    return { valid: true };
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * ImportRules manager for loading and evaluating rules
 *
 * @deprecated This class is now a compatibility wrapper around ImportConfigService.
 * Access the service directly via context.services.importConfig for new code.
 */
export class ImportRulesManager {
  private service: any; // ImportConfigService (avoiding circular dependency)
  private rulesPath: string;

  constructor(rulesPath?: string) {
    this.rulesPath = rulesPath || path.join(process.cwd(), 'import-rules.json');

    if (rulesPath) {
      warn('ImportRulesManager rulesPath parameter is deprecated. Rules are now stored in database.');
    }

    // Service will be injected via setService method
    // For backward compatibility, we'll lazy-load from global context
  }

  /**
   * Set the ImportConfigService instance (called from tools)
   */
  setService(service: any): void {
    this.service = service;
  }

  /**
   * Reload rules from database (deprecated, kept for compatibility)
   */
  reload(): void {
    if (this.service) {
      this.service.clearCache();
    }
  }

  /**
   * Get all loaded rules
   */
  getRules(): ImportRule[] {
    if (!this.service) {
      warn('ImportRulesManager: service not set, returning empty rules');
      return [];
    }
    return this.service.getRules();
  }

  /**
   * Match rules against a file
   *
   * @param fileName - Name of the file
   * @param fileType - Detected file type
   * @param content - Extracted content (optional)
   * @returns Array of matching rules with confidence scores
   */
  matchRules(
    fileName: string,
    fileType: FileType,
    content?: string
  ): RuleMatch[] {
    if (!this.service) {
      warn('ImportRulesManager: service not set, returning empty matches');
      return [];
    }
    return this.service.matchRules(fileName, fileType, content);
  }

  /**
   * Apply rule actions to a record's metadata
   *
   * @param metadata - Existing metadata
   * @param ruleMatches - Matched rules to apply
   * @returns Updated metadata
   */
  applyRules(
    metadata: Partial<{
      project?: string;
      context?: string;
      privacy?: 'public' | 'private' | 'confidential';
      tags?: string[];
    }>,
    ruleMatches: RuleMatch[]
  ): typeof metadata {
    if (!this.service) {
      warn('ImportRulesManager: service not set, returning unchanged metadata');
      return metadata;
    }
    return this.service.applyRules(metadata, ruleMatches);
  }

  /**
   * Add a new rule (with validation)
   */
  addRule(rule: ImportRule): { success: boolean; error?: string } {
    if (!this.service) {
      return { success: false, error: 'ImportRulesManager: service not set' };
    }
    return this.service.addRule(rule);
  }

  /**
   * Update an existing rule
   */
  updateRule(name: string, updates: Partial<ImportRule>): { success: boolean; error?: string } {
    if (!this.service) {
      return { success: false, error: 'ImportRulesManager: service not set' };
    }
    return this.service.updateRule(name, updates);
  }

  /**
   * Get a rule by name
   */
  getRule(name: string): ImportRule | undefined {
    if (!this.service) {
      warn('ImportRulesManager: service not set');
      return undefined;
    }
    return this.service.getRule(name);
  }

  /**
   * Remove a rule by name
   */
  removeRule(name: string): boolean {
    if (!this.service) {
      warn('ImportRulesManager: service not set');
      return false;
    }
    return this.service.removeRule(name);
  }
}
