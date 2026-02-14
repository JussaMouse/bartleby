// src/services/shed-bootstrap.ts
import path from 'path';
import fs from 'fs';
import { ShedService } from './shed.js';
import { info, debug } from '../utils/logger.js';

/**
 * Bootstrap documentation files for self-documentation
 *
 * Ingests Bartleby's own documentation into the Shed on first run,
 * enabling natural language help queries.
 */
export async function bootstrapDocs(shed: ShedService): Promise<void> {
  // Check if bootstrap marker exists
  const db = shed['db']; // Access private db
  const marker = db.prepare('SELECT * FROM sources WHERE filename = ?').get('__bootstrap_marker__');

  if (marker) {
    debug('Documentation already bootstrapped, skipping');
    return;
  }

  info('Bootstrapping Bartleby documentation...');

  // List of docs to ingest (relative to project root)
  const docsToIngest = [
    'README.md',
    'TECH_SPEC.md',
    'COMMANDS.md',
    'docs/optimization-guide.md',
  ];

  let ingestedCount = 0;
  let skippedCount = 0;

  for (const docPath of docsToIngest) {
    const fullPath = path.join(process.cwd(), docPath);

    if (!fs.existsSync(fullPath)) {
      debug('Documentation file not found, skipping', { path: docPath });
      skippedCount++;
      continue;
    }

    try {
      await shed.ingestDocument(fullPath);
      info('Ingested documentation', { file: docPath });
      ingestedCount++;
    } catch (err) {
      debug('Failed to ingest documentation', {
        file: docPath,
        error: String(err)
      });
      skippedCount++;
    }
  }

  // Create bootstrap marker
  db.prepare(`
    INSERT INTO sources (id, filename, filepath, title, ingested_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `).run('__bootstrap_marker__', '__bootstrap_marker__', '', 'Bootstrap Marker');

  info('Documentation bootstrap complete', {
    ingested: ingestedCount,
    skipped: skippedCount
  });
}
