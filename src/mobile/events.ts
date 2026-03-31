import { randomUUID } from 'crypto';
import type { Database as DB } from 'better-sqlite3';

export type AppEventType =
  | 'capture.received'
  | 'capture.accepted'
  | 'message.created'
  | 'job.queued'
  | 'job.processing'
  | 'job.completed'
  | 'job.failed';

export interface AppEvent<TPayload = Record<string, unknown>> {
  id: string;
  type: AppEventType;
  timestamp: string;
  payload: TPayload;
}

export class AppEventService {
  private db: DB;

  constructor(db: DB) {
    this.db = db;
  }

  emit<TPayload>(type: AppEventType, payload: TPayload): AppEvent<TPayload> {
    const event: AppEvent<TPayload> = {
      id: randomUUID(),
      type,
      timestamp: new Date().toISOString(),
      payload,
    };

    this.db.prepare(`
      INSERT INTO mobile_events (id, type, timestamp, payload_json)
      VALUES (@id, @type, @timestamp, @payloadJson)
    `).run({
      id: event.id,
      type: event.type,
      timestamp: event.timestamp,
      payloadJson: JSON.stringify(event.payload),
    });

    return event;
  }

  list(limit = 50): AppEvent[] {
    const rows = this.db.prepare(`
      SELECT id, type, timestamp, payload_json as payloadJson
      FROM mobile_events
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(limit) as Array<{ id: string; type: AppEventType; timestamp: string; payloadJson: string }>;

    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      timestamp: row.timestamp,
      payload: JSON.parse(row.payloadJson),
    }));
  }
}
