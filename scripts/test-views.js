#!/usr/bin/env node
/**
 * Test script for Phase 3: View Layer
 *
 * Tests:
 * - PageView base class
 * - ProjectPageView section generation
 * - ViewRegistry factory pattern
 * - Markdown and JSON rendering
 * - Integration with graph, query, facts
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { ViewRegistry } from '../dist/views/ViewRegistry.js';
import { GardenService } from '../dist/services/garden.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_DB = join(__dirname, 'test-views.sqlite3');

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

function assertContains(str, substring, message) {
  if (!str.includes(substring)) {
    throw new Error(message || `Expected string to contain "${substring}"`);
  }
}

function assertNotContains(str, substring, message) {
  if (str.includes(substring)) {
    throw new Error(message || `Expected string not to contain "${substring}"`);
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

console.log('Creating test data...\n');

// Create test project
const project = garden.create({
  type: 'project',
  title: 'Test Project',
  content: 'This is a test project for view layer testing.',
  status: 'active',
});

// Create contacts
const contact1 = garden.create({
  type: 'contact',
  title: 'Alice Smith',
});

const contact2 = garden.create({
  type: 'contact',
  title: 'Bob Jones',
});

// Link contacts to project
garden.addRelationship(project.id, contact1.id, 'reference');
garden.addRelationship(project.id, contact2.id, 'reference');

// Create actions for project
const action1 = garden.create({
  type: 'action',
  title: 'Complete design mockups',
  status: 'active',
  context: 'computer',
  due_date: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
});

const action2 = garden.create({
  type: 'action',
  title: 'Send proposal to client',
  status: 'active',
  context: 'email',
  tags: ['urgent'],
});

// Link actions to project
garden.addRelationship(action1.id, project.id, 'parent');
garden.addRelationship(action2.id, project.id, 'parent');

// Create notes for project
const note1 = garden.create({
  type: 'note',
  title: 'Meeting notes 2026-02-11',
  content: 'Discussed timeline and budget constraints. Need to finalize by end of month.',
});

const note2 = garden.create({
  type: 'note',
  title: 'Technical requirements',
  content: 'Must support mobile devices and offline mode.',
});

// Link notes to project
garden.addRelationship(note1.id, project.id, 'parent');
garden.addRelationship(note2.id, project.id, 'reference');

// Create media
const media1 = garden.create({
  type: 'media',
  title: 'design-mockup.png',
});

garden.addRelationship(media1.id, project.id, 'parent');

// Track some facts
garden.facts.increment(project.id, 'viewCount', 42);
garden.facts.setFact(project.id, 'lastViewed', new Date().toISOString());

console.log('Test data created.\n');

// Get view services
const services = {
  garden: garden,
  graph: garden.graph(),
  facts: garden.facts,
};

// === Tests ===

console.log('Running view layer tests...\n');

// Test 1: ViewRegistry has project view registered
test('ViewRegistry has project view registered', () => {
  assert(ViewRegistry.has('project'), 'Should have project view registered');
});

// Test 2: ViewRegistry can create project view
test('ViewRegistry creates project view', () => {
  const view = ViewRegistry.create(project, services);
  assert(view !== null, 'Should create a view');
  assert(view.constructor.name === 'ProjectPageView', 'Should be ProjectPageView');
});

// Test 3: ViewRegistry creates default view for unregistered types
test('ViewRegistry creates default view for unregistered types', () => {
  const entry = garden.create({ type: 'entry', title: 'Test Entry' });
  const view = ViewRegistry.create(entry, services);
  assert(view !== null, 'Should create a view');
  assert(view.constructor.name === 'DefaultPageView', 'Should be DefaultPageView');
  garden.delete(entry.id);
});

// Test 4: Project view generates sections
test('Project view generates sections', () => {
  const view = ViewRegistry.create(project, services);
  const sections = view.generateSections();
  assert(sections.length > 0, 'Should generate sections');
});

// Test 5: Project view renders markdown
test('Project view renders markdown', () => {
  const view = ViewRegistry.create(project, services);
  const markdown = view.render();
  assert(markdown.length > 0, 'Should render markdown');
  assertContains(markdown, '## Content', 'Should have Content section');
});

// Test 6: Project view includes user content
test('Project view includes user content', () => {
  const view = ViewRegistry.create(project, services);
  const markdown = view.render();
  assertContains(markdown, 'This is a test project', 'Should include user content');
});

// Test 7: Project view includes contacts section
test('Project view includes contacts section', () => {
  const view = ViewRegistry.create(project, services);
  const markdown = view.render();
  assertContains(markdown, '## 👥 People', 'Should have People section');
  assertContains(markdown, 'Alice Smith', 'Should include contact');
  assertContains(markdown, 'Bob Jones', 'Should include contact');
});

// Test 8: Project view includes actions section
test('Project view includes actions section', () => {
  const view = ViewRegistry.create(project, services);
  const markdown = view.render();
  assertContains(markdown, '## ✅ Next Actions', 'Should have Next Actions section');
  assertContains(markdown, 'Complete design mockups', 'Should include action');
  assertContains(markdown, 'Send proposal to client', 'Should include action');
});

// Test 9: Actions are formatted with context and tags
test('Actions are formatted with context and tags', () => {
  const view = ViewRegistry.create(project, services);
  const markdown = view.render();
  assertContains(markdown, '@computer', 'Should include context');
  assertContains(markdown, '#urgent', 'Should include tags');
});

// Test 10: Project view includes notes section
test('Project view includes notes section', () => {
  const view = ViewRegistry.create(project, services);
  const markdown = view.render();
  assertContains(markdown, '## 📝 Notes', 'Should have Notes section');
  assertContains(markdown, 'Meeting notes', 'Should include note');
  assertContains(markdown, 'Technical requirements', 'Should include note');
});

// Test 11: Project view includes media section
test('Project view includes media section', () => {
  const view = ViewRegistry.create(project, services);
  const markdown = view.render();
  assertContains(markdown, '## 📎 Media', 'Should have Media section');
  assertContains(markdown, 'design-mockup.png', 'Should include media');
});

// Test 12: Project view includes metadata section
test('Project view includes metadata section', () => {
  const view = ViewRegistry.create(project, services);
  const markdown = view.render();
  assertContains(markdown, '## 📊 Stats', 'Should have Stats section');
  assert(markdown.includes('Views:'), 'Should include view count');
});

// Test 13: Project view can export to JSON
test('Project view exports to JSON', () => {
  const view = ViewRegistry.create(project, services);
  const json = view.toJSON();
  assert(json !== null, 'Should export JSON');
  assertEquals(json.id, project.id, 'Should have correct ID');
  assertEquals(json.type, 'project', 'Should have correct type');
  assert(Array.isArray(json.sections), 'Should have sections array');
});

// Test 14: JSON export includes section metadata
test('JSON export includes section metadata', () => {
  const view = ViewRegistry.create(project, services);
  const json = view.toJSON();
  const actionsSection = json.sections.find(s => s.title === '✅ Next Actions');
  assert(actionsSection !== undefined, 'Should have actions section');
  assert(actionsSection.metadata !== undefined, 'Should have metadata');
  assertEquals(actionsSection.metadata.count, 2, 'Should have correct count');
});

// Test 15: Empty sections are not rendered in markdown
test('Empty sections are not rendered', () => {
  // Create project with no backlinks
  const emptyProject = garden.create({
    type: 'project',
    title: 'Empty Project',
    content: 'Test project with no relationships',
  });

  const view = ViewRegistry.create(emptyProject, services);
  const markdown = view.render();

  // Should not have empty sections
  assertNotContains(markdown, '## 🔗 Backlinks', 'Should not render empty backlinks');

  garden.delete(emptyProject.id);
});

// Test 16: View handles records with no content
test('View handles records with no content', () => {
  const noContentProject = garden.create({
    type: 'project',
    title: 'No Content Project',
    status: 'active',
  });

  const view = ViewRegistry.create(noContentProject, services);
  const markdown = view.render();
  assertContains(markdown, '_No content yet._', 'Should show placeholder for empty content');

  garden.delete(noContentProject.id);
});

// Test 17: Multiple views can be created for same record
test('Multiple views can be created for same record', () => {
  const view1 = ViewRegistry.create(project, services);
  const view2 = ViewRegistry.create(project, services);

  const markdown1 = view1.render();
  const markdown2 = view2.render();

  assertEquals(markdown1, markdown2, 'Views should generate consistent output');
});

// Test 18: ViewRegistry getRegisteredTypes works
test('ViewRegistry lists registered types', () => {
  const types = ViewRegistry.getRegisteredTypes();
  assert(types.length > 0, 'Should have registered types');
  assert(types.includes('project'), 'Should include project type');
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
