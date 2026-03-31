import { randomUUID } from 'crypto';
import type { Database as DB } from 'better-sqlite3';
import type { MobileMessage, MobileThread } from './types.js';

export class MobileChatService {
  private readonly defaultThreadId = 'mobile-primary';
  private db: DB;

  constructor(db: DB) {
    this.db = db;
    this.seedDefaultThread();
  }

  listThreads(): MobileThread[] {
    return this.db.prepare(`
      SELECT id, title, created_at as createdAt, updated_at as updatedAt, unread_count as unreadCount
      FROM mobile_threads
      ORDER BY updated_at DESC
    `).all() as MobileThread[];
  }

  getDefaultThreadId(): string {
    return this.defaultThreadId;
  }

  getMessages(threadId: string): MobileMessage[] {
    return this.db.prepare(`
      SELECT id, thread_id as threadId, role, format, text, created_at as createdAt, status
      FROM mobile_messages
      WHERE thread_id = ?
      ORDER BY created_at ASC
    `).all(threadId) as MobileMessage[];
  }

  appendUserMessage(text: string, threadId = this.defaultThreadId): MobileMessage {
    return this.appendMessage({ threadId, role: 'user', format: 'text', text, status: 'completed' });
  }

  appendAssistantMessage(text: string, threadId = this.defaultThreadId, format: MobileMessage['format'] = 'text'): MobileMessage {
    return this.appendMessage({ threadId, role: 'assistant', format, text, status: 'completed' });
  }

  private appendMessage(input: Omit<MobileMessage, 'id' | 'createdAt'>): MobileMessage {
    const createdAt = new Date().toISOString();
    const message: MobileMessage = {
      id: randomUUID(),
      createdAt,
      ...input,
    };

    this.db.prepare(`
      INSERT INTO mobile_messages (id, thread_id, role, format, text, created_at, status)
      VALUES (@id, @threadId, @role, @format, @text, @createdAt, @status)
    `).run(message);

    this.db.prepare(`
      UPDATE mobile_threads
      SET updated_at = @updatedAt,
          unread_count = unread_count + @unreadDelta
      WHERE id = @threadId
    `).run({
      updatedAt: createdAt,
      unreadDelta: message.role === 'assistant' ? 1 : 0,
      threadId: input.threadId,
    });

    return message;
  }

  private seedDefaultThread(): void {
    const existing = this.db.prepare('SELECT id FROM mobile_threads WHERE id = ?').get(this.defaultThreadId) as { id: string } | undefined;
    if (existing) return;

    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO mobile_threads (id, title, created_at, updated_at, unread_count)
      VALUES (?, ?, ?, ?, 0)
    `).run(this.defaultThreadId, 'Bartleby', now, now);

    this.db.prepare(`
      INSERT INTO mobile_messages (id, thread_id, role, format, text, created_at, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(randomUUID(), this.defaultThreadId, 'assistant', 'text', 'Bartleby mobile is ready for async chat.', now, 'completed');
  }
}
