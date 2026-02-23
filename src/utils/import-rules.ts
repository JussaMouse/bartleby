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
 */
export class ImportRulesManager {
  private rules: ImportRule[] = [];
  private rulesPath: string;

  constructor(rulesPath?: string) {
    this.rulesPath = rulesPath || path.join(process.cwd(), 'import-rules.json');
    this.loadRules();
  }

  /**
   * Load rules from configuration file
   */
  private loadRules(): void {
    try {
      if (!fs.existsSync(this.rulesPath)) {
        debug('No import rules file found', { path: this.rulesPath });
        return;
      }

      const content = fs.readFileSync(this.rulesPath, 'utf-8');
      const config: ImportRulesConfig = JSON.parse(content);

      if (!config.rules || !Array.isArray(config.rules)) {
        warn('Invalid import rules format', { path: this.rulesPath });
        return;
      }

      // Filter enabled rules and sort by priority
      this.rules = config.rules
        .filter(rule => rule.enabled !== false)
        .sort((a, b) => (b.priority || 0) - (a.priority || 0));

      debug('Import rules loaded', {
        path: this.rulesPath,
        count: this.rules.length,
      });
    } catch (err) {
      warn('Failed to load import rules', {
        path: this.rulesPath,
        error: String(err),
      });
    }
  }

  /**
   * Reload rules from file
   */
  reload(): void {
    this.rules = [];
    this.loadRules();
  }

  /**
   * Get all loaded rules
   */
  getRules(): ImportRule[] {
    return [...this.rules];
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
    const matches: RuleMatch[] = [];

    for (const rule of this.rules) {
      let confidence = 0;
      let matchCount = 0;
      let checkCount = 0;

      // Check filename pattern (case-insensitive by default)
      if (rule.match.filenamePattern) {
        checkCount++;
        try {
          const regex = new RegExp(rule.match.filenamePattern, 'i');
          if (regex.test(fileName)) {
            matchCount++;
            confidence += 0.5;
          }
        } catch (err) {
          warn('Invalid filename pattern in rule', {
            rule: rule.name,
            pattern: rule.match.filenamePattern,
          });
        }
      }

      // Check file type
      if (rule.match.fileTypes && rule.match.fileTypes.length > 0) {
        checkCount++;
        if (rule.match.fileTypes.includes(fileType)) {
          matchCount++;
          confidence += 0.3;
        }
      }

      // Check content pattern (if content provided, case-insensitive)
      if (rule.match.contentPattern && content) {
        checkCount++;
        try {
          const regex = new RegExp(rule.match.contentPattern, 'i');
          if (regex.test(content)) {
            matchCount++;
            confidence += 0.2;
          }
        } catch (err) {
          warn('Invalid content pattern in rule', {
            rule: rule.name,
            pattern: rule.match.contentPattern,
          });
        }
      }

      // Rule matches if any condition is met
      if (matchCount > 0) {
        // Normalize confidence based on checks performed
        confidence = checkCount > 0 ? confidence / checkCount : 0;
        matches.push({ rule, confidence });
      }
    }

    // Sort by confidence (highest first)
    return matches.sort((a, b) => b.confidence - a.confidence);
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
    const result = { ...metadata };

    // Apply highest priority rule first (first match wins for single values)
    for (const { rule, confidence } of ruleMatches) {
      // Apply project (only if not already set)
      if (rule.actions.project && !result.project) {
        result.project = rule.actions.project;
        debug('Rule applied project', { rule: rule.name, project: result.project });
      }

      // Apply context (only if not already set)
      if (rule.actions.context && !result.context) {
        result.context = rule.actions.context;
        debug('Rule applied context', { rule: rule.name, context: result.context });
      }

      // Apply privacy (only if not already set)
      if (rule.actions.privacy && !result.privacy) {
        result.privacy = rule.actions.privacy;
        debug('Rule applied privacy', { rule: rule.name, privacy: result.privacy });
      }

      // Accumulate tags from all matching rules
      if (rule.actions.tags && rule.actions.tags.length > 0) {
        result.tags = result.tags || [];
        for (const tag of rule.actions.tags) {
          if (!result.tags.includes(tag)) {
            result.tags.push(tag);
          }
        }
        debug('Rule applied tags', { rule: rule.name, tags: rule.actions.tags });
      }
    }

    return result;
  }

  /**
   * Add a new rule (with validation)
   */
  addRule(rule: ImportRule): { success: boolean; error?: string } {
    // Validate rule
    const validation = validateRule(rule);
    if (!validation.success) {
      return { success: false, error: validation.error };
    }

    // Check for duplicate rule names
    if (this.rules.some(r => r.name === rule.name)) {
      return { success: false, error: `Rule with name "${rule.name}" already exists` };
    }

    this.rules.push(validation.data);
    this.rules.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    this.saveRules();

    return { success: true };
  }

  /**
   * Update an existing rule
   */
  updateRule(name: string, updates: Partial<ImportRule>): { success: boolean; error?: string } {
    const ruleIndex = this.rules.findIndex(r => r.name === name);

    if (ruleIndex === -1) {
      return { success: false, error: `Rule "${name}" not found` };
    }

    // Merge updates with existing rule
    const updatedRule = { ...this.rules[ruleIndex], ...updates };

    // Validate updated rule
    const validation = validateRule(updatedRule);
    if (!validation.success) {
      return { success: false, error: validation.error };
    }

    this.rules[ruleIndex] = validation.data;
    this.rules.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    this.saveRules();

    return { success: true };
  }

  /**
   * Get a rule by name
   */
  getRule(name: string): ImportRule | undefined {
    return this.rules.find(r => r.name === name);
  }

  /**
   * Remove a rule by name
   */
  removeRule(name: string): boolean {
    const initialLength = this.rules.length;
    this.rules = this.rules.filter(r => r.name !== name);

    if (this.rules.length < initialLength) {
      this.saveRules();
      return true;
    }

    return false;
  }

  /**
   * Save rules to file
   */
  private saveRules(): void {
    try {
      const config: ImportRulesConfig = { rules: this.rules };
      fs.writeFileSync(this.rulesPath, JSON.stringify(config, null, 2), 'utf-8');
      debug('Import rules saved', { path: this.rulesPath });
    } catch (err) {
      warn('Failed to save import rules', {
        path: this.rulesPath,
        error: String(err),
      });
    }
  }
}
