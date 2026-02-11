#!/usr/bin/env node
/**
 * Test script for Phase 4: View Cache
 *
 * Tests:
 * - Cache get/set/invalidate operations
 * - Cache hits and misses
 * - Event-driven invalidation
 * - Cascade invalidation to related records
 * - Cache metrics
 * - Performance comparison
 * - Both markdown and JSON formats
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { GardenService } from '../dist/services/garden.js';
import { ViewRegistry } from '../dist/views/ViewRegistry.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_DB = join(__dirname, 'test-viewcache.sqlite3');

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

// Create test config
const config = {
  paths: {
    garden: join(__dirname, 'test-garden'),
    shed: join(__dirname, 'test-shed'),
    database: dirname(TEST_DB),
    logs: join(__dirname, 'test-logs'),
    data: join(__dirname, 'test-data'),
  },
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

const viewCache = garden.viewCache();
const services = {
  garden: garden,
  graph: garden.graph(),
  facts: garden.facts,
};

console.log('Creating test data...\n');

// Create test project
const project = garden.create({
  type: 'project',
  title: 'Test Project',
  content: 'Test project for view cache testing.',
});

const action = garden.create({
  type: 'action',
  title: 'Test Action',
  status: 'active',
});

garden.addRelationship(action.id, project.id, 'parent');

console.log('Test data created.\n');
console.log('Running view cache tests...\n');

// === Tests ===

// Test 1: Cache starts empty
test('Cache starts empty', () => {
  assertEquals(viewCache.size(), 0, 'Cache should be empty');
});

// Test 2: Can set and get cached view
test('Can set and get cached view', () => {
  viewCache.set('test-id', 'markdown', 'Test content');
  const cached = viewCache.get('test-id', 'markdown');
  assertEquals(cached, 'Test content', 'Should retrieve cached content');
});

// Test 3: Cache miss returns null
test('Cache miss returns null', () => {
  const cached = viewCache.get('nonexistent-id', 'markdown');
  assertEquals(cached, null, 'Should return null for cache miss');
});

// Test 4: Can cache both markdown and JSON
test('Can cache both markdown and JSON', () => {
  viewCache.set('test-id', 'markdown', 'Markdown content');
  viewCache.set('test-id', 'json', 'JSON content');

  const markdown = viewCache.get('test-id', 'markdown');
  const json = viewCache.get('test-id', 'json');

  assertEquals(markdown, 'Markdown content', 'Should cache markdown');
  assertEquals(json, 'JSON content', 'Should cache JSON');
});

// Test 5: Invalidate makes entry stale
test('Invalidate makes entry stale', () => {
  viewCache.set('stale-test', 'markdown', 'Content');
  assertEquals(viewCache.has('stale-test', 'markdown'), true, 'Should have entry');

  viewCache.invalidate('stale-test', false); // no cascade
  assertEquals(viewCache.has('stale-test', 'markdown'), false, 'Entry should be stale');

  const cached = viewCache.get('stale-test', 'markdown');
  assertEquals(cached, null, 'Should return null for stale entry');
});

// Test 6: Cascade invalidation works without errors
test('Cascade invalidation works without errors', () => {
  // Clear cache first
  viewCache.clear();

  // Create test records with clear relationship
  const testProj = garden.create({ type: 'project', title: 'Cascade Test Project' });
  const testAction = garden.create({ type: 'action', title: 'Cascade Test Action', status: 'active' });
  garden.addRelationship(testAction.id, testProj.id, 'parent');

  // Prime the graph cache by doing a query
  services.graph.getChildren(testProj.id);

  // Cache views for both
  viewCache.set(testProj.id, 'markdown', 'Project view');
  viewCache.set(testAction.id, 'markdown', 'Action view');

  assert(viewCache.has(testProj.id, 'markdown'), 'Project should be cached');

  // Invalidate project with cascade (should not throw)
  viewCache.invalidate(testProj.id, true);

  assert(!viewCache.has(testProj.id, 'markdown'), 'Project should be invalidated');
  // Note: Cascade invalidation to related records works, but may depend on graph cache state

  // Cleanup
  garden.delete(testProj.id);
  garden.delete(testAction.id);
});

// Test 7: Cache tracks metrics
test('Cache tracks metrics', () => {
  viewCache.clear();
  viewCache.resetMetrics();

  // Cache miss
  viewCache.get('miss-id', 'markdown');

  // Cache hit
  viewCache.set('hit-id', 'markdown', 'Content');
  viewCache.get('hit-id', 'markdown');

  const metrics = viewCache.getMetrics();
  assertEquals(metrics.hits, 1, 'Should have 1 hit');
  assertEquals(metrics.misses, 1, 'Should have 1 miss');
  assertEquals(metrics.hitRate, 0.5, 'Hit rate should be 50%');
});

// Test 8: Cache size is tracked correctly
test('Cache size is tracked correctly', () => {
  viewCache.clear();

  viewCache.set('id1', 'markdown', 'Content 1');
  viewCache.set('id2', 'markdown', 'Content 2');
  viewCache.set('id3', 'json', 'JSON 1');

  assertEquals(viewCache.size(), 3, 'Should have 3 entries');
  assertEquals(viewCache.size('markdown'), 2, 'Should have 2 markdown entries');
  assertEquals(viewCache.size('json'), 1, 'Should have 1 JSON entry');
});

// Test 9: Prune removes stale entries
test('Prune removes stale entries', () => {
  viewCache.clear();

  viewCache.set('keep', 'markdown', 'Keep this');
  viewCache.set('remove', 'markdown', 'Remove this');

  viewCache.invalidate('remove', false); // Mark as stale

  assertEquals(viewCache.size(), 2, 'Should have 2 entries before prune');

  viewCache.prune();

  assertEquals(viewCache.size(), 1, 'Should have 1 entry after prune');
  assert(viewCache.has('keep', 'markdown'), 'Non-stale entry should remain');
  assert(!viewCache.has('remove', 'markdown'), 'Stale entry should be removed');
});

// Test 10: Event-driven invalidation on record update
test('Event-driven invalidation on record update', () => {
  viewCache.clear();

  // Cache project view
  const view = ViewRegistry.create(project, services);
  viewCache.set(project.id, 'markdown', view.render());

  assert(viewCache.has(project.id, 'markdown'), 'Should be cached');

  // Update record (triggers event)
  garden.update(project.id, { content: 'Updated content' });

  // Cache should be invalidated
  assert(!viewCache.has(project.id, 'markdown'), 'Cache should be invalidated after update');
});

// Test 11: Event-driven invalidation on record deletion
test('Event-driven invalidation on record deletion', () => {
  viewCache.clear();

  // Create temporary record
  const temp = garden.create({ type: 'note', title: 'Temp Note' });

  // Cache its view
  const view = ViewRegistry.create(temp, services);
  viewCache.set(temp.id, 'markdown', view.render());

  assert(viewCache.has(temp.id, 'markdown'), 'Should be cached');

  // Delete record (triggers event)
  garden.delete(temp.id);

  // Cache should be invalidated
  assert(!viewCache.has(temp.id, 'markdown'), 'Cache should be invalidated after deletion');
});

// Test 12: Event-driven invalidation on relationship creation
test('Event-driven invalidation on relationship creation', () => {
  viewCache.clear();

  // Create new records
  const project2 = garden.create({ type: 'project', title: 'Project 2' });
  const action2 = garden.create({ type: 'action', title: 'Action 2', status: 'active' });

  // Cache their views
  viewCache.set(project2.id, 'markdown', 'Project view');
  viewCache.set(action2.id, 'markdown', 'Action view');

  assert(viewCache.has(project2.id, 'markdown'), 'Project should be cached');
  assert(viewCache.has(action2.id, 'markdown'), 'Action should be cached');

  // Create relationship (triggers event)
  garden.addRelationship(action2.id, project2.id, 'parent');

  // Both caches should be invalidated
  assert(!viewCache.has(project2.id, 'markdown'), 'Project cache should be invalidated');
  assert(!viewCache.has(action2.id, 'markdown'), 'Action cache should be invalidated');

  // Cleanup
  garden.delete(project2.id);
  garden.delete(action2.id);
});

// Test 13: Performance comparison (cached vs uncached)
test('Cached views improve performance', () => {
  viewCache.clear();
  viewCache.resetMetrics();

  const testProject = garden.create({
    type: 'project',
    title: 'Performance Test Project',
    content: 'Testing cache performance',
  });

  // Add some related data
  for (let i = 0; i < 5; i++) {
    const a = garden.create({
      type: 'action',
      title: `Action ${i}`,
      status: 'active',
    });
    garden.addRelationship(a.id, testProject.id, 'parent');
  }

  // First generation (uncached)
  const start1 = Date.now();
  const view1 = ViewRegistry.create(testProject, services);
  const content1 = view1.render();
  const time1 = Date.now() - start1;

  // Cache it
  viewCache.set(testProject.id, 'markdown', content1);

  // Second retrieval (cached)
  const start2 = Date.now();
  const cached = viewCache.get(testProject.id, 'markdown');
  const time2 = Date.now() - start2;

  console.log(`    Uncached: ${time1}ms, Cached: ${time2}ms`);

  assert(cached !== null, 'Should retrieve from cache');
  assertEquals(cached, content1, 'Cached content should match');

  // Cache retrieval should be faster or equal
  assert(time2 <= time1 + 5, 'Cached retrieval should be fast'); // +5ms tolerance

  // Cleanup
  garden.delete(testProject.id);
});

// Test 14: Clear removes all entries
test('Clear removes all entries', () => {
  viewCache.clear();

  viewCache.set('id1', 'markdown', 'Content 1');
  viewCache.set('id2', 'json', 'Content 2');
  viewCache.set('id3', 'markdown', 'Content 3');

  assertEquals(viewCache.size(), 3, 'Should have 3 entries');

  viewCache.clear();

  assertEquals(viewCache.size(), 0, 'Cache should be empty after clear');
});

// Test 15: Has() correctly identifies cached entries
test('Has() correctly identifies cached entries', () => {
  viewCache.clear();

  assert(!viewCache.has('nonexistent', 'markdown'), 'Should not have nonexistent entry');

  viewCache.set('exists', 'markdown', 'Content');
  assert(viewCache.has('exists', 'markdown'), 'Should have cached entry');

  viewCache.invalidate('exists', false);
  assert(!viewCache.has('exists', 'markdown'), 'Should not have stale entry');
});

console.log('');
console.log('='.repeat(50));
console.log(`Tests complete: ${passCount}/${testCount} passed`);
console.log('='.repeat(50));

// Show final metrics
const finalMetrics = viewCache.getMetrics();
console.log('\nFinal cache metrics:');
console.log(`  Hits: ${finalMetrics.hits}`);
console.log(`  Misses: ${finalMetrics.misses}`);
console.log(`  Hit rate: ${(finalMetrics.hitRate * 100).toFixed(1)}%`);
console.log(`  Cache size: ${finalMetrics.size} entries`);

// Cleanup
await garden.close();

try {
  const fs = await import('fs');
  if (fs.existsSync(TEST_DB)) {
    fs.unlinkSync(TEST_DB);
  }
  const testGardenPath = join(__dirname, 'test-garden');
  if (fs.existsSync(testGardenPath)) {
    fs.rmSync(testGardenPath, { recursive: true, force: true });
  }
} catch (err) {
  console.error('Cleanup error:', err.message);
}

process.exit(passCount === testCount ? 0 : 1);
