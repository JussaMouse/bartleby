// test-learning-poc.ts
// Proof of concept for unified learning system
// Demonstrates observation recording and context building

import { loadConfig } from './src/config.js';
import { LearningService } from './src/services/learning.js';
import { GardenService } from './src/services/garden.js';

async function main() {
  console.log('\n🧠 Unified Learning System - Proof of Concept\n');
  console.log('='.repeat(60));

  const config = loadConfig();
  const garden = new GardenService(config);
  await garden.initialize();

  const learning = new LearningService(garden.getDatabase());

  // ========================================================================
  // Simulate a user session
  // ========================================================================

  console.log('\n📝 Simulating user session...\n');

  const sessionId = learning.createEntity('session', {
    messageCount: 10,
    duration: 300
  });
  console.log(`Created session entity: ${sessionId}`);

  // User explicitly states a preference
  learning.recordObservation({
    entityId: 'user',
    key: 'preference.code_style',
    value: 'tabs',
    sourceType: 'stated',
    sourceId: sessionId,
    confidence: 1.0
  });
  console.log('✓ Recorded stated preference: code_style = tabs');

  // User implicitly shows a pattern
  learning.recordObservation({
    entityId: 'user',
    key: 'pattern.preferred_command_style',
    value: 'natural_language',
    sourceType: 'inferred',
    sourceId: sessionId,
    confidence: 0.8
  });
  console.log('✓ Recorded inferred pattern: preferred_command_style = natural_language');

  // User mentions their current goal
  learning.recordObservation({
    entityId: 'user',
    key: 'goal.current',
    value: 'Build unified learning system for Bartleby',
    sourceType: 'stated',
    sourceId: sessionId,
    confidence: 1.0
  });
  console.log('✓ Recorded current goal');

  // ========================================================================
  // Simulate command execution
  // ========================================================================

  console.log('\n💬 Simulating command execution...\n');

  // Create a note via command
  const note = garden.create({
    type: 'note',
    title: 'Learning system design notes',
    content: 'EOR model for unified memory',
    project: 'bartleby',
    tags: ['architecture', 'memory'],
    status: 'active'
  });
  console.log(`Created note: "${note.title}" (${note.id})`);

  // Record command entity
  const commandId = learning.createEntity('command', {
    rawInput: 'note learning system design notes +bartleby #architecture',
    intent: 'create_note',
    success: true
  });
  console.log(`Created command entity: ${commandId}`);

  // Record observation about command result
  learning.recordObservation({
    entityId: commandId,
    key: 'result.record_id',
    value: note.id,
    sourceType: 'computed',
    sourceId: sessionId,
    confidence: 1.0
  });
  console.log('✓ Recorded command result');

  // Record relationships
  learning.recordRelationship({
    fromEntity: 'user',
    toEntity: sessionId,
    relationType: 'participated_in',
    sourceId: sessionId
  });
  console.log('✓ Recorded relationship: user participated_in session');

  learning.recordRelationship({
    fromEntity: commandId,
    toEntity: note.id,
    relationType: 'created',
    sourceId: sessionId
  });
  console.log('✓ Recorded relationship: command created note');

  learning.recordRelationship({
    fromEntity: commandId,
    toEntity: sessionId,
    relationType: 'part_of',
    sourceId: sessionId
  });
  console.log('✓ Recorded relationship: command part_of session');

  // ========================================================================
  // Record observations about the note
  // ========================================================================

  console.log('\n📊 Recording observations about the note...\n');

  learning.recordObservation({
    entityId: note.id,
    key: 'topic',
    value: 'architecture',
    sourceType: 'extracted',
    confidence: 0.95
  });

  learning.recordObservation({
    entityId: note.id,
    key: 'topic',
    value: 'memory',
    sourceType: 'extracted',
    confidence: 0.95
  });

  learning.recordObservation({
    entityId: note.id,
    key: 'view_count',
    value: '1',
    valueType: 'number',
    sourceType: 'computed',
    confidence: 1.0
  });
  console.log('✓ Recorded topics and view count for note');

  // ========================================================================
  // Simulate end of session - record session summary
  // ========================================================================

  console.log('\n📝 Recording session summary...\n');

  learning.recordObservation({
    entityId: sessionId,
    key: 'summary',
    value: 'Created note about learning system design with EOR architecture',
    sourceType: 'extracted',
    sourceId: sessionId,
    confidence: 0.95
  });

  learning.recordObservation({
    entityId: sessionId,
    key: 'topic',
    value: 'architecture',
    sourceType: 'extracted',
    sourceId: sessionId,
    confidence: 0.9
  });

  learning.recordObservation({
    entityId: sessionId,
    key: 'decision',
    value: 'Use Entity-Observation-Relationship model for unified memory',
    sourceType: 'extracted',
    sourceId: sessionId,
    confidence: 1.0
  });

  learning.recordObservation({
    entityId: sessionId,
    key: 'artifact.created',
    value: 'learning system design notes',
    sourceType: 'computed',
    sourceId: sessionId,
    confidence: 1.0
  });

  console.log('✓ Session summary recorded');

  // ========================================================================
  // Query the learning system
  // ========================================================================

  console.log('\n🔍 Querying the learning system...\n');
  console.log('='.repeat(60));

  // Get user profile
  console.log('\n👤 USER PROFILE:');
  const profile = learning.getUserProfile();
  console.log(`  Preferences:`, profile.preferences);
  console.log(`  Patterns:`, profile.patterns);
  console.log(`  Current Goal:`, profile.goals[0] || 'None');

  // Get session summary
  console.log('\n📋 SESSION SUMMARY:');
  const summary = learning.getSessionSummary(sessionId);
  if (summary) {
    console.log(`  Summary: ${summary.summary}`);
    console.log(`  Topics: ${summary.topics.join(', ')}`);
    console.log(`  Decisions: ${summary.decisions.join(', ')}`);
    console.log(`  Artifacts: ${summary.artifacts.join(', ')}`);
  }

  // Get complete entity view for the note
  console.log('\n📄 NOTE DETAILS:');
  const noteComplete = learning.getEntityComplete(note.id);
  console.log(`  Entity: ${noteComplete.entity?.type} (${noteComplete.entity?.id})`);
  console.log(`  Observations:`);
  for (const obs of noteComplete.observations) {
    console.log(`    - ${obs.key}: ${obs.value} (${Math.round(obs.confidence * 100)}% confident)`);
  }
  console.log(`  Relationships:`);
  for (const rel of noteComplete.relationships) {
    console.log(`    - ${rel.relationType} ${rel.fromEntity === note.id ? 'from' : 'to'} ${rel.fromEntity === note.id ? rel.toEntity : rel.fromEntity}`);
  }

  // Search observations
  console.log('\n🔎 SEARCH: "architecture"');
  const searchResults = learning.searchObservations('architecture', 5);
  for (const result of searchResults) {
    console.log(`  - [${result.entityId.slice(0, 8)}...] ${result.key}: ${result.value.slice(0, 60)}`);
  }

  // Get user's relationships
  console.log('\n🔗 USER RELATIONSHIPS:');
  const userRels = learning.getRelationships('user', { direction: 'from' });
  for (const rel of userRels) {
    console.log(`  - ${rel.relationType} → ${rel.toEntity.slice(0, 8)}...`);
  }

  // ========================================================================
  // Demonstrate context building
  // ========================================================================

  console.log('\n🎯 CONTEXT BUILDING FOR LLM:\n');
  console.log('='.repeat(60));

  const profile2 = learning.getUserProfile();
  const recentWork = learning.getRecentWorkContext(7);

  console.log('\n📝 LLM Context:');
  console.log('"""');
  console.log('You are Bartleby, the user\'s personal knowledge assistant.');
  console.log('');
  console.log('USER PROFILE:');
  console.log(`- Code style: ${profile2.preferences.code_style || 'unknown'}`);
  console.log(`- Preferred command style: ${profile2.patterns.preferred_command_style || 'unknown'}`);
  console.log(`- Current goal: ${profile2.goals[0] || 'None specified'}`);
  console.log('');
  console.log('RECENT WORK (last 7 days):');
  console.log(`- Created ${recentWork.records.length} records`);
  console.log(`- Active topics: ${recentWork.topics.join(', ')}`);
  console.log(`- Active projects: ${recentWork.projects.join(', ')}`);
  console.log('');
  console.log('Respond with awareness of the user\'s goals, preferences, and recent work.');
  console.log('"""');

  // ========================================================================
  // Cleanup
  // ========================================================================

  console.log('\n');
  console.log('='.repeat(60));
  console.log('✅ Proof of concept complete!\n');
  console.log('The learning system successfully:');
  console.log('  ✓ Recorded user preferences and patterns');
  console.log('  ✓ Tracked command execution and results');
  console.log('  ✓ Created relationships between entities');
  console.log('  ✓ Stored observations about garden records');
  console.log('  ✓ Built rich context for LLM prompts');
  console.log('  ✓ Provided full-text search across observations');
  console.log('');

  garden.close();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
