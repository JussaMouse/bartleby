// src/services/calendar.ts
// Calendar as Temporal Index - unified view of all time-based data
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { Config, getDbPath, ensureDir } from '../config.js';
import { info, debug } from '../utils/logger.js';

// Entry types in the temporal index
export type EntryType = 'event' | 'deadline' | 'reminder' | 'tickler' | 'habit' | 'milestone';
export type SourceType = 'calendar' | 'garden' | 'scheduler';

export interface CalendarEntry {
  id: string;
  title: string;
  description?: string;
  start_time: string;
  end_time: string;
  all_day: boolean;
  location?: string;
  entry_type: EntryType;      // What kind of temporal entry
  source_type: SourceType;    // Where the data lives
  source_id: string;          // ID in source system
  reminder_minutes: number;   // Minutes before to notify (0 = none)
  recurrence?: string;        // null | 'daily' | 'weekly' | cron
  metadata?: string;          // JSON for type-specific data
  created_at: string;
  updated_at: string;
}

// Legacy interface for backward compatibility
export interface CalendarEvent extends CalendarEntry {}

// Base schema - only creates table structure
const SCHEMA = `
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  all_day INTEGER DEFAULT 0,
  location TEXT,
  recurrence TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_events_start ON events(start_time);
`;

// Migrations to add Time System columns to existing databases
const MIGRATIONS = [
  // Add new columns (safe to fail if already exist)
  `ALTER TABLE events ADD COLUMN entry_type TEXT DEFAULT 'event'`,
  `ALTER TABLE events ADD COLUMN source_type TEXT DEFAULT 'calendar'`,
  `ALTER TABLE events ADD COLUMN source_id TEXT`,
  `ALTER TABLE events ADD COLUMN reminder_minutes INTEGER DEFAULT 0`,
  `ALTER TABLE events ADD COLUMN metadata TEXT`,
];

export class CalendarService {
  private db: Database.Database;

  constructor(private config: Config) {
    const dbPath = getDbPath(config, 'calendar.sqlite3');
    ensureDir(path.dirname(dbPath));

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
  }

  async initialize(): Promise<void> {
    // 1. Create base table structure
    this.db.exec(SCHEMA);
    
    // 2. Run migrations to add Time System columns
    for (const migration of MIGRATIONS) {
      try {
        this.db.exec(migration);
      } catch {
        // Column already exists, ignore
      }
    }
    
    // 3. Backfill existing events with source info
    this.db.exec(`
      UPDATE events 
      SET source_id = id, source_type = 'calendar', entry_type = 'event'
      WHERE source_id IS NULL
    `);
    
    // 4. Create indexes (now that columns exist)
    try {
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_events_source ON events(source_type, source_id)`);
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_events_type ON events(entry_type)`);
    } catch {
      // Indexes already exist
    }
    
    info('CalendarService initialized');
  }

  // === Calendar-Native Events ===

  create(data: Omit<CalendarEntry, 'id' | 'created_at' | 'updated_at' | 'entry_type' | 'source_type' | 'source_id' | 'reminder_minutes'> & { reminder_minutes?: number }): CalendarEntry {
    const id = uuidv4();
    const now = new Date().toISOString();

    const entry: CalendarEntry = {
      ...data,
      id,
      entry_type: 'event',
      source_type: 'calendar',
      source_id: id,
      reminder_minutes: data.reminder_minutes || 0,
      created_at: now,
      updated_at: now,
    };

    this.insertEntry(entry);
    return entry;
  }

  // === Temporal Index API (for other services) ===

  /**
   * Register temporal data from another service
   */
  registerTemporal(
    sourceType: SourceType,
    sourceId: string,
    datetime: Date,
    entryType: EntryType,
    title: string,
    options?: {
      endTime?: Date;
      description?: string;
      reminderMinutes?: number;
      recurrence?: string;
      metadata?: Record<string, unknown>;
    }
  ): CalendarEntry {
    // Check if already exists
    const existing = this.getBySource(sourceType, sourceId);
    if (existing) {
      // Update instead
      this.updateTemporal(sourceType, sourceId, {
        datetime,
        title,
        ...options,
      });
      return this.getBySource(sourceType, sourceId)!;
    }

    const id = uuidv4();
    const now = new Date().toISOString();
    const endTime = options?.endTime || new Date(datetime.getTime() + 60 * 60 * 1000); // Default 1 hour

    const entry: CalendarEntry = {
      id,
      title,
      description: options?.description,
      start_time: datetime.toISOString(),
      end_time: endTime.toISOString(),
      all_day: false,
      entry_type: entryType,
      source_type: sourceType,
      source_id: sourceId,
      reminder_minutes: options?.reminderMinutes || 0,
      recurrence: options?.recurrence,
      metadata: options?.metadata ? JSON.stringify(options.metadata) : undefined,
      created_at: now,
      updated_at: now,
    };

    this.insertEntry(entry);
    debug('Registered temporal entry', { sourceType, sourceId, entryType, datetime: datetime.toISOString() });
    return entry;
  }

  /**
   * Update temporal data from another service
   */
  updateTemporal(
    sourceType: SourceType,
    sourceId: string,
    updates: {
      datetime?: Date;
      title?: string;
      description?: string;
      reminderMinutes?: number;
      recurrence?: string;
      metadata?: Record<string, unknown>;
    }
  ): boolean {
    const existing = this.getBySource(sourceType, sourceId);
    if (!existing) return false;

    const now = new Date().toISOString();
    const setClauses: string[] = ['updated_at = ?'];
    const values: unknown[] = [now];

    if (updates.datetime) {
      setClauses.push('start_time = ?');
      values.push(updates.datetime.toISOString());
      // Update end_time to maintain duration
      const duration = new Date(existing.end_time).getTime() - new Date(existing.start_time).getTime();
      setClauses.push('end_time = ?');
      values.push(new Date(updates.datetime.getTime() + duration).toISOString());
    }
    if (updates.title !== undefined) {
      setClauses.push('title = ?');
      values.push(updates.title);
    }
    if (updates.description !== undefined) {
      setClauses.push('description = ?');
      values.push(updates.description);
    }
    if (updates.reminderMinutes !== undefined) {
      setClauses.push('reminder_minutes = ?');
      values.push(updates.reminderMinutes);
    }
    if (updates.recurrence !== undefined) {
      setClauses.push('recurrence = ?');
      values.push(updates.recurrence);
    }
    if (updates.metadata !== undefined) {
      setClauses.push('metadata = ?');
      values.push(JSON.stringify(updates.metadata));
    }

    values.push(sourceType, sourceId);

    const result = this.db.prepare(`
      UPDATE events SET ${setClauses.join(', ')}
      WHERE source_type = ? AND source_id = ?
    `).run(...values);

    return result.changes > 0;
  }

  /**
   * Remove temporal data when source is deleted or temporal aspect removed
   */
  removeTemporal(sourceType: SourceType, sourceId: string): boolean {
    const result = this.db.prepare(`
      DELETE FROM events WHERE source_type = ? AND source_id = ?
    `).run(sourceType, sourceId);
    
    if (result.changes > 0) {
      debug('Removed temporal entry', { sourceType, sourceId });
    }
    return result.changes > 0;
  }

  // === Query API ===

  getById(id: string): CalendarEntry | null {
    const row = this.db.prepare('SELECT * FROM events WHERE id = ?').get(id) as any;
    return row ? this.rowToEntry(row) : null;
  }

  getBySource(sourceType: SourceType, sourceId: string): CalendarEntry | null {
    const row = this.db.prepare(`
      SELECT * FROM events WHERE source_type = ? AND source_id = ?
    `).get(sourceType, sourceId) as any;
    return row ? this.rowToEntry(row) : null;
  }

  getBySourceType(sourceType: SourceType): CalendarEntry[] {
    const rows = this.db.prepare(`
      SELECT * FROM events WHERE source_type = ? ORDER BY start_time
    `).all(sourceType) as any[];
    return rows.map(r => this.rowToEntry(r));
  }

  getByEntryType(entryType: EntryType): CalendarEntry[] {
    const rows = this.db.prepare(`
      SELECT * FROM events WHERE entry_type = ? ORDER BY start_time
    `).all(entryType) as any[];
    return rows.map(r => this.rowToEntry(r));
  }

  getForDay(date: Date): CalendarEntry[] {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    const rows = this.db.prepare(`
      SELECT * FROM events
      WHERE start_time >= ? AND start_time <= ?
      ORDER BY start_time
    `).all(dayStart.toISOString(), dayEnd.toISOString()) as any[];

    return rows.map(r => this.rowToEntry(r));
  }

  getInRange(start: Date, end: Date): CalendarEntry[] {
    const rows = this.db.prepare(`
      SELECT * FROM events
      WHERE start_time >= ? AND start_time <= ?
      ORDER BY start_time
    `).all(start.toISOString(), end.toISOString()) as any[];

    return rows.map(r => this.rowToEntry(r));
  }

  getUpcoming(count = 10): CalendarEntry[] {
    const rows = this.db.prepare(`
      SELECT * FROM events
      WHERE start_time >= ?
      ORDER BY start_time
      LIMIT ?
    `).all(new Date().toISOString(), count) as any[];

    return rows.map(r => this.rowToEntry(r));
  }

  /**
   * Get entries that need reminders sent
   */
  getUpcomingReminders(withinMinutes: number): CalendarEntry[] {
    const now = new Date();
    const cutoff = new Date(now.getTime() + withinMinutes * 60 * 1000);
    
    const rows = this.db.prepare(`
      SELECT * FROM events
      WHERE reminder_minutes > 0
        AND start_time >= ?
        AND start_time <= ?
      ORDER BY start_time
    `).all(now.toISOString(), cutoff.toISOString()) as any[];

    return rows.map(r => this.rowToEntry(r));
  }

  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM events WHERE id = ?').run(id);
    return result.changes > 0;
  }

  deleteAll(): void {
    this.db.exec('DELETE FROM events');
  }

  // === Helpers ===

  private insertEntry(entry: CalendarEntry): void {
    this.db.prepare(`
      INSERT INTO events (
        id, title, description, start_time, end_time, all_day, location,
        entry_type, source_type, source_id, reminder_minutes, recurrence, metadata,
        created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      entry.id, entry.title, entry.description,
      entry.start_time, entry.end_time, entry.all_day ? 1 : 0, entry.location,
      entry.entry_type, entry.source_type, entry.source_id,
      entry.reminder_minutes, entry.recurrence, entry.metadata,
      entry.created_at, entry.updated_at
    );
  }

  private rowToEntry(row: any): CalendarEntry {
    return {
      id: row.id,
      title: row.title,
      description: row.description || undefined,
      start_time: row.start_time,
      end_time: row.end_time,
      all_day: row.all_day === 1,
      location: row.location || undefined,
      entry_type: row.entry_type || 'event',
      source_type: row.source_type || 'calendar',
      source_id: row.source_id || row.id,
      reminder_minutes: row.reminder_minutes || 0,
      recurrence: row.recurrence || undefined,
      metadata: row.metadata || undefined,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  // === Reconciliation ===

  /**
   * Reconcile calendar index with source services.
   * Call on startup to ensure consistency.
   */
  async reconcile(
    gardenTasks: Array<{ id: string; title: string; due_date: string }>,
    schedulerTasks: Array<{ id: string; actionPayload: string; nextRun: string; scheduleType: string }>
  ): Promise<void> {
    info('Reconciling calendar index...');
    
    // Track what we've seen
    const seenGarden = new Set<string>();
    const seenScheduler = new Set<string>();

    // 1. Sync Garden tasks with due dates
    for (const task of gardenTasks) {
      seenGarden.add(task.id);
      const existing = this.getBySource('garden', task.id);
      
      const hasTime = task.due_date.includes('T');
      const entryType: EntryType = hasTime ? 'event' : 'deadline';
      const dueDate = new Date(task.due_date);

      if (!existing) {
        // Missing - create
        this.registerTemporal(
          'garden',
          task.id,
          dueDate,
          entryType,
          task.title,
          hasTime ? { endTime: new Date(dueDate.getTime() + 30 * 60 * 1000) } : undefined
        );
        debug('Reconcile: added missing garden entry', { id: task.id });
      } else if (
        existing.start_time !== dueDate.toISOString() ||
        existing.entry_type !== entryType
      ) {
        // Stale - update (recreate if type changed)
        if (existing.entry_type !== entryType) {
          this.removeTemporal('garden', task.id);
          this.registerTemporal(
            'garden',
            task.id,
            dueDate,
            entryType,
            task.title,
            hasTime ? { endTime: new Date(dueDate.getTime() + 30 * 60 * 1000) } : undefined
          );
        } else {
          this.updateTemporal('garden', task.id, { datetime: dueDate });
        }
        debug('Reconcile: updated stale garden entry', { id: task.id });
      }
    }

    // 2. Remove orphaned garden entries
    const gardenEntries = this.getBySourceType('garden');
    for (const entry of gardenEntries) {
      if (!seenGarden.has(entry.source_id)) {
        this.removeTemporal('garden', entry.source_id);
        debug('Reconcile: removed orphaned garden entry', { id: entry.source_id });
      }
    }

    // 3. Sync Scheduler tasks
    for (const task of schedulerTasks) {
      seenScheduler.add(task.id);
      const existing = this.getBySource('scheduler', task.id);
      
      if (!existing) {
        // Missing - create
        this.registerTemporal(
          'scheduler',
          task.id,
          new Date(task.nextRun),
          'reminder',
          task.actionPayload as string,
          { recurrence: task.scheduleType !== 'once' ? 'recurring' : undefined }
        );
        debug('Reconcile: added missing scheduler entry', { id: task.id });
      } else if (existing.start_time !== task.nextRun) {
        // Stale - update
        this.updateTemporal('scheduler', task.id, { datetime: new Date(task.nextRun) });
        debug('Reconcile: updated stale scheduler entry', { id: task.id });
      }
    }

    // 4. Remove orphaned scheduler entries
    const schedulerEntries = this.getBySourceType('scheduler');
    for (const entry of schedulerEntries) {
      if (!seenScheduler.has(entry.source_id)) {
        this.removeTemporal('scheduler', entry.source_id);
        debug('Reconcile: removed orphaned scheduler entry', { id: entry.source_id });
      }
    }

    info('Calendar reconciliation complete');
  }

  close(): void {
    this.db.close();
  }
}
