import type { Database as DB } from 'better-sqlite3';

export const CREATE_MOBILE_THREADS_TABLE = `
CREATE TABLE IF NOT EXISTS mobile_threads (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  unread_count INTEGER NOT NULL DEFAULT 0
)
`;

export const CREATE_MOBILE_MESSAGES_TABLE = `
CREATE TABLE IF NOT EXISTS mobile_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES mobile_threads(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  format TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL
)
`;

export const CREATE_MOBILE_JOBS_TABLE = `
CREATE TABLE IF NOT EXISTS mobile_jobs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  thread_id TEXT,
  capture_id TEXT,
  input_json TEXT,
  output_json TEXT,
  error TEXT
)
`;

export const CREATE_MOBILE_EVENTS_TABLE = `
CREATE TABLE IF NOT EXISTS mobile_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  payload_json TEXT NOT NULL
)
`;

export const MOBILE_INDEXES = [
  `CREATE INDEX IF NOT EXISTS idx_mobile_messages_thread_created ON mobile_messages(thread_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_mobile_jobs_updated ON mobile_jobs(updated_at)`,
  `CREATE INDEX IF NOT EXISTS idx_mobile_jobs_kind_status ON mobile_jobs(kind, status)`,
  `CREATE INDEX IF NOT EXISTS idx_mobile_events_timestamp ON mobile_events(timestamp)`,
];

export function initializeMobilePersistence(db: DB): void {
  db.exec(CREATE_MOBILE_THREADS_TABLE);
  db.exec(CREATE_MOBILE_MESSAGES_TABLE);
  db.exec(CREATE_MOBILE_EVENTS_TABLE);

  const jobsExists = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'mobile_jobs'").get() as { name: string } | undefined;
  if (!jobsExists) {
    db.exec(CREATE_MOBILE_JOBS_TABLE);
  } else {
    const columns = db.prepare('PRAGMA table_info(mobile_jobs)').all() as Array<{ name: string }>;
    const names = new Set(columns.map((column) => column.name));
    if (!names.has('kind')) {
      db.exec('ALTER TABLE mobile_jobs RENAME TO mobile_jobs_legacy');
      db.exec(CREATE_MOBILE_JOBS_TABLE);
      db.exec(`
        INSERT INTO mobile_jobs (id, kind, status, created_at, updated_at, thread_id, capture_id, input_json, output_json, error)
        SELECT id,
               CASE WHEN type = 'voice-message' THEN 'voice_transcription' ELSE type END,
               status,
               created_at,
               updated_at,
               thread_id,
               capture_id,
               NULL,
               json_object('transcript', transcript, 'replyText', reply_text),
               error
        FROM mobile_jobs_legacy
      `);
      db.exec('DROP TABLE mobile_jobs_legacy');
    }
  }

  MOBILE_INDEXES.forEach((sql) => db.exec(sql));
}
