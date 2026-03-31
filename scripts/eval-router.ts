#!/usr/bin/env tsx
/**
 * Router evaluation harness.
 *
 * Usage:
 *   tsx scripts/eval-router.ts
 *   tsx scripts/eval-router.ts --dataset data/router-eval/starter-labeled.jsonl --limit 50 --show-mismatches
 *   tsx scripts/eval-router.ts --json
 */

import path from 'path';
import { configureLogger, LogLevel } from '../src/utils/logger.js';
import { loadConfig } from '../src/config.js';
import { SettingsService } from '../src/services/settings.js';
import { initServices, closeServices } from '../src/services/index.js';
import { CommandRouter } from '../src/router/index.js';
import {
  buildRouterEvalGateVerdict,
  evaluateRouterDataset,
  type RouterEvalSummary,
} from '../src/router/eval.js';

function parseArgs(argv: string[]): {
  datasetPath: string;
  limit?: number;
  showMismatches: boolean;
  json: boolean;
} {
  let datasetPath = 'data/router-eval/starter-labeled.jsonl';
  let limit: number | undefined;
  let showMismatches = false;
  let json = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dataset' && argv[i + 1]) {
      datasetPath = argv[++i];
    } else if (arg === '--limit' && argv[i + 1]) {
      const n = Number(argv[++i]);
      if (!Number.isNaN(n) && n > 0) limit = Math.floor(n);
    } else if (arg === '--show-mismatches') {
      showMismatches = true;
    } else if (arg === '--json') {
      json = true;
    }
  }

  return { datasetPath, limit, showMismatches, json };
}

function pct(numerator: number, denominator: number): string {
  if (denominator === 0) return '0.0%';
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function printConfusion(summary: RouterEvalSummary): void {
  const matrix = summary.confusion;

  console.log('\nComplexity confusion matrix (expected x predicted):');
  console.log('                SIMPLE   COMPLEX');
  console.log(`expected SIMPLE  ${String(matrix.SIMPLE.SIMPLE).padStart(6)}   ${String(matrix.SIMPLE.COMPLEX).padStart(7)}`);
  console.log(`expected COMPLEX ${String(matrix.COMPLEX.SIMPLE).padStart(6)}   ${String(matrix.COMPLEX.COMPLEX).padStart(7)}`);
}

function printRouteBreakdown(summary: RouterEvalSummary): void {
  const byExpected = summary.route_breakdown_by_expected_complexity;

  console.log('\nRoute-type breakdown by expected complexity:');
  for (const expected of ['SIMPLE', 'COMPLEX'] as const) {
    const row = byExpected[expected];
    console.log(
      `${expected.padEnd(7)} -> routed:${String(row.routed).padStart(2)}  llm-simple:${String(row['llm-simple']).padStart(2)}  llm-complex:${String(row['llm-complex']).padStart(2)}`
    );
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  configureLogger({
    level: args.json ? LogLevel.ERROR : LogLevel.WARN,
    llmVerbose: false,
    console: !args.json,
  });
  const settings = new SettingsService();
  await settings.initialize();
  const config = loadConfig(settings);

  const services = await initServices(config, { settings });
  const router = new CommandRouter();
  await router.initialize(services);

  let summary: RouterEvalSummary;
  try {
    summary = await evaluateRouterDataset(router, args.datasetPath, args.limit);
  } finally {
    closeServices(services);
  }
  const gateVerdict = buildRouterEvalGateVerdict(summary);
  const mismatches = summary.mismatches;

  if (args.json) {
    console.log(JSON.stringify({
      ...summary,
      gate_verdict: gateVerdict,
    }, null, 2));
    return;
  }

  console.log('=== Router Eval Summary ===');
  console.log(`Dataset: ${path.resolve(args.datasetPath)}`);
  console.log(`Samples: ${summary.samples}`);
  console.log(`Complexity accuracy: ${summary.complexity_accuracy.correct}/${summary.complexity_accuracy.total} (${pct(summary.complexity_accuracy.count, summary.complexity_accuracy.total)})`);
  console.log(`Route-type accuracy: ${summary.route_type_accuracy.correct}/${summary.route_type_accuracy.total} (${pct(summary.route_type_accuracy.count, summary.route_type_accuracy.total)}) [labeled subset]`);
  console.log(`Thinking-rate: ${summary.thinking_rate.count}/${summary.thinking_rate.total} (${pct(summary.thinking_rate.count, summary.thinking_rate.total)})`);
  console.log(`Thinking-rate on expected SIMPLE: ${summary.thinking_rate_on_expected_simple.count}/${summary.thinking_rate_on_expected_simple.total} (${pct(summary.thinking_rate_on_expected_simple.count, summary.thinking_rate_on_expected_simple.total)})`);
  console.log(`Avg routing latency: ${summary.avg_routing_latency_ms}ms`);

  printConfusion(summary);
  printRouteBreakdown(summary);

  console.log(`\nGate verdict: ${gateVerdict.passed ? 'PASS' : 'FAIL'}`);
  for (const reason of gateVerdict.reasons) {
    console.log(`- ${reason}`);
  }

  console.log(`\nMismatches: ${summary.mismatch_count}`);

  if (args.showMismatches && mismatches.length > 0) {
    console.log('\nDetailed mismatches:');
    for (const r of mismatches) {
      const id = r.id ? `[${r.id}] ` : '';
      const expectedRt = r.expected_route_type ? `, expected route ${r.expected_route_type}` : '';
      console.log(
        `${id}expected ${r.expected_complexity}${expectedRt} -> got ${r.predicted_complexity}/${r.predicted_route_type}` +
        `${r.predicted_tool ? ` (tool: ${r.predicted_tool})` : ''}` +
        ` | ${r.input}`
      );
    }
  }
}

main().catch(err => {
  console.error('Router eval failed:', err);
  process.exit(1);
});
