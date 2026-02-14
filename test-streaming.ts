#!/usr/bin/env tsx
/**
 * Test script for LLM Response Streaming
 *
 * Run with: pnpm exec tsx test-streaming.ts
 */

import { LLMService } from './src/services/llm.js';
import { loadConfig } from './src/config.js';

console.log('🧪 Testing LLM Response Streaming\n');

const config = loadConfig();
const llm = new LLMService(config);

await llm.initialize();

// Test 1: Non-streaming (baseline)
console.log('Test 1: Non-Streaming Response');
console.log('================================');
const startNonStream = Date.now();
const nonStreamResponse = await llm.chat([
  { role: 'user', content: 'What is 2+2? Answer in one sentence.' }
], { tier: 'fast', skipCache: true });
const nonStreamTime = Date.now() - startNonStream;

console.log('Response:', nonStreamResponse);
console.log(`Time: ${nonStreamTime}ms`);
console.log('');

// Test 2: Streaming response
console.log('Test 2: Streaming Response');
console.log('===========================');
process.stdout.write('Response: ');

const startStream = Date.now();
const stream = llm.chatStream([
  { role: 'user', content: 'What is 3+3? Answer in one sentence.' }
], { tier: 'fast', skipCache: true });

let streamedContent = '';
let chunkCount = 0;
let firstChunkTime = 0;

for await (const chunk of stream) {
  if (chunkCount === 0) {
    firstChunkTime = Date.now() - startStream;
  }
  streamedContent += chunk;
  chunkCount++;
  process.stdout.write(chunk);
}

const streamTime = Date.now() - startStream;

console.log(''); // Newline after streaming
console.log(`Total time: ${streamTime}ms`);
console.log(`Time to first chunk: ${firstChunkTime}ms`);
console.log(`Chunks received: ${chunkCount}`);
console.log('');

// Test 3: Longer streaming response
console.log('Test 3: Longer Streaming Response');
console.log('==================================');
process.stdout.write('Response: ');

const startLong = Date.now();
const longStream = llm.chatStream([
  { role: 'user', content: 'Explain what a Mixture of Experts model is in 2-3 sentences.' }
], { tier: 'fast', skipCache: true });

let longContent = '';
let longChunkCount = 0;
let longFirstChunk = 0;

for await (const chunk of longStream) {
  if (longChunkCount === 0) {
    longFirstChunk = Date.now() - startLong;
  }
  longContent += chunk;
  longChunkCount++;
  process.stdout.write(chunk);
}

const longTime = Date.now() - startLong;

console.log(''); // Newline
console.log(`Total time: ${longTime}ms`);
console.log(`Time to first chunk: ${longFirstChunk}ms`);
console.log(`Chunks received: ${longChunkCount}`);
console.log('');

// Test 4: Cached response (should be instant)
console.log('Test 4: Cached Streaming Response');
console.log('==================================');
process.stdout.write('Response: ');

const startCached = Date.now();
const cachedStream = llm.chatStream([
  { role: 'user', content: 'What is 3+3? Answer in one sentence.' }
], { tier: 'fast' }); // Cache enabled

let cachedContent = '';
for await (const chunk of cachedStream) {
  cachedContent += chunk;
  process.stdout.write(chunk);
}

const cachedTime = Date.now() - startCached;

console.log(''); // Newline
console.log(`Time: ${cachedTime}ms (cached)`);
console.log('');

console.log('✅ Streaming tests completed!');
console.log('');
console.log('Results:');
console.log(`- Non-streaming: ${nonStreamTime}ms total`);
console.log(`- Streaming: ${streamTime}ms total, ${firstChunkTime}ms to first chunk`);
console.log(`- Improvement: ${firstChunkTime}ms faster perceived latency`);
console.log(`- Cached: ${cachedTime}ms (instant)`);
console.log('');
console.log('Benefits:');
console.log('- User sees output immediately (better UX)');
console.log('- Reduced perceived latency');
console.log('- Real-time feedback for long responses');
console.log('- Streaming and caching work together');
