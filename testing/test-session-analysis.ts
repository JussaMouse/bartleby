// test-session-analysis.ts
// Test LLM-powered session analysis

import { loadConfig } from './src/config.js';
import { GardenService } from './src/services/garden.js';
import { LearningService } from './src/services/learning.js';
import { LLMService } from './src/services/llm.js';
import { ContextService } from './src/services/context.js';

async function main() {
  console.log('\n🧠 Testing LLM-Powered Session Analysis\n');
  console.log('='.repeat(60));

  const config = loadConfig();

  // Initialize services
  const garden = new GardenService(config);
  await garden.initialize();

  const learning = new LearningService(garden.getDatabase());
  const llm = new LLMService(config);
  await llm.initialize();

  const context = new ContextService(config);
  await context.initialize();
  context.setServices(learning, llm);

  console.log('✓ Services initialized\n');

  // Start a session
  context.startSession();
  const sessionId = context.getCurrentSessionId();
  console.log(`📝 Started session: ${sessionId}\n`);

  // Simulate conversation
  const conversation = [
    ['User', 'I prefer using tabs for indentation, not spaces'],
    ['Bartleby', 'Got it, I\'ll remember that you prefer tabs'],
    ['User', 'My current goal is to finish the learning system integration'],
    ['Bartleby', 'That\'s a great goal. I can help track your progress'],
    ['User', 'Can you create a note about the unified memory architecture?'],
    ['Bartleby', '✓ Created note "Unified memory architecture"'],
    ['User', 'What are the next steps for implementation?'],
    ['Bartleby', 'Based on the roadmap, Phase 2 includes LLM analysis, context building, and background jobs'],
  ];

  console.log('💬 Conversation:');
  for (const [role, message] of conversation) {
    context.recordMessage(message, role === 'User');
    console.log(`  ${role}: ${message}`);
  }
  console.log();

  // End session - this triggers LLM analysis
  console.log('🤖 Ending session and triggering LLM analysis...\n');
  await context.endSession();

  // Check what was learned
  console.log('='.repeat(60));
  console.log('\n📊 Analysis Results:\n');

  if (!sessionId) {
    console.error('No session ID!');
    process.exit(1);
  }

  // Get observations about the user
  console.log('👤 USER OBSERVATIONS:');
  const userObs = learning.getObservations('user', { notExpired: true });
  for (const obs of userObs.filter(o => o.sourceId === sessionId)) {
    console.log(`  - ${obs.key}: ${obs.value} (${Math.round(obs.confidence * 100)}% confident)`);
  }

  // Get observations about the session
  console.log('\n📋 SESSION OBSERVATIONS:');
  const sessionObs = learning.getObservations(sessionId);
  for (const obs of sessionObs) {
    console.log(`  - ${obs.key}: ${obs.value.slice(0, 60)}${obs.value.length > 60 ? '...' : ''}`);
  }

  // Get session summary
  console.log('\n📝 SESSION SUMMARY:');
  const summary = learning.getSessionSummary(sessionId);
  if (summary) {
    console.log(`  Summary: ${summary.summary}`);
    console.log(`  Topics: ${summary.topics.join(', ') || 'None'}`);
    console.log(`  Decisions: ${summary.decisions.join(', ') || 'None'}`);
    console.log(`  Unresolved: ${summary.unresolved.join(', ') || 'None'}`);
    console.log(`  Artifacts: ${summary.artifacts.join(', ') || 'None'}`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ Session analysis complete!\n');

  garden.close();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
