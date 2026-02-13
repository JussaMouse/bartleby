// test-agent-context.ts
// Test that agent uses context from learning system

import { loadConfig } from './src/config.js';
import { initServices } from './src/services/index.js';
import { Agent } from './src/agent/index.js';

async function main() {
  console.log('\n🤖 Testing Agent Context Integration\n');
  console.log('='.repeat(60));

  const config = loadConfig();
  const services = await initServices(config);
  const agent = new Agent(services);

  console.log('✓ Services initialized\n');

  // Seed the learning system with observations
  console.log('📝 Seeding learning system with user observations...\n');

  services.learning.recordObservation({
    entityId: 'user',
    key: 'preference.code_style',
    value: 'tabs',
    sourceType: 'stated',
    confidence: 1.0
  });
  console.log('  ✓ preference.code_style = tabs');

  services.learning.recordObservation({
    entityId: 'user',
    key: 'preference.verbosity',
    value: 'concise',
    sourceType: 'inferred',
    confidence: 0.9
  });
  console.log('  ✓ preference.verbosity = concise');

  services.learning.recordObservation({
    entityId: 'user',
    key: 'goal.current',
    value: 'Complete unified learning system integration',
    sourceType: 'stated',
    confidence: 1.0
  });
  console.log('  ✓ goal.current = Complete unified learning system integration');

  services.learning.recordObservation({
    entityId: 'user',
    key: 'pattern.work_hours',
    value: '{"start": "09:00", "end": "17:00", "timezone": "EST"}',
    valueType: 'json',
    sourceType: 'computed',
    confidence: 0.8
  });
  console.log('  ✓ pattern.work_hours = 9am-5pm EST');

  // Create a fake recent work record
  const testRecordId = services.learning.createEntity('record', {
    title: 'Learning system architecture notes',
    type: 'note'
  });

  services.learning.recordRelationship({
    fromEntity: 'user',
    toEntity: testRecordId,
    relationType: 'created'
  });

  services.learning.recordObservation({
    entityId: testRecordId,
    key: 'project',
    value: 'bartleby',
    sourceType: 'extracted',
    confidence: 1.0
  });

  services.learning.recordObservation({
    entityId: testRecordId,
    key: 'topic',
    value: 'architecture',
    sourceType: 'extracted',
    confidence: 0.9
  });

  console.log('  ✓ Created record with project and topic\n');

  // Now test that the agent sees this context
  console.log('='.repeat(60));
  console.log('\n🎯 Testing Agent Awareness...\n');

  // Test 1: Ask about preferences (should be aware)
  console.log('❓ Question: "What do you know about my preferences?"\n');

  try {
    const response1 = await agent.handleSimple('What do you know about my preferences?');
    console.log('🤖 Agent Response:');
    console.log(`   ${response1}\n`);
  } catch (err: any) {
    console.log(`   ⚠️  Agent failed (LLM not configured): ${err.message}\n`);
  }

  // Test 2: Check if context is being built
  console.log('='.repeat(60));
  console.log('\n📊 Verifying Context Building...\n');

  // Access the private method via type assertion (for testing)
  const richContext = await (agent as any).buildRichContext('test query');

  console.log('📝 Profile Section:');
  console.log(richContext.profile);
  console.log('\n📝 Context Section:');
  console.log(richContext.context);

  console.log('\n' + '='.repeat(60));

  if (richContext.profile.includes('tabs')) {
    console.log('✅ Agent CAN see user preferences!');
  } else {
    console.log('❌ Agent NOT seeing preferences');
  }

  if (richContext.context.includes('bartleby')) {
    console.log('✅ Agent CAN see recent work!');
  } else {
    console.log('❌ Agent NOT seeing recent work');
  }

  if (richContext.profile.includes('Complete unified learning system')) {
    console.log('✅ Agent CAN see user goals!');
  } else {
    console.log('❌ Agent NOT seeing user goals');
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ Agent context integration test complete!\n');

  services.garden.close();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
