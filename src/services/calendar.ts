// src/services/calendar.ts
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { Config, getDbPath, ensureDir } from '../config.js';
import { info } from '../utils/logger.js';

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  start_time: string;
  end_time: string;
  all_day: boolean;
  location?: string;
  linked_record?: string;
  recurrence?: string;
  created_at: string;
  updated_at: string;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  all_day INTEGER DEFAULT 0,
  location TEXT,
  linked_record TEXT,
  recurrence TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_events_start ON events(start_time);
`;

export class CalendarService {
  private db: Database.Database;

  constructor(private config: Config) {
    const dbPath = getDbPath(config, 'calendar.sqlite3');
    ensureDir(path.dirname(dbPath));

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
  }

  async initialize(): Promise<void> {
    this.db.exec(SCHEMA);
    info('CalendarService initialized');
  }

  create(data: Omit<CalendarEvent, 'id' | 'created_at' | 'updated_at'>): CalendarEvent {
    const id = uuidv4();
    const now = new Date().toISOString();

    const event: CalendarEvent = { ...data, id, created_at: now, updated_at: now };

    this.db.prepare(`
      INSERT INTO events (id, title, description, start_time, end_time, all_day, location, linked_record, recurrence, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      event.id, event.title, event.description,
      event.start_time, event.end_time, event.all_day ? 1 : 0,
      event.location, event.linked_record, event.recurrence,
      event.created_at, event.updated_at
    );

    return event;
  }

  getForDay(date: Date): CalendarEvent[] {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    const rows = this.db.prepare(`
      SELECT * FROM events
      WHERE start_time >= ? AND start_time <= ?
      ORDER BY start_time
    `).all(dayStart.toISOString(), dayEnd.toISOString()) as any[];

    return rows.map(r => this.rowToEvent(r));
  }

  getInRange(start: Date, end: Date): CalendarEvent[] {
    const rows = this.db.prepare(`
      SELECT * FROM events
      WHERE start_time >= ? AND start_time <= ?
      ORDER BY start_time
    `).all(start.toISOString(), end.toISOString()) as any[];

    return rows.map(r => this.rowToEvent(r));
  }

  getUpcoming(count = 10): CalendarEvent[] {
    const rows = this.db.prepare(`
      SELECT * FROM events
      WHERE start_time >= ?
      ORDER BY start_time
      LIMIT ?
    `).all(new Date().toISOString(), count) as any[];

    return rows.map(r => this.rowToEvent(r));
  }

  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM events WHERE id = ?').run(id);
    return result.changes > 0;
  }

  private rowToEvent(row: any): CalendarEvent {
    return {
      id: row.id,
      title: row.title,
      description: row.description || undefined,
      start_time: row.start_time,
      end_time: row.end_time,
      all_day: row.all_day === 1,
      location: row.location || undefined,
      linked_record: row.linked_record || undefined,
      recurrence: row.recurrence || undefined,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  close(): void {
    this.db.close();
  }
}
