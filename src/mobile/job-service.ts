import { randomUUID } from 'crypto';
import type { Database as DB } from 'better-sqlite3';

export type AppJobKind = 'voice_transcription' | 'voice_reply';
export type AppJobStatus = 'queued' | 'processing' | 'completed' | 'failed';

export interface AppJobRecord {
  id: string;
  kind: AppJobKind;
  status: AppJobStatus;
  createdAt: string;
  updatedAt: string;
  threadId: string | null;
  captureId: string | null;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  error: string | null;
}

export class AppJobService {
  constructor(private db: DB) {}

  createJob(input: {
    kind: AppJobKind;
    threadId?: string | null;
    captureId?: string | null;
    input?: Record<string, unknown> | null;
  }): AppJobRecord {
    const now = new Date().toISOString();
    const job: AppJobRecord = {
      id: randomUUID(),
      kind: input.kind,
      status: 'queued',
      createdAt: now,
      updatedAt: now,
      threadId: input.threadId ?? null,
      captureId: input.captureId ?? null,
      input: input.input ?? null,
      output: null,
      error: null,
    };

    this.db.prepare(`
      INSERT INTO mobile_jobs (id, kind, status, created_at, updated_at, thread_id, capture_id, input_json, output_json, error)
      VALUES (@id, @kind, @status, @createdAt, @updatedAt, @threadId, @captureId, @inputJson, @outputJson, @error)
    `).run({
      id: job.id,
      kind: job.kind,
      status: job.status,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      threadId: job.threadId,
      captureId: job.captureId,
      inputJson: job.input ? JSON.stringify(job.input) : null,
      outputJson: null,
      error: null,
    });

    return job;
  }

  updateJob(id: string, patch: {
    status?: AppJobStatus;
    output?: Record<string, unknown> | null;
    error?: string | null;
  }): AppJobRecord | null {
    const existing = this.getJob(id);
    if (!existing) return null;

    const updated: AppJobRecord = {
      ...existing,
      status: patch.status ?? existing.status,
      output: patch.output === undefined ? existing.output : patch.output,
      error: patch.error === undefined ? existing.error : patch.error,
      updatedAt: new Date().toISOString(),
    };

    this.db.prepare(`
      UPDATE mobile_jobs
      SET status = @status,
          updated_at = @updatedAt,
          output_json = @outputJson,
          error = @error
      WHERE id = @id
    `).run({
      id: updated.id,
      status: updated.status,
      updatedAt: updated.updatedAt,
      outputJson: updated.output ? JSON.stringify(updated.output) : null,
      error: updated.error,
    });

    return updated;
  }

  getJob(id: string): AppJobRecord | null {
    const row = this.db.prepare(`
      SELECT id, kind, status, created_at as createdAt, updated_at as updatedAt,
             thread_id as threadId, capture_id as captureId,
             input_json as inputJson, output_json as outputJson, error
      FROM mobile_jobs
      WHERE id = ?
    `).get(id) as {
      id: string;
      kind: AppJobKind;
      status: AppJobStatus;
      createdAt: string;
      updatedAt: string;
      threadId: string | null;
      captureId: string | null;
      inputJson: string | null;
      outputJson: string | null;
      error: string | null;
    } | undefined;

    if (!row) return null;

    return {
      id: row.id,
      kind: row.kind,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      threadId: row.threadId,
      captureId: row.captureId,
      input: row.inputJson ? JSON.parse(row.inputJson) : null,
      output: row.outputJson ? JSON.parse(row.outputJson) : null,
      error: row.error,
    };
  }

  listJobs(filters: { kind?: AppJobKind; status?: AppJobStatus; limit?: number } = {}): AppJobRecord[] {
    const clauses: string[] = [];
    const values: unknown[] = [];

    if (filters.kind) {
      clauses.push('kind = ?');
      values.push(filters.kind);
    }
    if (filters.status) {
      clauses.push('status = ?');
      values.push(filters.status);
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const limit = filters.limit ?? 50;

    const rows = this.db.prepare(`
      SELECT id, kind, status, created_at as createdAt, updated_at as updatedAt,
             thread_id as threadId, capture_id as captureId,
             input_json as inputJson, output_json as outputJson, error
      FROM mobile_jobs
      ${where}
      ORDER BY updated_at DESC
      LIMIT ?
    `).all(...values, limit) as Array<{
      id: string;
      kind: AppJobKind;
      status: AppJobStatus;
      createdAt: string;
      updatedAt: string;
      threadId: string | null;
      captureId: string | null;
      inputJson: string | null;
      outputJson: string | null;
      error: string | null;
    }>;

    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      threadId: row.threadId,
      captureId: row.captureId,
      input: row.inputJson ? JSON.parse(row.inputJson) : null,
      output: row.outputJson ? JSON.parse(row.outputJson) : null,
      error: row.error,
    }));
  }
}
