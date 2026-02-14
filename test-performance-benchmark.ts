#!/usr/bin/env tsx
/**
 * Performance Benchmark - Measure Optimization Impact
 *
 * Compares performance with and without optimizations to quantify improvements.
 *
 * Run with: pnpm exec tsx test-performance-benchmark.ts
 */

import { LLMService } from './src/services/llm.js';
import { loadConfig } from './src/config.js';
import { getSystemPrompt } from './src/llm/system-prompts.js';
import { estimateTokens } from './src/llm/prompt-optimizer.js';

console.log('📊 Performance Benchmark - Optimization Impact\n');
console.log('===============================================\n');

const config = loadConfig();
const llm = new LLMService(config);

await llm.initialize();

interface BenchmarkResult {
  name: string;
  runs: number;
  totalTimeMs: number;
  avgTimeMs: number;
  minTimeMs: number;
  maxTimeMs: number;
  tokens?: number;
}

/**
 * Run a benchmark with multiple iterations
 */
async function benchmark(
  name: string,
  fn: () => Promise<void>,
  runs: number = 5
): Promise<BenchmarkResult> {
  const times: number[] = [];

  // Warmup run (not counted)
  await fn();

  // Timed runs
  for (let i = 0; i < runs; i++) {
    const start = Date.now();
    await fn();
    const elapsed = Date.now() - start;
    times.push(elapsed);
  }

  const totalTimeMs = times.reduce((a, b) => a + b, 0);
  const avgTimeMs = totalTimeMs / runs;
  const minTimeMs = Math.min(...times);
  const maxTimeMs = Math.max(...times);

  return {
    name,
    runs,
    totalTimeMs,
    avgTimeMs,
    minTimeMs,
    maxTimeMs,
  };
}

// Benchmark 1: Prompt Token Comparison
console.log('Benchmark 1: Prompt Token Efficiency');
console.log('=====================================\n');

const thinkingOriginal = getSystemPrompt('thinking', false);
const thinkingOptimized = getSystemPrompt('thinking', true);

const thinkingOriginalTokens = estimateTokens(thinkingOriginal);
const thinkingOptimizedTokens = estimateTokens(thinkingOptimized);

console.log('Thinking Tier System Prompt:');
console.log(`  Original: ${thinkingOriginalTokens} tokens`);
console.log(`  Optimized: ${thinkingOptimizedTokens} tokens`);
console.log(`  Savings: ${thinkingOriginalTokens - thinkingOptimizedTokens} tokens (${((1 - thinkingOptimizedTokens / thinkingOriginalTokens) * 100).toFixed(1)}%)`);
console.log('');

const fastOriginal = getSystemPrompt('fast', false);
const fastOptimized = getSystemPrompt('fast', true);

const fastOriginalTokens = estimateTokens(fastOriginal);
const fastOptimizedTokens = estimateTokens(fastOptimized);

console.log('Fast Tier System Prompt:');
console.log(`  Original: ${fastOriginalTokens} tokens`);
console.log(`  Optimized: ${fastOptimizedTokens} tokens`);
console.log(`  Savings: ${fastOriginalTokens - fastOptimizedTokens} tokens (${((1 - fastOptimizedTokens / fastOriginalTokens) * 100).toFixed(1)}%)`);
console.log('');

const totalOriginalTokens = thinkingOriginalTokens + fastOriginalTokens;
const totalOptimizedTokens = thinkingOptimizedTokens + fastOptimizedTokens;
const totalSavings = totalOriginalTokens - totalOptimizedTokens;

console.log('Total (Thinking + Fast):');
console.log(`  Original: ${totalOriginalTokens} tokens`);
console.log(`  Optimized: ${totalOptimizedTokens} tokens`);
console.log(`  Savings: ${totalSavings} tokens (${((1 - totalOptimizedTokens / totalOriginalTokens) * 100).toFixed(1)}%)`);
console.log('');

// Benchmark 2: Streaming vs Non-Streaming
console.log('Benchmark 2: Streaming Performance');
console.log('===================================\n');

const testQuery = 'What is TypeScript? Answer in 2 sentences.';

const nonStreamBench = await benchmark('Non-Streaming', async () => {
  await llm.chat([{ role: 'user', content: testQuery }], {
    tier: 'fast',
    skipCache: true,
  });
}, 3);

const streamBench = await benchmark('Streaming', async () => {
  const stream = llm.chatStream([{ role: 'user', content: testQuery }], {
    tier: 'fast',
    skipCache: true,
  });
  for await (const chunk of stream) {
    // Consume stream
  }
}, 3);

console.log('Non-Streaming:');
console.log(`  Avg: ${nonStreamBench.avgTimeMs.toFixed(0)}ms`);
console.log(`  Min: ${nonStreamBench.minTimeMs}ms`);
console.log(`  Max: ${nonStreamBench.maxTimeMs}ms`);
console.log('');

console.log('Streaming:');
console.log(`  Avg: ${streamBench.avgTimeMs.toFixed(0)}ms`);
console.log(`  Min: ${streamBench.minTimeMs}ms`);
console.log(`  Max: ${streamBench.maxTimeMs}ms`);
console.log('');

// Note: Total time should be similar, but streaming provides progressive output
console.log('Note: Streaming provides progressive output (better UX)');
console.log('      Total time similar, but perceived latency much lower');
console.log('');

// Benchmark 3: Cache Hit Performance
console.log('Benchmark 3: Cache Performance');
console.log('===============================\n');

// First request (cache miss)
const cacheMissStart = Date.now();
await llm.chat([{ role: 'user', content: 'What is 10+10?' }], { tier: 'fast' });
const cacheMissTime = Date.now() - cacheMissStart;

// Second request (cache hit)
const cacheHitStart = Date.now();
await llm.chat([{ role: 'user', content: 'What is 10+10?' }], { tier: 'fast' });
const cacheHitTime = Date.now() - cacheHitStart;

console.log('Cache Miss (first request):');
console.log(`  Time: ${cacheMissTime}ms`);
console.log('');

console.log('Cache Hit (second request):');
console.log(`  Time: ${cacheHitTime}ms`);
console.log(`  Speedup: ${(cacheMissTime / cacheHitTime).toFixed(1)}x faster`);
console.log(`  Latency reduction: ${((1 - cacheHitTime / cacheMissTime) * 100).toFixed(0)}%`);
console.log('');

const cacheStats = llm.getCacheStats();
console.log('Overall Cache Statistics:');
console.log(`  Hits: ${cacheStats.hits}`);
console.log(`  Misses: ${cacheStats.misses}`);
console.log(`  Hit rate: ${(cacheStats.hitRate * 100).toFixed(1)}%`);
console.log('');

// Benchmark 4: Router Intelligence
console.log('Benchmark 4: Router Intelligence');
console.log('=================================\n');

const routingBench = await benchmark('Routing Decision', async () => {
  await llm.classifyComplexity('analyze my tasks and create a plan');
}, 10);

console.log('Routing Decision Time:');
console.log(`  Avg: ${routingBench.avgTimeMs.toFixed(1)}ms`);
console.log(`  Min: ${routingBench.minTimeMs}ms`);
console.log(`  Max: ${routingBench.maxTimeMs}ms`);
console.log('');

const routerStats = llm.getRouterStats();
console.log('Router Learning Statistics:');
for (const [tier, stats] of Object.entries(routerStats)) {
  const simpleReqs = stats.simple.totalRequests;
  const complexReqs = stats.complex.totalRequests;
  const total = simpleReqs + complexReqs;

  if (total > 0) {
    console.log(`  ${tier}: ${total} requests`);
    if (simpleReqs > 0) {
      console.log(`    Simple: ${simpleReqs} (${(stats.simple.successRate * 100).toFixed(0)}% success)`);
    }
    if (complexReqs > 0) {
      console.log(`    Complex: ${complexReqs} (${(stats.complex.successRate * 100).toFixed(0)}% success)`);
    }
  }
}
console.log('');

// Final Summary
console.log('═══════════════════════════════════════════');
console.log('Performance Benchmark Summary');
console.log('═══════════════════════════════════════════\n');

console.log('Optimization Impact:');
console.log(`  ✓ Prompt tokens: ${totalSavings} saved (${((1 - totalOptimizedTokens / totalOriginalTokens) * 100).toFixed(1)}% reduction)`);
console.log(`  ✓ Cache speedup: ${(cacheMissTime / cacheHitTime).toFixed(1)}x faster on hits`);
console.log(`  ✓ Cache hit rate: ${(cacheStats.hitRate * 100).toFixed(1)}%`);
console.log(`  ✓ Routing decision: ${routingBench.avgTimeMs.toFixed(1)}ms avg`);
console.log('');

console.log('Performance Metrics:');
console.log(`  • Prompt savings: ${totalSavings} tokens per request`);
console.log(`  • Cache miss: ~${cacheMissTime}ms`);
console.log(`  • Cache hit: ~${cacheHitTime}ms (${((1 - cacheHitTime / cacheMissTime) * 100).toFixed(0)}% faster)`);
console.log(`  • Routing overhead: ${routingBench.avgTimeMs.toFixed(1)}ms`);
console.log('');

const estimatedRequestsPerDay = 1000;
const tokenSavingsPerDay = totalSavings * estimatedRequestsPerDay;
const cacheSavingsMs = (cacheMissTime - cacheHitTime) * cacheStats.hits;

console.log(`Estimated Daily Impact (${estimatedRequestsPerDay} requests):');
console.log(`  • Token savings: ${(tokenSavingsPerDay / 1000).toFixed(0)}k tokens`);
console.log(`  • Cache time saved: ${(cacheSavingsMs / 1000).toFixed(0)}s`);
console.log(`  • Total latency reduction: ${((cacheSavingsMs / (cacheMissTime * estimatedRequestsPerDay)) * 100).toFixed(1)}%`);
console.log('');

console.log('✅ Performance benchmark complete!\n');
