#!/usr/bin/env node
import { loadConfig } from './dist/config.js';

const config = loadConfig();

console.log('\n=== Raw HTTP Test ===');
console.log('Testing:', config.llm.fast.url);
console.log('Model:', config.llm.fast.model);

const start = Date.now();
try {
  const response = await fetch(`${config.llm.fast.url}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.llm.apiKey || 'not-needed'}`
    },
    body: JSON.stringify({
      model: config.llm.fast.model,
      messages: [{ role: 'user', content: 'Say "ok"' }],
      max_tokens: 10
    }),
    signal: AbortSignal.timeout(30000)
  });
  
  const duration = Date.now() - start;
  const data = await response.json();
  
  console.log(`✓ HTTP request completed in ${duration}ms`);
  console.log(`Status: ${response.status}`);
  console.log(`Response:`, data.choices?.[0]?.message?.content || data);
} catch (err) {
  const duration = Date.now() - start;
  console.log(`✗ Failed after ${duration}ms`);
  console.log(`Error: ${err.message}`);
}

process.exit(0);
