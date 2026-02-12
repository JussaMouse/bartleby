#!/usr/bin/env node
// Database Optimization Tool
// Cleans up expired data and optimizes database for performance

import { loadConfig } from '../src/config.js';
import { GardenService } from '../src/services/garden.js';
import { LearningService } from '../src/services/learning.js';
import { info } from '../src/utils/logger.js';

async function optimizeDatabase() {
  console.log('\n=== Database Optimization ===\n');

  const config = loadConfig();
  const garden = new GardenService(config);
  await garden.initialize();

  const learning = new LearningService(garden.getDatabase());
  garden.setLearningService(learning);

  // Step 1: Get initial stats
  console.log('Step 1: Analyzing database...');
  const statsBefore = learning.getStats();
  console.log(`  Entities: ${statsBefore.entities.toLocaleString()}`);
  console.log(`  Observations: ${statsBefore.observations.toLocaleString()}`);
  console.log(`  Relationships: ${statsBefore.relationships.toLocaleString()}`);
  console.log(`  Expired observations: ${statsBefore.expiredObservations.toLocaleString()}`);
  console.log(`  Database size: ${statsBefore.databaseSizeMB.toFixed(2)} MB\n`);

  // Step 2: Clean up expired observations
  console.log('Step 2: Cleaning up expired observations...');
  const deletedCount = learning.cleanupExpiredObservations();
  console.log(`  ✓ Deleted ${deletedCount.toLocaleString()} expired observations\n`);

  // Step 3: Optimize database
  console.log('Step 3: Optimizing database (VACUUM + ANALYZE)...');
  const result = learning.optimizeDatabase();
  console.log(`  Before: ${result.before.toFixed(2)} MB`);
  console.log(`  After: ${result.after.toFixed(2)} MB`);
  console.log(`  Reclaimed: ${result.reclaimedMB.toFixed(2)} MB\n`);

  // Step 4: Final stats
  console.log('Step 4: Final statistics...');
  const statsAfter = learning.getStats();
  console.log(`  Entities: ${statsAfter.entities.toLocaleString()}`);
  console.log(`  Observations: ${statsAfter.observations.toLocaleString()}`);
  console.log(`  Relationships: ${statsAfter.relationships.toLocaleString()}`);
  console.log(`  Expired observations: ${statsAfter.expiredObservations.toLocaleString()}`);
  console.log(`  Database size: ${statsAfter.databaseSizeMB.toFixed(2)} MB\n`);

  // Summary
  const obsSaved = statsBefore.observations - statsAfter.observations;
  const spaceSaved = statsBefore.databaseSizeMB - statsAfter.databaseSizeMB;

  console.log('=== Optimization Complete ===\n');
  console.log(`Removed ${obsSaved.toLocaleString()} expired observations`);
  console.log(`Reclaimed ${spaceSaved.toFixed(2)} MB of space`);
  console.log(`Final database size: ${statsAfter.databaseSizeMB.toFixed(2)} MB\n`);

  learning.close();
  garden.close();
}

optimizeDatabase().catch(console.error);
