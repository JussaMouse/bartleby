#!/usr/bin/env node
/**
 * Test script for Phase 2: Graph Structure
 *
 * Tests:
 * - getRelated() with different depths
 * - getParents/getChildren/getReferences/getMentions()
 * - getBacklinks()
 * - Multi-hop queries
 * - Type filtering
 * - Direction filtering
 * - Cache behavior
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Database from 'better-sqlite3';
import { GardenService } from '../dist/services/garden.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_DB = join(__dirname, 'test-graph.sqlite3');

// Test utilities
let testCount = 0;
let passCount = 0;

function test(name, fn) {
  testCount++;
  try {
    fn();
    passCount++;
    console.log(`✓ Test ${testCount}: ${name}`);
  } catch (err) {
    console.error(`✗ Test ${testCount}: ${name}`);
    console.error(`  Error: ${err.message}`);
    if (err.stack) {
      console.error(`  ${err.stack.split('\n').slice(1, 3).join('\n  ')}`);
    }
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

function assertArrayLength(arr, expected, message) {
  if (arr.length !== expected) {
    throw new Error(message || `Expected array length ${expected}, got ${arr.length}`);
  }
}

function assertContains(arr, predicate, message) {
  if (!arr.some(predicate)) {
    throw new Error(message || 'Array does not contain expected element');
  }
}

// Setup test environment
console.log('Setting up test environment...\n');

// Remove existing test DB
try {
  const fs = await import('fs');
  if (fs.existsSync(TEST_DB)) {
    fs.unlinkSync(TEST_DB);
  }
} catch (err) {
  // Ignore
}

// Create test config with minimal required structure
const config = {
  paths: {
    garden: join(__dirname, 'test-garden'),
    shed: join(__dirname, 'test-shed'),
    database: dirname(TEST_DB),
    logs: join(__dirname, 'test-logs'),
    data: join(__dirname, 'test-data'),
  },
  // Add other required config fields with dummy values
  llm: {
    router: { model: 'test', url: 'http://localhost:8080', maxTokens: 1000 },
    fast: { model: 'test', url: 'http://localhost:8080', maxTokens: 2000 },
    thinking: { model: 'test', url: 'http://localhost:8080', maxTokens: 4000 },
    healthTimeout: 5000,
    agentMaxIterations: 10,
  },
  embeddings: { url: 'http://localhost:8081', model: 'test', dimensions: 768 },
  ocr: { enabled: false, maxTokens: 1000 },
  calendar: { timezone: 'UTC', defaultDuration: 60, weekStart: 'sunday', dateFormat: 'mdy', eventReminderMinutes: 15 },
  presence: { startup: false, shutdown: false, scheduled: false, contextual: false, idle: false },
  scheduler: { enabled: false, checkInterval: 60000 },
  signal: { enabled: false },
  logging: { level: 'error', llmVerbose: false },
  dashboard: { port: 3333, host: 'localhost' },
  security: { apiToken: null, allowedIPs: [] },
};

// Initialize Garden service
const garden = new GardenService(config);
await garden.initialize();

console.log('Creating test data...\n');

// Create test records
const project1 = garden.create({
  type: 'project',
  title: 'Project Alpha',
  status: 'active',
});

const project2 = garden.create({
  type: 'project',
  title: 'Project Beta',
  status: 'active',
});

const action1 = garden.create({
  type: 'action',
  title: 'Action 1',
  status: 'active',
});

const action2 = garden.create({
  type: 'action',
  title: 'Action 2',
  status: 'active',
});

const action3 = garden.create({
  type: 'action',
  title: 'Action 3',
  status: 'active',
});

const note1 = garden.create({
  type: 'note',
  title: 'Note 1',
});

const note2 = garden.create({
  type: 'note',
  title: 'Note 2',
});

const contact1 = garden.create({
  type: 'contact',
  title: 'Contact 1',
});

// Create relationships
// Project1 has Action1 and Action2 as children
garden.addRelationship(action1.id, project1.id, 'parent');
garden.addRelationship(action2.id, project1.id, 'parent');

// Project2 has Action3 as child
garden.addRelationship(action3.id, project2.id, 'parent');

// Action1 references Note1
garden.addRelationship(action1.id, note1.id, 'reference');

// Action2 references Contact1
garden.addRelationship(action2.id, contact1.id, 'reference');

// Note1 mentions Note2
garden.addRelationship(note1.id, note2.id, 'mentions');

// Note2 references Project1 (creates 2-hop connection: Action1 → Note1 → Note2 → Project1)
garden.addRelationship(note2.id, project1.id, 'reference');

console.log('Test data created.\n');
console.log('Relationship structure:');
console.log('  Project1 ← parent ─ Action1 → reference → Note1 → mentions → Note2 → reference → Project1');
console.log('           ← parent ─ Action2 → reference → Contact1');
console.log('  Project2 ← parent ─ Action3');
console.log('');

// Get graph instance
const graph = garden.graph();

// === Tests ===

console.log('Running graph tests...\n');

// Test 1: getParents - Action1 should have Project1 as parent
test('getParents returns correct parent', () => {
  const parents = graph.getParents(action1.id);
  assertArrayLength(parents, 1, 'Should have 1 parent');
  assertEquals(parents[0].id, project1.id, 'Parent should be Project1');
});

// Test 2: getChildren - Project1 should have Action1 and Action2 as children
test('getChildren returns correct children', () => {
  const children = graph.getChildren(project1.id);
  assertArrayLength(children, 2, 'Should have 2 children');
  const childIds = children.map(c => c.id);
  assert(childIds.includes(action1.id), 'Should include Action1');
  assert(childIds.includes(action2.id), 'Should include Action2');
});

// Test 3: getReferences - Action1 should reference Note1
test('getReferences returns correct references', () => {
  const refs = graph.getReferences(action1.id);
  assertArrayLength(refs, 1, 'Should have 1 reference');
  assertEquals(refs[0].id, note1.id, 'Reference should be Note1');
});

// Test 4: getMentions - Note1 should mention Note2
test('getMentions returns correct mentions', () => {
  const mentions = graph.getMentions(note1.id);
  assertArrayLength(mentions, 1, 'Should have 1 mention');
  assertEquals(mentions[0].id, note2.id, 'Mention should be Note2');
});

// Test 5: getBacklinks - Project1 should have backlinks from Action1, Action2, and Note2
test('getBacklinks returns all incoming references', () => {
  const backlinks = graph.getBacklinks(project1.id);
  assertArrayLength(backlinks, 3, 'Should have 3 backlinks');
  const backlinkIds = backlinks.map(b => b.id);
  assert(backlinkIds.includes(action1.id), 'Should include Action1');
  assert(backlinkIds.includes(action2.id), 'Should include Action2');
  assert(backlinkIds.includes(note2.id), 'Should include Note2');
});

// Test 6: getBacklinks with type filter - Project1 should have 2 parent backlinks
test('getBacklinks with type filter', () => {
  const backlinks = graph.getBacklinks(project1.id, ['parent']);
  assertArrayLength(backlinks, 2, 'Should have 2 parent backlinks');
  const backlinkIds = backlinks.map(b => b.id);
  assert(backlinkIds.includes(action1.id), 'Should include Action1');
  assert(backlinkIds.includes(action2.id), 'Should include Action2');
});

// Test 7: getRelated with depth=1, outgoing
test('getRelated depth 1 outgoing from Action1', () => {
  const related = graph.getRelated(action1.id, { depth: 1, direction: 'outgoing' });
  assertArrayLength(related, 2, 'Should have 2 related records');
  const relatedIds = related.map(r => r.id);
  assert(relatedIds.includes(project1.id), 'Should include Project1');
  assert(relatedIds.includes(note1.id), 'Should include Note1');
});

// Test 8: getRelated with depth=2, outgoing - should reach Note2 through Note1
test('getRelated depth 2 outgoing from Action1', () => {
  const related = graph.getRelated(action1.id, { depth: 2, direction: 'outgoing' });
  assertArrayLength(related, 3, 'Should have 3 related records');
  const relatedIds = related.map(r => r.id);
  assert(relatedIds.includes(project1.id), 'Should include Project1 (depth 1)');
  assert(relatedIds.includes(note1.id), 'Should include Note1 (depth 1)');
  assert(relatedIds.includes(note2.id), 'Should include Note2 (depth 2 via Note1)');
});

// Test 9: getRelated with depth=3, outgoing - should reach Project1 again via Note2
test('getRelated depth 3 detects cycles', () => {
  const related = graph.getRelated(action1.id, { depth: 3, direction: 'outgoing' });
  // Should not duplicate Project1 (cycle detection)
  const project1Count = related.filter(r => r.id === project1.id).length;
  assertEquals(project1Count, 1, 'Should have Project1 only once despite cycle');
});

// Test 10: getRelated with incoming direction - Project1 incoming should find Action1, Action2
test('getRelated incoming from Project1', () => {
  const related = graph.getRelated(project1.id, { depth: 1, direction: 'incoming' });
  assertArrayLength(related, 3, 'Should have 3 incoming records');
  const relatedIds = related.map(r => r.id);
  assert(relatedIds.includes(action1.id), 'Should include Action1');
  assert(relatedIds.includes(action2.id), 'Should include Action2');
  assert(relatedIds.includes(note2.id), 'Should include Note2');
});

// Test 11: getRelated with both directions
test('getRelated both directions from Action1', () => {
  const related = graph.getRelated(action1.id, { depth: 1, direction: 'both' });
  // Outgoing: Project1, Note1
  // Incoming: none
  assertArrayLength(related, 2, 'Should have 2 related records');
});

// Test 12: getRelated with recordType filter
test('getRelated with record type filter', () => {
  const related = graph.getRelated(action1.id, {
    depth: 1,
    direction: 'outgoing',
    recordTypes: ['project']
  });
  assertArrayLength(related, 1, 'Should have 1 project');
  assertEquals(related[0].id, project1.id, 'Should be Project1');
});

// Test 13: getRelated with relationship type filter
test('getRelated with relationship type filter', () => {
  const related = graph.getRelated(action1.id, {
    depth: 1,
    direction: 'outgoing',
    types: ['parent']
  });
  assertArrayLength(related, 1, 'Should have 1 parent relationship');
  assertEquals(related[0].id, project1.id, 'Should be Project1');
});

// Test 14: getCluster - get all records within 2 hops
test('getCluster finds records within radius', () => {
  const cluster = graph.getCluster(action1.id, 2);
  assert(cluster.length >= 3, 'Should find at least 3 records in cluster');
  const clusterIds = cluster.map(c => c.id);
  assert(clusterIds.includes(project1.id), 'Cluster should include Project1');
  assert(clusterIds.includes(note1.id), 'Cluster should include Note1');
  assert(clusterIds.includes(note2.id), 'Cluster should include Note2');
});

// Test 15: Cache behavior - adjacency list is built and reused
test('Graph cache builds adjacency list', () => {
  // Invalidate to ensure fresh start
  graph.invalidate();

  // First query (builds cache)
  const result1 = graph.getRelated(action1.id, { depth: 2 });

  // Second query (should use same cache)
  const result2 = graph.getRelated(action1.id, { depth: 2 });

  // Results should be consistent
  assertEquals(result1.length, result2.length, 'Cached query should return same results');
});

// Test 16: Cache invalidation on relationship creation
test('Cache invalidates on relationship creation', () => {
  // Create new relationship
  const newAction = garden.create({
    type: 'action',
    title: 'New Action',
    status: 'active',
  });

  garden.addRelationship(newAction.id, project1.id, 'parent');

  // Query should reflect new relationship
  const children = graph.getChildren(project1.id);
  assertContains(children, c => c.id === newAction.id, 'Should include new action');

  // Cleanup
  garden.delete(newAction.id);
});

// Test 17: getRelated with custom filter
test('getRelated with custom filter', () => {
  const related = graph.getRelated(action1.id, {
    depth: 1,
    direction: 'outgoing',
    filter: (record) => record.type === 'note'
  });
  assertArrayLength(related, 1, 'Should have 1 note');
  assertEquals(related[0].id, note1.id, 'Should be Note1');
});

// Test 18: Empty results when no relationships
test('getRelated returns empty for record with no relationships', () => {
  const orphan = garden.create({
    type: 'note',
    title: 'Orphan Note',
  });

  const related = graph.getRelated(orphan.id, { depth: 1 });
  assertArrayLength(related, 0, 'Should have no related records');

  // Cleanup
  garden.delete(orphan.id);
});

console.log('');
console.log('='.repeat(50));
console.log(`Tests complete: ${passCount}/${testCount} passed`);
console.log('='.repeat(50));

// Cleanup
await garden.close();

try {
  const fs = await import('fs');
  if (fs.existsSync(TEST_DB)) {
    fs.unlinkSync(TEST_DB);
  }
  // Clean up test garden directory
  const testGardenPath = join(__dirname, 'test-garden');
  if (fs.existsSync(testGardenPath)) {
    fs.rmSync(testGardenPath, { recursive: true, force: true });
  }
} catch (err) {
  console.error('Cleanup error:', err.message);
}

process.exit(passCount === testCount ? 0 : 1);
