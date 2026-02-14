#!/usr/bin/env node
import { loadConfig } from './dist/config.js';

const config = loadConfig();

async function checkEndpoint(name, url) {
  console.log(`\n--- ${name} ---`);
  console.log(`URL: ${url}`);
  
  const start = Date.now();
  try {
    const headers = {};
    if (config.llm.apiKey) {
      headers['Authorization'] = `Bearer ${config.llm.apiKey}`;
    }
    const response = await fetch(`${url}/models`, {
      headers,
      signal: AbortSignal.timeout(5000)
    });
    const duration = Date.now() - start;
    
    if (response.ok) {
      const data = await response.json();
      console.log(`✓ Server reachable (${duration}ms)`);
      console.log(`Models available: ${data.data?.length || 'unknown'}`);
    } else {
      console.log(`✗ Server returned ${response.status} (${duration}ms)`);
    }
  } catch (err) {
    const duration = Date.now() - start;
    console.log(`✗ Connection failed (${duration}ms): ${err.message}`);
  }
}

console.log('=== Checking LLM Server Connectivity ===');
await checkEndpoint('Router', config.llm.router.url);
await checkEndpoint('Fast', config.llm.fast.url);
await checkEndpoint('Thinking', config.llm.thinking.url);
console.log('\n');
process.exit(0);
