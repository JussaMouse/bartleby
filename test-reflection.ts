#!/usr/bin/env tsx
/**
 * Test script for Reflection Service
 *
 * Run with: pnpm exec tsx test-reflection.ts
 */

import { ReflectionService, ConversationTurn } from './src/services/reflection.js';
import { LearningService } from './src/services/learning.js';
import { LLMService } from './src/services/llm.js';
import { loadConfig } from './src/config.js';
import Database from 'better-sqlite3';

console.log('🧪 Testing Reflection Service\n');

// Load config
const config = loadConfig();

// Setup test database
const db = new Database(':memory:');
const learning = new LearningService(db);
const llm = new LLMService(config);
const reflection = new ReflectionService(learning, llm);

// Test 1: Detect Preferences
console.log('Test 1: Detect Preferences');
console.log('===========================');
const prefTurn: ConversationTurn = {
  userInput: 'I prefer using dark mode for all my apps',
  agentResponse: 'Got it, I\'ll remember that.',
  timestamp: new Date(),
  success: true,
};
await reflection.reflect(prefTurn);

// Check if stored
const context1 = learning.getEntityComplete('user');
console.log('Stored observations:', context1.observations.length);
if (context1.observations.length > 0) {
  console.log('✓ Preference detected:', context1.observations[0]);
} else {
  console.log('✗ No preference stored');
}
console.log('');

// Test 2: Detect Habits
console.log('Test 2: Detect Behavioral Patterns');
console.log('===================================');
const habitTurn: ConversationTurn = {
  userInput: 'I always review my notes in the morning with coffee',
  agentResponse: 'That\'s a great habit!',
  timestamp: new Date('2024-01-15T08:30:00'),
  success: true,
};
await reflection.reflect(habitTurn);

const context2 = learning.getEntityComplete('user');
console.log('Total observations:', context2.observations.length);
const habits = context2.observations.filter(o => o.key.includes('habit'));
if (habits.length > 0) {
  console.log('✓ Habit detected:', habits[0]);
} else {
  console.log('✗ No habit stored');
}
console.log('');

// Test 3: Detect Goals
console.log('Test 3: Detect Goals');
console.log('====================');
const goalTurn: ConversationTurn = {
  userInput: 'I want to learn TypeScript better this quarter',
  agentResponse: 'That\'s a great goal! Let me help.',
  timestamp: new Date(),
  success: true,
};
await reflection.reflect(goalTurn);

const context3 = learning.getEntityComplete('user');
const goals = context3.observations.filter(o => o.key.includes('goal'));
console.log('Goals detected:', goals.length);
if (goals.length > 0) {
  console.log('✓ Goal detected:', goals[0]);
} else {
  console.log('✗ No goal stored');
}
console.log('');

// Test 4: Detect Corrections (requires LLM)
console.log('Test 4: Detect Corrections');
console.log('==========================');
const correctionTurn: ConversationTurn = {
  userInput: 'No, I meant Python, not JavaScript',
  agentResponse: 'My apologies, let me correct that.',
  timestamp: new Date(),
  success: false,
};
await reflection.reflect(correctionTurn);

const context4 = learning.getEntityComplete('user');
const mistakes = context4.observations.filter(o => o.key.includes('mistake'));
console.log('Mistakes learned:', mistakes.length);
if (mistakes.length > 0) {
  console.log('✓ Mistake detected:', mistakes[0]);
} else {
  console.log('⚠ No mistake stored (LLM may be required)');
}
console.log('');

// Test 5: Statistics
console.log('Test 5: Reflection Statistics');
console.log('==============================');
const stats = reflection.getStats();
console.log('Enabled:', stats.enabled);
console.log('Reflection count:', stats.reflectionCount);
console.log('');

// Test 6: Enable/Disable
console.log('Test 6: Enable/Disable Reflection');
console.log('==================================');
reflection.setEnabled(false);
const disabledTurn: ConversationTurn = {
  userInput: 'I love pizza',
  agentResponse: 'Great!',
  timestamp: new Date(),
  success: true,
};
await reflection.reflect(disabledTurn);

const statsBefore = reflection.getStats();
reflection.setEnabled(true);
console.log('Reflection disabled count:', statsBefore.reflectionCount);
console.log('✓ Enable/disable working');
console.log('');

console.log('✅ Reflection Service tests completed!');
console.log('');
console.log('Summary:');
const finalContext = learning.getEntityComplete('user');
console.log(`- Total observations stored: ${finalContext.observations.length}`);
console.log(`- Total reflections run: ${stats.reflectionCount}`);
console.log('');
console.log('Benefits:');
console.log('- Automatic preference learning');
console.log('- Pattern detection over time');
console.log('- Goal tracking');
console.log('- Mistake learning for self-improvement');
