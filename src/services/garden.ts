// src/services/garden.ts
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import chokidar, { FSWatcher } from 'chokidar';
import { Config, resolvePath, getDbPath, ensureDir } from '../config.js';
import { parseMarkdown, generateMarkdown, sanitizeFilename } from '../utils/markdown.js';
import { info, warn, error, debug } from '../utils/logger.js';

// === Types ===

export type RecordType = 'action' | 'project' | 'context' | 'contact' | 'note' | 'daily' | 'list';
export type RecordStatus = 'active' | 'completed' | 'archived' | 'someday' | 'waiting';

export interface GardenRecord {
  id: string;
  type: RecordType;
  title: string;
  status: RecordStatus;
  context?: string;
  project?: string;
  due_date?: string;
  email?: string;
  phone?: string;
  birthday?: string;
  content?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

export interface TaskFilters {
  status?: RecordStatus | RecordStatus[];
  context?: string;
  project?: string;
  type?: RecordType;
  dueBefore?: string;
  dueAfter?: string;
}

// === Schema ===

const SCHEMA = `
CREATE TABLE IF NOT EXISTS garden_records (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  context TEXT,
  project TEXT,
  due_date TEXT,
  email TEXT,
  phone TEXT,
  birthday TEXT,
  content TEXT,
  tags TEXT,
  metadata TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS garden_links (
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  link_text TEXT,
  PRIMARY KEY (source_id, target_id)
);

CREATE INDEX IF NOT EXISTS idx_garden_type ON garden_records(type);
CREATE INDEX IF NOT EXISTS idx_garden_status ON garden_records(status);
CREATE INDEX IF NOT EXISTS idx_garden_context ON garden_records(context);
CREATE INDEX IF NOT EXISTS idx_garden_project ON garden_records(project);
CREATE INDEX IF NOT EXISTS idx_garden_due ON garden_records(due_date);
`;

// === Service ===

export class GardenService {
  private db: Database.Database;
  private gardenPath: string;
  private watcher?: FSWatcher;
  private syncing = false;

  constructor(private config: Config) {
    const dbPath = getDbPath(config, 'garden.sqlite3');
    ensureDir(path.dirname(dbPath));

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.gardenPath = resolvePath(config, 'garden');
  }

  async initialize(): Promise<void> {
    this.db.exec(SCHEMA);
    ensureDir(this.gardenPath);

    await this.syncFromFiles();
    this.startWatcher();

    info('GardenService initialized', { path: this.gardenPath });
  }

  // === CRUD ===

  create(data: Omit<GardenRecord, 'id' | 'created_at' | 'updated_at'>): GardenRecord {
    const id = uuidv4();
    const now = new Date().toISOString();

    const record: GardenRecord = {
      ...data,
      id,
      status: data.status || 'active',
      created_at: now,
      updated_at: now,
    };

    this.db.prepare(`
      INSERT INTO garden_records 
      (id, type, title, status, context, project, due_date, email, phone, birthday, content, tags, metadata, created_at, updated_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.id, record.type, record.title, record.status,
      record.context, record.project, record.due_date,
      record.email, record.phone, record.birthday,
      record.content, JSON.stringify(record.tags || []),
      JSON.stringify(record.metadata || {}),
      record.created_at, record.updated_at, record.completed_at
    );

    this.syncToFile(record);
    return record;
  }

  get(id: string): GardenRecord | null {
    const row = this.db.prepare('SELECT * FROM garden_records WHERE id = ?').get(id) as any;
    return row ? this.rowToRecord(row) : null;
  }

  getByTitle(title: string): GardenRecord | null {
    const row = this.db.prepare('SELECT * FROM garden_records WHERE title = ? COLLATE NOCASE').get(title) as any;
    return row ? this.rowToRecord(row) : null;
  }

  update(id: string, updates: Partial<GardenRecord>): GardenRecord | null {
    const existing = this.get(id);
    if (!existing) return null;

    const updated: GardenRecord = {
      ...existing,
      ...updates,
      id: existing.id,
      updated_at: new Date().toISOString(),
    };

    if (updates.status === 'completed' && existing.status !== 'completed') {
      updated.completed_at = updated.updated_at;
    }

    this.db.prepare(`
      UPDATE garden_records SET
        type=?, title=?, status=?, context=?, project=?, due_date=?,
        email=?, phone=?, birthday=?, content=?, tags=?, metadata=?,
        updated_at=?, completed_at=?
      WHERE id=?
    `).run(
      updated.type, updated.title, updated.status,
      updated.context, updated.project, updated.due_date,
      updated.email, updated.phone, updated.birthday,
      updated.content, JSON.stringify(updated.tags || []),
      JSON.stringify(updated.metadata || {}),
      updated.updated_at, updated.completed_at, id
    );

    this.syncToFile(updated);
    return updated;
  }

  delete(id: string): boolean {
    const record = this.get(id);
    if (!record) return false;

    this.db.prepare('DELETE FROM garden_records WHERE id = ?').run(id);

    const filepath = this.getFilePath(record);
    if (fs.existsSync(filepath)) {
      this.syncing = true;
      fs.unlinkSync(filepath);
      this.syncing = false;
    }

    return true;
  }

  // === Queries ===

  getTasks(filters: TaskFilters = {}): GardenRecord[] {
    let sql = 'SELECT * FROM garden_records WHERE type = ?';
    const params: unknown[] = ['action'];

    if (filters.status) {
      const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
      sql += ` AND status IN (${statuses.map(() => '?').join(', ')})`;
      params.push(...statuses);
    }

    if (filters.context) {
      sql += ' AND context = ?';
      params.push(filters.context);
    }

    if (filters.project) {
      sql += ' AND project = ?';
      params.push(filters.project);
    }

    if (filters.dueBefore) {
      sql += ' AND due_date <= ?';
      params.push(filters.dueBefore);
    }

    if (filters.dueAfter) {
      sql += ' AND due_date >= ?';
      params.push(filters.dueAfter);
    }

    sql += ' ORDER BY context, project, title';

    const rows = this.db.prepare(sql).all(...params) as any[];
    return rows.map(r => this.rowToRecord(r));
  }

  getByType(type: RecordType): GardenRecord[] {
    const rows = this.db.prepare('SELECT * FROM garden_records WHERE type = ? ORDER BY title').all(type) as any[];
    return rows.map(r => this.rowToRecord(r));
  }

  search(query: string, limit = 50): GardenRecord[] {
    const pattern = `%${query}%`;
    const rows = this.db.prepare(`
      SELECT * FROM garden_records 
      WHERE title LIKE ? OR content LIKE ?
      ORDER BY updated_at DESC
      LIMIT ?
    `).all(pattern, pattern, limit) as any[];
    return rows.map(r => this.rowToRecord(r));
  }

  // === Task Helpers ===

  addTask(title: string, context = '@inbox', project?: string, dueDate?: string): GardenRecord {
    return this.create({
      type: 'action',
      title,
      status: 'active',
      context,
      project,
      due_date: dueDate,
    });
  }

  completeTask(identifier: string | number): GardenRecord | null {
    let record: GardenRecord | null = null;

    if (typeof identifier === 'number') {
      const tasks = this.getTasks({ status: 'active' });
      if (identifier > 0 && identifier <= tasks.length) {
        record = tasks[identifier - 1];
      }
    } else {
      record = this.get(identifier) || this.getByTitle(identifier);
    }

    if (!record) return null;
    return this.update(record.id, { status: 'completed' });
  }

  captureToInbox(text: string): GardenRecord {
    return this.addTask(text, '@inbox');
  }

  // === Stats for Proactive ===

  getStaleInboxItems(days: number): GardenRecord[] {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString();

    const rows = this.db.prepare(`
      SELECT * FROM garden_records 
      WHERE type = 'action' AND context = '@inbox' AND created_at < ?
      ORDER BY created_at
    `).all(cutoffStr) as any[];
    return rows.map(r => this.rowToRecord(r));
  }

  getOverdueTasks(): GardenRecord[] {
    const today = new Date().toISOString().split('T')[0];
    const rows = this.db.prepare(`
      SELECT * FROM garden_records 
      WHERE type = 'action' AND status = 'active' 
      AND due_date IS NOT NULL AND due_date < ?
    `).all(today) as any[];
    return rows.map(r => this.rowToRecord(r));
  }

  getTaskStats(days: number): { added: number; completed: number } {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString();

    const added = this.db.prepare(`
      SELECT COUNT(*) as count FROM garden_records 
      WHERE type = 'action' AND created_at >= ?
    `).get(cutoffStr) as { count: number };

    const completed = this.db.prepare(`
      SELECT COUNT(*) as count FROM garden_records 
      WHERE type = 'action' AND status = 'completed' AND completed_at >= ?
    `).get(cutoffStr) as { count: number };

    return { added: added.count, completed: completed.count };
  }

  // === Contact Helpers ===

  addContact(name: string, data: Partial<GardenRecord> = {}): GardenRecord {
    return this.create({
      type: 'contact',
      title: name,
      status: 'active',
      email: data.email,
      phone: data.phone,
      birthday: data.birthday,
      content: data.content,
      tags: data.tags,
    });
  }

  searchContacts(query: string): GardenRecord[] {
    const pattern = `%${query}%`;
    const rows = this.db.prepare(`
      SELECT * FROM garden_records 
      WHERE type = 'contact' AND (title LIKE ? OR email LIKE ?)
      ORDER BY title
    `).all(pattern, pattern) as any[];
    return rows.map(r => this.rowToRecord(r));
  }

  // === File Sync ===

  private getFilePath(record: GardenRecord): string {
    const filename = `${sanitizeFilename(record.title)}.md`;
    return path.join(this.gardenPath, filename);
  }

  private syncToFile(record: GardenRecord): void {
    if (this.syncing) return;

    const filepath = this.getFilePath(record);

    const frontmatter: Record<string, unknown> = {
      id: record.id,
      type: record.type,
      status: record.status,
    };

    if (record.context) frontmatter.context = record.context;
    if (record.project) frontmatter.project = record.project;
    if (record.due_date) frontmatter.due = record.due_date;
    if (record.email) frontmatter.email = record.email;
    if (record.phone) frontmatter.phone = record.phone;
    if (record.birthday) frontmatter.birthday = record.birthday;
    if (record.tags?.length) frontmatter.tags = record.tags;

    const body = `# ${record.title}\n\n${record.content || ''}`;
    const markdown = generateMarkdown(frontmatter, body);

    this.syncing = true;
    fs.writeFileSync(filepath, markdown);
    this.syncing = false;

    debug('Synced to file', { filepath });
  }

  private syncFromFile(filepath: string): void {
    if (this.syncing || !filepath.endsWith('.md')) return;

    try {
      const content = fs.readFileSync(filepath, 'utf-8');
      const { frontmatter, content: body } = parseMarkdown(content);

      const titleMatch = body.match(/^#\s+(.+)$/m);
      const title = titleMatch ? titleMatch[1].trim() : path.basename(filepath, '.md');

      // Check if this file has an ID (was created by us)
      const existingId = frontmatter.id as string | undefined;
      const existing = existingId ? this.get(existingId) : this.getByTitle(title);

      const recordData = {
        type: (frontmatter.type as RecordType) || 'note',
        title,
        status: (frontmatter.status as RecordStatus) || 'active',
        context: frontmatter.context as string | undefined,
        project: frontmatter.project as string | undefined,
        due_date: frontmatter.due as string | undefined,
        email: frontmatter.email as string | undefined,
        phone: frontmatter.phone as string | undefined,
        birthday: frontmatter.birthday as string | undefined,
        content: body.replace(/^#\s+.+\n+/, '').trim(),
        tags: frontmatter.tags as string[] | undefined,
      };

      this.syncing = true;

      if (existing) {
        this.update(existing.id, recordData);
      } else {
        this.create(recordData);
      }

      this.syncing = false;
    } catch (err) {
      error('Failed to sync from file', { filepath, error: String(err) });
      this.syncing = false;
    }
  }

  private async syncFromFiles(): Promise<void> {
    if (!fs.existsSync(this.gardenPath)) return;

    const files = fs.readdirSync(this.gardenPath).filter(f => f.endsWith('.md'));

    for (const file of files) {
      this.syncFromFile(path.join(this.gardenPath, file));
    }

    info('Initial file sync complete', { files: files.length });
  }

  private startWatcher(): void {
    this.watcher = chokidar.watch(this.gardenPath, {
      ignored: /(^|[\/\\])\../,
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 300 },
    });

    this.watcher.on('change', filepath => {
      if (!this.syncing) this.syncFromFile(filepath);
    });

    this.watcher.on('add', filepath => {
      if (!this.syncing) this.syncFromFile(filepath);
    });
  }

  // === Helpers ===

  private rowToRecord(row: any): GardenRecord {
    return {
      id: row.id,
      type: row.type,
      title: row.title,
      status: row.status,
      context: row.context || undefined,
      project: row.project || undefined,
      due_date: row.due_date || undefined,
      email: row.email || undefined,
      phone: row.phone || undefined,
      birthday: row.birthday || undefined,
      content: row.content || undefined,
      tags: row.tags ? JSON.parse(row.tags) : [],
      metadata: row.metadata ? JSON.parse(row.metadata) : {},
      created_at: row.created_at,
      updated_at: row.updated_at,
      completed_at: row.completed_at || undefined,
    };
  }

  close(): void {
    this.watcher?.close();
    this.db.close();
  }
}
