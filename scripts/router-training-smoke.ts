#!/usr/bin/env tsx

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import type { Config } from '../src/config.js';
import { LogLevel, configureLogger } from '../src/utils/logger.js';
import { LearningService, type RoutingTrainingExampleInput } from '../src/services/learning.js';
import { RouterTrainingService } from '../src/services/router-training.js';

interface ScenarioResult {
  name: string;
  details: string[];
}

const SANDBOX_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'bartleby-router-training-smoke-'));
configureLogger({
  level: LogLevel.ERROR,
  console: false,
  file: path.join(SANDBOX_ROOT, 'router-training-smoke.log'),
});

function makeConfig(rootDir: string, overrides: Partial<Config['routerTraining']> = {}): Config {
  const logDir = path.join(rootDir, 'logs');
  fs.mkdirSync(logDir, { recursive: true });

  return {
    llm: {
      router: {
        model: 'router-base-smoke',
        url: 'http://127.0.0.1:1/v1',
        maxTokens: 128,
      },
      fast: {
        model: 'fast-smoke',
        url: 'http://127.0.0.1:1/v1',
        maxTokens: 256,
      },
      thinking: {
        model: 'thinking-smoke',
        url: 'http://127.0.0.1:1/v1',
        maxTokens: 512,
        budget: 1024,
      },
      healthTimeout: 10,
      agentMaxIterations: 4,
      apiKey: undefined,
    },
    embeddings: {
      url: 'http://127.0.0.1:1/v1',
      model: 'embed-smoke',
      dimensions: 384,
      apiKey: undefined,
    },
    ocr: {
      enabled: false,
      url: undefined,
      model: undefined,
      maxTokens: 256,
      apiKey: undefined,
    },
    paths: {
      garden: path.join(rootDir, 'garden'),
      shed: path.join(rootDir, 'shed'),
      database: path.join(rootDir, 'database'),
      logs: logDir,
      inbox: path.join(rootDir, 'inbox'),
    },
    dashboard: {
      host: 'localhost',
      port: 0,
      apiToken: undefined,
      allowedIps: [],
    },
    weather: {
      city: undefined,
      apiKey: undefined,
      units: 'F',
    },
    signal: {
      enabled: false,
      cliPath: '/usr/bin/false',
      number: undefined,
      recipient: undefined,
      timeout: 1000,
      receiveEnabled: false,
      allowedSenders: [],
    },
    scheduler: {
      enabled: false,
      checkInterval: 60000,
      missedReminders: 'ask',
    },
    calendar: {
      timezone: 'UTC',
      defaultDuration: 60,
      ambiguousTime: 'afternoon',
      weekStart: 'monday',
      reminderMinutes: 15,
      dateFormat: 'mdy',
    },
    presence: {
      startup: false,
      shutdown: false,
      scheduled: false,
      contextual: false,
      idle: false,
      idleMinutes: 5,
      morningHour: 8,
      eveningHour: 18,
      weeklyDay: 0,
      weeklyHour: 9,
    },
    routerTraining: {
      enabled: true,
      captureMode: 'all_local',
      retentionDays: 30,
      autoTrainEnabled: false,
      autoTrainIntervalHours: 168,
      dailyReviewQueueLimit: 10,
      minimumExamplesToTrain: 3,
      minimumShadowObservationsToPromote: 0,
      minimumCanaryRequestsToPromote: 0,
      minimumCanarySuccessRateToPromote: 0.95,
      maxCanaryLatencyRegressionMsToPromote: 250,
      hardwarePreset: 'cpu_safe',
      shadowEnabled: false,
      canaryPercent: 0,
      ...overrides,
    },
    logging: {
      level: 'error',
      file: path.join(logDir, 'bartleby.log'),
      console: false,
      llmVerbose: false,
    },
  };
}

function makeSandbox(name: string): string {
  return fs.mkdtempSync(path.join(SANDBOX_ROOT, `${name}-`));
}

function getColumnNames(db: Database.Database, tableName: string): string[] {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  return rows.map((row) => row.name);
}

function hasIndex(db: Database.Database, indexName: string): boolean {
  const row = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?`)
    .get(indexName) as { name?: string } | undefined;
  return Boolean(row?.name);
}

function seedReviewedExamples(learning: LearningService, count: number = 3): void {
  for (let i = 0; i < count; i++) {
    const label = i % 3 === 0 ? 'DIRECT_TOOL' : i % 3 === 1 ? 'FAST_AGENT' : 'THINKING_AGENT';
    const input: RoutingTrainingExampleInput = {
      captureMode: 'all_local',
      userId: 'user',
      sanitizedInput: `smoke example ${i} for ${label}`,
      piiRedactionVersion: 'smoke-v1',
      predictedComplexity: label === 'THINKING_AGENT' ? 'COMPLEX' : 'SIMPLE',
      chosenRoute: label,
      finalTier: label === 'DIRECT_TOOL' ? 'router' : label === 'FAST_AGENT' ? 'fast' : 'thinking',
      matchedTool: label === 'DIRECT_TOOL' ? 'showHelp' : undefined,
      decisionSignals: ['smoke-test'],
      success: true,
      responseTimeMs: 20 + i,
      userCorrectionWithin1Turn: false,
      retryCount: 0,
      escalatedAfterResponse: false,
      qualityScore: 0.95,
      candidateLabel: label,
      candidateLabelSource: 'human',
      candidateLabelConfidence: 1,
      labelStatus: 'reviewed',
      reviewedBy: 'smoke-test',
      reviewedAt: new Date().toISOString(),
      reviewNotes: 'seeded for smoke test',
    };
    learning.recordRoutingTrainingExample(input);
  }
}

function makeEvalSummary() {
  return {
    dataset: 'smoke-dataset',
    samples: 3,
    complexity_accuracy: { correct: 3, count: 3, total: 3, rate: 100 },
    route_type_accuracy: { correct: 3, count: 3, total: 3, rate: 100 },
    thinking_rate: { count: 1, total: 3, rate: 33.3 },
    thinking_rate_on_expected_simple: { count: 0, total: 2, rate: 0 },
    avg_routing_latency_ms: 25,
    confusion: {
      SIMPLE: { SIMPLE: 2, COMPLEX: 0 },
      COMPLEX: { SIMPLE: 0, COMPLEX: 1 },
    },
    route_breakdown_by_expected_complexity: {
      SIMPLE: { routed: 2, 'llm-simple': 0, 'llm-complex': 0 },
      COMPLEX: { routed: 0, 'llm-simple': 0, 'llm-complex': 1 },
    },
    mismatch_count: 0,
    mismatches: [],
  };
}

function patchComparePass(service: RouterTrainingService): void {
  (service as any).compareTrainingRun = async (runId: string) => {
    const run = service.getTrainingRun(runId);
    const adapter = service.getAdapterForRun(runId);
    assert(run, `expected run ${runId} to exist`);
    assert(adapter, `expected adapter for run ${runId} to exist`);

    return {
      run,
      adapter,
      baselineRuntime: {
        source: 'base',
        model: run.baseModel,
        modelVersion: run.baseModelVersion,
        baseModel: run.baseModel,
        baseModelVersion: run.baseModelVersion,
      },
      candidateRuntime: {
        source: 'active-adapter',
        model: adapter.runtimeBinding?.model ?? `${run.baseModel}-candidate`,
        modelVersion: adapter.runtimeBinding?.modelVersion ?? adapter.adapterVersion,
        baseModel: run.baseModel,
        baseModelVersion: run.baseModelVersion,
        activeAdapterId: adapter.id,
        activeAdapterVersion: adapter.adapterVersion,
      },
      candidateEval: makeEvalSummary(),
      absoluteGate: {
        passed: true,
        mode: 'single-router-absolute',
        thresholds: {
          minComplexityAccuracyRate: 85,
          minRouteTypeAccuracyRate: 80,
          maxThinkingRateOnExpectedSimple: 20,
          maxAvgRoutingLatencyMs: 1500,
        },
        checks: {
          complexity_accuracy: { passed: true, actual: 100, threshold: 85 },
          route_type_accuracy: { passed: true, actual: 100, threshold: 80 },
          thinking_rate_on_expected_simple: { passed: true, actual: 0, threshold: 20 },
          avg_routing_latency_ms: { passed: true, actual: 25, threshold: 1500 },
        },
        reasons: [],
        notes: ['smoke-test forced pass'],
      },
      compareSummary: undefined,
      compareVerdict: undefined,
    };
  };
}

function patchCompareFail(service: RouterTrainingService, reason: string): void {
  (service as any).compareTrainingRun = async (runId: string) => {
    const run = service.getTrainingRun(runId);
    const adapter = service.getAdapterForRun(runId);
    assert(run, `expected run ${runId} to exist`);
    assert(adapter, `expected adapter for run ${runId} to exist`);

    return {
      run,
      adapter,
      baselineRuntime: {
        source: 'base',
        model: run.baseModel,
        modelVersion: run.baseModelVersion,
        baseModel: run.baseModel,
        baseModelVersion: run.baseModelVersion,
      },
      candidateRuntime: {
        source: 'active-adapter',
        model: adapter.runtimeBinding?.model ?? `${run.baseModel}-candidate`,
        modelVersion: adapter.runtimeBinding?.modelVersion ?? adapter.adapterVersion,
        baseModel: run.baseModel,
        baseModelVersion: run.baseModelVersion,
        activeAdapterId: adapter.id,
        activeAdapterVersion: adapter.adapterVersion,
      },
      candidateEval: makeEvalSummary(),
      absoluteGate: {
        passed: false,
        mode: 'single-router-absolute',
        thresholds: {
          minComplexityAccuracyRate: 85,
          minRouteTypeAccuracyRate: 80,
          maxThinkingRateOnExpectedSimple: 20,
          maxAvgRoutingLatencyMs: 1500,
        },
        checks: {
          complexity_accuracy: { passed: false, actual: 70, threshold: 85 },
          route_type_accuracy: { passed: true, actual: 100, threshold: 80 },
          thinking_rate_on_expected_simple: { passed: true, actual: 0, threshold: 20 },
          avg_routing_latency_ms: { passed: true, actual: 25, threshold: 1500 },
        },
        reasons: [reason],
        notes: ['smoke-test forced failure'],
      },
      compareSummary: undefined,
      compareVerdict: undefined,
    };
  };
}

class SuccessfulWorker {
  async run(input: {
    runId: string;
    configPath: string;
    runDir: string;
    onEvent?: (event: Record<string, unknown>) => void;
  }) {
    fs.mkdirSync(input.runDir, { recursive: true });
    const artifactDir = path.join(input.runDir, 'artifacts');
    fs.mkdirSync(artifactDir, { recursive: true });
    const adapterPath = path.join(artifactDir, `${input.runId}.safetensors`);
    fs.writeFileSync(adapterPath, 'smoke adapter\n', 'utf-8');

    input.onEvent?.({ type: 'status', stage: 'train', message: 'smoke training start' });
    input.onEvent?.({ type: 'progress', stage: 'train', percent: 50, message: 'halfway' });
    input.onEvent?.({ type: 'metrics', metrics: { val_accuracy: 0.91, simulated: true } });

    return {
      exitCode: 0,
      adapterPath,
      format: 'safetensors',
      metrics: { val_accuracy: 0.91, simulated: true },
      eventCount: 3,
    };
  }
}

class MissingArtifactWorker {
  async run(input: {
    runId: string;
    configPath: string;
    runDir: string;
    onEvent?: (event: Record<string, unknown>) => void;
  }) {
    fs.mkdirSync(input.runDir, { recursive: true });
    input.onEvent?.({ type: 'status', stage: 'train', message: 'missing artifact path' });
    input.onEvent?.({ type: 'metrics', metrics: { simulated: true } });

    return {
      exitCode: 0,
      adapterPath: undefined,
      format: 'safetensors',
      metrics: { simulated: true },
      eventCount: 2,
    };
  }
}

class ThrowingWorker {
  async run() {
    throw new Error('simulated worker crash');
  }
}

async function withHarness<T>(
  name: string,
  worker: unknown,
  overrides: Partial<Config['routerTraining']>,
  fn: (ctx: {
    rootDir: string;
    db: Database.Database;
    learning: LearningService;
    service: RouterTrainingService;
  }) => Promise<T>
): Promise<T> {
  const rootDir = makeSandbox(name);
  const previousCwd = process.cwd();
  process.chdir(rootDir);

  const db = new Database(path.join(rootDir, 'learning.sqlite'));
  const learning = new LearningService(db);
  const config = makeConfig(rootDir, overrides);
  const service = new RouterTrainingService(config, learning, worker as any);

  try {
    await service.initialize();
    return await fn({ rootDir, db, learning, service });
  } finally {
    service.close();
    learning.close();
    db.close();
    process.chdir(previousCwd);
  }
}

async function testFreshBootstrap(): Promise<ScenarioResult> {
  const db = new Database(':memory:');
  try {
    new LearningService(db);
    const tables = ['routing_events', 'routing_training_examples', 'router_training_runs', 'router_adapters'];
    for (const table of tables) {
      const row = db
        .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
        .get(table) as { name?: string } | undefined;
      assert.equal(row?.name, table, `expected table ${table} to exist`);
    }

    const routingColumns = getColumnNames(db, 'routing_events');
    for (const column of ['router_model', 'router_model_version', 'router_source', 'router_adapter_id', 'router_adapter_version', 'trace_id']) {
      assert.ok(routingColumns.includes(column), `expected routing_events.${column}`);
    }

    const adapterColumns = getColumnNames(db, 'router_adapters');
    for (const column of ['runtime_binding_json', 'eval_summary_json']) {
      assert.ok(adapterColumns.includes(column), `expected router_adapters.${column}`);
    }

    assert.ok(hasIndex(db, 'idx_routing_events_trace_id'));
    assert.ok(hasIndex(db, 'idx_rtr_status'));
    assert.ok(hasIndex(db, 'idx_ra_user_state'));

    new LearningService(db);

    return {
      name: 'fresh bootstrap migration smoke',
      details: [
        'created router training tables and indexes on a fresh database',
        'verified routing telemetry and adapter runtime-binding columns',
        'confirmed LearningService migrations are idempotent on repeat initialization',
      ],
    };
  } finally {
    db.close();
  }
}

async function testLegacyUpgrade(): Promise<ScenarioResult> {
  const dbPath = path.join(makeSandbox('legacy-upgrade'), 'legacy.sqlite');
  const db = new Database(dbPath);

  try {
    db.exec(`
      CREATE TABLE routing_events (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        input_hash TEXT NOT NULL,
        input_length INTEGER NOT NULL,
        route_type TEXT NOT NULL,
        predicted_complexity TEXT,
        final_tier TEXT NOT NULL,
        matched_tool TEXT,
        success INTEGER NOT NULL,
        response_time_ms INTEGER NOT NULL,
        error_message TEXT,
        override_applied INTEGER NOT NULL DEFAULT 0,
        override_reason TEXT,
        decision_reason TEXT,
        decision_signals TEXT
      );
      CREATE TABLE router_adapters (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        user_id TEXT NOT NULL,
        adapter_version TEXT NOT NULL,
        base_model TEXT NOT NULL,
        base_model_version TEXT,
        source_run_id TEXT,
        path TEXT NOT NULL,
        format TEXT NOT NULL,
        lifecycle_state TEXT NOT NULL,
        promoted_at TEXT,
        rolled_back_at TEXT,
        rollback_reason TEXT,
        eval_summary_json TEXT
      );
    `);

    new LearningService(db);

    const routingColumns = getColumnNames(db, 'routing_events');
    assert.ok(routingColumns.includes('trace_id'));
    assert.ok(routingColumns.includes('router_model'));
    assert.ok(routingColumns.includes('router_adapter_version'));

    const adapterColumns = getColumnNames(db, 'router_adapters');
    assert.ok(adapterColumns.includes('runtime_binding_json'));

    assert.ok(hasIndex(db, 'idx_routing_events_trace_id'));
    new LearningService(db);

    return {
      name: 'legacy upgrade migration smoke',
      details: [
        'upgraded legacy routing_events and router_adapters tables in place',
        'added trace/runtime-binding columns without destroying existing tables',
        'confirmed repeat startup does not re-break migrated schemas',
      ],
    };
  } finally {
    db.close();
  }
}

async function testSuccessfulLifecycleAndRollback(): Promise<ScenarioResult> {
  return withHarness(
    'lifecycle-active',
    new SuccessfulWorker(),
    {
      minimumExamplesToTrain: 3,
      shadowEnabled: false,
      canaryPercent: 0,
    },
    async ({ rootDir, learning, service }) => {
      seedReviewedExamples(learning, 3);

      const fallbackPath = path.join(rootDir, 'fallback.safetensors');
      fs.writeFileSync(fallbackPath, 'fallback adapter\n', 'utf-8');
      const fallbackId = learning.registerRouterAdapter({
        userId: 'user',
        adapterVersion: 'fallback_v1',
        baseModel: 'router-base-smoke',
        baseModelVersion: 'router-base-smoke',
        sourceRunId: 'fallback-run',
        path: fallbackPath,
        format: 'safetensors',
        lifecycleState: 'archived',
        runtimeBinding: {
          model: 'router-fallback-smoke',
          modelVersion: 'fallback_v1',
          updatedAt: new Date().toISOString(),
          notes: 'rollback fallback for smoke test',
        },
        evalSummary: { smoke: true },
      });

      patchComparePass(service);

      const queued = await service.queueTrainingRun();
      const beforeRun = service.getTrainingRun(queued.runId);
      assert(beforeRun);
      assert.equal(beforeRun.status, 'queued');
      assert.equal(beforeRun.stage, 'preflight');

      const result = await service.executeQueuedRun(queued.runId);
      assert.equal(result.status, 'active');

      const run = service.getTrainingRun(queued.runId);
      assert(run);
      assert.equal(run.status, 'active');
      assert.equal(run.stage, 'activate');
      assert.ok(run.startedAt);
      assert.ok(run.finishedAt);
      assert.ok((run.metrics?.worker as Record<string, unknown>)?.adapterPath);
      assert.equal((run.metrics?.promotionGate as Record<string, unknown>)?.passed, true);

      const activeAdapter = service.getActiveAdapter();
      assert(activeAdapter);
      assert.equal(activeAdapter.sourceRunId, queued.runId);
      assert.equal(activeAdapter.lifecycleState, 'active');

      const rollback = service.rollbackActiveAdapter('user', 'smoke rollback');
      assert.equal(rollback.rolledBackAdapterId, activeAdapter.id);
      assert.equal(rollback.restoredAdapterId, fallbackId);

      const restored = learning.getRouterAdapter({ id: fallbackId });
      const rolledBack = learning.getRouterAdapter({ id: activeAdapter.id });
      assert(restored);
      assert(rolledBack);
      assert.equal(restored.lifecycleState, 'active');
      assert.equal(rolledBack.lifecycleState, 'rolled_back');
      assert.equal(rolledBack.rollbackReason, 'smoke rollback');

      return {
        name: 'successful lifecycle + rollback integrity',
        details: [
          `queued run ${queued.runId} and promoted it to active`,
          'persisted worker artifacts and promotion-gate metadata on the run record',
          `rolled back the active adapter and restored archived fallback ${fallbackId}`,
        ],
      };
    }
  );
}

async function testWorkerCrashFailure(): Promise<ScenarioResult> {
  return withHarness(
    'worker-crash',
    new ThrowingWorker(),
    {
      minimumExamplesToTrain: 3,
      shadowEnabled: false,
      canaryPercent: 0,
    },
    async ({ service, learning }) => {
      seedReviewedExamples(learning, 3);
      const queued = await service.queueTrainingRun();
      const result = await service.executeQueuedRun(queued.runId);
      assert.equal(result.status, 'failed');
      assert.match(result.failureReason ?? '', /simulated worker crash/);

      const run = service.getTrainingRun(queued.runId);
      assert(run);
      assert.equal(run.status, 'failed');
      assert.match(run.failureReason ?? '', /simulated worker crash/);

      return {
        name: 'worker crash failure handling',
        details: [
          `captured worker exception for run ${queued.runId}`,
          'persisted failed terminal state without activating any adapter',
        ],
      };
    }
  );
}

async function testMissingArtifactFailure(): Promise<ScenarioResult> {
  return withHarness(
    'missing-artifact',
    new MissingArtifactWorker(),
    {
      minimumExamplesToTrain: 3,
      shadowEnabled: false,
      canaryPercent: 0,
    },
    async ({ service, learning }) => {
      seedReviewedExamples(learning, 3);
      const queued = await service.queueTrainingRun();
      const result = await service.executeQueuedRun(queued.runId);
      assert.equal(result.status, 'rejected');
      assert.match(result.failureReason ?? '', /without producing an adapter artifact/);

      const run = service.getTrainingRun(queued.runId);
      assert(run);
      assert.equal(run.status, 'rejected');
      assert.equal(run.stage, 'eval');

      return {
        name: 'missing artifact rejection',
        details: [
          `rejected run ${queued.runId} when the worker returned no adapter artifact`,
          'kept the failure non-destructive by stopping before activation',
        ],
      };
    }
  );
}

async function testGateFailure(): Promise<ScenarioResult> {
  return withHarness(
    'gate-failure',
    new SuccessfulWorker(),
    {
      minimumExamplesToTrain: 3,
      shadowEnabled: false,
      canaryPercent: 0,
    },
    async ({ service, learning }) => {
      seedReviewedExamples(learning, 3);
      patchCompareFail(service, 'forced smoke gate failure');

      const queued = await service.queueTrainingRun();
      const result = await service.executeQueuedRun(queued.runId);
      assert.equal(result.status, 'rejected');
      assert.match(result.failureReason ?? '', /forced smoke gate failure/);
      assert.equal(service.getActiveAdapter(), null);

      const run = service.getTrainingRun(queued.runId);
      const adapter = service.getAdapterForRun(queued.runId);
      assert(run);
      assert(adapter);
      assert.equal(run.status, 'rejected');
      assert.equal(adapter.lifecycleState, 'archived');
      assert.equal((adapter.evalSummary?.gate_verdict as Record<string, unknown>)?.passed, false);

      return {
        name: 'promotion gate rejection',
        details: [
          `blocked activation for run ${queued.runId} on a forced gate failure`,
          'left the candidate archived and kept the active adapter pointer unset',
        ],
      };
    }
  );
}

async function main(): Promise<void> {
  const scenarios = [
    testFreshBootstrap,
    testLegacyUpgrade,
    testSuccessfulLifecycleAndRollback,
    testWorkerCrashFailure,
    testMissingArtifactFailure,
    testGateFailure,
  ];

  const results: ScenarioResult[] = [];

  try {
    for (const scenario of scenarios) {
      results.push(await scenario());
    }
  } finally {
    fs.rmSync(SANDBOX_ROOT, { recursive: true, force: true });
  }

  console.log('Router training smoke suite passed.');
  for (const result of results) {
    console.log(`\n- ${result.name}`);
    for (const detail of result.details) {
      console.log(`  • ${detail}`);
    }
  }
}

main().catch((err) => {
  console.error('Router training smoke suite failed:', err);
  console.error(`Sandbox retained at: ${SANDBOX_ROOT}`);
  process.exit(1);
});
