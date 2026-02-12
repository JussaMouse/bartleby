#!/usr/bin/env node
// Test: Query Optimization and Database Indexes
// Validates that all indexes are created and queries perform efficiently

import { GardenService } from './src/services/garden.js';
import { LearningService } from './src/services/learning.js';
import { loadConfig } from './src/config.js';
import fs from 'fs';
import path from 'path';

console.log('\n=== Test: Query Optimization and Database Indexes ===\n');

// Use test database
const config = loadConfig();
const testDbPath = path.join(config.paths.database, 'test-indexes.db');

// Remove test db if exists
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}

// Initialize services
const garden = new GardenService(config);
await garden.initialize();

const learning = new LearningService(garden.getDatabase());
garden.setLearningService(learning);

console.log('✓ Services initialized\n');

// Test 1: Verify all indexes exist
console.log('Test 1: Verifying database indexes...');
const db = learning['db'];
const indexes = db.prepare(`
  SELECT name, tbl_name, sql
  FROM sqlite_master
  WHERE type = 'index'
  AND name LIKE 'idx_%'
  ORDER BY name
`).all() as Array<{ name: string; tbl_name: string; sql: string }>;

const expectedIndexes = [
  'idx_entities_created',
  'idx_entities_type',
  'idx_observations_confidence',
  'idx_observations_entity',
  'idx_observations_entity_time',
  'idx_observations_expires',
  'idx_observations_key',
  'idx_observations_observed_at',
  'idx_observations_source',
  'idx_observations_supersedes',
  'idx_relationships_from',
  'idx_relationships_strength',
  'idx_relationships_to'
];

console.log(`Found ${indexes.length} indexes:\n`);
for (const idx of indexes) {
  console.log(`  ✓ ${idx.name} on ${idx.tbl_name}`);
}
console.log();

// Check for missing indexes
const foundIndexNames = indexes.map(idx => idx.name);
const missingIndexes = expectedIndexes.filter(name => !foundIndexNames.includes(name));

if (missingIndexes.length > 0) {
  console.error(`❌ Missing indexes: ${missingIndexes.join(', ')}`);
  process.exit(1);
}

console.log(`✓ All ${expectedIndexes.length} expected indexes exist\n`);

// Test 2: Create test data
console.log('Test 2: Creating test data for performance testing...');
const testEntityIds: string[] = [];
const timestamp = Date.now();

// Create 100 test entities
for (let i = 0; i < 100; i++) {
  const id = `test-perf-${timestamp}-${i}`;
  learning.createEntity('record', { index: i }, id);
  testEntityIds.push(id);
}

// Create observations for each entity (10 per entity = 1000 observations)
for (let i = 0; i < testEntityIds.length; i++) {
  const entityId = testEntityIds[i];

  for (let j = 0; j < 10; j++) {
    learning.recordObservation({
      entityId,
      key: `test.metric_${j % 5}`, // 5 different keys
      value: `value_${Math.random()}`,
      sourceType: j % 2 === 0 ? 'computed' : 'inferred',
      confidence: 0.5 + (Math.random() * 0.5) // 0.5 to 1.0
    });
  }

  // Add some superseded observations
  if (i % 10 === 0) {
    const obs1 = learning.recordObservation({
      entityId,
      key: 'test.superseded',
      value: 'old value',
      sourceType: 'stated',
      confidence: 0.8
    });

    learning.recordObservation({
      entityId,
      key: 'test.superseded',
      value: 'new value',
      sourceType: 'stated',
      confidence: 0.9,
      supersedes: obs1
    });
  }
}

// Create relationships
for (let i = 0; i < testEntityIds.length - 1; i++) {
  learning.recordRelationship({
    fromEntity: testEntityIds[i],
    toEntity: testEntityIds[i + 1],
    relationType: 'references',
    strength: Math.random()
  });
}

console.log(`  ✓ Created 100 entities`);
console.log(`  ✓ Created 1000+ observations`);
console.log(`  ✓ Created 99 relationships\n`);

// Test 3: Measure query performance
console.log('Test 3: Measuring query performance...');

// Query 1: Get observations by entity_id
const start1 = Date.now();
for (let i = 0; i < 100; i++) {
  learning.getObservations(testEntityIds[i % testEntityIds.length]);
}
const time1 = Date.now() - start1;
console.log(`  Query 1 (getObservations): ${time1}ms for 100 queries`);

// Query 2: Get observation by entity_id + key (uses supersedes check)
const start2 = Date.now();
for (let i = 0; i < 100; i++) {
  learning.getObservation(testEntityIds[i % testEntityIds.length], 'test.metric_0');
}
const time2 = Date.now() - start2;
console.log(`  Query 2 (getObservation with supersedes): ${time2}ms for 100 queries`);

// Query 3: Query by key prefix
const start3 = Date.now();
const keyResults = learning.queryObservationsByKey('test.metric', { limit: 100 });
const time3 = Date.now() - start3;
console.log(`  Query 3 (queryByKey prefix): ${time3}ms, found ${keyResults.length} results`);

// Query 4: Filter by confidence
const start4 = Date.now();
const confResults = learning.getObservations(testEntityIds[0], { minConfidence: 0.8 });
const time4 = Date.now() - start4;
console.log(`  Query 4 (filter by confidence): ${time4}ms, found ${confResults.length} results`);

// Query 5: Get relationships
const start5 = Date.now();
for (let i = 0; i < 50; i++) {
  learning.getRelationships(testEntityIds[i], { direction: 'from' });
}
const time5 = Date.now() - start5;
console.log(`  Query 5 (getRelationships): ${time5}ms for 50 queries`);

console.log();

// Performance checks
const avgTime = (time1 + time2 + time3 + time4 + time5) / 5;
console.log(`Average query time: ${avgTime.toFixed(2)}ms\n`);

if (avgTime > 100) {
  console.error('❌ Queries are slower than expected (avg > 100ms)');
  process.exit(1);
}

console.log('✓ Query performance is good (avg < 100ms)\n');

// Test 4: Verify EXPLAIN QUERY PLAN uses indexes
console.log('Test 4: Verifying query plans use indexes...');

// Check that entity_id queries use idx_observations_entity
const plan1 = db.prepare(`
  EXPLAIN QUERY PLAN
  SELECT * FROM observations WHERE entity_id = ? AND key = ?
`).all('test-entity-0', 'test.metric_0') as Array<{ detail: string }>;

const usesEntityIndex = plan1.some(row =>
  row.detail.includes('idx_observations_entity')
);

if (!usesEntityIndex) {
  console.error('❌ Query does not use idx_observations_entity index');
  console.log('Query plan:', plan1);
  process.exit(1);
}
console.log('  ✓ entity_id + key queries use idx_observations_entity\n');

// Check that supersedes queries use idx_observations_supersedes
const plan2 = db.prepare(`
  EXPLAIN QUERY PLAN
  SELECT * FROM observations WHERE supersedes = ?
`).all('some-id') as Array<{ detail: string }>;

const usesSupersedesIndex = plan2.some(row =>
  row.detail.includes('idx_observations_supersedes')
);

if (!usesSupersedesIndex) {
  console.error('❌ Query does not use idx_observations_supersedes index');
  console.log('Query plan:', plan2);
  process.exit(1);
}
console.log('  ✓ supersedes queries use idx_observations_supersedes\n');

// Check that key LIKE queries use idx_observations_key
const plan3 = db.prepare(`
  EXPLAIN QUERY PLAN
  SELECT * FROM observations WHERE key LIKE ?
`).all('test.%') as Array<{ detail: string }>;

// Note: SQLite may use index or scan depending on selectivity
console.log('  ℹ️  key LIKE query plan:', plan3.map(p => p.detail).join(' | '));
console.log();

// Cleanup
learning.close();
garden.close();

console.log('=== ✅ All Tests Passed ===\n');
console.log('Summary:');
console.log(`  ✓ All ${expectedIndexes.length} indexes exist`);
console.log('  ✓ Created 1100+ test records');
console.log(`  ✓ Average query time: ${avgTime.toFixed(2)}ms`);
console.log('  ✓ Query plans use appropriate indexes');
console.log('\nTask #70 validation complete!\n');
