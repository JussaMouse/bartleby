#!/usr/bin/env node
// Test: Observation Cleanup Job
// Validates that expired observations are cleaned up and database is optimized

import { GardenService } from './src/services/garden.js';
import { LearningService } from './src/services/learning.js';
import { BackgroundAnalysis } from './src/services/background-analysis.js';
import { loadConfig } from './src/config.js';

console.log('\n=== Test: Observation Cleanup Job ===\n');

// Initialize services
const config = loadConfig();
const garden = new GardenService(config);
await garden.initialize();

// Create learning service using garden's database
const learning = new LearningService(garden.getDatabase());
garden.setLearningService(learning);

const backgroundAnalysis = new BackgroundAnalysis(learning, garden);

console.log('✓ Services initialized\n');

// Get baseline stats
const baselineStats = learning.getStats();
console.log(`Baseline: ${baselineStats.observations} total observations, ${baselineStats.expiredObservations} expired\n`);

// Test 1: Create observations with different TTLs
console.log('Test 1: Creating observations with TTL...');
const testUserId = 'test-user-' + Date.now();
const testRecordId = 'test-record-' + Date.now();
learning.createEntity('user', {}, testUserId);
learning.createEntity('record', { type: 'note' }, testRecordId);

// Observation that expires immediately
learning.recordObservation({
  entityId: testUserId,
  key: 'test.expired',
  value: 'should be deleted',
  sourceType: 'stated',
  confidence: 1.0,
  expiresAt: new Date(Date.now() - 1000).toISOString() // 1 second ago
});

// Observation that expires in 1 hour
learning.recordObservation({
  entityId: testUserId,
  key: 'test.valid',
  value: 'should remain',
  sourceType: 'stated',
  confidence: 1.0,
  expiresAt: new Date(Date.now() + 3600000).toISOString()
});

// Observation with no expiry
learning.recordObservation({
  entityId: testUserId,
  key: 'test.permanent',
  value: 'should remain',
  sourceType: 'stated',
  confidence: 1.0
});

// Observation for test record that expired
learning.recordObservation({
  entityId: testRecordId,
  key: 'test.expired2',
  value: 'should also be deleted',
  sourceType: 'computed',
  confidence: 0.8,
  expiresAt: new Date(Date.now() - 5000).toISOString() // 5 seconds ago
});

console.log('✓ Created 4 observations (2 expired, 2 valid)\n');

// Test 2: Get stats before cleanup
console.log('Test 2: Database stats before cleanup...');
const statsBefore = learning.getStats();
console.log(`  - Entities: ${statsBefore.entities}`);
console.log(`  - Observations: ${statsBefore.observations}`);
console.log(`  - Expired observations: ${statsBefore.expiredObservations}`);
console.log(`  - Database size: ${statsBefore.databaseSizeMB.toFixed(2)} MB\n`);

// Verify we have at least our 2 test expired observations
if (statsBefore.expiredObservations < 2) {
  console.error(`❌ Expected at least 2 expired observations, got ${statsBefore.expiredObservations}`);
  process.exit(1);
}
console.log(`✓ Stats show ${statsBefore.expiredObservations} expired observations (including our 2 test observations)\n`);

const totalExpiredCount = statsBefore.expiredObservations;

// Test 3: Manual cleanup
console.log('Test 3: Running cleanup...');
const deletedCount = learning.cleanupExpiredObservations();
console.log(`  - Deleted ${deletedCount} expired observations\n`);

if (deletedCount !== totalExpiredCount) {
  console.error(`❌ Expected to delete ${totalExpiredCount} observations, deleted ${deletedCount}`);
  process.exit(1);
}
console.log(`✓ Cleanup deleted ${deletedCount} expired observations\n`);

// Test 4: Get stats after cleanup
console.log('Test 4: Database stats after cleanup...');
const statsAfter = learning.getStats();
console.log(`  - Entities: ${statsAfter.entities}`);
console.log(`  - Observations: ${statsAfter.observations}`);
console.log(`  - Expired observations: ${statsAfter.expiredObservations}\n`);

const expectedRemaining = statsBefore.observations - deletedCount;
if (statsAfter.observations !== expectedRemaining) {
  console.error(`❌ Expected ${expectedRemaining} remaining observations (${statsBefore.observations} - ${deletedCount}), got ${statsAfter.observations}`);
  process.exit(1);
}
if (statsAfter.expiredObservations !== 0) {
  console.error(`❌ Expected 0 expired observations after cleanup, got ${statsAfter.expiredObservations}`);
  process.exit(1);
}
console.log('✓ All expired observations cleaned up, valid observations remain\n');

// Test 5: Verify valid observations are intact
console.log('Test 5: Verifying valid observations...');
const validObs = learning.getObservation(testUserId, 'test.valid');
const permanentObs = learning.getObservation(testUserId, 'test.permanent');

if (!validObs || validObs.value !== 'should remain') {
  console.error('❌ Valid TTL observation was incorrectly deleted');
  process.exit(1);
}
if (!permanentObs || permanentObs.value !== 'should remain') {
  console.error('❌ Permanent observation was incorrectly deleted');
  process.exit(1);
}
console.log('✓ Valid observations intact\n');

// Test 6: Database optimization
console.log('Test 6: Testing database optimization...');
const optimizeResult = learning.optimizeDatabase();
console.log(`  - Before: ${optimizeResult.before.toFixed(2)} MB`);
console.log(`  - After: ${optimizeResult.after.toFixed(2)} MB`);
console.log(`  - Reclaimed: ${optimizeResult.reclaimedMB.toFixed(2)} MB\n`);
console.log('✓ Database optimized\n');

// Test 7: Background analysis integration
console.log('Test 7: Testing background analysis integration...');
// Create more data to trigger cleanup in background job
for (let i = 0; i < 5; i++) {
  learning.recordObservation({
    entityId: testUserId,
    key: `test.expired_${i}`,
    value: 'temp',
    sourceType: 'computed',
    confidence: 0.5,
    expiresAt: new Date(Date.now() - 1000).toISOString()
  });
}

// Run background analysis (should include cleanup)
await backgroundAnalysis['cleanupExpiredData'](); // Access private method for test

const statsAfterBg = learning.getStats();
if (statsAfterBg.expiredObservations !== 0) {
  console.error(`❌ Background cleanup failed, ${statsAfterBg.expiredObservations} expired observations remain`);
  process.exit(1);
}
console.log('✓ Background analysis cleanup works\n');

// Cleanup
learning.close();
garden.close();

console.log('=== ✅ All Tests Passed ===\n');
console.log('Summary:');
console.log('  ✓ Expired observations are correctly identified');
console.log('  ✓ Cleanup job removes only expired observations');
console.log('  ✓ Valid observations are preserved');
console.log('  ✓ Database optimization works');
console.log('  ✓ Background analysis integration works');
console.log('\nTask #69 validation complete!\n');
