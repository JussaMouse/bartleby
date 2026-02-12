#!/usr/bin/env node
// Memory Usage Monitor
// Reports database and system memory statistics for the learning system

import { loadConfig } from '../src/config.js';
import { GardenService } from '../src/services/garden.js';
import { LearningService } from '../src/services/learning.js';
import { info } from '../src/utils/logger.js';
import fs from 'fs';
import path from 'path';

async function monitorMemory() {
  console.log('\n=== Learning System Memory Monitor ===\n');

  const config = loadConfig();
  const garden = new GardenService(config);
  await garden.initialize();

  const learning = new LearningService(garden.getDatabase());
  garden.setLearningService(learning);

  // Get learning system statistics
  const stats = learning.getStats();

  console.log('Database Statistics:');
  console.log(`  Entities: ${stats.entities.toLocaleString()}`);
  console.log(`  Observations: ${stats.observations.toLocaleString()}`);
  console.log(`  Relationships: ${stats.relationships.toLocaleString()}`);
  console.log(`  Expired observations: ${stats.expiredObservations.toLocaleString()}`);
  console.log(`  Database size: ${stats.databaseSizeMB.toFixed(2)} MB\n`);

  // Calculate memory per entity
  const avgBytesPerEntity = (stats.databaseSizeMB * 1024 * 1024) / stats.entities;
  const avgBytesPerObs = (stats.databaseSizeMB * 1024 * 1024) / stats.observations;

  console.log('Memory Efficiency:');
  console.log(`  Bytes per entity: ${avgBytesPerEntity.toFixed(0)}`);
  console.log(`  Bytes per observation: ${avgBytesPerObs.toFixed(0)}\n`);

  // Check for optimization opportunities
  const expirationRate = stats.observations > 0 ? (stats.expiredObservations / stats.observations * 100) : 0;

  console.log('Health Check:');
  if (stats.expiredObservations > 100) {
    console.log(`  ⚠️  ${stats.expiredObservations} expired observations - recommend running cleanup`);
    console.log('     Run: pnpm profile cleanup\n');
  } else {
    console.log(`  ✓ Expired observations: ${stats.expiredObservations} (${expirationRate.toFixed(1)}%)\n`);
  }

  if (stats.databaseSizeMB > 100) {
    console.log(`  ⚠️  Database size ${stats.databaseSizeMB.toFixed(2)} MB - recommend optimization`);
    console.log('     Run: pnpm profile optimize\n');
  } else {
    console.log(`  ✓ Database size healthy: ${stats.databaseSizeMB.toFixed(2)} MB\n`);
  }

  // Get system memory usage
  const memUsage = process.memoryUsage();
  console.log('Process Memory Usage:');
  console.log(`  RSS: ${(memUsage.rss / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  Heap used: ${(memUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  Heap total: ${(memUsage.heapTotal / 1024 / 1024).toFixed(2)} MB\n`);

  // Get file sizes for other databases
  const dbPath = config.paths.database;
  const files = ['bartleby.db', 'shed.db', 'calendar.db', 'context.db'];

  console.log('Other Database Files:');
  let totalSize = stats.databaseSizeMB;

  for (const file of files) {
    const filePath = path.join(dbPath, file);
    if (fs.existsSync(filePath)) {
      const statFile = fs.statSync(filePath);
      const sizeMB = statFile.size / (1024 * 1024);
      totalSize += sizeMB;
      console.log(`  ${file}: ${sizeMB.toFixed(2)} MB`);
    }
  }

  console.log(`\nTotal database storage: ${totalSize.toFixed(2)} MB\n`);

  learning.close();
  garden.close();
}

monitorMemory().catch(console.error);
