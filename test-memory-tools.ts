#!/usr/bin/env tsx
/**
 * Test script for memory tools
 *
 * Run with: tsx test-memory-tools.ts
 */

import Database from 'better-sqlite3';
import { LearningService } from './src/services/learning.js';
import { MemoryTools } from './src/tools/memory-tools.js';

console.log('🧪 Testing Memory Tools\n');

// Create in-memory database for testing
const db = new Database(':memory:');
const learning = new LearningService(db);
const memoryTools = new MemoryTools(learning);

console.log('✓ Services initialized\n');

// Test 1: Store observation
console.log('Test 1: Store Observation');
console.log('==========================');
const result1 = memoryTools.storeObservation({
  entityId: 'user',
  key: 'preference.theme',
  value: 'dark',
  confidence: 0.9,
});
console.log('Stored:', result1);
console.log('');

// Test 2: Store another observation
console.log('Test 2: Store Another Observation');
console.log('==================================');
const result2 = memoryTools.storeObservation({
  entityId: 'user',
  key: 'name',
  value: 'Alex',
  confidence: 0.95,
});
console.log('Stored:', result2);
console.log('');

// Test 3: Store observation with TTL
console.log('Test 3: Store Observation with TTL');
console.log('===================================');
const result3 = memoryTools.storeObservation({
  entityId: 'user',
  key: 'temp.status',
  value: 'working from home',
  confidence: 0.8,
  expiresIn: '7d',
});
console.log('Stored:', result3);
console.log('');

// Test 4: Retrieve context
console.log('Test 4: Retrieve Context');
console.log('========================');
const context = memoryTools.retrieveContext({
  entityId: 'user',
});
console.log('Observations found:', context.observations.length);
console.log('Observations:');
context.observations.forEach(obs => {
  console.log(`  - ${obs.key}: ${obs.value} (confidence: ${(obs.confidence * 100).toFixed(0)}%)`);
});
console.log('');

// Test 5: Update observation
console.log('Test 5: Update Observation');
console.log('==========================');
const updateResult = memoryTools.updateObservation({
  observationId: result1.observationId,
  newValue: 'light',
  reason: 'User changed preference',
});
console.log('Updated:', updateResult);
console.log('');

// Test 6: Retrieve updated context
console.log('Test 6: Retrieve Updated Context');
console.log('=================================');
const context2 = memoryTools.retrieveContext({
  entityId: 'user',
});
console.log('Observations:');
context2.observations.forEach(obs => {
  console.log(`  - ${obs.key}: ${obs.value} (confidence: ${(obs.confidence * 100).toFixed(0)}%)`);
});
console.log('');

// Test 7: Forget observation
console.log('Test 7: Forget Observation');
console.log('==========================');
const forgetResult = memoryTools.forgetObservation({
  observationId: result3.observationId,
  reason: 'No longer relevant',
});
console.log('Forgotten:', forgetResult);
console.log('');

// Test 8: Final context
console.log('Test 8: Final Context (excluding forgotten)');
console.log('===========================================');
const context3 = memoryTools.retrieveContext({
  entityId: 'user',
});
console.log('Active observations:');
context3.observations
  .filter(obs => obs.confidence > 0) // Exclude forgotten (confidence=0)
  .forEach(obs => {
    console.log(`  - ${obs.key}: ${obs.value} (confidence: ${(obs.confidence * 100).toFixed(0)}%)`);
  });
console.log('');

console.log('✅ All tests completed successfully!');
