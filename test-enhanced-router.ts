#!/usr/bin/env tsx
/**
 * Test script for Enhanced Router with Learning
 *
 * Run with: pnpm exec tsx test-enhanced-router.ts
 */

import { EnhancedRouter, RoutingDecision, RoutingOutcome } from './src/llm/enhanced-router.js';

console.log('🧪 Testing Enhanced Router\n');

const router = new EnhancedRouter();

// Test 1: Simple request routing
console.log('Test 1: Simple Request Classification');
console.log('======================================');
const simpleRequests = [
  'show tasks',
  'list projects',
  'help',
  'what is my name?',
];

for (const input of simpleRequests) {
  const decision = await router.routeRequest(input, false);
  console.log(`Input: "${input}"`);
  console.log(`  → Complexity: ${decision.complexity}, Tier: ${decision.tier}`);
  console.log(`  → Confidence: ${(decision.confidence * 100).toFixed(0)}%`);
  console.log(`  → Reason: ${decision.reason}`);
  console.log('');
}

// Test 2: Complex request routing
console.log('Test 2: Complex Request Classification');
console.log('=======================================');
const complexRequests = [
  'analyze all my tasks and create a weekly plan',
  'write a function to parse CSV files and then test it',
  'compare my notes from last week and summarize the themes',
  'import data.csv and then create a report',
];

for (const input of complexRequests) {
  const decision = await router.routeRequest(input, false);
  console.log(`Input: "${input}"`);
  console.log(`  → Complexity: ${decision.complexity}, Tier: ${decision.tier}`);
  console.log(`  → Confidence: ${(decision.confidence * 100).toFixed(0)}%`);
  console.log(`  → Signals: ${decision.signals.join(', ')}`);
  console.log('');
}

// Test 3: Record outcomes and learn
console.log('Test 3: Learning from Outcomes');
console.log('===============================');

// Simulate successful fast tier requests
for (let i = 0; i < 10; i++) {
  const decision = await router.routeRequest('show my tasks', false);
  router.recordOutcome({
    decision,
    success: true,
    responseTimeMs: 150 + Math.random() * 50,
  });
}

// Simulate some failed fast tier requests
for (let i = 0; i < 3; i++) {
  const decision = await router.routeRequest('show my tasks', false);
  router.recordOutcome({
    decision,
    success: false,
    responseTimeMs: 200,
    errorMessage: 'Connection timeout',
  });
}

// Simulate successful thinking tier requests
for (let i = 0; i < 5; i++) {
  const decision = await router.routeRequest('analyze all tasks and create plan', false);
  router.recordOutcome({
    decision,
    success: true,
    responseTimeMs: 2500 + Math.random() * 500,
  });
}

console.log('Recorded outcomes for learning...\n');

// Test 4: View statistics
console.log('Test 4: Routing Statistics');
console.log('===========================');
const stats = router.getStats();

for (const [tier, complexityStats] of Object.entries(stats)) {
  console.log(`${tier.toUpperCase()} tier:`);

  if (complexityStats.simple.totalRequests > 0) {
    console.log(`  Simple requests: ${complexityStats.simple.totalRequests}`);
    console.log(`    Success rate: ${(complexityStats.simple.successRate * 100).toFixed(0)}%`);
    console.log(`    Avg response time: ${complexityStats.simple.avgResponseTimeMs.toFixed(0)}ms`);
  }

  if (complexityStats.complex.totalRequests > 0) {
    console.log(`  Complex requests: ${complexityStats.complex.totalRequests}`);
    console.log(`    Success rate: ${(complexityStats.complex.successRate * 100).toFixed(0)}%`);
    console.log(`    Avg response time: ${complexityStats.complex.avgResponseTimeMs.toFixed(0)}ms`);
  }

  console.log('');
}

// Test 5: Get recommendations
console.log('Test 5: Optimization Recommendations');
console.log('=====================================');
const recommendations = router.getRecommendations();
if (recommendations.length > 0) {
  recommendations.forEach(rec => console.log(`• ${rec}`));
} else {
  console.log('No recommendations - routing is optimal!');
}
console.log('');

// Test 6: Recent outcomes
console.log('Test 6: Recent Routing Outcomes');
console.log('================================');
const recentOutcomes = router.getRecentOutcomes(5);
console.log(`Last ${recentOutcomes.length} routing decisions:\n`);
recentOutcomes.forEach((outcome, i) => {
  const status = outcome.success ? '✓' : '✗';
  console.log(`${i + 1}. ${status} ${outcome.decision.tier} (${outcome.decision.complexity})`);
  console.log(`   Time: ${outcome.responseTimeMs.toFixed(0)}ms`);
  if (outcome.errorMessage) {
    console.log(`   Error: ${outcome.errorMessage}`);
  }
});
console.log('');

console.log('✅ Enhanced Router tests completed!');
console.log('');
console.log('Benefits:');
console.log('- Confidence scoring for routing decisions');
console.log('- Historical performance tracking per tier');
console.log('- Adaptive routing based on success rates');
console.log('- Detailed signal analysis for complexity detection');
console.log('- Recommendations for optimization');
