#!/usr/bin/env tsx
/**
 * Test script for structured outputs with Zod schemas
 *
 * Run with: pnpm exec tsx test-structured-outputs.ts
 */

import { storeObservation, retrieveContext } from './src/tools/memory.js';
import { toolToOpenAI, validateToolCall } from './src/tools/openai-tools.js';
import { zodToOpenAISchema } from './src/tools/schema-converter.js';
import { StoreObservationSchema } from './src/tools/schemas.js';

console.log('🧪 Testing Structured Outputs with Zod\n');

// Test 1: Convert Zod schema to OpenAI format
console.log('Test 1: Zod Schema → OpenAI Parameters');
console.log('========================================');
const openaiParams = zodToOpenAISchema(StoreObservationSchema);
console.log(JSON.stringify(openaiParams, null, 2));
console.log('');

// Test 2: Convert Tool to OpenAI format
console.log('Test 2: Tool → OpenAI ChatCompletionTool');
console.log('=========================================');
const openaiTool = toolToOpenAI(storeObservation);
console.log(JSON.stringify(openaiTool, null, 2));
console.log('');

// Test 3: Validate valid parameters
console.log('Test 3: Validate Valid Parameters');
console.log('==================================');
const validParams = {
  entityId: 'user',
  key: 'preference.theme',
  value: 'dark',
  confidence: 0.9,
};
const validResult = validateToolCall(storeObservation, validParams);
console.log('Input:', validParams);
console.log('Result:', validResult);
console.log('');

// Test 4: Validate invalid parameters (missing required field)
console.log('Test 4: Validate Invalid Parameters (Missing Field)');
console.log('====================================================');
const invalidParams1 = {
  entityId: 'user',
  // Missing 'key' and 'value'
};
const invalidResult1 = validateToolCall(storeObservation, invalidParams1);
console.log('Input:', invalidParams1);
console.log('Result:', invalidResult1);
console.log('');

// Test 5: Validate invalid parameters (wrong type)
console.log('Test 5: Validate Invalid Parameters (Wrong Type)');
console.log('=================================================');
const invalidParams2 = {
  entityId: 'user',
  key: 'preference.theme',
  value: 'dark',
  confidence: 'high', // Should be number, not string
};
const invalidResult2 = validateToolCall(storeObservation, invalidParams2);
console.log('Input:', invalidParams2);
console.log('Result:', invalidResult2);
console.log('');

// Test 6: Validate invalid parameters (out of range)
console.log('Test 6: Validate Invalid Parameters (Out of Range)');
console.log('===================================================');
const invalidParams3 = {
  entityId: 'user',
  key: 'preference.theme',
  value: 'dark',
  confidence: 1.5, // Should be 0.0-1.0
};
const invalidResult3 = validateToolCall(storeObservation, invalidParams3);
console.log('Input:', invalidParams3);
console.log('Result:', invalidResult3);
console.log('');

console.log('✅ All structured output tests completed!');
console.log('');
console.log('Benefits:');
console.log('- Type-safe parameter validation');
console.log('- Automatic error messages');
console.log('- 100% reliable tool calls');
console.log('- JSON Schema generation for LLM');
