/**
 * Command Parser Tests
 *
 * Run with: tsx src/server/command-parser.test.ts
 */

import { strict as assert } from 'assert';
import { parseCommand } from './command-parser.js';

// Test utilities
let testCount = 0;
let passCount = 0;

function test(name: string, fn: () => void) {
  testCount++;
  try {
    fn();
    passCount++;
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    console.error(`  ${error}`);
  }
}

// ============================================
// Note Command Tests
// ============================================

test('parses simple note command', () => {
  const result = parseCommand('note meeting notes');
  assert.equal(result.type, 'create_note');
  assert.equal(result.confidence, 'high');
  if (result.type === 'create_note') {
    assert.equal(result.title, 'meeting notes');
  }
});

test('parses note with project', () => {
  const result = parseCommand('note meeting +project-x');
  if (result.type === 'create_note') {
    assert.equal(result.title, 'meeting');
    assert.equal(result.metadata.project, 'project-x');
  }
});

test('parses note with project and tags', () => {
  const result = parseCommand('note meeting +project-x #important #urgent');
  if (result.type === 'create_note') {
    assert.equal(result.title, 'meeting');
    assert.equal(result.metadata.project, 'project-x');
    assert.deepEqual(result.metadata.tags, ['important', 'urgent']);
  }
});

test('parses note with all metadata', () => {
  const result = parseCommand('note meeting +project-x #important @work with alice');
  if (result.type === 'create_note') {
    assert.equal(result.title, 'meeting');
    assert.equal(result.metadata.project, 'project-x');
    assert.deepEqual(result.metadata.tags, ['important']);
    assert.equal(result.metadata.context, '@work');
    assert.equal(result.metadata.contact, 'alice');
  }
});

test('handles note with "new" prefix', () => {
  const result = parseCommand('new note test');
  assert.equal(result.type, 'create_note');
  if (result.type === 'create_note') {
    assert.equal(result.title, 'test');
  }
});

test('rejects note without title', () => {
  const result = parseCommand('note +project-x');
  assert.equal(result.type, 'unknown');
  if (result.type === 'unknown') {
    assert.ok(result.reason?.includes('title'));
  }
});

// ============================================
// Action Command Tests
// ============================================

test('parses simple action command', () => {
  const result = parseCommand('action call bob');
  assert.equal(result.type, 'create_action');
  if (result.type === 'create_action') {
    assert.equal(result.title, 'call bob');
  }
});

test('parses action with context', () => {
  const result = parseCommand('action call bob @phone');
  if (result.type === 'create_action') {
    assert.equal(result.title, 'call bob');
    assert.equal(result.metadata.context, '@phone');
  }
});

test('parses action with due date', () => {
  const result = parseCommand('action finish report due:friday');
  if (result.type === 'create_action') {
    assert.equal(result.title, 'finish report');
    assert.equal(result.metadata.dueDate, 'friday');
  }
});

test('parses action with project and context', () => {
  const result = parseCommand('action email team +project-x @work');
  if (result.type === 'create_action') {
    assert.equal(result.title, 'email team');
    assert.equal(result.metadata.project, 'project-x');
    assert.equal(result.metadata.context, '@work');
  }
});

// ============================================
// Project Command Tests
// ============================================

test('parses simple project command', () => {
  const result = parseCommand('project website redesign');
  assert.equal(result.type, 'create_project');
  if (result.type === 'create_project') {
    assert.equal(result.name, 'website redesign');
  }
});

test('parses project with tags', () => {
  const result = parseCommand('project launch #client #urgent');
  if (result.type === 'create_project') {
    assert.equal(result.name, 'launch');
    assert.deepEqual(result.tags, ['client', 'urgent']);
  }
});

// ============================================
// Event Command Tests
// ============================================

test('parses event with time', () => {
  const result = parseCommand('event standup at 10am tomorrow');
  assert.equal(result.type, 'create_event');
  if (result.type === 'create_event') {
    assert.equal(result.title, 'standup');
    assert.equal(result.dateStr, '10am tomorrow');
  }
});

test('parses event with project', () => {
  const result = parseCommand('event launch +project-x at 2026-03-15 14:00');
  if (result.type === 'create_event') {
    assert.equal(result.title, 'launch');
    assert.equal(result.project, 'project-x');
    assert.equal(result.dateStr, '2026-03-15 14:00');
  }
});

test('rejects event without time', () => {
  const result = parseCommand('event standup');
  assert.equal(result.type, 'unknown');
  if (result.type === 'unknown') {
    assert.ok(result.reason?.includes('time'));
  }
});

// ============================================
// Show Command Tests
// ============================================

test('parses show inbox', () => {
  const result = parseCommand('show inbox');
  assert.equal(result.type, 'show_panel');
  if (result.type === 'show_panel') {
    assert.equal(result.panel, 'inbox');
  }
});

test('parses show notes', () => {
  const result = parseCommand('show notes');
  assert.equal(result.type, 'show_panel');
  if (result.type === 'show_panel') {
    assert.equal(result.panel, 'notes');
  }
});

test('parses show next actions', () => {
  const result = parseCommand('show next actions');
  assert.equal(result.type, 'show_panel');
  if (result.type === 'show_panel') {
    assert.equal(result.panel, 'next-actions');
  }
});

test('parses show project', () => {
  const result = parseCommand('show project website-redesign');
  assert.equal(result.type, 'show_project');
  if (result.type === 'show_project') {
    assert.equal(result.projectName, 'website-redesign');
  }
});

test('parses show note with ID', () => {
  const result = parseCommand('show note abc123');
  assert.equal(result.type, 'show_note');
  if (result.type === 'show_note') {
    assert.equal(result.noteId, 'abc123');
  }
});

// ============================================
// List Command Tests
// ============================================

test('parses list notes', () => {
  const result = parseCommand('list notes');
  assert.equal(result.type, 'list_items');
  if (result.type === 'list_items') {
    assert.equal(result.itemType, 'notes');
  }
});

test('parses list actions in project', () => {
  const result = parseCommand('list actions in project-x');
  if (result.type === 'list_items') {
    assert.equal(result.itemType, 'actions');
    assert.equal(result.filters?.project, 'project-x');
  }
});

test('parses list overdue actions', () => {
  const result = parseCommand('list overdue actions');
  if (result.type === 'list_items') {
    assert.equal(result.itemType, 'actions');
    assert.equal(result.filters?.status, 'overdue');
  }
});

test('parses list projects', () => {
  const result = parseCommand('list projects');
  if (result.type === 'list_items') {
    assert.equal(result.itemType, 'projects');
  }
});

// ============================================
// Done Command Tests
// ============================================

test('parses done with ID', () => {
  const result = parseCommand('done action-123');
  assert.equal(result.type, 'mark_done');
  if (result.type === 'mark_done') {
    assert.equal(result.actionId, 'action-123');
    assert.equal(result.confidence, 'high');
  }
});

test('parses complete with title', () => {
  const result = parseCommand('complete call bob');
  assert.equal(result.type, 'mark_done');
  if (result.type === 'mark_done') {
    assert.equal(result.actionId, 'call bob');
    assert.equal(result.confidence, 'medium');
  }
});

// ============================================
// Delete Command Tests
// ============================================

test('parses delete note with ID', () => {
  const result = parseCommand('delete note note-123');
  assert.equal(result.type, 'delete_item');
  if (result.type === 'delete_item') {
    assert.equal(result.itemType, 'note');
    assert.equal(result.itemId, 'note-123');
    assert.equal(result.confidence, 'high');
  }
});

test('parses delete project with title', () => {
  const result = parseCommand('delete project old website');
  if (result.type === 'delete_item') {
    assert.equal(result.itemType, 'project');
    assert.equal(result.itemTitle, 'old website');
    assert.equal(result.confidence, 'medium');
  }
});

// ============================================
// Search Command Tests
// ============================================

test('parses find notes', () => {
  const result = parseCommand('find notes about meeting');
  assert.equal(result.type, 'search');
  if (result.type === 'search') {
    assert.equal(result.itemType, 'notes');
    assert.equal(result.query, 'meeting');
  }
});

test('parses search with tag', () => {
  const result = parseCommand('search #important');
  assert.equal(result.type, 'search');
  if (result.type === 'search') {
    assert.equal(result.query, '#important');
  }
});

test('parses find actions for person', () => {
  const result = parseCommand('find actions for alice');
  if (result.type === 'search') {
    assert.equal(result.itemType, 'actions');
    assert.equal(result.query, 'alice');
  }
});

// ============================================
// Unknown Command Tests
// ============================================

test('handles empty input', () => {
  const result = parseCommand('');
  assert.equal(result.type, 'unknown');
  if (result.type === 'unknown') {
    assert.ok(result.reason);
    assert.ok(result.suggestions);
  }
});

test('handles unrecognized command', () => {
  const result = parseCommand('foobar baz qux');
  assert.equal(result.type, 'unknown');
  if (result.type === 'unknown') {
    assert.ok(result.reason);
    assert.ok(result.suggestions);
  }
});

// ============================================
// Edge Cases
// ============================================

test('handles extra whitespace', () => {
  const result = parseCommand('  note   test   ');
  assert.equal(result.type, 'create_note');
  if (result.type === 'create_note') {
    assert.equal(result.title, 'test');
  }
});

test('handles mixed case', () => {
  const result = parseCommand('NOTE Test +Project #TAG');
  assert.equal(result.type, 'create_note');
  if (result.type === 'create_note') {
    assert.equal(result.title, 'Test');
    assert.equal(result.metadata.project, 'Project');
    assert.deepEqual(result.metadata.tags, ['TAG']);
  }
});

test('preserves special characters in title', () => {
  const result = parseCommand('note test & test');
  if (result.type === 'create_note') {
    assert.equal(result.title, 'test & test');
  }
});

test('handles multiple spaces in metadata', () => {
  const result = parseCommand('note test  +project-x  #tag');
  if (result.type === 'create_note') {
    assert.equal(result.title, 'test');
    assert.equal(result.metadata.project, 'project-x');
  }
});

// ============================================
// Results
// ============================================

console.log(`\n${passCount}/${testCount} tests passed`);
if (passCount === testCount) {
  console.log('✓ All tests passed!');
  process.exit(0);
} else {
  console.log(`✗ ${testCount - passCount} tests failed`);
  process.exit(1);
}
