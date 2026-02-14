#!/usr/bin/env node
import { LLMService } from './dist/services/llm.js';
import { loadConfig } from './dist/config.js';
import OpenAI from 'openai';

const config = loadConfig();

console.log('\n=== LLM Diagnostic Tests ===\n');
console.log('Config:', {
  router: config.llm.router,
  fast: config.llm.fast,
  thinking: config.llm.thinking,
});

// Test 1: Direct OpenAI client call (bypassing our LLMService)
console.log('\n--- Test 1: Raw OpenAI client to fast model ---');
const client = new OpenAI({
  baseURL: config.llm.fast.url,
  apiKey: config.llm.apiKey || 'not-needed',
  timeout: 30000,
});

let start = Date.now();
try {
  console.log('Making request...');
  const response = await client.chat.completions.create({
    model: config.llm.fast.model,
    messages: [{ role: 'user', content: 'Say "ok"' }],
    max_tokens: 10,
  });
  const duration = Date.now() - start;
  console.log(`✓ Success in ${duration}ms`);
  console.log(`Response: "${response.choices[0].message.content}"`);
} catch (err) {
  const duration = Date.now() - start;
  console.log(`✗ Failed after ${duration}ms`);
  console.log(`Error: ${err.message}`);
}

// Test 2: Through our LLMService with fast tier
console.log('\n--- Test 2: LLMService with fast tier ---');
const llm = new LLMService(config);
start = Date.now();
try {
  console.log('Making request...');
  const response = await llm.chat([
    { role: 'user', content: 'Say "ok"' }
  ], { tier: 'fast' });
  const duration = Date.now() - start;
  console.log(`✓ Success in ${duration}ms`);
  console.log(`Response: "${response}"`);
} catch (err) {
  const duration = Date.now() - start;
  console.log(`✗ Failed after ${duration}ms`);
  console.log(`Error: ${err.message}`);
}

// Test 3: With longer context (like shed queries)
console.log('\n--- Test 3: Fast tier with 5KB context ---');
const longContext = 'Context: ' + 'Lorem ipsum dolor sit amet. '.repeat(200);
start = Date.now();
try {
  console.log('Making request with large context...');
  const response = await llm.chat([
    { role: 'system', content: 'Answer based on context.' },
    { role: 'user', content: longContext + '\n\nQuestion: What is the first word?' }
  ], { tier: 'fast' });
  const duration = Date.now() - start;
  console.log(`✓ Success in ${duration}ms`);
  console.log(`Response length: ${response.length} chars`);
} catch (err) {
  const duration = Date.now() - start;
  console.log(`✗ Failed after ${duration}ms`);
  console.log(`Error: ${err.message}`);
}

// Test 4: Router tier (smallest model)
console.log('\n--- Test 4: Router tier (smallest model) ---');
start = Date.now();
try {
  console.log('Making request...');
  const response = await llm.chat([
    { role: 'user', content: 'Say "ok"' }
  ], { tier: 'router' });
  const duration = Date.now() - start;
  console.log(`✓ Success in ${duration}ms`);
  console.log(`Response: "${response}"`);
} catch (err) {
  const duration = Date.now() - start;
  console.log(`✗ Failed after ${duration}ms`);
  console.log(`Error: ${err.message}`);
}

console.log('\n=== Tests Complete ===\n');
process.exit(0);
