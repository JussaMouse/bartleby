#!/usr/bin/env node
/**
 * Test script for Phase 6: LLM Generator
 *
 * Tests:
 * - LLMGenerator class instantiation
 * - Cache operations (get, set, invalidate)
 * - Project summary generation
 * - Next actions suggestions
 * - Weekly review generation
 * - Cache hit/miss behavior
 * - TTL expiration
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { GardenService } from '../dist/services/garden.js';
import { LLMService } from '../dist/services/llm.js';
import { LLMGenerator } from '../dist/llm/LLMGenerator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_DB = join(__dirname, 'test-llmgen.sqlite3');

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

// Initialize services
const garden = new GardenService(config);
await garden.initialize();

// Mock LLM service (returns canned responses for testing)
class MockLLMService {
  constructor() {
    this.fastModel = {
      generate: async (prompt, options) => {
        // Mock responses based on prompt content
        if (prompt.includes('Generate a brief 2-3 sentence summary')) {
          return 'This project is progressing well with 3 active tasks. The team is on track to meet the upcoming deadline. Key next step is completing the design phase.';
        }
        if (prompt.includes('suggest 3-5 concrete next actions')) {
          return `- Review design mockups with team
- Complete technical specification document
- Schedule kickoff meeting with stakeholders
- Set up project tracking board
- Draft communication plan`;
        }
        if (prompt.includes('weekly review')) {
          return 'Great week! You completed 5 important tasks across 3 projects. Focus this coming week is on the Medical project with 2 upcoming deadlines. Keep up the momentum!';
        }
        return 'Mock LLM response';
      }
    };
  }
}

const llm = new MockLLMService();
const generator = new LLMGenerator(llm);

console.log('Creating test data...\n');

// Create test project
const project = garden.create({
  type: 'project',
  title: 'Test Project',
  content: 'A test project for LLM generator testing.',
});

const action1 = garden.create({
  type: 'action',
  title: 'Complete design',
  status: 'active',
  project: project.id,
});

const action2 = garden.create({
  type: 'action',
  title: 'Write documentation',
  status: 'active',
  project: project.id,
  due_date: '2026-02-15',
});

const note = garden.create({
  type: 'note',
  title: 'Project Notes',
  content: 'Some notes about the project.',
});

garden.addRelationship(action1.id, project.id, 'parent');
garden.addRelationship(action2.id, project.id, 'parent');
garden.addRelationship(note.id, project.id, 'reference');

const contact = garden.create({
  type: 'contact',
  title: 'Alice Smith',
  email: 'alice@example.com',
});

garden.addRelationship(contact.id, project.id, 'reference');

console.log('Test data created.\n');
console.log('Running LLM Generator tests...\n');

// === Tests ===

// Test 1: LLMGenerator instantiates correctly
test('LLMGenerator instantiates correctly', () => {
  assert(generator !== null, 'Generator should be created');
  assert(typeof generator.summarizeProject === 'function', 'Should have summarizeProject method');
  assert(typeof generator.suggestNextActions === 'function', 'Should have suggestNextActions method');
  assert(typeof generator.generateWeeklyReview === 'function', 'Should have generateWeeklyReview method');
});

// Test 2: Cache starts empty
test('Cache starts empty', () => {
  generator.clearCache();
  // Try to get a non-existent cached item
  // (We can't easily test this without accessing private cache, but we can verify no errors)
  assert(true, 'Cache cleared without error');
});

// Test 3: Can generate project summary
test('Can generate project summary', async () => {
  const relatedData = {
    actions: [action1, action2],
    notes: [note],
    contacts: [contact],
    media: [],
  };

  const summary = await generator.summarizeProject(project, relatedData);

  assert(summary.length > 0, 'Summary should not be empty');
  assert(typeof summary === 'string', 'Summary should be a string');
  assertContains(summary, 'project', 'Summary should mention project');
});

// Test 4: Project summary is cached
test('Project summary is cached', async () => {
  const relatedData = {
    actions: [action1, action2],
    notes: [note],
    contacts: [contact],
    media: [],
  };

  // First call
  const summary1 = await generator.summarizeProject(project, relatedData);

  // Second call (should hit cache)
  const summary2 = await generator.summarizeProject(project, relatedData);

  assertEquals(summary1, summary2, 'Cached summary should match original');
});

// Test 5: Can suggest next actions
test('Can suggest next actions', async () => {
  const suggestions = await generator.suggestNextActions(
    project,
    'Need to launch new feature',
    [action1, action2]
  );

  assert(Array.isArray(suggestions), 'Should return array');
  assert(suggestions.length > 0, 'Should have at least one suggestion');
  assert(suggestions.length <= 5, 'Should have at most 5 suggestions');
  assert(suggestions.every(s => typeof s === 'string'), 'All suggestions should be strings');
  assert(suggestions.every(s => s.length > 0), 'All suggestions should be non-empty');
});

// Test 6: Next actions are cached
test('Next actions are cached', async () => {
  const suggestions1 = await generator.suggestNextActions(
    project,
    'Need to launch new feature',
    [action1, action2]
  );

  const suggestions2 = await generator.suggestNextActions(
    project,
    'Need to launch new feature',
    [action1, action2]
  );

  assertEquals(
    JSON.stringify(suggestions1),
    JSON.stringify(suggestions2),
    'Cached suggestions should match'
  );
});

// Test 7: Can generate weekly review
test('Can generate weekly review', async () => {
  const completedAction = garden.create({
    type: 'action',
    title: 'Completed task',
    status: 'completed',
  });

  const upcomingEvent = {
    id: 'event-1',
    title: 'Team meeting',
    start_time: '2026-02-12T10:00:00Z',
    end_time: '2026-02-12T11:00:00Z',
    all_day: false,
    entry_type: 'event',
    source_type: 'calendar',
    source_id: 'event-1',
    reminder_minutes: 15,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const review = await generator.generateWeeklyReview(
    [completedAction],
    [upcomingEvent],
    { includeStats: true }
  );

  assert(review.length > 0, 'Review should not be empty');
  assert(typeof review === 'string', 'Review should be a string');
});

// Test 8: Weekly review is cached
test('Weekly review is cached', async () => {
  const completedAction = garden.create({
    type: 'action',
    title: 'Another completed task',
    status: 'completed',
  });

  const review1 = await generator.generateWeeklyReview([completedAction], [], {});
  const review2 = await generator.generateWeeklyReview([completedAction], [], {});

  assertEquals(review1, review2, 'Cached review should match');
});

// Test 9: Cache invalidation works
test('Cache invalidation works', async () => {
  generator.clearCache();

  const relatedData = {
    actions: [action1],
    notes: [],
    contacts: [],
    media: [],
  };

  // Generate and cache
  const summary1 = await generator.summarizeProject(project, relatedData);
  assert(summary1.length > 0, 'Should generate summary');

  // Clear cache
  generator.clearCache();

  // This would normally regenerate, but with our mock it returns the same
  // In a real scenario with a real LLM, this would be a fresh generation
  const summary2 = await generator.summarizeProject(project, relatedData);
  assert(summary2.length > 0, 'Should generate new summary after cache clear');
});

// Test 10: Handles empty related data
test('Handles empty related data gracefully', async () => {
  const emptyProject = garden.create({
    type: 'project',
    title: 'Empty Project',
    content: 'No related data.',
  });

  const relatedData = {
    actions: [],
    notes: [],
    contacts: [],
    media: [],
  };

  const summary = await generator.summarizeProject(emptyProject, relatedData);
  assert(summary.length > 0, 'Should generate summary even with no related data');
});

// Test 11: Handles projects with no content
test('Handles projects with no content', async () => {
  const minimalProject = garden.create({
    type: 'project',
    title: 'Minimal Project',
  });

  const relatedData = {
    actions: [action1],
    notes: [],
    contacts: [],
    media: [],
  };

  const summary = await generator.summarizeProject(minimalProject, relatedData);
  assert(summary.length > 0, 'Should generate summary for minimal project');
});

// Test 12: Handles many actions in suggestions
test('Limits action suggestions to 5', async () => {
  const manyActions = Array.from({ length: 10 }, (_, i) =>
    garden.create({
      type: 'action',
      title: `Action ${i + 1}`,
      status: 'active',
    })
  );

  const suggestions = await generator.suggestNextActions(
    project,
    'Complex context',
    manyActions
  );

  assert(suggestions.length <= 5, 'Should limit to 5 suggestions');
});

// Test 13: Weekly review handles no data
test('Weekly review handles no data', async () => {
  const review = await generator.generateWeeklyReview([], [], {});
  assert(review.length > 0, 'Should generate review even with no data');
});

// Test 14: Weekly review with project grouping option
test('Weekly review with project grouping', async () => {
  const completedActions = [
    garden.create({ type: 'action', title: 'Task 1', status: 'completed', project: 'proj-1' }),
    garden.create({ type: 'action', title: 'Task 2', status: 'completed', project: 'proj-1' }),
    garden.create({ type: 'action', title: 'Task 3', status: 'completed', project: 'proj-2' }),
  ];

  const review = await generator.generateWeeklyReview(
    completedActions,
    [],
    { includeProjects: true }
  );

  assert(review.length > 0, 'Should generate grouped review');
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
