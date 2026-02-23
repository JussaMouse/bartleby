// src/services/import-config.ts
import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { debug, warn } from '../utils/logger.js';
import { FileType } from '../utils/file-type-detection.js';
import { ImportRule, ImportRuleSchema, validateRule } from '../utils/import-rules.js';
import { ImportProfile, ImportProfileSchema } from '../utils/import-profiles.js';

/**
 * Database schema for import configuration
 */
const SCHEMA = `
-- Import rules for automatic file organization
CREATE TABLE IF NOT EXISTS import_rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  match_criteria TEXT NOT NULL,
  actions TEXT NOT NULL,
  priority INTEGER DEFAULT 50,
  enabled BOOLEAN DEFAULT TRUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_rules_priority
  ON import_rules(priority DESC, name) WHERE enabled = TRUE;

CREATE INDEX IF NOT EXISTS idx_rules_enabled ON import_rules(enabled);

-- Import profiles for preset configurations
CREATE TABLE IF NOT EXISTS import_profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  default_project TEXT,
  default_context TEXT,
  default_privacy TEXT,
  enable_ocr BOOLEAN DEFAULT FALSE,
  auto_confirm BOOLEAN DEFAULT FALSE,
  duplicate_action TEXT DEFAULT 'prompt',
  rules_enabled BOOLEAN DEFAULT TRUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_profiles_name ON import_profiles(name);
`;

/**
 * Result of rule matching
 */
export interface RuleMatch {
  rule: ImportRule;
  confidence: number;
}

/**
 * ImportConfigService manages import rules and profiles in the database
 *
 * Provides unified storage for import configuration with caching,
 * automatic migration from JSON files, and backward compatibility.
 */
export class ImportConfigService {
  private db: Database.Database;
  private rulesCache: ImportRule[] | null = null;
  private profilesCache: Map<string, ImportProfile> | null = null;

  /**
   * Create ImportConfigService with shared database connection
   */
  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Initialize import config schema
   */
  async initialize(): Promise<void> {
    this.db.exec(SCHEMA);
    debug('ImportConfigService initialized');
  }

  // ==================== RULES API ====================

  /**
   * Get all rules (cached, sorted by priority)
   */
  getRules(): ImportRule[] {
    if (this.rulesCache === null) {
      this.loadRulesCache();
    }
    return this.rulesCache ? [...this.rulesCache] : [];
  }

  /**
   * Get a specific rule by name
   */
  getRule(name: string): ImportRule | undefined {
    const rules = this.getRules();
    return rules.find(r => r.name === name);
  }

  /**
   * Add a new rule
   */
  addRule(rule: ImportRule): { success: boolean; error?: string } {
    try {
      // Validate rule
      const validation = validateRule(rule);
      if (!validation.success) {
        return { success: false, error: validation.error };
      }

      // Check for duplicate names
      if (this.getRule(rule.name)) {
        return { success: false, error: `Rule with name "${rule.name}" already exists` };
      }

      // Insert into database
      const id = randomUUID();
      const stmt = this.db.prepare(`
        INSERT INTO import_rules (id, name, description, match_criteria, actions, priority, enabled)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        id,
        validation.data.name,
        validation.data.description || null,
        JSON.stringify(validation.data.match),
        JSON.stringify(validation.data.actions),
        validation.data.priority || 50,
        validation.data.enabled !== false ? 1 : 0
      );

      // Invalidate cache
      this.rulesCache = null;

      debug('Import rule added', { name: rule.name });
      return { success: true };
    } catch (err) {
      warn('Failed to add import rule', { name: rule.name, error: String(err) });
      return { success: false, error: String(err) };
    }
  }

  /**
   * Update an existing rule
   */
  updateRule(name: string, updates: Partial<ImportRule>): { success: boolean; error?: string } {
    try {
      // Get existing rule
      const existing = this.getRule(name);
      if (!existing) {
        return { success: false, error: `Rule "${name}" not found` };
      }

      // Merge updates
      const updated = { ...existing, ...updates };

      // Validate merged rule
      const validation = validateRule(updated);
      if (!validation.success) {
        return { success: false, error: validation.error };
      }

      // Update database
      const stmt = this.db.prepare(`
        UPDATE import_rules
        SET description = ?,
            match_criteria = ?,
            actions = ?,
            priority = ?,
            enabled = ?,
            updated_at = datetime('now')
        WHERE name = ?
      `);

      stmt.run(
        validation.data.description || null,
        JSON.stringify(validation.data.match),
        JSON.stringify(validation.data.actions),
        validation.data.priority || 50,
        validation.data.enabled !== false ? 1 : 0,
        name
      );

      // Invalidate cache
      this.rulesCache = null;

      debug('Import rule updated', { name });
      return { success: true };
    } catch (err) {
      warn('Failed to update import rule', { name, error: String(err) });
      return { success: false, error: String(err) };
    }
  }

  /**
   * Remove a rule by name
   */
  removeRule(name: string): boolean {
    try {
      const stmt = this.db.prepare('DELETE FROM import_rules WHERE name = ?');
      const result = stmt.run(name);

      if (result.changes > 0) {
        // Invalidate cache
        this.rulesCache = null;
        debug('Import rule removed', { name });
        return true;
      }

      return false;
    } catch (err) {
      warn('Failed to remove import rule', { name, error: String(err) });
      return false;
    }
  }

  /**
   * Match rules against a file
   */
  matchRules(fileName: string, fileType: FileType, content?: string): RuleMatch[] {
    const rules = this.getRules();
    const matches: RuleMatch[] = [];

    for (const rule of rules) {
      let confidence = 0;
      let matchCount = 0;
      let checkCount = 0;

      // Check filename pattern (case-insensitive)
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
   * Apply rule actions to metadata
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
    for (const { rule } of ruleMatches) {
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

  // ==================== PROFILES API ====================

  /**
   * Get all profiles (cached)
   */
  getProfiles(): ImportProfile[] {
    if (this.profilesCache === null) {
      this.loadProfilesCache();
    }
    return this.profilesCache ? Array.from(this.profilesCache.values()) : [];
  }

  /**
   * Get a specific profile by name
   */
  getProfile(name: string): ImportProfile | undefined {
    if (this.profilesCache === null) {
      this.loadProfilesCache();
    }
    return this.profilesCache?.get(name);
  }

  /**
   * Create a new profile
   */
  createProfile(profile: ImportProfile): void {
    try {
      // Check for duplicates
      if (this.getProfile(profile.name)) {
        throw new Error(`Profile already exists: ${profile.name}`);
      }

      // Validate
      const validated = ImportProfileSchema.parse(profile);

      // Insert into database
      const id = randomUUID();
      const stmt = this.db.prepare(`
        INSERT INTO import_profiles (
          id, name, description, default_project, default_context,
          default_privacy, enable_ocr, auto_confirm, duplicate_action, rules_enabled
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        id,
        validated.name,
        validated.description,
        validated.defaultProject || null,
        validated.defaultContext || null,
        validated.defaultPrivacy || null,
        validated.enableOcr ? 1 : 0,
        validated.autoConfirm ? 1 : 0,
        validated.duplicateAction,
        validated.rulesEnabled ? 1 : 0
      );

      // Invalidate cache
      this.profilesCache = null;

      debug('Import profile created', { name: profile.name });
    } catch (err) {
      warn('Failed to create import profile', { name: profile.name, error: String(err) });
      throw err;
    }
  }

  /**
   * Update an existing profile
   */
  updateProfile(name: string, updates: Partial<Omit<ImportProfile, 'name'>>): void {
    try {
      // Get existing profile
      const existing = this.getProfile(name);
      if (!existing) {
        throw new Error(`Profile not found: ${name}`);
      }

      // Merge updates
      const updated = { ...existing, ...updates };

      // Validate
      const validated = ImportProfileSchema.parse(updated);

      // Update database
      const stmt = this.db.prepare(`
        UPDATE import_profiles
        SET description = ?,
            default_project = ?,
            default_context = ?,
            default_privacy = ?,
            enable_ocr = ?,
            auto_confirm = ?,
            duplicate_action = ?,
            rules_enabled = ?,
            updated_at = datetime('now')
        WHERE name = ?
      `);

      stmt.run(
        validated.description,
        validated.defaultProject || null,
        validated.defaultContext || null,
        validated.defaultPrivacy || null,
        validated.enableOcr ? 1 : 0,
        validated.autoConfirm ? 1 : 0,
        validated.duplicateAction,
        validated.rulesEnabled ? 1 : 0,
        name
      );

      // Invalidate cache
      this.profilesCache = null;

      debug('Import profile updated', { name });
    } catch (err) {
      warn('Failed to update import profile', { name, error: String(err) });
      throw err;
    }
  }

  /**
   * Delete a profile
   */
  deleteProfile(name: string): boolean {
    try {
      const stmt = this.db.prepare('DELETE FROM import_profiles WHERE name = ?');
      const result = stmt.run(name);

      if (result.changes > 0) {
        // Invalidate cache
        this.profilesCache = null;
        debug('Import profile deleted', { name });
        return true;
      }

      return false;
    } catch (err) {
      warn('Failed to delete import profile', { name, error: String(err) });
      return false;
    }
  }

  // ==================== CACHE MANAGEMENT ====================

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.rulesCache = null;
    this.profilesCache = null;
    debug('Import config cache cleared');
  }

  /**
   * Load rules into cache
   */
  private loadRulesCache(): void {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM import_rules
        WHERE enabled = TRUE
        ORDER BY priority DESC, name
      `);
      const rows = stmt.all() as Array<{
        id: string;
        name: string;
        description: string | null;
        match_criteria: string;
        actions: string;
        priority: number;
        enabled: number;
      }>;

      this.rulesCache = rows.map(row => ({
        name: row.name,
        description: row.description || undefined,
        match: JSON.parse(row.match_criteria),
        actions: JSON.parse(row.actions),
        priority: row.priority,
        enabled: row.enabled === 1,
      }));

      debug('Rules cache loaded', { count: this.rulesCache.length });
    } catch (err) {
      warn('Failed to load rules cache', { error: String(err) });
      this.rulesCache = [];
    }
  }

  /**
   * Load profiles into cache
   */
  private loadProfilesCache(): void {
    try {
      const stmt = this.db.prepare('SELECT * FROM import_profiles ORDER BY name');
      const rows = stmt.all() as Array<{
        id: string;
        name: string;
        description: string;
        default_project: string | null;
        default_context: string | null;
        default_privacy: string | null;
        enable_ocr: number;
        auto_confirm: number;
        duplicate_action: string;
        rules_enabled: number;
      }>;

      this.profilesCache = new Map();

      for (const row of rows) {
        const profile: ImportProfile = {
          name: row.name,
          description: row.description,
          defaultProject: row.default_project || undefined,
          defaultContext: row.default_context || undefined,
          defaultPrivacy: row.default_privacy as any || undefined,
          enableOcr: row.enable_ocr === 1,
          autoConfirm: row.auto_confirm === 1,
          duplicateAction: row.duplicate_action as 'skip' | 'prompt' | 'reimport',
          rulesEnabled: row.rules_enabled === 1,
        };

        this.profilesCache.set(profile.name, profile);
      }

      debug('Profiles cache loaded', { count: this.profilesCache.size });
    } catch (err) {
      warn('Failed to load profiles cache', { error: String(err) });
      this.profilesCache = new Map();
    }
  }
}
