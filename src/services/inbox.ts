// src/services/inbox.ts
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
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
`;

/**
 * Migrations for existing databases
 */
const MIGRATIONS: string[] = [
  // Future migrations will go here
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
}
