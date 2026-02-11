#!/usr/bin/env node
/**
 * Test script for Phase 8: Other Views (Contact, Tag, Daily)
 *
 * Tests:
 * - ContactPageView rendering
 * - TagPageView rendering
 * - DailyPageView rendering
 * - View registration
 * - Section generation
 * - JSON output
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { GardenService } from '../dist/services/garden.js';
import { ViewRegistry } from '../dist/views/ViewRegistry.js';
import { ContactPageView } from '../dist/views/ContactPageView.js';
import { TagPageView } from '../dist/views/TagPageView.js';
import { DailyPageView } from '../dist/views/DailyPageView.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_DB = join(__dirname, 'test-otherviews.sqlite3');

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

function assertContains(text, substring, message) {
  if (!text.includes(substring)) {
    throw new Error(message || `Expected text to contain "${substring}"`);
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
  const testGardenPath = join(__dirname, 'test-garden');
  if (fs.existsSync(testGardenPath)) {
    fs.rmSync(testGardenPath, { recursive: true, force: true });
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

const services = {
  garden: garden,
  graph: garden.graph(),
  facts: garden.facts,
};

console.log('Creating test data...\n');

// Create test contact
const contact = garden.create({
  type: 'contact',
  title: 'Alice Smith',
  content: 'Met at conference. Works on developer tools.',
  email: 'alice@example.com',
  phone: '555-1234',
  birthday: '03-15',
  tags: ['work', 'engineering'],
});

// Create projects related to contact
const project1 = garden.create({
  type: 'project',
  title: 'Engineering Project',
  content: 'Collaboration with Alice.',
  status: 'active',
  tags: ['work'],
});

// Project references contact (project → contact)
garden.addRelationship(project1.id, contact.id, 'reference');

// Create actions related to contact
const action1 = garden.create({
  type: 'action',
  title: 'Email Alice about proposal',
  status: 'active',
  context: '@email',
  tags: ['work'],
  due_date: '2026-02-15',
});

// Action references contact (action → contact)
garden.addRelationship(action1.id, contact.id, 'reference');

// Create notes mentioning contact
const note1 = garden.create({
  type: 'note',
  title: 'Meeting Notes 2026-02-11',
  content: 'Discussed project timeline with Alice. Key points: ...',
  tags: ['work', 'meeting'],
});

// Note references contact (note → contact)
garden.addRelationship(note1.id, contact.id, 'reference');

// Create tagged items for TagPageView testing
const taggedProject = garden.create({
  type: 'project',
  title: 'Medical Project',
  content: 'Health insurance claim.',
  status: 'active',
  tags: ['medical', 'urgent'],
});

const taggedAction = garden.create({
  type: 'action',
  title: 'Call doctor',
  status: 'active',
  context: '@phone',
  tags: ['medical'],
  due_date: '2026-02-12',
});

const taggedNote = garden.create({
  type: 'note',
  title: 'Medical History',
  content: 'Notes about medical conditions and treatments...',
  tags: ['medical'],
});

// Create daily entry
const daily = garden.create({
  type: 'daily',
  title: '2026-02-11',
  content: 'Today I worked on Garden 2.0 implementation.',
});

// Create action due today
const todayAction = garden.create({
  type: 'action',
  title: 'Complete Phase 8',
  status: 'active',
  due_date: '2026-02-11',
  context: '@computer',
});

// Create completed action
const completedAction = garden.create({
  type: 'action',
  title: 'Completed earlier',
  status: 'completed',
  completed_at: '2026-02-11T10:00:00Z',
});

console.log('Test data created.\n');
console.log('Running Other Views tests...\n');

// === Tests ===

// Test 1: ContactPageView is registered
test('ContactPageView is registered', () => {
  assert(ViewRegistry.has('contact'), 'Contact view should be registered');
});

// Test 2: Can create ContactPageView
test('Can create ContactPageView', () => {
  const view = ViewRegistry.create(contact, services);
  assert(view instanceof ContactPageView, 'Should create ContactPageView instance');
});

// Test 3: ContactPageView renders correctly
test('ContactPageView renders correctly', () => {
  const view = ViewRegistry.create(contact, services);
  const markdown = view.render();

  assertContains(markdown, 'Met at conference', 'Should include user content');
  assertContains(markdown, 'alice@example.com', 'Should include email');
  assertContains(markdown, '555-1234', 'Should include phone');
  assertContains(markdown, '03-15', 'Should include birthday');
});

// Test 4: ContactPageView shows related projects
test('ContactPageView shows related projects', () => {
  const view = ViewRegistry.create(contact, services);
  const markdown = view.render();

  assertContains(markdown, '📁 Projects', 'Should have projects section');
  assertContains(markdown, 'Engineering Project', 'Should list related project');
});

// Test 5: ContactPageView shows related actions
test('ContactPageView shows related actions', () => {
  const view = ViewRegistry.create(contact, services);
  const markdown = view.render();

  assertContains(markdown, '✅ Actions', 'Should have actions section');
  assertContains(markdown, 'Email Alice about proposal', 'Should list related action');
});

// Test 6: ContactPageView shows related notes
test('ContactPageView shows related notes', () => {
  const view = ViewRegistry.create(contact, services);
  const markdown = view.render();

  assertContains(markdown, '📝 Notes', 'Should have notes section');
  assertContains(markdown, 'Meeting Notes', 'Should list related note');
});

// Test 7: ContactPageView toJSON works
test('ContactPageView toJSON works', () => {
  const view = ViewRegistry.create(contact, services);
  const json = view.toJSON();

  assert(json.id !== undefined, 'JSON should have id');
  assert(json.type === 'contact', 'JSON should have type');
  assert(Array.isArray(json.sections), 'JSON should have sections array');
  assert(json.sections.length > 0, 'Should have at least one section');
});

// Test 8: TagPageView can be instantiated
test('TagPageView can be instantiated', () => {
  // Create a dummy record for tag view
  const dummyRecord = garden.create({
    type: 'note',
    title: 'Tag: medical',
  });

  const view = new TagPageView(dummyRecord, services, 'medical');
  assert(view !== null, 'TagPageView should be created');
});

// Test 9: TagPageView renders tag overview
test('TagPageView renders tag overview', () => {
  const dummyRecord = garden.create({
    type: 'note',
    title: 'Tag: medical',
  });

  const view = new TagPageView(dummyRecord, services, 'medical');
  const markdown = view.render();

  assertContains(markdown, '#medical', 'Should show tag name');
  assertContains(markdown, 'Total items', 'Should show item count');
});

// Test 10: TagPageView shows tagged projects
test('TagPageView shows tagged projects', () => {
  const dummyRecord = garden.create({
    type: 'note',
    title: 'Tag: medical',
  });

  const view = new TagPageView(dummyRecord, services, 'medical');
  const markdown = view.render();

  assertContains(markdown, '📁 Projects', 'Should have projects section');
  assertContains(markdown, 'Medical Project', 'Should list tagged project');
});

// Test 11: TagPageView shows tagged actions
test('TagPageView shows tagged actions', () => {
  const dummyRecord = garden.create({
    type: 'note',
    title: 'Tag: medical',
  });

  const view = new TagPageView(dummyRecord, services, 'medical');
  const markdown = view.render();

  assertContains(markdown, '✅ Actions', 'Should have actions section');
  assertContains(markdown, 'Call doctor', 'Should list tagged action');
});

// Test 12: TagPageView shows tagged notes
test('TagPageView shows tagged notes', () => {
  const dummyRecord = garden.create({
    type: 'note',
    title: 'Tag: medical',
  });

  const view = new TagPageView(dummyRecord, services, 'medical');
  const markdown = view.render();

  assertContains(markdown, '📝 Notes', 'Should have notes section');
  assertContains(markdown, 'Medical History', 'Should list tagged note');
});

// Test 13: DailyPageView is registered
test('DailyPageView is registered', () => {
  assert(ViewRegistry.has('daily'), 'Daily view should be registered');
});

// Test 14: Can create DailyPageView
test('Can create DailyPageView', () => {
  const view = ViewRegistry.create(daily, services);
  assert(view instanceof DailyPageView, 'Should create DailyPageView instance');
});

// Test 15: DailyPageView renders correctly
test('DailyPageView renders correctly', () => {
  const view = ViewRegistry.create(daily, services);
  const markdown = view.render();

  assertContains(markdown, 'Garden 2.0 implementation', 'Should include user content');
});

// Test 16: DailyPageView shows actions due today
test('DailyPageView shows actions due today', () => {
  const view = ViewRegistry.create(daily, services);
  const markdown = view.render();

  assertContains(markdown, '✅ Due Today', 'Should have due today section');
  assertContains(markdown, 'Complete Phase 8', 'Should list action due today');
});

// Test 17: DailyPageView shows completed actions
test('DailyPageView shows completed actions', () => {
  const view = ViewRegistry.create(daily, services);
  const markdown = view.render();

  assertContains(markdown, '✓ Completed', 'Should have completed section');
  assertContains(markdown, 'Completed earlier', 'Should list completed action');
});

// Test 18: DailyPageView toJSON works
test('DailyPageView toJSON works', () => {
  const view = ViewRegistry.create(daily, services);
  const json = view.toJSON();

  assert(json.id !== undefined, 'JSON should have id');
  assert(json.type === 'daily', 'JSON should have type');
  assert(Array.isArray(json.sections), 'JSON should have sections array');
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
  const testGardenPath = join(__dirname, 'test-garden');
  if (fs.existsSync(testGardenPath)) {
    fs.rmSync(testGardenPath, { recursive: true, force: true });
  }
} catch (err) {
  console.error('Cleanup error:', err.message);
}

process.exit(passCount === testCount ? 0 : 1);
