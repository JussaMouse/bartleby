import type { Tool } from './types.js';
import * as fmt from '../utils/format.js';
import type {
  ReviewQueueItem,
  RouterTrainingCompareResult,
} from '../services/router-training.js';
import type {
  RouterRouteLabel,
  RouterTrainingRunRecord,
  RouterAdapterRecord,
} from '../services/learning.js';

const ROUTE_LABELS: RouterRouteLabel[] = ['DIRECT_TOOL', 'FAST_AGENT', 'THINKING_AGENT'];

function yesNo(value: boolean): string {
  return value ? 'yes' : 'no';
}

function formatDateTime(value?: string): string {
  if (!value) return 'n/a';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatDurationMs(value?: number): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'n/a';
  return `${Math.round(value)} ms`;
}

function formatPercentFraction(value?: number): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'n/a';
  return `${(value * 100).toFixed(1)}%`;
}

function formatPercentValue(value?: number): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'n/a';
  return `${value.toFixed(1)}%`;
}

function formatSignedPercentPoints(value?: number): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'n/a';
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)} pts`;
}

function formatSignedDurationMs(value?: number): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'n/a';
  return `${value >= 0 ? '+' : ''}${Math.round(value)} ms`;
}

function truncateText(value: string, maxLength: number = 120): string {
  return fmt.truncate(value.replace(/\s+/g, ' ').trim(), maxLength);
}

function formatRunHeadline(run: RouterTrainingRunRecord): string {
  return `${run.id} · ${run.status} · ${run.stage} · dataset ${run.datasetVersion}`;
}

function formatAdapterHeadline(adapter?: RouterAdapterRecord | null): string {
  if (!adapter) return 'none';
  return `${adapter.adapterVersion} · ${adapter.lifecycleState} · ${adapter.runtimeBinding?.model || adapter.baseModel}`;
}

function formatReviewItem(item: ReviewQueueItem, index: number): string {
  const example = item.example;
  const lines = [
    fmt.numbered(index + 1, `${example.id} · ${item.bucket} · ${item.reason}`),
    fmt.keyValue('priority', item.priority.toFixed(2), 2),
    fmt.keyValue('label', `${example.candidateLabel || example.chosenRoute} (${formatPercentFraction(example.candidateLabelConfidence)})`, 2),
    fmt.keyValue('route', `${example.chosenRoute} via ${example.finalTier}`, 2),
    fmt.keyValue('input', truncateText(example.sanitizedInput, 140), 2),
  ];

  if (example.reviewNotes) {
    lines.push(fmt.keyValue('notes', truncateText(example.reviewNotes, 140), 2));
  }

  return lines.join('\n');
}

function renderRunDetails(run: RouterTrainingRunRecord, adapter?: RouterAdapterRecord | null): string {
  const workerMetrics = (run.metrics?.workerMetrics ?? {}) as Record<string, unknown>;
  const artifacts = (run.metrics?.artifacts ?? {}) as Record<string, unknown>;
  const progress = (run.metrics?.progress ?? {}) as Record<string, unknown>;
  const promotionGate = (run.metrics?.promotionGate ?? {}) as Record<string, unknown>;
  const compareGate = (run.metrics?.compareGate ?? {}) as Record<string, unknown>;

  let response = fmt.header(`Router Training Run ${run.id}`, '🏃');
  response += `${fmt.keyValue('status', run.status)}\n`;
  response += `${fmt.keyValue('stage', run.stage)}\n`;
  response += `${fmt.keyValue('dataset', run.datasetVersion)}\n`;
  response += `${fmt.keyValue('base model', run.baseModel)}\n`;
  response += `${fmt.keyValue('adapter version', run.outputAdapterVersion || 'pending')}\n`;
  response += `${fmt.keyValue('created', formatDateTime(run.createdAt))}\n`;
  response += `${fmt.keyValue('started', formatDateTime(run.startedAt))}\n`;
  response += `${fmt.keyValue('finished', formatDateTime(run.finishedAt))}\n`;
  response += `${fmt.keyValue('adapter', formatAdapterHeadline(adapter))}\n`;

  if (run.failureReason) {
    response += `${fmt.keyValue('failure', run.failureReason)}\n`;
  }

  if (Object.keys(progress).length > 0) {
    response += `\n${fmt.section('Progress')}\n`;
    response += `${fmt.keyValue('percent', typeof progress.percent === 'number' ? `${progress.percent}%` : 'n/a', 2)}\n`;
    response += `${fmt.keyValue('message', typeof progress.message === 'string' ? progress.message : 'n/a', 2)}\n`;
    response += `${fmt.keyValue('updated', typeof progress.updatedAt === 'string' ? formatDateTime(progress.updatedAt) : 'n/a', 2)}\n`;
  }

  if (Object.keys(workerMetrics).length > 0) {
    response += `\n${fmt.section('Worker Metrics')}\n`;
    for (const [key, value] of Object.entries(workerMetrics)) {
      response += `${fmt.keyValue(key, String(value), 2)}\n`;
    }
  }

  if (Object.keys(promotionGate).length > 0 || Object.keys(compareGate).length > 0) {
    response += `\n${fmt.section('Promotion Gates')}\n`;
    if (typeof promotionGate.passed === 'boolean') {
      response += `${fmt.keyValue('absolute gate', promotionGate.passed ? 'passed' : 'failed', 2)}\n`;
    }
    if (typeof compareGate.passed === 'boolean') {
      response += `${fmt.keyValue('compare gate', compareGate.passed ? 'passed' : 'failed', 2)}\n`;
    }
  }

  if (Object.keys(artifacts).length > 0) {
    response += `\n${fmt.section('Artifacts')}\n`;
    for (const [key, value] of Object.entries(artifacts)) {
      response += `${fmt.keyValue(key, String(value), 2)}\n`;
    }
  }

  return response.trimEnd();
}

function formatAbsoluteGateChecks(result: RouterTrainingCompareResult): string[] {
  const checks = result.absoluteGate.checks;
  return [
    `complexity accuracy: ${formatPercentValue(checks.complexity_accuracy.actual)} (threshold ${formatPercentValue(checks.complexity_accuracy.threshold)})`,
    `route-type accuracy: ${formatPercentValue(checks.route_type_accuracy.actual)} (threshold ${formatPercentValue(checks.route_type_accuracy.threshold)})`,
    `thinking-on-simple: ${formatPercentValue(checks.thinking_rate_on_expected_simple.actual)} (threshold ${formatPercentValue(checks.thinking_rate_on_expected_simple.threshold)})`,
    `avg latency: ${formatDurationMs(checks.avg_routing_latency_ms.actual)} (threshold ${formatDurationMs(checks.avg_routing_latency_ms.threshold)})`,
  ];
}

function formatCompareChecks(result: RouterTrainingCompareResult): string[] {
  if (!result.compareSummary || !result.compareVerdict) {
    return ['compare skipped: baseline and candidate runtime bindings are identical'];
  }

  const compare = result.compareSummary;
  return [
    `complexity accuracy: ${formatPercentValue(compare.baseline.complexity_accuracy.rate)} → ${formatPercentValue(compare.candidate.complexity_accuracy.rate)} (${formatSignedPercentPoints(compare.deltas.complexity_accuracy_rate)})`,
    `route-type accuracy: ${formatPercentValue(compare.baseline.route_type_accuracy.rate)} → ${formatPercentValue(compare.candidate.route_type_accuracy.rate)} (${formatSignedPercentPoints(compare.deltas.route_type_accuracy_rate)})`,
    `thinking-on-simple: ${formatPercentValue(compare.baseline.thinking_rate_on_expected_simple.rate)} → ${formatPercentValue(compare.candidate.thinking_rate_on_expected_simple.rate)} (${formatSignedPercentPoints(compare.deltas.thinking_rate_on_expected_simple)})`,
    `avg latency: ${formatDurationMs(compare.baseline.avg_routing_latency_ms)} → ${formatDurationMs(compare.candidate.avg_routing_latency_ms)} (${formatSignedDurationMs(compare.deltas.avg_routing_latency_ms)})`,
  ];
}

export const showRouterTrainingStatus: Tool = {
  name: 'showRouterTrainingStatus',
  description: 'Show router training status, queue health, and active adapter state',

  routing: {
    patterns: [
      /^(?:routing|router)\s+training\s+status\s*$/i,
      /^show\s+(?:routing|router)\s+training\s+status\s*$/i,
    ],
    keywords: {
      verbs: ['show', 'view', 'check'],
      nouns: ['routing training', 'router training', 'training status'],
    },
    examples: [
      'routing training status',
      'router training status',
      'show routing training status',
    ],
    priority: 88,
  },

  parseArgs: () => ({}),

  execute: async (_args, context) => {
    const snapshot = context.services.routerTraining.getDashboardSnapshot();
    const status = snapshot.status;
    const runtime = snapshot.routerRuntime;

    let response = fmt.header('Router Training Status', '🧭');
    response += `${fmt.keyValue('enabled', yesNo(status.enabled))}\n`;
    response += `${fmt.keyValue('capture mode', status.captureMode)}\n`;
    response += `${fmt.keyValue('retention', `${status.retentionDays} days`)}\n`;
    response += `${fmt.keyValue('hardware preset', status.hardwarePreset)}\n`;
    response += `${fmt.keyValue('auto-train', yesNo(status.autoTrainEnabled))}\n`;
    response += `${fmt.keyValue('shadow enabled', yesNo(status.shadowEnabled))}\n`;
    response += `${fmt.keyValue('canary percent', `${status.canaryPercent}%`)}\n`;
    response += `${fmt.keyValue('min examples to train', String(status.minimumExamplesToTrain))}\n`;
    response += `${fmt.keyValue('shadow promotion gate', `${status.minimumShadowObservationsToPromote} observations`)}\n`;
    response += `${fmt.keyValue('canary promotion gate', `${status.minimumCanaryRequestsToPromote} requests`)}\n`;
    response += `${fmt.keyValue('canary success gate', formatPercentFraction(status.minimumCanarySuccessRateToPromote))}\n`;
    response += `${fmt.keyValue('canary latency gate', formatDurationMs(status.maxCanaryLatencyRegressionMsToPromote))}\n`;

    response += `\n${fmt.section('Runtime')}\n`;
    response += `${fmt.keyValue('source', runtime.source, 2)}\n`;
    response += `${fmt.keyValue('model', runtime.model, 2)}\n`;
    response += `${fmt.keyValue('model version', runtime.modelVersion || 'n/a', 2)}\n`;
    response += `${fmt.keyValue('active adapter', snapshot.activeAdapter?.adapterVersion || 'none', 2)}\n`;
    response += `${fmt.keyValue('shadow adapter', snapshot.shadowAdapter?.adapterVersion || 'none', 2)}\n`;
    response += `${fmt.keyValue('canary adapter', snapshot.canaryAdapter?.adapterVersion || 'none', 2)}\n`;

    response += `\n${fmt.section('Queue')}\n`;
    response += `${fmt.keyValue('active runs', String(snapshot.activeRunCount), 2)}\n`;
    response += `${fmt.keyValue('review queue', String(snapshot.reviewQueueSize), 2)}\n`;

    if (snapshot.shadowMetrics) {
      response += `\n${fmt.section('Shadow Live')}\n`;
      response += `${fmt.keyValue('observed', String(snapshot.shadowMetrics.totalObserved), 2)}\n`;
      response += `${fmt.keyValue('route match', formatPercentFraction(snapshot.shadowMetrics.routeMatchRate), 2)}\n`;
      response += `${fmt.keyValue('complexity match', formatPercentFraction(snapshot.shadowMetrics.complexityMatchRate), 2)}\n`;
      response += `${fmt.keyValue('last scored', formatDateTime(snapshot.shadowMetrics.lastScoredAt), 2)}\n`;
    }

    if (snapshot.canaryMetrics) {
      response += `\n${fmt.section('Canary 24h')}\n`;
      response += `${fmt.keyValue('requests', String(snapshot.canaryMetrics.totalEvents), 2)}\n`;
      response += `${fmt.keyValue('success rate', formatPercentFraction(snapshot.canaryMetrics.successRate), 2)}\n`;
      response += `${fmt.keyValue('avg latency', formatDurationMs(snapshot.canaryMetrics.avgResponseTimeMs), 2)}\n`;
      response += `${fmt.keyValue('route breakdown', `R ${snapshot.canaryMetrics.routeTypeBreakdown.routed} · F ${snapshot.canaryMetrics.routeTypeBreakdown['llm-simple']} · T ${snapshot.canaryMetrics.routeTypeBreakdown['llm-complex']}`, 2)}\n`;
    }

    if (snapshot.recentRuns.length > 0) {
      response += `\n${fmt.section('Recent Runs')}\n`;
      for (const run of snapshot.recentRuns.slice(0, 5)) {
        response += `${fmt.bullet(formatRunHeadline(run), 2)}\n`;
      }
    }

    return response.trimEnd();
  },
};

export const showRouterTrainingReviewQueue: Tool = {
  name: 'showRouterTrainingReviewQueue',
  description: 'Show the current router training review queue',

  routing: {
    patterns: [
      /^(?:routing|router)\s+training\s+review(?:\s+(\d+))?\s*$/i,
      /^show\s+(?:routing|router)\s+training\s+review(?:\s+(\d+))?\s*$/i,
    ],
    keywords: {
      verbs: ['show', 'view', 'review'],
      nouns: ['routing training review', 'router training review', 'review queue'],
    },
    examples: [
      'routing training review',
      'routing training review 10',
      'show router training review 20',
    ],
    priority: 87,
  },

  parseArgs: (input, match) => {
    const limit = match?.[1] ? Number.parseInt(match[1], 10) : 10;
    return { limit };
  },

  execute: async (args, context) => {
    const limit = typeof args.limit === 'number' && Number.isFinite(args.limit)
      ? Math.max(1, Math.min(50, Math.floor(args.limit)))
      : 10;

    const items = context.services.routerTraining.getReviewQueue(limit);
    if (items.length === 0) {
      return fmt.info('The router training review queue is empty.');
    }

    let response = fmt.header(`Router Training Review Queue (${items.length})`, '🧪');
    response += `${fmt.dim('Approve: routing training review approve <example-id> [DIRECT_TOOL|FAST_AGENT|THINKING_AGENT] --notes <text>')}\n`;
    response += `${fmt.dim('Reject:  routing training review reject <example-id> --notes <text>')}\n\n`;
    response += items.map((item, index) => formatReviewItem(item, index)).join('\n\n');
    return response.trimEnd();
  },
};

export const approveRouterTrainingReview: Tool = {
  name: 'approveRouterTrainingReview',
  description: 'Approve or relabel a router training review item',

  routing: {
    patterns: [
      /^(?:routing|router)\s+training\s+review\s+approve\s+(\S+)(?:\s+(DIRECT_TOOL|FAST_AGENT|THINKING_AGENT))?(?:\s+--notes\s+(.+))?\s*$/i,
    ],
    keywords: {
      verbs: ['approve', 'review'],
      nouns: ['routing training', 'review item', 'router training'],
    },
    examples: [
      'routing training review approve example-123',
      'routing training review approve example-123 FAST_AGENT',
      'routing training review approve example-123 THINKING_AGENT --notes multi-step request',
    ],
    priority: 89,
  },

  parseArgs: (_input, match) => ({
    id: match?.[1],
    label: match?.[2]?.toUpperCase(),
    notes: match?.[3]?.trim(),
  }),

  execute: async (args, context) => {
    const id = typeof args.id === 'string' ? args.id.trim() : '';
    const notes = typeof args.notes === 'string' ? args.notes.trim() : undefined;
    const rawLabel = typeof args.label === 'string' ? args.label.trim().toUpperCase() : undefined;
    const label = rawLabel && ROUTE_LABELS.includes(rawLabel as RouterRouteLabel)
      ? rawLabel as RouterRouteLabel
      : undefined;

    if (!id) {
      return 'Usage: routing training review approve <example-id> [DIRECT_TOOL|FAST_AGENT|THINKING_AGENT] --notes <text>';
    }

    const result = context.services.routerTraining.reviewTrainingExample({
      id,
      action: 'approve',
      label,
      notes,
      reviewer: 'cli',
    });

    let response = fmt.success(`Reviewed ${result.example.id}`);
    response += `\n${fmt.keyValue('label', result.example.candidateLabel || result.example.chosenRoute, 2)}`;
    response += `\n${fmt.keyValue('status', result.example.labelStatus, 2)}`;
    response += `\n${fmt.keyValue('reviewed at', formatDateTime(result.example.reviewedAt), 2)}`;
    return response;
  },
};

export const rejectRouterTrainingReview: Tool = {
  name: 'rejectRouterTrainingReview',
  description: 'Reject a router training review item',

  routing: {
    patterns: [
      /^(?:routing|router)\s+training\s+review\s+reject\s+(\S+)(?:\s+--notes\s+(.+))?\s*$/i,
    ],
    keywords: {
      verbs: ['reject', 'review'],
      nouns: ['routing training', 'review item', 'router training'],
    },
    examples: [
      'routing training review reject example-123',
      'routing training review reject example-123 --notes duplicate or noisy sample',
    ],
    priority: 89,
  },

  parseArgs: (_input, match) => ({
    id: match?.[1],
    notes: match?.[2]?.trim(),
  }),

  execute: async (args, context) => {
    const id = typeof args.id === 'string' ? args.id.trim() : '';
    const notes = typeof args.notes === 'string' ? args.notes.trim() : undefined;

    if (!id) {
      return 'Usage: routing training review reject <example-id> --notes <text>';
    }

    const result = context.services.routerTraining.reviewTrainingExample({
      id,
      action: 'reject',
      notes,
      reviewer: 'cli',
    });

    let response = fmt.success(`Rejected ${result.example.id}`);
    response += `\n${fmt.keyValue('status', result.example.labelStatus, 2)}`;
    response += `\n${fmt.keyValue('reviewed at', formatDateTime(result.example.reviewedAt), 2)}`;
    return response;
  },
};

export const manageRouterTrainingRun: Tool = {
  name: 'manageRouterTrainingRun',
  description: 'Queue, start, resume, or inspect router training runs',

  routing: {
    patterns: [
      /^(?:routing|router)\s+training\s+run(?:\s+--force)?\s*$/i,
      /^(?:routing|router)\s+training\s+run\s+now(?:\s+--force)?\s*$/i,
      /^(?:routing|router)\s+training\s+run\s+next\s*$/i,
      /^(?:routing|router)\s+training\s+run\s+resume\s+(\S+)\s*$/i,
      /^(?:routing|router)\s+training\s+run\s+inspect\s+(\S+)\s*$/i,
    ],
    keywords: {
      verbs: ['queue', 'run', 'resume', 'inspect'],
      nouns: ['routing training', 'router training', 'training run'],
    },
    examples: [
      'routing training run',
      'routing training run now --force',
      'routing training run next',
      'routing training run resume <run-id>',
      'routing training run inspect <run-id>',
    ],
    priority: 88,
  },

  parseArgs: (input, match) => {
    const normalized = input.trim().toLowerCase();
    const force = /\s--force\s*$/i.test(input);

    if (/\s+run\s+next\s*$/i.test(input)) {
      return { action: 'next' };
    }

    if (/\s+run\s+now(?:\s+--force)?\s*$/i.test(input)) {
      return { action: 'queue', runNow: true, force };
    }

    if (/\s+run\s+resume\s+/i.test(input)) {
      return { action: 'resume', runId: match?.[1] };
    }

    if (/\s+run\s+inspect\s+/i.test(input)) {
      return { action: 'inspect', runId: match?.[1] };
    }

    if (normalized.includes('routing training run') || normalized.includes('router training run')) {
      return { action: 'queue', runNow: false, force };
    }

    return { action: 'help' };
  },

  execute: async (args, context) => {
    const action = typeof args.action === 'string' ? args.action : 'help';

    if (action === 'queue') {
      const result = await context.services.routerTraining.queueTrainingRun({
        runNow: args.runNow === true,
        force: args.force === true,
      });

      let response = fmt.success(`${result.started ? 'Queued and started' : 'Queued'} router training run ${result.runId}`);
      response += `\n${fmt.keyValue('dataset', result.datasetVersion, 2)}`;
      response += `\n${fmt.keyValue('examples', String(result.queuedExamples), 2)}`;
      response += `\n${fmt.keyValue('started', yesNo(result.started), 2)}`;
      return response;
    }

    if (action === 'next') {
      const result = await context.services.routerTraining.runNextQueuedTraining();
      if (!result) {
        return fmt.info('No queued router training runs are waiting.');
      }

      let response = fmt.success(`Ran next queued router training job: ${result.runId}`);
      response += `\n${fmt.keyValue('status', result.status, 2)}`;
      if (result.failureReason) {
        response += `\n${fmt.keyValue('failure', result.failureReason, 2)}`;
      }
      return response;
    }

    if (action === 'resume') {
      const runId = typeof args.runId === 'string' ? args.runId.trim() : '';
      if (!runId) {
        return 'Usage: routing training run resume <run-id>';
      }

      const result = await context.services.routerTraining.executeQueuedRun(runId);
      let response = fmt.success(`Resumed router training run ${result.runId}`);
      response += `\n${fmt.keyValue('status', result.status, 2)}`;
      if (result.failureReason) {
        response += `\n${fmt.keyValue('failure', result.failureReason, 2)}`;
      }
      return response;
    }

    if (action === 'inspect') {
      const runId = typeof args.runId === 'string' ? args.runId.trim() : '';
      if (!runId) {
        return 'Usage: routing training run inspect <run-id>';
      }

      const run = context.services.routerTraining.getTrainingRun(runId);
      if (!run) {
        return `Router training run not found: ${runId}`;
      }

      const adapter = context.services.routerTraining.getAdapterForRun(runId);
      return renderRunDetails(run, adapter);
    }

    return [
      'Usage:',
      '  routing training run',
      '  routing training run now --force',
      '  routing training run next',
      '  routing training run resume <run-id>',
      '  routing training run inspect <run-id>',
    ].join('\n');
  },
};

export const compareRouterTrainingRunTool: Tool = {
  name: 'compareRouterTrainingRunTool',
  description: 'Compare a router training candidate against the current baseline runtime',

  routing: {
    patterns: [
      /^(?:routing|router)\s+training\s+compare\s+(\S+)\s*$/i,
    ],
    keywords: {
      verbs: ['compare'],
      nouns: ['routing training', 'router training', 'candidate', 'baseline'],
    },
    examples: [
      'routing training compare <run-id>',
      'router training compare <run-id>',
    ],
    priority: 88,
  },

  parseArgs: (_input, match) => ({ runId: match?.[1] }),

  execute: async (args, context) => {
    const runId = typeof args.runId === 'string' ? args.runId.trim() : '';
    if (!runId) {
      return 'Usage: routing training compare <run-id>';
    }

    const result = await context.services.routerTraining.compareTrainingRun(runId);
    let response = fmt.header(`Router Training Compare ${result.run.id}`, '⚖️');
    response += `${fmt.keyValue('candidate adapter', result.adapter.adapterVersion)}\n`;
    response += `${fmt.keyValue('baseline runtime', `${result.baselineRuntime.model} (${result.baselineRuntime.source})`)}\n`;
    response += `${fmt.keyValue('candidate runtime', `${result.candidateRuntime.model} (${result.candidateRuntime.source})`)}\n`;
    response += `${fmt.keyValue('absolute gate', result.absoluteGate.passed ? 'passed' : 'failed')}\n`;
    response += `${fmt.keyValue('compare gate', result.compareVerdict ? (result.compareVerdict.passed ? 'passed' : 'failed') : 'skipped')}\n`;

    response += `\n${fmt.section('Absolute Gate')}\n`;
    for (const line of formatAbsoluteGateChecks(result)) {
      response += `${fmt.bullet(line, 2)}\n`;
    }
    if (result.absoluteGate.reasons.length > 0) {
      response += `${fmt.keyValue('reasons', result.absoluteGate.reasons.join('; '), 2)}\n`;
    }

    response += `\n${fmt.section('Baseline vs Candidate')}\n`;
    for (const line of formatCompareChecks(result)) {
      response += `${fmt.bullet(line, 2)}\n`;
    }
    if (result.compareVerdict?.reasons?.length) {
      response += `${fmt.keyValue('compare reasons', result.compareVerdict.reasons.join('; '), 2)}\n`;
    }

    return response.trimEnd();
  },
};

export const promoteRouterTrainingRunTool: Tool = {
  name: 'promoteRouterTrainingRunTool',
  description: 'Promote an eligible router training run through shadow, canary, or active states',

  routing: {
    patterns: [
      /^(?:routing|router)\s+training\s+promote\s+(\S+)\s*$/i,
    ],
    keywords: {
      verbs: ['promote'],
      nouns: ['routing training', 'router training', 'run'],
    },
    examples: [
      'routing training promote <run-id>',
      'router training promote <run-id>',
    ],
    priority: 88,
  },

  parseArgs: (_input, match) => ({ runId: match?.[1] }),

  execute: async (args, context) => {
    const runId = typeof args.runId === 'string' ? args.runId.trim() : '';
    if (!runId) {
      return 'Usage: routing training promote <run-id>';
    }

    const result = await context.services.routerTraining.promoteTrainingRun(runId);
    let response = fmt.success(`Promotion advanced for run ${result.runId}`);
    response += `\n${fmt.keyValue('status', result.status, 2)}`;
    if (result.failureReason) {
      response += `\n${fmt.keyValue('failure', result.failureReason, 2)}`;
    }
    return response;
  },
};

export const rollbackRouterTrainingTool: Tool = {
  name: 'rollbackRouterTrainingTool',
  description: 'Rollback the currently active router adapter',

  routing: {
    patterns: [
      /^(?:routing|router)\s+training\s+rollback(?:\s+(.+))?\s*$/i,
    ],
    keywords: {
      verbs: ['rollback', 'revert'],
      nouns: ['routing training', 'router training', 'adapter'],
    },
    examples: [
      'routing training rollback',
      'routing training rollback manual regression observed',
    ],
    priority: 88,
  },

  parseArgs: (_input, match) => ({
    reason: match?.[1]?.trim(),
  }),

  execute: async (args, context) => {
    const reason = typeof args.reason === 'string' && args.reason.trim()
      ? args.reason.trim()
      : 'manual-cli-rollback';

    const result = context.services.routerTraining.rollbackActiveAdapter('user', reason);
    if (!result.rolledBackAdapterId) {
      return 'No active router adapter is available to roll back.';
    }

    let response = fmt.success(`Rolled back adapter ${result.rolledBackAdapterId}`);
    response += `\n${fmt.keyValue('restored adapter', result.restoredAdapterId || 'none', 2)}`;
    response += `\n${fmt.keyValue('reason', reason, 2)}`;
    return response;
  },
};

export const routerTrainingTools: Tool[] = [
  showRouterTrainingStatus,
  showRouterTrainingReviewQueue,
  approveRouterTrainingReview,
  rejectRouterTrainingReview,
  manageRouterTrainingRun,
  compareRouterTrainingRunTool,
  promoteRouterTrainingRunTool,
  rollbackRouterTrainingTool,
];
