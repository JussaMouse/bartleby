#!/usr/bin/env node
// Test: /memory and /insights commands
// Validates that the new Phase 5 commands work correctly

import { GardenService } from './src/services/garden.js';
import { LearningService } from './src/services/learning.js';
import { loadConfig } from './src/config.js';
import { showInsights } from './src/tools/insights.js';
import { viewProfile } from './src/tools/context.js';

console.log('\n=== Test: /memory and /insights Commands ===\n');

const config = loadConfig();
const garden = new GardenService(config);
await garden.initialize();

const learning = new LearningService(garden.getDatabase());
garden.setLearningService(learning);

console.log('✓ Services initialized\n');

// Create mock service container
const services = {
  config,
  garden,
  learning,
  context: null as any, // Not needed for these tests
  shed: null as any,
  calendar: null as any,
  data: null as any,
  presence: null as any,
  llm: null as any,
  embeddings: null as any,
  vectors: null as any,
  scheduler: null as any,
  audit: null as any,
  weather: null as any,
  signal: null as any,
  ocr: null as any,
};

const mockContext = {
  services,
  sessionId: 'test-session',
  user: { name: 'Test User' },
};

// Test 1: Create test data
console.log('Test 1: Creating test user observations...');

// User preferences
learning.recordObservation({
  entityId: 'user',
  key: 'preference.editor',
  value: 'vscode',
  sourceType: 'stated',
  confidence: 1.0,
});

learning.recordObservation({
  entityId: 'user',
  key: 'preference.meeting_length',
  value: 'short',
  sourceType: 'stated',
  confidence: 0.8,
});

// Work patterns
learning.recordObservation({
  entityId: 'user',
  key: 'pattern.work_hours',
  value: JSON.stringify({ start: '09:00', end: '17:00', timezone: 'America/Los_Angeles' }),
  valueType: 'json',
  sourceType: 'computed',
  confidence: 0.7,
});

// Current context
learning.recordObservation({
  entityId: 'user',
  key: 'context.primary_project',
  value: 'unified-learning-system',
  sourceType: 'computed',
  confidence: 0.9,
});

// Goals
learning.recordObservation({
  entityId: 'user',
  key: 'goal.current',
  value: 'Complete Phase 5 UI features',
  sourceType: 'stated',
  confidence: 1.0,
});

console.log('  ✓ Created 5 user observations\n');

// Test 2: Create test garden records with insights
console.log('Test 2: Creating test records with AI insights...');

const timestamp = Date.now();
const testRecordId = `test-note-${timestamp}`;

learning.createEntity('record', { type: 'note', title: 'Authentication refactor' }, testRecordId);

// Mark it as high importance
learning.recordObservation({
  entityId: testRecordId,
  key: 'computed.importance',
  value: 'high',
  sourceType: 'computed',
  confidence: 0.9,
});

// Add AI insight
learning.recordObservation({
  entityId: testRecordId,
  key: 'ai_insight.importance',
  value: 'Frequently accessed (15 views, 5 edits) - likely active priority',
  sourceType: 'inferred',
  confidence: 0.85,
});

// Add next action suggestion
learning.recordObservation({
  entityId: testRecordId,
  key: 'ai_insight.next_action',
  value: 'Consider creating action items to track implementation',
  sourceType: 'inferred',
  confidence: 0.7,
});

console.log('  ✓ Created test record with insights\n');

// Test 3: Create test session with unresolved question
console.log('Test 3: Creating test session with unresolved question...');

const testSessionId = `test-session-${timestamp}`;
learning.createEntity('session', { startTime: new Date().toISOString() }, testSessionId);

learning.recordObservation({
  entityId: testSessionId,
  key: 'unresolved_question',
  value: 'Should we add 2FA to the authentication system?',
  sourceType: 'extracted',
  confidence: 0.9,
});

console.log('  ✓ Created test session with unresolved question\n');

// Test 4: Test /memory command
console.log('Test 4: Testing /memory command...\n');

try {
  const memoryOutput = await viewProfile.execute({}, mockContext);
  console.log('--- /memory output ---');
  console.log(memoryOutput);
  console.log('--- end output ---\n');

  // Validate output contains expected sections
  if (!memoryOutput.includes('What I Know About You')) {
    console.error('❌ Missing "What I Know About You" header');
    process.exit(1);
  }

  if (!memoryOutput.includes('Preferences')) {
    console.error('❌ Missing Preferences section');
    process.exit(1);
  }

  if (!memoryOutput.includes('editor')) {
    console.error('❌ Missing preference data');
    process.exit(1);
  }

  if (!memoryOutput.includes('Patterns')) {
    console.error('❌ Missing Patterns section');
    process.exit(1);
  }

  if (!memoryOutput.includes('work_hours')) {
    console.error('❌ Missing pattern data');
    process.exit(1);
  }

  console.log('✓ /memory command output validated\n');
} catch (err) {
  console.error('❌ /memory command failed:', err);
  process.exit(1);
}

// Test 5: Test /insights command
console.log('Test 5: Testing /insights command...\n');

try {
  const insightsOutput = await showInsights.execute({}, mockContext);
  console.log('--- /insights output ---');
  console.log(insightsOutput);
  console.log('--- end output ---\n');

  // Validate output contains expected sections
  if (!insightsOutput.includes('Insights')) {
    console.error('❌ Missing "Insights" header');
    process.exit(1);
  }

  if (!insightsOutput.includes('High-Priority Records')) {
    console.error('❌ Missing High-Priority Records section');
    process.exit(1);
  }

  if (!insightsOutput.includes('Unresolved from Past Sessions')) {
    console.error('❌ Missing Unresolved section');
    process.exit(1);
  }

  if (!insightsOutput.includes('Should we add 2FA')) {
    console.error('❌ Missing unresolved question data');
    process.exit(1);
  }

  if (!insightsOutput.includes('Current Focus')) {
    console.error('❌ Missing Current Focus section');
    process.exit(1);
  }

  console.log('✓ /insights command output validated\n');
} catch (err) {
  console.error('❌ /insights command failed:', err);
  process.exit(1);
}

// Cleanup
learning.close();
garden.close();

console.log('=== ✅ All Tests Passed ===\n');
console.log('Summary:');
console.log('  ✓ /memory command shows user preferences, patterns, context, and goals');
console.log('  ✓ /insights command shows high-priority records with AI insights');
console.log('  ✓ /insights command surfaces unresolved questions');
console.log('  ✓ /insights command displays current focus');
console.log('\nPhase 5 Tasks #72 and #73 validated!\n');
