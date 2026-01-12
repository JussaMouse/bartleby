// src/services/scheduler.ts
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { Config, getDbPath, ensureDir } from '../config.js';
import { info, warn, debug, error } from '../utils/logger.js';
import { SignalService } from './signal.js';
import type { CalendarService } from './calendar.js';

export interface ScheduledTask {
  id: string;
  type: 'reminder' | 'recurring' | 'check';
  scheduleType: 'once' | 'interval' | 'cron';
  scheduleValue: string;  // ISO date, interval ms, or cron expression
  actionType: 'notify' | 'execute';
  actionPayload: unknown;
  lastRun?: string;
  nextRun: string;
  enabled: boolean;
  createdAt: string;
  createdBy: 'user' | 'system';
  relatedRecord?: string;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  schedule_type TEXT NOT NULL,
  schedule_value TEXT NOT NULL,
  action_type TEXT NOT NULL,
  action_payload TEXT,
  last_run TEXT,
  next_run TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  created_by TEXT DEFAULT 'user',
  related_record TEXT
);

CREATE INDEX IF NOT EXISTS idx_tasks_next ON tasks(next_run);
CREATE INDEX IF NOT EXISTS idx_tasks_enabled ON tasks(enabled);
`;

export class SchedulerService {
  private db: Database.Database;
  private intervalId?: NodeJS.Timeout;
  private running = false;
  private calendar?: CalendarService;

  constructor(
    private config: Config,
    private signal: SignalService
  ) {
    const dbPath = getDbPath(config, 'scheduler.sqlite3');
    ensureDir(path.dirname(dbPath));

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
  }

  /**
   * Set the calendar service for temporal index integration.
   * Called after both services are initialized.
   */
  setCalendar(calendar: CalendarService): void {
    this.calendar = calendar;
  }

  async initialize(): Promise<void> {
    this.db.exec(SCHEMA);
    info('SchedulerService initialized');
  }

  start(): void {
    if (this.running) return;
    if (!this.config.scheduler.enabled) {
      info('Scheduler disabled by config');
      return;
    }

    this.running = true;
    this.intervalId = setInterval(
      () => this.tick(),
      this.config.scheduler.checkInterval
    );

    // Don't run tick immediately - let REPL handle missed reminders first
    info('Scheduler started', { interval: this.config.scheduler.checkInterval });
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    this.running = false;
    info('Scheduler stopped');
  }

  private async tick(): Promise<void> {
    const now = new Date().toISOString();

    const dueTasks = this.db.prepare(`
      SELECT * FROM tasks
      WHERE enabled = 1 AND next_run <= ?
      ORDER BY next_run
    `).all(now) as any[];

    for (const row of dueTasks) {
      const task = this.rowToTask(row);
      try {
        await this.executeTask(task);
        this.updateAfterRun(task);
      } catch (err) {
        error('Scheduled task failed', { taskId: task.id, error: String(err) });
      }
    }
  }

  private async executeTask(task: ScheduledTask): Promise<void> {
    debug('Executing scheduled task', { id: task.id, type: task.type });

    switch (task.actionType) {
      case 'notify':
        await this.sendNotification(task.actionPayload as string);
        break;
      case 'execute':
        // For now, just log - actual tool execution would require tool registry
        info('Scheduled execution', { payload: task.actionPayload });
        break;
    }
  }

  private async sendNotification(message: string): Promise<void> {
    // Try Signal first
    if (this.signal.isEnabled()) {
      await this.signal.send(`🔔 Reminder: ${message}`);
    }
    
    // Always log to console
    console.log(`\n🔔 Reminder: ${message}\n`);
  }

  private updateAfterRun(task: ScheduledTask): void {
    const now = new Date().toISOString();

    if (task.scheduleType === 'once') {
      // Disable one-time tasks
      this.db.prepare(
        'UPDATE tasks SET enabled = 0, last_run = ? WHERE id = ?'
      ).run(now, task.id);
      
      // Remove from calendar (one-time reminder is done)
      if (this.calendar) {
        this.calendar.removeTemporal('scheduler', task.id);
      }
    } else {
      // Calculate next run
      const nextRun = this.calculateNextRun(task);
      this.db.prepare(
        'UPDATE tasks SET last_run = ?, next_run = ? WHERE id = ?'
      ).run(now, nextRun, task.id);
      
      // Update next run time in calendar
      if (this.calendar) {
        this.calendar.updateTemporal('scheduler', task.id, {
          datetime: new Date(nextRun),
        });
      }
    }
  }

  private calculateNextRun(task: ScheduledTask): string {
    const now = new Date();

    switch (task.scheduleType) {
      case 'interval':
        const intervalMs = parseInt(task.scheduleValue);
        return new Date(now.getTime() + intervalMs).toISOString();

      case 'cron':
        // Simple cron parsing for common patterns
        // For full cron support, add a cron parsing library
        return this.nextCronRun(task.scheduleValue).toISOString();

      default:
        return now.toISOString();
    }
  }

  private nextCronRun(cron: string): Date {
    // Simplified cron: only supports "0 HH * * *" (daily at hour)
    // For real implementation, use a library like 'cron-parser'
    const match = cron.match(/^0\s+(\d+)\s+\*\s+\*\s+\*$/);
    if (match) {
      const hour = parseInt(match[1]);
      const next = new Date();
      next.setHours(hour, 0, 0, 0);
      if (next <= new Date()) {
        next.setDate(next.getDate() + 1);
      }
      return next;
    }

    // Fallback: 24 hours from now
    warn('Unsupported cron format, defaulting to 24h', { cron });
    return new Date(Date.now() + 24 * 60 * 60 * 1000);
  }

  // === CRUD ===

  create(data: Omit<ScheduledTask, 'id' | 'createdAt' | 'enabled'>): ScheduledTask {
    const id = uuidv4();
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO tasks (id, type, schedule_type, schedule_value, action_type, action_payload, next_run, created_by, related_record)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.type,
      data.scheduleType,
      data.scheduleValue,
      data.actionType,
      JSON.stringify(data.actionPayload),
      data.nextRun,
      data.createdBy || 'user',
      data.relatedRecord
    );

    info('Scheduled task created', { id, type: data.type, nextRun: data.nextRun });

    return {
      ...data,
      id,
      enabled: true,
      createdAt: now,
    };
  }

  get(id: string): ScheduledTask | null {
    const row = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as any;
    return row ? this.rowToTask(row) : null;
  }

  list(includeDisabled = false): ScheduledTask[] {
    const sql = includeDisabled
      ? 'SELECT * FROM tasks ORDER BY next_run'
      : 'SELECT * FROM tasks WHERE enabled = 1 ORDER BY next_run';
    const rows = this.db.prepare(sql).all() as any[];
    return rows.map(r => this.rowToTask(r));
  }

  /**
   * Get reminders that were scheduled to fire while Bartleby was offline.
   * These are "missed" reminders that need user attention.
   */
  getMissedReminders(): ScheduledTask[] {
    const now = new Date().toISOString();
    const rows = this.db.prepare(`
      SELECT * FROM tasks
      WHERE enabled = 1 AND next_run <= ? AND type = 'reminder'
      ORDER BY next_run
    `).all(now) as any[];
    return rows.map(r => this.rowToTask(r));
  }

  /**
   * Fire a specific missed reminder now.
   */
  async fireReminder(id: string): Promise<boolean> {
    const task = this.get(id);
    if (!task || !task.enabled) return false;

    try {
      await this.executeTask(task);
      this.updateAfterRun(task);
      return true;
    } catch (err) {
      error('Failed to fire reminder', { id, error: String(err) });
      return false;
    }
  }

  /**
   * Dismiss a missed reminder without firing it.
   */
  dismissReminder(id: string): boolean {
    const task = this.get(id);
    if (!task || !task.enabled) return false;

    // Disable it (like canceling, but it was already overdue)
    this.db.prepare('UPDATE tasks SET enabled = 0 WHERE id = ?').run(id);
    
    // Remove from calendar
    if (this.calendar) {
      this.calendar.removeTemporal('scheduler', id);
    }
    
    info('Dismissed missed reminder', { id });
    return true;
  }

  /**
   * Fire all missed reminders at once.
   */
  async fireAllMissed(): Promise<number> {
    const missed = this.getMissedReminders();
    let fired = 0;
    for (const task of missed) {
      if (await this.fireReminder(task.id)) {
        fired++;
      }
    }
    return fired;
  }

  /**
   * Dismiss all missed reminders without firing.
   */
  dismissAllMissed(): number {
    const missed = this.getMissedReminders();
    let dismissed = 0;
    for (const task of missed) {
      if (this.dismissReminder(task.id)) {
        dismissed++;
      }
    }
    return dismissed;
  }

  cancel(id: string): boolean {
    const result = this.db.prepare('UPDATE tasks SET enabled = 0 WHERE id = ?').run(id);
    if (result.changes > 0) {
      info('Scheduled task cancelled', { id });
      // Remove from calendar temporal index
      if (this.calendar) {
        this.calendar.removeTemporal('scheduler', id);
      }
      return true;
    }
    return false;
  }

  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
    return result.changes > 0;
  }

  // === Helpers ===

  scheduleReminder(message: string, when: Date | string): ScheduledTask {
    const nextRun = typeof when === 'string' ? when : when.toISOString();
    const task = this.create({
      type: 'reminder',
      scheduleType: 'once',
      scheduleValue: nextRun,
      actionType: 'notify',
      actionPayload: message,
      nextRun,
      createdBy: 'user',
    });

    // Register in calendar temporal index
    if (this.calendar) {
      this.calendar.registerTemporal(
        'scheduler',
        task.id,
        new Date(nextRun),
        'reminder',
        message
      );
    }

    return task;
  }

  scheduleDaily(message: string, hour: number): ScheduledTask {
    const nextRun = new Date();
    nextRun.setHours(hour, 0, 0, 0);
    if (nextRun <= new Date()) {
      nextRun.setDate(nextRun.getDate() + 1);
    }

    const task = this.create({
      type: 'recurring',
      scheduleType: 'cron',
      scheduleValue: `0 ${hour} * * *`,
      actionType: 'notify',
      actionPayload: message,
      nextRun: nextRun.toISOString(),
      createdBy: 'user',
    });

    // Register in calendar temporal index (recurring)
    if (this.calendar) {
      this.calendar.registerTemporal(
        'scheduler',
        task.id,
        nextRun,
        'reminder',
        message,
        { recurrence: 'daily' }
      );
    }

    return task;
  }

  private rowToTask(row: any): ScheduledTask {
    return {
      id: row.id,
      type: row.type,
      scheduleType: row.schedule_type,
      scheduleValue: row.schedule_value,
      actionType: row.action_type,
      actionPayload: row.action_payload ? JSON.parse(row.action_payload) : null,
      lastRun: row.last_run,
      nextRun: row.next_run,
      enabled: row.enabled === 1,
      createdAt: row.created_at,
      createdBy: row.created_by,
      relatedRecord: row.related_record,
    };
  }

  close(): void {
    this.stop();
    this.db.close();
  }
}
