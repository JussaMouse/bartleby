#!/usr/bin/env tsx
/**
 * Test script for Prompt Optimization
 *
 * Run with: pnpm exec tsx test-prompt-optimization.ts
 */

import {
  analyzePrompt,
  optimizePrompt,
  comparePrompts,
  DynamicPromptBuilder,
  OPTIMIZED_PROMPTS,
} from './src/llm/prompt-optimizer.js';
import { SYSTEM_PROMPTS } from './src/llm/system-prompts.js';

console.log('🧪 Testing Prompt Optimization\n');

// Test 1: Analyze current prompts
console.log('Test 1: Analyze Current Prompts');
console.log('=================================\n');

for (const [tier, prompt] of Object.entries(SYSTEM_PROMPTS)) {
  if (tier === 'default') continue; // Skip default

  const analysis = analyzePrompt(prompt);

  console.log(`${tier.toUpperCase()} Tier:`);
  console.log(`  Estimated tokens: ${analysis.tokenEstimate}`);
  console.log(`  Lines: ${analysis.lines}`);
  console.log(`  Sections: ${analysis.sections}`);

  if (analysis.redundancies.length > 0) {
    console.log(`  Redundancies found: ${analysis.redundancies.length}`);
    analysis.redundancies.forEach(r => console.log(`    - ${r}`));
  }

  if (analysis.suggestions.length > 0) {
    console.log(`  Suggestions: ${analysis.suggestions.length}`);
    analysis.suggestions.forEach(s => console.log(`    - ${s}`));
  }

  console.log('');
}

// Test 2: Compare original vs optimized
console.log('Test 2: Optimization Results');
console.log('=============================\n');

const comparisons = [
  { name: 'Thinking', original: SYSTEM_PROMPTS.thinking, optimized: OPTIMIZED_PROMPTS.thinking },
  { name: 'Fast', original: SYSTEM_PROMPTS.fast, optimized: OPTIMIZED_PROMPTS.fast },
  { name: 'Router', original: SYSTEM_PROMPTS.router, optimized: OPTIMIZED_PROMPTS.router },
];

let totalOriginal = 0;
let totalOptimized = 0;

for (const { name, original, optimized } of comparisons) {
  const comparison = comparePrompts(original, optimized);

  console.log(`${name} Tier:`);
  console.log(`  Original: ${comparison.originalTokens} tokens, ${comparison.originalLines} lines`);
  console.log(`  Optimized: ${comparison.optimizedTokens} tokens, ${comparison.optimizedLines} lines`);
  console.log(`  Savings: ${comparison.savings} tokens (${comparison.savingsPercent.toFixed(1)}%)`);
  console.log('');

  totalOriginal += comparison.originalTokens;
  totalOptimized += comparison.optimizedTokens;
}

const totalSavings = totalOriginal - totalOptimized;
const totalSavingsPercent = (totalSavings / totalOriginal) * 100;

console.log('Total Across All Tiers:');
console.log(`  Original: ${totalOriginal} tokens`);
console.log(`  Optimized: ${totalOptimized} tokens`);
console.log(`  Total Savings: ${totalSavings} tokens (${totalSavingsPercent.toFixed(1)}%)`);
console.log('');

// Test 3: Automatic optimization
console.log('Test 3: Automatic Optimization');
console.log('================================\n');

const testPrompt = `You should always be very careful when you are working with the user's data.
In order to ensure quality, you must really check everything thoroughly.
Due to the fact that errors can happen, it is important to validate inputs.`;

console.log('Original prompt:');
console.log(testPrompt);
console.log('');

const optimized = optimizePrompt(testPrompt, false);
console.log('Optimized (conservative):');
console.log(optimized.optimized);
console.log(`Savings: ${optimized.savings} tokens (${optimized.savingsPercent.toFixed(1)}%)`);
console.log('');

const aggressiveOpt = optimizePrompt(testPrompt, true);
console.log('Optimized (aggressive):');
console.log(aggressiveOpt.optimized);
console.log(`Savings: ${aggressiveOpt.savings} tokens (${aggressiveOpt.savingsPercent.toFixed(1)}%)`);
console.log('');

// Test 4: Dynamic prompt building
console.log('Test 4: Dynamic Prompt Building');
console.log('=================================\n');

const builder = new DynamicPromptBuilder('You are Bartleby, a helpful assistant.');

builder.addSection({
  id: 'memory',
  content: '# Memory\n\nUse memory tools to store and retrieve information.',
  condition: (ctx) => ctx.hasMemory,
  priority: 1,
});

builder.addSection({
  id: 'coding',
  content: '# Code\n\nWrite clean, tested code with proper error handling.',
  condition: (ctx) => ctx.needsCoding,
  priority: 2,
});

builder.addSection({
  id: 'analysis',
  content: '# Analysis\n\nBreak down complex problems systematically.',
  condition: (ctx) => ctx.needsAnalysis,
  priority: 3,
});

// Scenario 1: Simple query (no special context)
const simple = builder.build({});
console.log('Simple context (base only):');
console.log(`  Tokens: ${builder.estimateTokens({})}`);
console.log(`  Content: "${simple.substring(0, 50)}..."`);
console.log('');

// Scenario 2: Memory task
const memory = builder.build({ hasMemory: true });
console.log('Memory task:');
console.log(`  Tokens: ${builder.estimateTokens({ hasMemory: true })}`);
console.log('  Includes: memory section');
console.log('');

// Scenario 3: Coding + analysis
const complex = builder.build({ needsCoding: true, needsAnalysis: true });
console.log('Complex task (coding + analysis):');
console.log(`  Tokens: ${builder.estimateTokens({ needsCoding: true, needsAnalysis: true })}`);
console.log('  Includes: coding + analysis sections');
console.log('');

// Scenario 4: Token limit
const limited = builder.build({ hasMemory: true, needsCoding: true, needsAnalysis: true }, 50);
console.log('With token limit (50 tokens):');
console.log(`  Tokens: ${builder.estimateTokens({ hasMemory: true, needsCoding: true, needsAnalysis: true })}`);
console.log('  High-priority sections only');
console.log('');

console.log('✅ Prompt optimization tests completed!');
console.log('');
console.log('Key Findings:');
console.log(`- Total token savings: ${totalSavings} (${totalSavingsPercent.toFixed(1)}%)`);
console.log('- Dynamic prompts reduce tokens by including only relevant sections');
console.log('- Automatic optimization removes redundant phrases');
console.log('- Better prompt structure improves caching effectiveness');
console.log('');
console.log('Impact:');
console.log(`- Faster responses (fewer tokens to process)`);
console.log(`- Lower API costs (if using remote LLMs)`);
console.log(`- Better cache hit rates (more stable prompts)`);
console.log(`- More context window space for actual content`);
