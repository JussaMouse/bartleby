#!/usr/bin/env node
// User Profile Export/Import Tool
// Backup and restore user learning data from the unified learning system

import fs from 'fs';
import path from 'path';
import { loadConfig } from '../src/config.js';
import { GardenService } from '../src/services/garden.js';
import { LearningService } from '../src/services/learning.js';
import { info, warn, error as logError } from '../src/utils/logger.js';

interface ExportData {
  metadata: {
    exportDate: string;
    version: string;
    statistics: {
      entities: number;
      observations: number;
      relationships: number;
    };
  };
  entities: any[];
  observations: any[];
  relationships: any[];
}

interface ExportOptions {
  outputFile?: string;
  include?: Array<'user' | 'sessions' | 'commands' | 'relationships'>;
  dateRange?: { start: string; end: string };
}

interface ImportOptions {
  inputFile: string;
  dryRun?: boolean;
  skipExisting?: boolean;
}

async function exportProfile(options: ExportOptions = {}): Promise<string> {
  info('Starting profile export...');

  const config = loadConfig();
  const garden = new GardenService(config);
  await garden.initialize();

  const learning = new LearningService(garden.getDatabase());
  garden.setLearningService(learning);

  const db = learning['db'];

  // Determine what to include (default: everything)
  const include = options.include || ['user', 'sessions', 'commands', 'relationships'];

  // Build entity type filter
  const entityTypes: string[] = [];
  if (include.includes('user')) entityTypes.push('user');
  if (include.includes('sessions')) entityTypes.push('session');
  if (include.includes('commands')) entityTypes.push('command');

  // Export entities
  let entities: any[] = [];
  if (entityTypes.length > 0) {
    const placeholders = entityTypes.map(() => '?').join(',');
    entities = db.prepare(`
      SELECT * FROM entities
      WHERE type IN (${placeholders})
      ${options.dateRange ? 'AND created_at BETWEEN ? AND ?' : ''}
      ORDER BY created_at ASC
    `).all(...entityTypes, ...(options.dateRange ? [options.dateRange.start, options.dateRange.end] : []));
  }

  const entityIds = entities.map((e: any) => e.id);

  // Export observations for these entities
  let observations: any[] = [];
  if (entityIds.length > 0) {
    // Need to batch this for large datasets
    const batchSize = 500;
    for (let i = 0; i < entityIds.length; i += batchSize) {
      const batch = entityIds.slice(i, i + batchSize);
      const placeholders = batch.map(() => '?').join(',');
      const batchObs = db.prepare(`
        SELECT * FROM observations
        WHERE entity_id IN (${placeholders})
        ORDER BY observed_at ASC
      `).all(...batch);
      observations.push(...batchObs);
    }
  }

  // Export relationships (always export relationships for the entities we're exporting)
  let relationships: any[] = [];
  if (entityIds.length > 0) {
    const batchSize = 500;
    for (let i = 0; i < entityIds.length; i += batchSize) {
      const batch = entityIds.slice(i, i + batchSize);
      const placeholders = batch.map(() => '?').join(',');
      const batchRels = db.prepare(`
        SELECT * FROM relationships
        WHERE from_entity IN (${placeholders}) OR to_entity IN (${placeholders})
        ORDER BY observed_at ASC
      `).all(...batch, ...batch);
      relationships.push(...batchRels);
    }
  }

  // Get statistics
  const stats = learning.getStats();

  // Create export data
  const exportData: ExportData = {
    metadata: {
      exportDate: new Date().toISOString(),
      version: '1.0.0',
      statistics: {
        entities: entities.length,
        observations: observations.length,
        relationships: relationships.length
      }
    },
    entities,
    observations,
    relationships
  };

  // Write to file
  const outputFile = options.outputFile || path.join(
    config.paths.database,
    `profile-export-${new Date().toISOString().split('T')[0]}.json`
  );

  fs.writeFileSync(outputFile, JSON.stringify(exportData, null, 2), 'utf-8');

  info('Export complete', {
    file: outputFile,
    entities: entities.length,
    observations: observations.length,
    relationships: relationships.length
  });

  learning.close();
  garden.close();

  return outputFile;
}

async function importProfile(options: ImportOptions): Promise<void> {
  info(`Starting profile import from ${options.inputFile}...`);

  // Validate file exists
  if (!fs.existsSync(options.inputFile)) {
    throw new Error(`Import file not found: ${options.inputFile}`);
  }

  // Read and parse file
  const fileContent = fs.readFileSync(options.inputFile, 'utf-8');
  const importData: ExportData = JSON.parse(fileContent);

  // Validate structure
  if (!importData.metadata || !importData.entities || !importData.observations) {
    throw new Error('Invalid export file format');
  }

  info('Import file validation passed', {
    version: importData.metadata.version,
    exportDate: importData.metadata.exportDate,
    entities: importData.metadata.statistics.entities,
    observations: importData.metadata.statistics.observations,
    relationships: importData.metadata.statistics.relationships
  });

  if (options.dryRun) {
    info('Dry run mode - no changes will be made');
    return;
  }

  // Initialize services
  const config = loadConfig();
  const garden = new GardenService(config);
  await garden.initialize();

  const learning = new LearningService(garden.getDatabase());
  garden.setLearningService(learning);

  const db = learning['db'];

  let entitiesImported = 0;
  let observationsImported = 0;
  let relationshipsImported = 0;
  let skipped = 0;

  // Import entities
  for (const entity of importData.entities) {
    try {
      // Check if entity already exists
      if (options.skipExisting && learning.entityExists(entity.id)) {
        skipped++;
        continue;
      }

      // Insert or replace entity
      db.prepare(`
        INSERT OR REPLACE INTO entities (id, type, created_at, data)
        VALUES (?, ?, ?, ?)
      `).run(entity.id, entity.type, entity.created_at, entity.data);

      entitiesImported++;
    } catch (err) {
      warn('Failed to import entity', { entityId: entity.id, error: String(err) });
    }
  }

  // Import observations
  for (const obs of importData.observations) {
    try {
      // Check if observation already exists
      if (options.skipExisting) {
        const existing = db.prepare('SELECT id FROM observations WHERE id = ?').get(obs.id);
        if (existing) {
          skipped++;
          continue;
        }
      }

      // Insert or replace observation
      db.prepare(`
        INSERT OR REPLACE INTO observations (
          id, entity_id, key, value, value_type,
          source_type, source_id, confidence,
          observed_at, expires_at, supersedes, search_text
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        obs.id,
        obs.entity_id,
        obs.key,
        obs.value,
        obs.value_type,
        obs.source_type,
        obs.source_id,
        obs.confidence,
        obs.observed_at,
        obs.expires_at,
        obs.supersedes,
        obs.search_text
      );

      observationsImported++;
    } catch (err) {
      warn('Failed to import observation', { obsId: obs.id, error: String(err) });
    }
  }

  // Import relationships
  for (const rel of importData.relationships) {
    try {
      // Check if relationship already exists
      if (options.skipExisting) {
        const existing = db.prepare('SELECT id FROM relationships WHERE id = ?').get(rel.id);
        if (existing) {
          skipped++;
          continue;
        }
      }

      // Insert or replace relationship
      db.prepare(`
        INSERT OR REPLACE INTO relationships (
          id, from_entity, to_entity, relation_type,
          strength, context, observed_at, source_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        rel.id,
        rel.from_entity,
        rel.to_entity,
        rel.relation_type,
        rel.strength,
        rel.context,
        rel.observed_at,
        rel.source_id
      );

      relationshipsImported++;
    } catch (err) {
      warn('Failed to import relationship', { relId: rel.id, error: String(err) });
    }
  }

  info('Import complete', {
    entitiesImported,
    observationsImported,
    relationshipsImported,
    skipped
  });

  learning.close();
  garden.close();
}

// CLI interface
const command = process.argv[2];

if (command === 'export') {
  // Parse options
  const outputFileIndex = process.argv.indexOf('--output');
  const outputFile = outputFileIndex !== -1 ? process.argv[outputFileIndex + 1] : undefined;

  const includeIndex = process.argv.indexOf('--include');
  const include = includeIndex !== -1
    ? process.argv[includeIndex + 1].split(',') as Array<'user' | 'sessions' | 'commands' | 'relationships'>
    : undefined;

  await exportProfile({ outputFile, include });

} else if (command === 'import') {
  const inputFile = process.argv[3];
  if (!inputFile) {
    console.error('Usage: npm run profile import <file> [--dry-run] [--skip-existing]');
    process.exit(1);
  }

  const dryRun = process.argv.includes('--dry-run');
  const skipExisting = process.argv.includes('--skip-existing');

  await importProfile({ inputFile, dryRun, skipExisting });

} else {
  console.log(`
User Profile Export/Import Tool

Usage:
  Export: npm run profile export [--output <file>] [--include user,sessions,commands]
  Import: npm run profile import <file> [--dry-run] [--skip-existing]

Examples:
  # Export full profile
  npm run profile export

  # Export only user preferences and sessions
  npm run profile export --include user,sessions

  # Export to specific file
  npm run profile export --output /path/to/backup.json

  # Import from backup (dry run first)
  npm run profile import backup.json --dry-run

  # Import, skipping records that already exist
  npm run profile import backup.json --skip-existing
  `);
}
