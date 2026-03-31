import fs from 'fs';
import path from 'path';
import type { CommandRouter } from './index.js';

export type RouterEvalComplexity = 'SIMPLE' | 'COMPLEX';
export type RouterEvalRouteType = 'routed' | 'llm-simple' | 'llm-complex';

export interface LabeledRouterEvalExample {
  id?: string;
  input: string;
  expected_complexity: RouterEvalComplexity;
  expected_route_type?: RouterEvalRouteType;
  tags?: string[];
  notes?: string;
}

export interface RouterEvalResult {
  example: LabeledRouterEvalExample;
  predictedComplexity: RouterEvalComplexity;
  predictedRouteType: RouterEvalRouteType;
  predictedTool?: string;
  predictedTier: 'router' | 'fast' | 'thinking';
  latencyMs: number;
  complexityCorrect: boolean;
  routeTypeCorrect?: boolean;
}

export interface RouterEvalRateSummary {
  correct?: number;
  count: number;
  total: number;
  rate: number;
}

export interface RouterEvalSummary {
  dataset: string;
  samples: number;
  complexity_accuracy: RouterEvalRateSummary;
  route_type_accuracy: RouterEvalRateSummary;
  thinking_rate: RouterEvalRateSummary;
  thinking_rate_on_expected_simple: RouterEvalRateSummary;
  avg_routing_latency_ms: number;
  confusion: Record<RouterEvalComplexity, Record<RouterEvalComplexity, number>>;
  route_breakdown_by_expected_complexity: Record<RouterEvalComplexity, Record<RouterEvalRouteType, number>>;
  mismatch_count: number;
  mismatches: Array<{
    id?: string;
    input: string;
    expected_complexity: RouterEvalComplexity;
    expected_route_type?: RouterEvalRouteType;
    predicted_complexity: RouterEvalComplexity;
    predicted_route_type: RouterEvalRouteType;
    predicted_tool?: string;
  }>;
}

export interface RouterEvalGateThresholds {
  minComplexityAccuracyRate: number;
  minRouteTypeAccuracyRate: number;
  maxThinkingRateOnExpectedSimple: number;
  maxAvgRoutingLatencyMs: number;
}

export interface RouterEvalGateVerdict {
  passed: boolean;
  mode: 'single-router-absolute';
  thresholds: RouterEvalGateThresholds;
  checks: Record<string, { passed: boolean; actual: number; threshold: number }>;
  reasons: string[];
  notes: string[];
}

export interface RouterEvalCompareThresholds {
  minComplexityAccuracyDelta: number;
  minRouteTypeAccuracyDelta: number;
  maxThinkingRateOnExpectedSimpleDelta: number;
  maxAvgRoutingLatencyDeltaMs: number;
}

export interface RouterEvalCompareSummary {
  dataset: string;
  baseline: RouterEvalSummary;
  candidate: RouterEvalSummary;
  deltas: {
    complexity_accuracy_rate: number;
    route_type_accuracy_rate: number;
    thinking_rate_on_expected_simple: number;
    avg_routing_latency_ms: number;
  };
}

export interface RouterEvalCompareVerdict {
  passed: boolean;
  mode: 'baseline-vs-candidate-delta';
  thresholds: RouterEvalCompareThresholds;
  checks: Record<string, { passed: boolean; actual: number; threshold: number }>;
  reasons: string[];
  notes: string[];
}

export const DEFAULT_ROUTER_EVAL_DATASET = 'data/router-eval/starter-labeled.jsonl';

export const DEFAULT_ROUTER_EVAL_THRESHOLDS: RouterEvalGateThresholds = {
  minComplexityAccuracyRate: 85,
  minRouteTypeAccuracyRate: 80,
  maxThinkingRateOnExpectedSimple: 20,
  maxAvgRoutingLatencyMs: 1500,
};

export const DEFAULT_ROUTER_EVAL_COMPARE_THRESHOLDS: RouterEvalCompareThresholds = {
  minComplexityAccuracyDelta: 0,
  minRouteTypeAccuracyDelta: 0,
  maxThinkingRateOnExpectedSimpleDelta: 5,
  maxAvgRoutingLatencyDeltaMs: 250,
};

export function loadRouterEvalDataset(datasetPath: string): LabeledRouterEvalExample[] {
  const fullPath = path.resolve(datasetPath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Dataset not found: ${fullPath}`);
  }

  const lines = fs.readFileSync(fullPath, 'utf-8').split('\n');
  const rows: LabeledRouterEvalExample[] = [];

  for (const [idx, raw] of lines.entries()) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (err) {
      throw new Error(`Invalid JSONL at line ${idx + 1}: ${String(err)}`);
    }

    const example = parsed as Partial<LabeledRouterEvalExample>;
    if (!example.input || !example.expected_complexity) {
      throw new Error(`Missing required fields at line ${idx + 1} (input, expected_complexity)`);
    }

    if (example.expected_complexity !== 'SIMPLE' && example.expected_complexity !== 'COMPLEX') {
      throw new Error(`Invalid expected_complexity at line ${idx + 1}`);
    }

    if (
      example.expected_route_type &&
      !['routed', 'llm-simple', 'llm-complex'].includes(example.expected_route_type)
    ) {
      throw new Error(`Invalid expected_route_type at line ${idx + 1}`);
    }

    rows.push(example as LabeledRouterEvalExample);
  }

  return rows;
}

export async function evaluateRouterDataset(
  router: CommandRouter,
  datasetPath: string,
  limit?: number
): Promise<RouterEvalSummary> {
  const dataset = loadRouterEvalDataset(datasetPath);
  const examples = limit ? dataset.slice(0, limit) : dataset;
  const results: RouterEvalResult[] = [];

  for (const ex of examples) {
    const start = Date.now();
    const routed = await router.route(ex.input);
    const latencyMs = Date.now() - start;

    const predictedRouteType = routed.type;
    const predictedComplexity = routed.complexity;
    const predictedTier = deriveTier(predictedRouteType);
    const predictedTool = routed.route?.tool;

    results.push({
      example: ex,
      predictedComplexity,
      predictedRouteType,
      predictedTool,
      predictedTier,
      latencyMs,
      complexityCorrect: predictedComplexity === ex.expected_complexity,
      routeTypeCorrect: ex.expected_route_type
        ? predictedRouteType === ex.expected_route_type
        : undefined,
    });
  }

  return summarizeRouterEvalResults(datasetPath, results);
}

export function summarizeRouterEvalResults(
  datasetPath: string,
  results: RouterEvalResult[]
): RouterEvalSummary {
  const total = results.length;
  const complexityCorrect = results.filter((r) => r.complexityCorrect).length;
  const routeLabeled = results.filter((r) => r.example.expected_route_type !== undefined);
  const routeCorrect = routeLabeled.filter((r) => r.routeTypeCorrect === true).length;
  const thinkingCount = results.filter((r) => r.predictedTier === 'thinking').length;
  const simpleExpected = results.filter((r) => r.example.expected_complexity === 'SIMPLE');
  const thinkingOnSimple = simpleExpected.filter((r) => r.predictedTier === 'thinking').length;
  const avgLatency = total > 0
    ? Math.round(results.reduce((sum, r) => sum + r.latencyMs, 0) / total)
    : 0;

  const confusion: Record<RouterEvalComplexity, Record<RouterEvalComplexity, number>> = {
    SIMPLE: { SIMPLE: 0, COMPLEX: 0 },
    COMPLEX: { SIMPLE: 0, COMPLEX: 0 },
  };
  for (const r of results) {
    confusion[r.example.expected_complexity][r.predictedComplexity]++;
  }

  const routeBreakdownByExpectedComplexity: Record<
    RouterEvalComplexity,
    Record<RouterEvalRouteType, number>
  > = {
    SIMPLE: { routed: 0, 'llm-simple': 0, 'llm-complex': 0 },
    COMPLEX: { routed: 0, 'llm-simple': 0, 'llm-complex': 0 },
  };
  for (const r of results) {
    routeBreakdownByExpectedComplexity[r.example.expected_complexity][r.predictedRouteType]++;
  }

  const mismatches = results.filter((r) => !r.complexityCorrect || r.routeTypeCorrect === false);

  return {
    dataset: path.resolve(datasetPath),
    samples: total,
    complexity_accuracy: {
      correct: complexityCorrect,
      count: complexityCorrect,
      total,
      rate: pctNumber(complexityCorrect, total),
    },
    route_type_accuracy: {
      correct: routeCorrect,
      count: routeCorrect,
      total: routeLabeled.length,
      rate: pctNumber(routeCorrect, routeLabeled.length),
    },
    thinking_rate: {
      count: thinkingCount,
      total,
      rate: pctNumber(thinkingCount, total),
    },
    thinking_rate_on_expected_simple: {
      count: thinkingOnSimple,
      total: simpleExpected.length,
      rate: pctNumber(thinkingOnSimple, simpleExpected.length),
    },
    avg_routing_latency_ms: avgLatency,
    confusion,
    route_breakdown_by_expected_complexity: routeBreakdownByExpectedComplexity,
    mismatch_count: mismatches.length,
    mismatches: mismatches.map((r) => ({
      id: r.example.id,
      input: r.example.input,
      expected_complexity: r.example.expected_complexity,
      expected_route_type: r.example.expected_route_type,
      predicted_complexity: r.predictedComplexity,
      predicted_route_type: r.predictedRouteType,
      predicted_tool: r.predictedTool,
    })),
  };
}

export function buildRouterEvalGateVerdict(
  summary: RouterEvalSummary,
  thresholds: RouterEvalGateThresholds = DEFAULT_ROUTER_EVAL_THRESHOLDS
): RouterEvalGateVerdict {
  const checks = {
    complexity_accuracy: {
      passed: summary.complexity_accuracy.rate >= thresholds.minComplexityAccuracyRate,
      actual: summary.complexity_accuracy.rate,
      threshold: thresholds.minComplexityAccuracyRate,
    },
    route_type_accuracy: {
      passed:
        summary.route_type_accuracy.total === 0 ||
        summary.route_type_accuracy.rate >= thresholds.minRouteTypeAccuracyRate,
      actual: summary.route_type_accuracy.rate,
      threshold: thresholds.minRouteTypeAccuracyRate,
    },
    thinking_rate_on_expected_simple: {
      passed: summary.thinking_rate_on_expected_simple.rate <= thresholds.maxThinkingRateOnExpectedSimple,
      actual: summary.thinking_rate_on_expected_simple.rate,
      threshold: thresholds.maxThinkingRateOnExpectedSimple,
    },
    avg_routing_latency_ms: {
      passed: summary.avg_routing_latency_ms <= thresholds.maxAvgRoutingLatencyMs,
      actual: summary.avg_routing_latency_ms,
      threshold: thresholds.maxAvgRoutingLatencyMs,
    },
  };

  const reasons: string[] = [];
  if (!checks.complexity_accuracy.passed) {
    reasons.push(
      `complexity accuracy ${summary.complexity_accuracy.rate.toFixed(1)} below ${thresholds.minComplexityAccuracyRate.toFixed(1)}`
    );
  }
  if (!checks.route_type_accuracy.passed) {
    reasons.push(
      `route-type accuracy ${summary.route_type_accuracy.rate.toFixed(1)} below ${thresholds.minRouteTypeAccuracyRate.toFixed(1)}`
    );
  }
  if (!checks.thinking_rate_on_expected_simple.passed) {
    reasons.push(
      `thinking-on-simple rate ${summary.thinking_rate_on_expected_simple.rate.toFixed(1)} above ${thresholds.maxThinkingRateOnExpectedSimple.toFixed(1)}`
    );
  }
  if (!checks.avg_routing_latency_ms.passed) {
    reasons.push(
      `avg routing latency ${summary.avg_routing_latency_ms.toFixed(1)}ms above ${thresholds.maxAvgRoutingLatencyMs.toFixed(1)}ms`
    );
  }

  return {
    passed: reasons.length === 0,
    mode: 'single-router-absolute',
    thresholds,
    checks,
    reasons,
    notes: [
      'Uses the live router stack and the current labeled eval dataset.',
      'Absolute gate is intended to pair with baseline-vs-candidate compare when a candidate runtime exists.',
    ],
  };
}

export function buildRouterEvalCompareSummary(
  baseline: RouterEvalSummary,
  candidate: RouterEvalSummary
): RouterEvalCompareSummary {
  return {
    dataset: candidate.dataset,
    baseline,
    candidate,
    deltas: {
      complexity_accuracy_rate: roundDelta(
        candidate.complexity_accuracy.rate - baseline.complexity_accuracy.rate
      ),
      route_type_accuracy_rate: roundDelta(
        candidate.route_type_accuracy.rate - baseline.route_type_accuracy.rate
      ),
      thinking_rate_on_expected_simple: roundDelta(
        candidate.thinking_rate_on_expected_simple.rate - baseline.thinking_rate_on_expected_simple.rate
      ),
      avg_routing_latency_ms: roundDelta(
        candidate.avg_routing_latency_ms - baseline.avg_routing_latency_ms
      ),
    },
  };
}

export function buildRouterEvalCompareVerdict(
  compare: RouterEvalCompareSummary,
  thresholds: RouterEvalCompareThresholds = DEFAULT_ROUTER_EVAL_COMPARE_THRESHOLDS
): RouterEvalCompareVerdict {
  const checks = {
    complexity_accuracy_rate: {
      passed: compare.deltas.complexity_accuracy_rate >= thresholds.minComplexityAccuracyDelta,
      actual: compare.deltas.complexity_accuracy_rate,
      threshold: thresholds.minComplexityAccuracyDelta,
    },
    route_type_accuracy_rate: {
      passed: compare.deltas.route_type_accuracy_rate >= thresholds.minRouteTypeAccuracyDelta,
      actual: compare.deltas.route_type_accuracy_rate,
      threshold: thresholds.minRouteTypeAccuracyDelta,
    },
    thinking_rate_on_expected_simple: {
      passed:
        compare.deltas.thinking_rate_on_expected_simple <= thresholds.maxThinkingRateOnExpectedSimpleDelta,
      actual: compare.deltas.thinking_rate_on_expected_simple,
      threshold: thresholds.maxThinkingRateOnExpectedSimpleDelta,
    },
    avg_routing_latency_ms: {
      passed: compare.deltas.avg_routing_latency_ms <= thresholds.maxAvgRoutingLatencyDeltaMs,
      actual: compare.deltas.avg_routing_latency_ms,
      threshold: thresholds.maxAvgRoutingLatencyDeltaMs,
    },
  };

  const reasons: string[] = [];
  if (!checks.complexity_accuracy_rate.passed) {
    reasons.push(
      `complexity accuracy delta ${compare.deltas.complexity_accuracy_rate.toFixed(1)} below ${thresholds.minComplexityAccuracyDelta.toFixed(1)}`
    );
  }
  if (!checks.route_type_accuracy_rate.passed) {
    reasons.push(
      `route-type accuracy delta ${compare.deltas.route_type_accuracy_rate.toFixed(1)} below ${thresholds.minRouteTypeAccuracyDelta.toFixed(1)}`
    );
  }
  if (!checks.thinking_rate_on_expected_simple.passed) {
    reasons.push(
      `thinking-on-simple delta ${compare.deltas.thinking_rate_on_expected_simple.toFixed(1)} above ${thresholds.maxThinkingRateOnExpectedSimpleDelta.toFixed(1)}`
    );
  }
  if (!checks.avg_routing_latency_ms.passed) {
    reasons.push(
      `latency delta ${compare.deltas.avg_routing_latency_ms.toFixed(1)}ms above ${thresholds.maxAvgRoutingLatencyDeltaMs.toFixed(1)}ms`
    );
  }

  return {
    passed: reasons.length === 0,
    mode: 'baseline-vs-candidate-delta',
    thresholds,
    checks,
    reasons,
    notes: [
      'Compares the current base router runtime against the candidate runtime binding on the same dataset.',
    ],
  };
}

function pctNumber(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Number(((numerator / denominator) * 100).toFixed(1));
}

function deriveTier(routeType: RouterEvalRouteType): 'router' | 'fast' | 'thinking' {
  if (routeType === 'llm-complex') return 'thinking';
  if (routeType === 'llm-simple') return 'fast';
  return 'router';
}

function roundDelta(value: number): number {
  return Number(value.toFixed(1));
}
