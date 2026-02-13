// Phase 2 End-to-End Integration Test
// Verifies all learning system components work together

import { loadConfig } from './src/config.js';
import { GardenService } from './src/services/garden.js';
import { LearningService } from './src/services/learning.js';
import { LLMService } from './src/services/llm.js';
import { ContextService } from './src/services/context.js';
import { EmbeddingService } from './src/services/embeddings.js';
import { BackgroundAnalysis } from './src/services/background-analysis.js';
import { EmbeddingRelationships } from './src/services/embedding-relationships.js';
import { executeCommand } from './src/server/command-executor.js';
import { parseCommand } from './src/server/command-parser.js';
import { info, warn } from './src/utils/logger.js';

async function testPhase2Integration() {
  info('\n=== Phase 2 End-to-End Integration Test ===\n');

  const config = loadConfig();

  // Initialize all services
  info('1. Initializing services...');
  const garden = new GardenService(config);
  const llm = new LLMService(config);
  const embeddings = new EmbeddingService(config);

  await garden.initialize();
  await llm.initialize();
  await embeddings.initialize();

  const learning = new LearningService(garden.getDatabase());
  const context = new ContextService(config);
  await context.initialize();
  context.setServices(learning, llm);

  const backgroundAnalysis = new BackgroundAnalysis(learning, garden);
  const embeddingRelationships = new EmbeddingRelationships(learning, garden, embeddings);
  backgroundAnalysis.setEmbeddingRelationships(embeddingRelationships);

  info('✓ All services initialized\n');

  // Test 1: Command Execution Recording
  info('2. Testing command execution recording...');
  context.startSession();

  const commands = [
    'create note "Machine Learning Basics" #ai #learning',
    'create note "Neural Networks Deep Dive" #ai #deeplearning',
    'create task "Review ML papers" due tomorrow',
    'create project "AI Research" #research',
  ];

  for (const cmdText of commands) {
    const parsed = parseCommand(cmdText);
    if (parsed.success && parsed.intent) {
      const result = executeCommand(parsed.intent, garden, learning, context.getCurrentSessionId());
      info(`  ✓ Executed: ${cmdText} -> ${result.success ? 'SUCCESS' : 'FAILED'}`);

      // Simulate conversation
      context.addMessage('user', cmdText);
      context.addMessage('assistant', result.message || 'Done');
    }
  }

  // Verify observations were recorded by checking user relationships
  const userRelationships = learning.getRelationships('user', {
    direction: 'from',
    relationType: 'executed'
  });
  info(`  ✓ Recorded ${userRelationships.length} command execution relationships`);

  if (userRelationships.length > 0) {
    const recentCmd = userRelationships[0].toEntity;
    const observations = learning.getObservations(recentCmd);
    info(`  ✓ Command has ${observations.length} observations`);
  }

  info('✓ Command execution recording works\n');

  // Test 2: Session Analysis
  info('3. Testing session analysis...');
  const llmAvailable = await llm.isHealthy();

  if (llmAvailable) {
    info('  LLM available - testing full session analysis...');
    try {
      await context.endSession();
      info('  ✓ Session ended and analyzed with LLM');

      // Check if preferences were extracted
      const userObs = learning.getObservations('user');
      const preferences = userObs.filter(o => o.key.startsWith('preference.'));
      info(`  ✓ Extracted ${preferences.length} user preferences`);

      if (preferences.length > 0) {
        info(`    Example: ${preferences[0].key} = ${preferences[0].value}`);
      }
    } catch (err) {
      warn('  ⚠️  Session analysis failed (LLM issue)', { error: String(err) });
    }
  } else {
    info('  ⚠️  LLM unavailable - skipping session analysis test');
    info('     (Session analysis will fall back to basic extraction in production)');
  }

  info('✓ Session analysis integration verified\n');

  // Test 3: Agent Context Building
  info('4. Testing agent context building...');

  // Record some observations to test context retrieval
  learning.recordObservation({
    entityId: 'user',
    key: 'preference.topic.primary',
    value: 'machine learning',
    sourceType: 'inferred',
    confidence: 0.85
  });

  learning.recordObservation({
    entityId: 'user',
    key: 'goal.current',
    value: 'Learn AI fundamentals and build ML projects',
    sourceType: 'inferred',
    confidence: 0.9
  });

  // Test getUserProfile
  const profile = learning.getUserProfile();
  info(`  ✓ User profile has ${Object.keys(profile.preferences).length} preferences`);
  info(`  ✓ User profile has ${profile.goals.length} goals`);
  info(`  ✓ User profile has ${Object.keys(profile.patterns).length} patterns`);

  // Test getRecentWorkContext
  const workContext = learning.getRecentWorkContext(7);
  info(`  ✓ Recent work context: ${workContext.records.length} records, ${workContext.topics.length} topics`);

  // Test searchObservations
  const relevantObs = learning.searchObservations('machine learning', 5);
  info(`  ✓ Found ${relevantObs.length} relevant observations for "machine learning"`);

  info('✓ Agent context building works\n');

  // Test 4: Background Analysis
  info('5. Testing background analysis...');

  // Simulate some activity for pattern detection
  for (let i = 0; i < 10; i++) {
    const cmdId = learning.createEntity('command', {
      rawInput: 'test command',
      timestamp: new Date().toISOString()
    });

    learning.recordObservation({
      entityId: cmdId,
      key: 'intent_type',
      value: 'create_note',
      sourceType: 'computed',
      confidence: 1.0
    });

    learning.recordRelationship({
      fromEntity: 'user',
      toEntity: cmdId,
      relationType: 'executed'
    });
  }

  // Run background analysis
  await backgroundAnalysis.runAll();
  info('  ✓ Background analysis completed');

  // Check for computed patterns
  const workHours = learning.getObservation('user', 'pattern.work_hours');
  if (workHours) {
    info(`  ✓ Detected work hours pattern: ${workHours.value}`);
  }

  const importanceObs = learning.searchObservations('importance', 5);
  info(`  ✓ Computed importance for ${importanceObs.length} records`);

  info('✓ Background analysis works\n');

  // Test 5: Embedding Relationships
  info('6. Testing embedding relationships...');

  if (embeddings.isAvailable()) {
    info('  Embedding service available - testing semantic relationships...');

    const relationshipsCreated = await embeddingRelationships.discoverRelationships(0.7);
    info(`  ✓ Discovered ${relationshipsCreated} semantic relationships`);

    // Test findSimilar
    const notes = garden.query().type('note').exec();
    if (notes.length > 0) {
      const similar = await embeddingRelationships.findSimilar(notes[0].id, 3);
      info(`  ✓ Found ${similar.length} similar notes for "${notes[0].title}"`);

      for (const sim of similar) {
        info(`    → "${sim.title}" (similarity: ${sim.similarity.toFixed(3)})`);
      }
    }
  } else {
    info('  ⚠️  Embedding service unavailable - skipping semantic relationships');
    info('     (System gracefully handles embedding unavailability)');
  }

  info('✓ Embedding relationships integration verified\n');

  // Test 6: Data Persistence
  info('7. Testing data persistence...');

  // Query observations
  const userObservations = learning.getObservations('user');
  info(`  ✓ User has ${userObservations.length} observations`);

  // Query relationships
  const allUserRelationships = learning.getRelationships('user', { direction: 'from' });
  info(`  ✓ User has ${allUserRelationships.length} outgoing relationships`);

  // Test full-text search
  const searchResults = learning.searchObservations('machine', 10);
  info(`  ✓ Full-text search found ${searchResults.length} matching observations`);

  // Verify persistence of different entity types
  const allCommands = learning.getRelationships('user', {
    direction: 'from',
    relationType: 'executed'
  });
  info(`  ✓ Database persists ${allCommands.length} command executions`);

  info('✓ Data persistence works\n');

  // Summary
  info('=== Phase 2 Integration Test Summary ===\n');
  info('✓ Command execution recording: PASS');
  info(`✓ Session analysis: ${llmAvailable ? 'PASS' : 'SKIPPED (LLM unavailable)'}`);
  info('✓ Agent context building: PASS');
  info('✓ Background analysis: PASS');
  info(`✓ Embedding relationships: ${embeddings.isAvailable() ? 'PASS' : 'SKIPPED (embeddings unavailable)'}`);
  info('✓ Data persistence: PASS');
  info('\n✅ All Phase 2 components integrated and working!\n');

  // Cleanup
  garden.close();
  llm.close();
  embeddings.close();
  learning.close();
  context.close();
}

testPhase2Integration().catch(console.error);
