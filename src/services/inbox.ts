// src/services/inbox.ts
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { debug, warn } from '../utils/logger.js';
import { FileType } from '../utils/file-type-detection.js';

/**
 * Inbox item representing a staged file awaiting import
 */
export interface InboxItem {
  id: string;
  file_path: string;
  file_name: string;
  file_type: FileType;
  file_size: number;
  mime_type: string | null;
  created_at: string;
  captured_at: string;
  processing_status?: 'pending' | 'processed' | 'failed' | 'skipped';
  processing_metadata?: string; // JSON string
}

/**
 * Import history record tracking previously imported files
 */
export interface ImportHistoryRecord {
  id: string;
  file_name: string;
  file_path: string;
  file_hash: string;
  file_type: string;
  file_size: number;
  imported_at: string;
  garden_record_id: string | null;
  rule_applied: string | null;
  metadata: string | null; // JSON string
}

/**
 * Result of duplicate detection check
 */
export interface DuplicateCheckResult {
  isDuplicate: boolean;
  action: 'import' | 'skip' | 'reimport' | 'prompt';
  existingRecord?: ImportHistoryRecord;
  reason?: string;
}

/**
 * Database schema for inbox items
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS inbox_items (
  id TEXT PRIMARY KEY,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  created_at TEXT NOT NULL,
  captured_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_inbox_created
  ON inbox_items(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inbox_type
  ON inbox_items(file_type);
CREATE INDEX IF NOT EXISTS idx_inbox_captured
  ON inbox_items(captured_at DESC);

CREATE TABLE IF NOT EXISTS import_history (
  id TEXT PRIMARY KEY,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_hash TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  imported_at TEXT NOT NULL DEFAULT (datetime('now')),
  garden_record_id TEXT,
  rule_applied TEXT,
  metadata TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_import_hash
  ON import_history(file_hash);
CREATE INDEX IF NOT EXISTS idx_import_date
  ON import_history(imported_at DESC);
CREATE INDEX IF NOT EXISTS idx_import_record
  ON import_history(garden_record_id);
CREATE INDEX IF NOT EXISTS idx_import_filename
  ON import_history(file_name);
`;

/**
 * Migrations for existing databases
 */
const MIGRATIONS: string[] = [
  `ALTER TABLE inbox_items ADD COLUMN processing_status TEXT DEFAULT 'pending'`,
  `ALTER TABLE inbox_items ADD COLUMN processing_metadata TEXT`,
];

/**
 * InboxService manages temporary staging records for file imports
 *
 * Follows the GardenService pattern but shares the main database connection.
 * Lightweight facade over inbox_items table operations.
 */
export class InboxService {
  private db: Database.Database;

  /**
   * Create InboxService with shared database connection
   *
   * @param db - Shared database instance (from GardenService)
   */
  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Initialize the inbox schema and run migrations
   */
  async initialize(): Promise<void> {
    this.db.exec(SCHEMA);

    // Run migrations for existing databases
    for (const migration of MIGRATIONS) {
      try {
        this.db.exec(migration);
        debug('Inbox migration applied', { migration: migration.substring(0, 50) });
      } catch (err) {
        const errMsg = String(err);
        if (errMsg.includes('duplicate column name')) {
          debug('Inbox migration skipped (column exists)', {
            migration: migration.substring(0, 50)
          });
        } else {
          warn('Inbox migration failed', {
            migration: migration.substring(0, 50),
            error: errMsg
          });
        }
      }
    }

    debug('InboxService initialized');
  }

  /**
   * Capture a file for import
   *
   * @param filePath - Path to the file
   * @param fileName - Name of the file
   * @param fileType - Detected file type
   * @param fileSize - Size in bytes
   * @param mimeType - MIME type
   * @param createdAt - File creation/modification date
   * @returns Created inbox item
   */
  captureFile(
    filePath: string,
    fileName: string,
    fileType: FileType,
    fileSize: number,
    mimeType: string | null,
    createdAt: Date
  ): InboxItem {
    const id = uuidv4();
    const createdAtISO = createdAt.toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO inbox_items (
        id, file_path, file_name, file_type,
        file_size, mime_type, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(id, filePath, fileName, fileType, fileSize, mimeType, createdAtISO);

    debug('File captured to inbox', { id, fileName, fileType });

    return this.getItem(id)!;
  }

  /**
   * Get a single inbox item by ID
   *
   * @param id - Inbox item ID
   * @returns Inbox item or undefined if not found
   */
  getItem(id: string): InboxItem | undefined {
    const stmt = this.db.prepare(`
      SELECT * FROM inbox_items WHERE id = ?
    `);

    const row = stmt.get(id) as InboxItem | undefined;
    return row;
  }

  /**
   * List all inbox items
   *
   * @param fileType - Optional filter by file type
   * @returns Array of inbox items ordered by capture date (newest first)
   */
  listInbox(fileType?: FileType): InboxItem[] {
    let query = `SELECT * FROM inbox_items`;
    const params: any[] = [];

    if (fileType) {
      query += ` WHERE file_type = ?`;
      params.push(fileType);
    }

    query += ` ORDER BY captured_at DESC`;

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as InboxItem[];

    return rows;
  }

  /**
   * Get inbox statistics
   *
   * @returns Object with counts by file type
   */
  getStats(): Record<string, number> {
    const stmt = this.db.prepare(`
      SELECT file_type, COUNT(*) as count
      FROM inbox_items
      GROUP BY file_type
    `);

    const rows = stmt.all() as Array<{ file_type: string; count: number }>;
    const stats: Record<string, number> = {};

    for (const row of rows) {
      stats[row.file_type] = row.count;
    }

    return stats;
  }

  /**
   * Delete an inbox item
   *
   * @param id - Inbox item ID
   * @returns True if deleted, false if not found
   */
  deleteItem(id: string): boolean {
    const stmt = this.db.prepare(`
      DELETE FROM inbox_items WHERE id = ?
    `);

    const result = stmt.run(id);
    debug('Inbox item deleted', { id, deleted: result.changes > 0 });

    return result.changes > 0;
  }

  /**
   * Delete multiple inbox items by IDs
   *
   * @param ids - Array of inbox item IDs
   * @returns Number of items deleted
   */
  deleteItems(ids: string[]): number {
    if (ids.length === 0) return 0;

    const placeholders = ids.map(() => '?').join(',');
    const stmt = this.db.prepare(`
      DELETE FROM inbox_items WHERE id IN (${placeholders})
    `);

    const result = stmt.run(...ids);
    debug('Inbox items deleted', { count: result.changes });

    return result.changes;
  }

  /**
   * Clear all inbox items
   *
   * @returns Number of items deleted
   */
  clearInbox(): number {
    const stmt = this.db.prepare(`DELETE FROM inbox_items`);
    const result = stmt.run();

    debug('Inbox cleared', { count: result.changes });

    return result.changes;
  }

  /**
   * Get total inbox count
   *
   * @returns Number of items in inbox
   */
  getCount(): number {
    const stmt = this.db.prepare(`SELECT COUNT(*) as count FROM inbox_items`);
    const result = stmt.get() as { count: number };

    return result.count;
  }

  /**
   * Compute SHA256 hash of a file
   *
   * @param filePath - Path to the file
   * @returns SHA256 hash as hex string
   */
  private computeFileHash(filePath: string): string {
    try {
      const fileBuffer = readFileSync(filePath);
      const hash = createHash('sha256');
      hash.update(fileBuffer);
      return hash.digest('hex');
    } catch (err) {
      warn('Failed to compute file hash', { filePath, error: String(err) });
      throw err;
    }
  }

  /**
   * Check if a file has been imported before
   *
   * @param filePath - Path to the file to check
   * @returns Duplicate check result with action recommendation
   */
  async checkDuplicate(filePath: string): Promise<DuplicateCheckResult> {
    try {
      const fileHash = this.computeFileHash(filePath);

      const stmt = this.db.prepare(`
        SELECT * FROM import_history
        WHERE file_hash = ?
        ORDER BY imported_at DESC
        LIMIT 1
      `);

      const existingRecord = stmt.get(fileHash) as ImportHistoryRecord | undefined;

      if (!existingRecord) {
        return {
          isDuplicate: false,
          action: 'import',
        };
      }

      // File has been imported before
      // Check if the garden record still exists (if applicable)
      let gardenRecordExists = false;
      if (existingRecord.garden_record_id) {
        const gardenStmt = this.db.prepare(`
          SELECT id FROM records WHERE id = ?
        `);
        gardenRecordExists = !!gardenStmt.get(existingRecord.garden_record_id);
      }

      // Determine action based on whether garden record still exists
      let action: DuplicateCheckResult['action'] = 'skip';
      let reason = `File was previously imported on ${new Date(existingRecord.imported_at).toLocaleString()}`;

      if (existingRecord.garden_record_id && !gardenRecordExists) {
        // Record was deleted, allow reimport
        action = 'reimport';
        reason = `File was imported before but the record has been deleted. You can reimport it.`;
      } else if (existingRecord.garden_record_id && gardenRecordExists) {
        // Record still exists, skip by default but allow prompt
        action = 'skip';
        reason = `File was already imported (record: ${existingRecord.garden_record_id})`;
      }

      return {
        isDuplicate: true,
        action,
        existingRecord,
        reason,
      };
    } catch (err) {
      warn('Duplicate check failed', { filePath, error: String(err) });
      // On error, allow import (fail open)
      return {
        isDuplicate: false,
        action: 'import',
      };
    }
  }

  /**
   * Record a file import in the history
   *
   * @param filePath - Path to the imported file
   * @param fileName - Name of the file
   * @param fileType - Type of the file
   * @param fileSize - Size of the file in bytes
   * @param gardenRecordId - ID of the created garden record (if any)
   * @param ruleApplied - Name of the import rule that was applied (if any)
   * @param metadata - Additional metadata to store (optional)
   * @returns Created import history record
   */
  recordImport(
    filePath: string,
    fileName: string,
    fileType: string,
    fileSize: number,
    gardenRecordId: string | null = null,
    ruleApplied: string | null = null,
    metadata?: Record<string, unknown>
  ): ImportHistoryRecord {
    const id = uuidv4();
    const fileHash = this.computeFileHash(filePath);
    const metadataJson = metadata ? JSON.stringify(metadata) : null;

    const stmt = this.db.prepare(`
      INSERT INTO import_history (
        id, file_name, file_path, file_hash, file_type,
        file_size, garden_record_id, rule_applied, metadata
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      fileName,
      filePath,
      fileHash,
      fileType,
      fileSize,
      gardenRecordId,
      ruleApplied,
      metadataJson
    );

    debug('Import recorded in history', { id, fileName, fileHash: fileHash.substring(0, 8) });

    const getStmt = this.db.prepare(`
      SELECT * FROM import_history WHERE id = ?
    `);

    return getStmt.get(id) as ImportHistoryRecord;
  }

  /**
   * Get import history records
   *
   * @param limit - Maximum number of records to return (default: 50)
   * @param since - Only return records imported after this date (optional)
   * @returns Array of import history records
   */
  getImportHistory(limit: number = 50, since?: Date): ImportHistoryRecord[] {
    let query = `SELECT * FROM import_history`;
    const params: any[] = [];

    if (since) {
      query += ` WHERE imported_at > ?`;
      params.push(since.toISOString());
    }

    query += ` ORDER BY imported_at DESC LIMIT ?`;
    params.push(limit);

    const stmt = this.db.prepare(query);
    return stmt.all(...params) as ImportHistoryRecord[];
  }

  /**
   * Search import history
   *
   * @param query - Search query (searches file_name and file_path)
   * @returns Array of matching import history records
   */
  searchHistory(query: string): ImportHistoryRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM import_history
      WHERE file_name LIKE ? OR file_path LIKE ?
      ORDER BY imported_at DESC
      LIMIT 100
    `);

    const searchPattern = `%${query}%`;
    return stmt.all(searchPattern, searchPattern) as ImportHistoryRecord[];
  }

  /**
   * Get import history statistics
   *
   * @returns Statistics about imports
   */
  getImportStats(): {
    total: number;
    byType: Record<string, number>;
    recentCount: number;
  } {
    // Total imports
    const totalStmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM import_history
    `);
    const total = (totalStmt.get() as { count: number }).count;

    // By type
    const typeStmt = this.db.prepare(`
      SELECT file_type, COUNT(*) as count
      FROM import_history
      GROUP BY file_type
    `);
    const typeRows = typeStmt.all() as Array<{ file_type: string; count: number }>;
    const byType: Record<string, number> = {};
    for (const row of typeRows) {
      byType[row.file_type] = row.count;
    }

    // Recent (last 7 days)
    const recentStmt = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM import_history
      WHERE imported_at > datetime('now', '-7 days')
    `);
    const recentCount = (recentStmt.get() as { count: number }).count;

    return { total, byType, recentCount };
  }
}
