#!/usr/bin/env node
/**
 * Test script for Phase 7: Template Engine
 *
 * Tests:
 * - Template registration
 * - Template loading from disk
 * - Variable substitution
 * - Record creation from templates
 * - Default values
 * - Template saving
 * - Default template creation
 * - Title extraction
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { GardenService } from '../dist/services/garden.js';
import { TemplateEngine } from '../dist/templates/TemplateEngine.js';
import fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_DB = join(__dirname, 'test-templates.sqlite3');

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

function assertContains(text, substring, message) {
  if (!text.includes(substring)) {
    throw new Error(message || `Expected text to contain "${substring}"`);
  }
}

// Setup test environment
console.log('Setting up test environment...\n');

// Remove existing test DB and templates
try {
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

// Initialize services
const garden = new GardenService(config);
await garden.initialize();

const templates = new TemplateEngine(garden, config);
await templates.initialize();

console.log('Test environment ready.\n');
console.log('Running Template Engine tests...\n');

// === Tests ===

// Test 1: TemplateEngine initializes correctly
test('TemplateEngine initializes correctly', () => {
  assert(templates !== null, 'TemplateEngine should be created');
  assert(typeof templates.register === 'function', 'Should have register method');
  assert(typeof templates.render === 'function', 'Should have render method');
  assert(typeof templates.createFromTemplate === 'function', 'Should have createFromTemplate method');
});

// Test 2: Can register a template
test('Can register a template', () => {
  const template = {
    name: 'test-template',
    description: 'A test template',
    type: 'note',
    content: '# {{title}}\n\n{{body}}',
    defaultValues: { body: 'Default body text' },
  };

  templates.register(template);

  const retrieved = templates.get('test-template');
  assert(retrieved !== undefined, 'Template should be retrievable');
  assertEquals(retrieved.name, 'test-template', 'Name should match');
  assertEquals(retrieved.type, 'note', 'Type should match');
});

// Test 3: Can render template with variables
test('Can render template with variables', () => {
  const template = {
    name: 'greeting',
    description: 'Greeting template',
    type: 'note',
    content: 'Hello {{name}}, welcome to {{place}}!',
  };

  templates.register(template);

  const rendered = templates.render('greeting', {
    name: 'Alice',
    place: 'Wonderland',
  });

  assertEquals(rendered, 'Hello Alice, welcome to Wonderland!', 'Variables should be substituted');
});

// Test 4: Default values work
test('Default values are applied', () => {
  const template = {
    name: 'with-defaults',
    description: 'Template with defaults',
    type: 'note',
    content: '{{greeting}} {{name}}!',
    defaultValues: { greeting: 'Hello' },
  };

  templates.register(template);

  const rendered = templates.render('with-defaults', { name: 'Bob' });

  assertContains(rendered, 'Hello Bob', 'Default values should be used');
});

// Test 5: Variables override defaults
test('Variables override default values', () => {
  const template = {
    name: 'override-test',
    description: 'Override test',
    type: 'note',
    content: '{{greeting}} {{name}}!',
    defaultValues: { greeting: 'Hello' },
  };

  templates.register(template);

  const rendered = templates.render('override-test', {
    greeting: 'Hi',
    name: 'Charlie',
  });

  assertContains(rendered, 'Hi Charlie', 'Provided vars should override defaults');
});

// Test 6: Can create record from template
test('Can create record from template', () => {
  const template = {
    name: 'project-tmpl',
    description: 'Project template',
    type: 'project',
    content: '# {{title}}\n\n{{description}}\n\n## Goals\n- Goal 1\n- Goal 2',
  };

  templates.register(template);

  const record = templates.createFromTemplate(
    'project-tmpl',
    {
      title: 'My Project',
      description: 'This is a test project.',
    },
    { status: 'active' }
  );

  assert(record.id !== undefined, 'Record should have an ID');
  assertEquals(record.type, 'project', 'Record type should match template');
  assertEquals(record.title, 'My Project', 'Title should be extracted');
  assertContains(record.content, 'This is a test project', 'Content should be rendered');
});

// Test 7: Unsubstituted variables are removed
test('Unsubstituted variables are removed', () => {
  const template = {
    name: 'partial-vars',
    description: 'Partial variables',
    type: 'note',
    content: 'Name: {{name}}, Age: {{age}}, City: {{city}}',
  };

  templates.register(template);

  const rendered = templates.render('partial-vars', { name: 'Diana' });

  assertContains(rendered, 'Name: Diana', 'Provided var should be substituted');
  assert(!rendered.includes('{{age}}'), 'Unsubstituted vars should be removed');
  assert(!rendered.includes('{{city}}'), 'Unsubstituted vars should be removed');
});

// Test 8: List all templates
test('List all templates', () => {
  const allTemplates = templates.list();

  assert(Array.isArray(allTemplates), 'Should return an array');
  assert(allTemplates.length > 0, 'Should have at least one template');

  const names = allTemplates.map(t => t.name);
  assert(names.includes('test-template'), 'Should include registered templates');
});

// Test 9: Save template to disk
test('Save template to disk', () => {
  const template = {
    name: 'disk-test',
    description: 'Disk save test',
    type: 'note',
    content: '# {{title}}\n\n{{content}}',
    defaultValues: { content: 'Default content' },
  };

  templates.register(template);
  templates.saveTemplate(template);

  const templatePath = join(config.paths.garden, 'templates', 'disk-test.md');
  assert(fs.existsSync(templatePath), 'Template file should exist on disk');

  const fileContent = fs.readFileSync(templatePath, 'utf-8');
  assertContains(fileContent, 'name: disk-test', 'File should contain template metadata');
  assertContains(fileContent, '# {{title}}', 'File should contain template content');
});

// Test 10: Load template from disk
test('Load template from disk after restart', async () => {
  // Create a new template engine instance
  const templates2 = new TemplateEngine(garden, config);
  await templates2.initialize();

  const loaded = templates2.get('disk-test');
  assert(loaded !== undefined, 'Template should be loaded from disk');
  assertEquals(loaded.name, 'disk-test', 'Loaded template should match');
  assertEquals(loaded.type, 'note', 'Type should match');
});

// Test 11: Create default templates
test('Create default templates', () => {
  // Clear existing templates first
  const allTemplates = templates.list();
  for (const t of allTemplates) {
    templates.deleteTemplate(t.name);
  }

  templates.createDefaultTemplates();

  const gtdProject = templates.get('gtd-project');
  assert(gtdProject !== undefined, 'Should have gtd-project template');
  assertEquals(gtdProject.type, 'project', 'GTD project should be project type');

  const meetingNotes = templates.get('meeting-notes');
  assert(meetingNotes !== undefined, 'Should have meeting-notes template');
  assertEquals(meetingNotes.type, 'note', 'Meeting notes should be note type');

  const contact = templates.get('contact');
  assert(contact !== undefined, 'Should have contact template');
  assertEquals(contact.type, 'contact', 'Contact should be contact type');
});

// Test 12: GTD project template works
test('GTD project template works correctly', () => {
  const record = templates.createFromTemplate(
    'gtd-project',
    {
      title: 'Launch Product',
      description: 'Launch our new product to market.',
      goal1: 'Complete development',
      goal2: 'Marketing campaign',
      goal3: 'Sales targets',
      criteria1: 'Beta testing completed',
      criteria2: 'Marketing materials ready',
      criteria3: 'Sales team trained',
    },
    { status: 'active' }
  );

  assert(record !== null, 'Record should be created');
  assertEquals(record.type, 'project', 'Should be a project');
  assertContains(record.content, 'Launch Product', 'Should have title');
  assertContains(record.content, 'Complete development', 'Should have goals');
  assertContains(record.content, 'Beta testing completed', 'Should have criteria');
});

// Test 13: Meeting notes template works
test('Meeting notes template works correctly', () => {
  const today = new Date().toISOString().split('T')[0];

  const record = templates.createFromTemplate(
    'meeting-notes',
    {
      title: 'Team Standup',
      attendees: 'Alice, Bob, Charlie',
      agenda1: 'Sprint progress',
      agenda2: 'Blockers',
      agenda3: 'Next sprint planning',
      action1: 'Fix bug #123',
      action2: 'Review PR #456',
    }
  );

  assert(record !== null, 'Record should be created');
  assertEquals(record.type, 'note', 'Should be a note');
  assertContains(record.content, 'Team Standup', 'Should have title');
  assertContains(record.content, 'Alice, Bob, Charlie', 'Should have attendees');
  assertContains(record.content, today, 'Should have today\'s date by default');
});

// Test 14: Delete template
test('Delete template', () => {
  const template = {
    name: 'to-delete',
    description: 'Template to delete',
    type: 'note',
    content: 'Content',
  };

  templates.register(template);
  templates.saveTemplate(template);

  const templatePath = join(config.paths.garden, 'templates', 'to-delete.md');
  assert(fs.existsSync(templatePath), 'Template file should exist');

  const deleted = templates.deleteTemplate('to-delete');
  assert(deleted === true, 'Delete should return true');
  assert(!fs.existsSync(templatePath), 'Template file should be deleted');
  assert(templates.get('to-delete') === undefined, 'Template should be removed from memory');
});

// Test 15: Title extraction works
test('Title extraction from markdown', () => {
  const template = {
    name: 'title-test',
    description: 'Title extraction test',
    type: 'note',
    content: '# {{projectName}} Project\n\nSome content here.',
  };

  templates.register(template);

  const record = templates.createFromTemplate('title-test', {
    projectName: 'Awesome',
  });

  assertEquals(record.title, 'Awesome Project', 'Title should be extracted from heading');
});

console.log('');
console.log('='.repeat(50));
console.log(`Tests complete: ${passCount}/${testCount} passed`);
console.log('='.repeat(50));

// Cleanup
await garden.close();

try {
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
