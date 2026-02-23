// src/services/settings.ts
import Database from 'better-sqlite3';
import { debug, warn } from '../utils/logger.js';

/**
 * Database schema for settings
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  value_type TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_settings_category
  ON settings(category);

CREATE TABLE IF NOT EXISTS settings_metadata (
  id TEXT PRIMARY KEY DEFAULT 'singleton',
  first_run_completed BOOLEAN DEFAULT FALSE,
  migration_version INTEGER DEFAULT 0,
  last_migration_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Ensure metadata row exists
INSERT OR IGNORE INTO settings_metadata (id) VALUES ('singleton');
`;

/**
 * Type mappings for value storage
 */
type SettingValueType = 'string' | 'number' | 'boolean' | 'json';

/**
 * Setting record from database
 */
export interface SettingRecord {
  key: string;
  value: string;
  value_type: SettingValueType;
  category: string;
  description?: string;
  updated_at: string;
}

/**
 * Settings metadata record
 */
export interface SettingsMetadata {
  id: string;
  first_run_completed: boolean;
  migration_version: number;
  last_migration_at?: string;
  created_at: string;
}

/**
 * SettingsService manages application configuration in the database
 *
 * Provides runtime-configurable settings with categorization, type safety,
 * and migration support. Replaces most .env configuration.
 */
export class SettingsService {
  private db: Database.Database;
  private cache: Map<string, any> = new Map();
  private cacheEnabled: boolean = true;

  /**
   * Create SettingsService with shared database connection
   *
   * @param db - Shared database instance
   */
  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Initialize settings schema
   */
  async initialize(): Promise<void> {
    this.db.exec(SCHEMA);
    debug('SettingsService initialized');
  }

  /**
   * Get a setting value with type conversion
   *
   * @param key - Setting key (e.g., 'llm.router-model')
   * @param defaultValue - Default value if not found
   * @returns Setting value with proper type
   */
  getSetting<T = any>(key: string, defaultValue?: T): T {
    // Check cache first
    if (this.cacheEnabled && this.cache.has(key)) {
      return this.cache.get(key) as T;
    }

    try {
      const stmt = this.db.prepare('SELECT * FROM settings WHERE key = ?');
      const record = stmt.get(key) as SettingRecord | undefined;

      if (!record) {
        if (defaultValue !== undefined) {
          return defaultValue;
        }
        throw new Error(`Setting not found: ${key}`);
      }

      // Convert value based on type
      const value = this.deserializeValue(record.value, record.value_type);

      // Cache the value
      if (this.cacheEnabled) {
        this.cache.set(key, value);
      }

      return value as T;
    } catch (err) {
      warn('Failed to get setting', { key, error: String(err) });
      if (defaultValue !== undefined) {
        return defaultValue;
      }
      throw err;
    }
  }

  /**
   * Set a setting value with type detection
   *
   * @param key - Setting key
   * @param value - Value to store
   * @param category - Setting category (e.g., 'llm', 'calendar')
   * @param description - Optional description
   */
  setSetting<T = any>(
    key: string,
    value: T,
    category: string,
    description?: string
  ): void {
    try {
      const valueType = this.detectValueType(value);
      const serialized = this.serializeValue(value, valueType);

      const stmt = this.db.prepare(`
        INSERT INTO settings (key, value, value_type, category, description)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          value_type = excluded.value_type,
          category = excluded.category,
          description = COALESCE(excluded.description, description),
          updated_at = datetime('now')
      `);

      stmt.run(key, serialized, valueType, category, description || null);

      // Update cache
      if (this.cacheEnabled) {
        this.cache.set(key, value);
      }

      debug('Setting updated', { key, category });
    } catch (err) {
      warn('Failed to set setting', { key, error: String(err) });
      throw err;
    }
  }

  /**
   * Get all settings in a category
   *
   * @param category - Category name
   * @returns Object with setting keys and values
   */
  getCategory(category: string): Record<string, any> {
    try {
      const stmt = this.db.prepare('SELECT * FROM settings WHERE category = ?');
      const records = stmt.all(category) as SettingRecord[];

      const result: Record<string, any> = {};

      for (const record of records) {
        // Remove category prefix from key for cleaner access
        const shortKey = record.key.replace(`${category}.`, '');
        result[shortKey] = this.deserializeValue(record.value, record.value_type);
      }

      return result;
    } catch (err) {
      warn('Failed to get category', { category, error: String(err) });
      return {};
    }
  }

  /**
   * Get all settings grouped by category
   *
   * @returns Object with categories as keys
   */
  getAllSettings(): Record<string, Record<string, any>> {
    try {
      const stmt = this.db.prepare('SELECT DISTINCT category FROM settings ORDER BY category');
      const categories = stmt.all() as Array<{ category: string }>;

      const result: Record<string, Record<string, any>> = {};

      for (const { category } of categories) {
        result[category] = this.getCategory(category);
      }

      return result;
    } catch (err) {
      warn('Failed to get all settings', { error: String(err) });
      return {};
    }
  }

  /**
   * Delete a setting
   *
   * @param key - Setting key to delete
   * @returns True if deleted, false if not found
   */
  deleteSetting(key: string): boolean {
    try {
      const stmt = this.db.prepare('DELETE FROM settings WHERE key = ?');
      const result = stmt.run(key);

      // Remove from cache
      this.cache.delete(key);

      debug('Setting deleted', { key, deleted: result.changes > 0 });
      return result.changes > 0;
    } catch (err) {
      warn('Failed to delete setting', { key, error: String(err) });
      return false;
    }
  }

  /**
   * Reset all settings in a category (delete them)
   *
   * @param category - Category to reset (if undefined, resets all)
   * @returns Number of settings deleted
   */
  reset(category?: string): number {
    try {
      let stmt: Database.Statement;

      if (category) {
        stmt = this.db.prepare('DELETE FROM settings WHERE category = ?');
        stmt.run(category);
      } else {
        stmt = this.db.prepare('DELETE FROM settings');
        stmt.run();
      }

      // Clear cache
      this.cache.clear();

      const changes = stmt.run(category || '').changes;
      debug('Settings reset', { category: category || 'all', count: changes });

      return changes;
    } catch (err) {
      warn('Failed to reset settings', { category, error: String(err) });
      return 0;
    }
  }

  /**
   * Check if this is the first run (no settings exist)
   *
   * @returns True if first run
   */
  isFirstRun(): boolean {
    try {
      const stmt = this.db.prepare(
        'SELECT first_run_completed FROM settings_metadata WHERE id = ?'
      );
      const metadata = stmt.get('singleton') as SettingsMetadata | undefined;

      return metadata ? !metadata.first_run_completed : true;
    } catch (err) {
      warn('Failed to check first run', { error: String(err) });
      return true; // Assume first run on error
    }
  }

  /**
   * Mark first run as completed
   */
  markFirstRunComplete(): void {
    try {
      const stmt = this.db.prepare(`
        UPDATE settings_metadata
        SET first_run_completed = TRUE
        WHERE id = ?
      `);

      stmt.run('singleton');
      debug('First run marked complete');
    } catch (err) {
      warn('Failed to mark first run complete', { error: String(err) });
      throw err;
    }
  }

  /**
   * Get migration version
   *
   * @returns Current migration version
   */
  getMigrationVersion(): number {
    try {
      const stmt = this.db.prepare(
        'SELECT migration_version FROM settings_metadata WHERE id = ?'
      );
      const metadata = stmt.get('singleton') as SettingsMetadata | undefined;

      return metadata?.migration_version || 0;
    } catch (err) {
      warn('Failed to get migration version', { error: String(err) });
      return 0;
    }
  }

  /**
   * Set migration version
   *
   * @param version - New migration version
   */
  setMigrationVersion(version: number): void {
    try {
      const stmt = this.db.prepare(`
        UPDATE settings_metadata
        SET migration_version = ?,
            last_migration_at = datetime('now')
        WHERE id = ?
      `);

      stmt.run(version, 'singleton');
      debug('Migration version updated', { version });
    } catch (err) {
      warn('Failed to set migration version', { version, error: String(err) });
      throw err;
    }
  }

  /**
   * Migrate settings from environment variables
   *
   * @param envConfig - Configuration object from .env
   */
  migrateFromEnv(envConfig: Record<string, any>): void {
    debug('Starting environment migration');

    // This will be implemented in the migration tool
    // For now, just log that migration was requested
    warn('Environment migration not yet implemented', {
      keys: Object.keys(envConfig).length,
    });
  }

  /**
   * Clear the settings cache
   */
  clearCache(): void {
    this.cache.clear();
    debug('Settings cache cleared');
  }

  /**
   * Detect the type of a value
   */
  private detectValueType(value: any): SettingValueType {
    if (typeof value === 'string') return 'string';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    return 'json';
  }

  /**
   * Serialize a value for storage
   */
  private serializeValue(value: any, type: SettingValueType): string {
    switch (type) {
      case 'string':
        return String(value);
      case 'number':
        return String(value);
      case 'boolean':
        return value ? '1' : '0';
      case 'json':
        return JSON.stringify(value);
      default:
        return String(value);
    }
  }

  /**
   * Deserialize a value from storage
   */
  private deserializeValue(value: string, type: SettingValueType): any {
    switch (type) {
      case 'string':
        return value;
      case 'number':
        return Number(value);
      case 'boolean':
        return value === '1' || value === 'true';
      case 'json':
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      default:
        return value;
    }
  }

  /**
   * Get statistics about settings
   */
  getStats(): {
    total: number;
    byCategory: Record<string, number>;
    firstRunCompleted: boolean;
    migrationVersion: number;
  } {
    try {
      // Total count
      const totalStmt = this.db.prepare('SELECT COUNT(*) as count FROM settings');
      const total = (totalStmt.get() as { count: number }).count;

      // By category
      const categoryStmt = this.db.prepare(`
        SELECT category, COUNT(*) as count
        FROM settings
        GROUP BY category
      `);
      const categories = categoryStmt.all() as Array<{ category: string; count: number }>;

      const byCategory: Record<string, number> = {};
      for (const { category, count } of categories) {
        byCategory[category] = count;
      }

      // Metadata
      const metadataStmt = this.db.prepare(
        'SELECT * FROM settings_metadata WHERE id = ?'
      );
      const metadata = metadataStmt.get('singleton') as SettingsMetadata | undefined;

      return {
        total,
        byCategory,
        firstRunCompleted: metadata?.first_run_completed || false,
        migrationVersion: metadata?.migration_version || 0,
      };
    } catch (err) {
      warn('Failed to get settings stats', { error: String(err) });
      return {
        total: 0,
        byCategory: {},
        firstRunCompleted: false,
        migrationVersion: 0,
      };
    }
  }
}
