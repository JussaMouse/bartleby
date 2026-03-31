// src/services/router-training.ts
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { Config } from '../config.js';
import type { ServiceContainer } from './index.js';
import type { RouterRuntimeBinding } from './llm.js';
import type {
  RouterAdapterRecord,
  RouterAdapterRuntimeBinding,
  LearningService,
  RouterAdapterLifecycleState,
  RouterRouteLabel,
  RouterTrainingRunFilters,
  RouterTrainingRunRecord,
  RouterTrainingRunStage,
  RouterTrainingRunStatus,
  RoutingLabelStatus,
  RoutingEventSummary,
  RoutingTrainingExampleRecord,
  RoutingTrainingExampleUpdate,
} from './learning.js';
import {
  DEFAULT_ROUTER_EVAL_DATASET,
  buildRouterEvalCompareSummary,
  buildRouterEvalCompareVerdict,
  buildRouterEvalGateVerdict,
  evaluateRouterDataset,
  type RouterEvalCompareSummary,
  type RouterEvalCompareVerdict,
  type RouterEvalGateVerdict,
  type RouterEvalSummary,
} from '../router/eval.js';
import { CommandRouter } from '../router/index.js';
import {
  RouterTrainingWorker,
  type RouterTrainingWorkerEvent,
} from './router-training-worker.js';
import { debug, info, warn } from '../utils/logger.js';

export interface RouterTrainingStatus {
  enabled: boolean;
  captureMode: 'off' | 'canary' | 'opt_in' | 'all_local';
  retentionDays: number;
  autoTrainEnabled: boolean;
  autoTrainIntervalHours: number;
  dailyReviewQueueLimit: number;
  minimumExamplesToTrain: number;
  minimumShadowObservationsToPromote: number;
  minimumCanaryRequestsToPromote: number;
  minimumCanarySuccessRateToPromote: number;
  maxCanaryLatencyRegressionMsToPromote: number;
  hardwarePreset: 'cpu_safe' | 'gpu_balanced' | 'gpu_fast';
  shadowEnabled: boolean;
  canaryPercent: number;
}

export interface CaptureFromRoutingEventInput {
  routingEventId: string;
  traceId: string;
  userId?: string;
  input: string;
  routeType: 'routed' | 'llm-simple' | 'llm-complex';
  predictedComplexity?: 'SIMPLE' | 'COMPLEX';
  finalTier: 'router' | 'fast' | 'thinking';
  matchedTool?: string;
  success: boolean;
  responseTimeMs: number;
  decisionSignals?: string[];
  optInCapture?: boolean;
}

export interface ReviewQueueItem {
  example: RoutingTrainingExampleRecord;
  reason: string;
  bucket: 'hard_negative' | 'uncertain' | 'latency_outlier';
  priority: number;
}

export interface ReviewTrainingExampleResult {
  example: RoutingTrainingExampleRecord;
}

export interface ExportDatasetOptions {
  userId?: string;
  datasetVersion?: string;
  maxExamples?: number;
}

export interface ExportDatasetResult {
  datasetVersion: string;
  datasetDir: string;
  trainPath: string;
  valPath: string;
  testPath: string;
  mlxTrainPath: string;
  mlxValPath: string;
  mlxTestPath: string;
  counts: {
    train: number;
    val: number;
    test: number;
    total: number;
  };
}

export interface QueueTrainingRunOptions {
  userId?: string;
  baseId?: string;
  basePath?: string;
  baseModel?: string;
  baseModelVersion?: string;
  outputAdapterVersion?: string;
  force?: boolean;
  runNow?: boolean;
}

export interface QueueTrainingRunResult {
  runId: string;
  datasetVersion: string;
  queuedExamples: number;
  started: boolean;
}

export interface RunExecutionResult {
  runId: string;
  status: 'shadow' | 'canary' | 'active' | 'failed' | 'rejected' | 'rolled_back';
  failureReason?: string;
}

export interface RouterTrainingDashboardSnapshot {
  status: RouterTrainingStatus;
  reviewQueueSize: number;
  reviewQueuePreview: ReviewQueueItem[];
  activeRunCount: number;
  recentRuns: RouterTrainingRunRecord[];
  activeAdapter?: RouterAdapterRecord;
  shadowAdapter?: RouterAdapterRecord;
  canaryAdapter?: RouterAdapterRecord;
  recentAdapters: RouterAdapterRecord[];
  routerRuntime: RouterRuntimeBinding;
  shadowMetrics?: RouterTrainingShadowMetrics;
  canaryMetrics?: RoutingEventSummary;
  canaryBaselineMetrics?: RoutingEventSummary;
}

export interface RouterTrainingShadowMetrics {
  totalObserved: number;
  routeMatchRate: number;
  complexityMatchRate: number;
  lastScoredAt?: string;
  lastServedRuntime?: RouterRuntimeBinding;
  lastShadowRuntime?: RouterRuntimeBinding;
}

interface PromotionReadiness {
  ready: boolean;
  actualCount: number;
  requiredCount: number;
  reason?: string;
}

interface RouterPromotionDecision {
  accepted: boolean;
  reason: string;
  evalSummary?: RouterEvalSummary;
  gateVerdict?: RouterEvalGateVerdict;
  compareSummary?: RouterEvalCompareSummary;
  compareVerdict?: RouterEvalCompareVerdict;
}

export interface RouterTrainingCompareResult {
  run: RouterTrainingRunRecord;
  adapter: RouterAdapterRecord;
  baselineRuntime: RouterRuntimeBinding;
  candidateRuntime: RouterRuntimeBinding;
  candidateEval: RouterEvalSummary;
  absoluteGate: RouterEvalGateVerdict;
  compareSummary?: RouterEvalCompareSummary;
  compareVerdict?: RouterEvalCompareVerdict;
}

interface DerivedOutcomeSignals {
  userCorrectionWithin1Turn: boolean;
  retryCount: number;
  escalatedAfterResponse: boolean;
}

/**
 * RouterTrainingService
 *
 * Phase C responsibilities:
 * - Capture eligible routing examples with sanitization + dedupe.
 * - Run periodic outcome enrichment (quality + candidate labels).
 * - Build stratified review queue for uncertain/hard-negative samples.
 *
 * Phase D responsibilities:
 * - Queue and orchestrate training runs.
 * - Freeze/export datasets for a run.
 * - Launch Python worker and persist state-machine transitions.
 */
export class RouterTrainingService {
  private config: Config;
  private learning: LearningService;
  private worker: RouterTrainingWorker;
  private runtimeServices?: ServiceContainer;

  private enricherTimer?: NodeJS.Timeout;
  private reviewQueueTimer?: NodeJS.Timeout;

  private dedupeCache = new Map<string, number>();
  private cachedReviewQueue: ReviewQueueItem[] = [];
  private activeRuns = new Set<string>();

  constructor(config: Config, learning: LearningService, worker?: RouterTrainingWorker) {
    this.config = config;
    this.learning = learning;
    this.worker = worker ?? new RouterTrainingWorker();
  }

  async initialize(): Promise<void> {
    const status = this.getStatus();
    info('RouterTrainingService initialized', {
      enabled: status.enabled,
      captureMode: status.captureMode,
      autoTrainEnabled: status.autoTrainEnabled,
      hardwarePreset: status.hardwarePreset,
    });

    if (!status.enabled || status.captureMode === 'off') {
      return;
    }

    const resumableRuns = this.learning
      .listRouterTrainingRuns({ limit: 100 })
      .filter((run) => this.isResumableRunStatus(run.status));

    if (resumableRuns.length > 0) {
      info('Router training resumable runs detected after startup', {
        count: resumableRuns.length,
        runIds: resumableRuns.map((run) => run.id),
      });
    }

    // Run once at startup so local state is up to date.
    await this.runOutcomeEnricher();
    await this.runReviewQueueBuilder();

    // Hourly enrichment pass.
    this.enricherTimer = setInterval(() => {
      void this.runOutcomeEnricher();
    }, 60 * 60 * 1000);

    // Daily review queue refresh.
    this.reviewQueueTimer = setInterval(() => {
      void this.runReviewQueueBuilder();
    }, 24 * 60 * 60 * 1000);
  }

  attachServices(services: ServiceContainer): void {
    this.runtimeServices = services;
  }

  getStatus(): RouterTrainingStatus {
    return {
      enabled: this.config.routerTraining.enabled,
      captureMode: this.config.routerTraining.captureMode,
      retentionDays: this.config.routerTraining.retentionDays,
      autoTrainEnabled: this.config.routerTraining.autoTrainEnabled,
      autoTrainIntervalHours: this.config.routerTraining.autoTrainIntervalHours,
      dailyReviewQueueLimit: this.config.routerTraining.dailyReviewQueueLimit,
      minimumExamplesToTrain: this.config.routerTraining.minimumExamplesToTrain,
      minimumShadowObservationsToPromote: this.config.routerTraining.minimumShadowObservationsToPromote,
      minimumCanaryRequestsToPromote: this.config.routerTraining.minimumCanaryRequestsToPromote,
      minimumCanarySuccessRateToPromote: this.config.routerTraining.minimumCanarySuccessRateToPromote,
      maxCanaryLatencyRegressionMsToPromote: this.config.routerTraining.maxCanaryLatencyRegressionMsToPromote,
      hardwarePreset: this.config.routerTraining.hardwarePreset,
      shadowEnabled: this.config.routerTraining.shadowEnabled,
      canaryPercent: this.config.routerTraining.canaryPercent,
    };
  }

  listTrainingRuns(filters: RouterTrainingRunFilters = {}): RouterTrainingRunRecord[] {
    return this.learning.listRouterTrainingRuns(filters);
  }

  getTrainingRun(runId: string): RouterTrainingRunRecord | null {
    return this.learning.getRouterTrainingRun(runId);
  }

  listAdapters(userId: string = 'user'): RouterAdapterRecord[] {
    return this.learning.listRouterAdapters({
      userId,
      limit: 10,
    });
  }

  getAdapterForRun(runId: string): RouterAdapterRecord | null {
    const run = this.learning.getRouterTrainingRun(runId);
    if (!run) {
      return null;
    }

    return this.learning.getRouterAdapter({
      userId: run.userId,
      sourceRunId: run.id,
      adapterVersion: run.outputAdapterVersion,
    });
  }

  getActiveAdapter(userId: string = 'user'): RouterAdapterRecord | null {
    return this.learning.listRouterAdapters({
      userId,
      lifecycleState: 'active',
      limit: 1,
    })[0] ?? null;
  }

  getShadowAdapter(userId: string = 'user'): RouterAdapterRecord | null {
    return this.learning.listRouterAdapters({
      userId,
      lifecycleState: 'shadow',
      limit: 1,
    })[0] ?? null;
  }

  getCanaryAdapter(userId: string = 'user'): RouterAdapterRecord | null {
    return this.learning.listRouterAdapters({
      userId,
      lifecycleState: 'canary',
      limit: 1,
    })[0] ?? null;
  }

  getRouterRuntimeBinding(userId: string = 'user'): RouterRuntimeBinding {
    const baseModel = this.config.llm.router.model;
    const baseModelVersion = inferModelVersion(baseModel);
    const activeAdapter = this.getActiveAdapter(userId);

    if (!activeAdapter) {
      return {
        source: 'base',
        model: baseModel,
        modelVersion: baseModelVersion,
        baseModel,
        baseModelVersion,
      };
    }

    const runtimeBinding = activeAdapter.runtimeBinding ?? this.extractRuntimeBinding(activeAdapter);
    return {
      source: 'active-adapter',
      model: runtimeBinding.model ?? baseModel,
      modelVersion: runtimeBinding.modelVersion ?? activeAdapter.adapterVersion ?? baseModelVersion,
      baseModel,
      baseModelVersion,
      activeAdapterId: activeAdapter.id,
      activeAdapterVersion: activeAdapter.adapterVersion,
    };
  }

  resolveRequestRouterRuntime(traceId: string, userId: string = 'user'): RouterRuntimeBinding {
    const active = this.getActiveAdapter(userId);
    if (active) {
      return this.buildCandidateRouterRuntimeBinding(active, 'active-adapter');
    }

    const canary = this.getCanaryAdapter(userId);
    if (canary && this.hashBucket(traceId) < this.config.routerTraining.canaryPercent) {
      return this.buildCandidateRouterRuntimeBinding(canary, 'canary-adapter');
    }

    return this.buildBaseRouterRuntimeBinding();
  }

  getDashboardSnapshot(userId: string = 'user'): RouterTrainingDashboardSnapshot {
    const recentRuns = this.learning.listRouterTrainingRuns({
      userId,
      limit: 10,
    });
    const recentAdapters = this.learning.listRouterAdapters({
      userId,
      limit: 10,
    });
    const shadowAdapter = recentAdapters.find((adapter) => adapter.lifecycleState === 'shadow');
    const canaryAdapter = recentAdapters.find((adapter) => adapter.lifecycleState === 'canary');
    const canaryMetrics = canaryAdapter
      ? this.learning.summarizeRoutingEvents({
          routerSource: 'canary-adapter',
          routerAdapterVersion: canaryAdapter.adapterVersion,
          sinceHours: 24,
          limit: 500,
        })
      : undefined;
    const canaryBaselineMetrics = canaryAdapter
      ? this.learning.summarizeRoutingEvents({
          routerSource: 'base',
          sinceHours: 24,
          limit: 500,
        })
      : undefined;

    return {
      status: this.getStatus(),
      reviewQueueSize: this.cachedReviewQueue.length,
      reviewQueuePreview: this.cachedReviewQueue.slice(0, 25),
      activeRunCount: recentRuns.filter((run) => this.isResumableRunStatus(run.status)).length,
      recentRuns,
      activeAdapter: recentAdapters.find((adapter) => adapter.lifecycleState === 'active'),
      shadowAdapter,
      canaryAdapter,
      recentAdapters,
      routerRuntime: this.getRouterRuntimeBinding(userId),
      shadowMetrics: shadowAdapter ? this.getShadowMetrics(shadowAdapter) : undefined,
      canaryMetrics,
      canaryBaselineMetrics,
    };
  }

  rollbackActiveAdapter(userId: string = 'user', reason: string = 'manual-dashboard-rollback') {
    return this.learning.rollbackRouterAdapter(userId, reason);
  }

  async promoteTrainingRun(runId: string): Promise<RunExecutionResult> {
    const run = this.requireRun(runId);
    const adapter = this.findAdapterForRun(run);
    if (!adapter) {
      throw new Error(`No adapter registered for run ${runId}`);
    }

    if (run.status === 'shadow') {
      const shadowReadiness = this.getShadowPromotionReadiness(adapter);
      if (!shadowReadiness.ready) {
        throw new Error(shadowReadiness.reason ?? 'Shadow promotion threshold not met');
      }

      if (this.config.routerTraining.canaryPercent > 0) {
        this.learning.updateRouterAdapterLifecycle(adapter.id, {
          lifecycleState: 'canary',
        });
        this.transitionRun(runId, {
          status: 'canary',
          stage: 'canary',
        });
        return { runId, status: 'canary' };
      }

      return this.activatePromotedRun(run, adapter.id);
    }

    if (run.status === 'canary') {
      const canaryReadiness = this.getCanaryPromotionReadiness(adapter);
      if (!canaryReadiness.ready) {
        throw new Error(canaryReadiness.reason ?? 'Canary promotion threshold not met');
      }

      return this.activatePromotedRun(run, adapter.id);
    }

    if (run.status === 'evaluating') {
      return this.promoteRunToActive(run, adapter.id);
    }

    throw new Error(`Run ${runId} is not promotable from status ${run.status}`);
  }

  async compareTrainingRun(runId: string): Promise<RouterTrainingCompareResult> {
    if (!this.runtimeServices) {
      throw new Error('RouterTrainingService runtime services not attached for compare');
    }

    const run = this.requireRun(runId);
    const adapter = this.findAdapterForRun(run);
    if (!adapter) {
      throw new Error(`No adapter registered for run ${runId}`);
    }

    const router = new CommandRouter();
    await router.initialize(this.runtimeServices);

    const datasetPath =
      typeof run.config?.evalDatasetPath === 'string' && run.config.evalDatasetPath.trim()
        ? run.config.evalDatasetPath.trim()
        : DEFAULT_ROUTER_EVAL_DATASET;

    const baselineRuntime = this.buildBaseRouterRuntimeBinding();
    const candidateRuntime = this.buildCandidateRouterRuntimeBinding(adapter);

    const candidateEval = await this.runtimeServices.llm.withTemporaryRouterRuntimeBinding(
      candidateRuntime,
      () => evaluateRouterDataset(router, datasetPath)
    );
    const absoluteGate = buildRouterEvalGateVerdict(candidateEval);

    let compareSummary: RouterEvalCompareSummary | undefined;
    let compareVerdict: RouterEvalCompareVerdict | undefined;

    if (!this.sameRouterRuntimeBinding(baselineRuntime, candidateRuntime)) {
      const baselineEval = await this.runtimeServices.llm.withTemporaryRouterRuntimeBinding(
        baselineRuntime,
        () => evaluateRouterDataset(router, datasetPath)
      );
      compareSummary = buildRouterEvalCompareSummary(baselineEval, candidateEval);
      compareVerdict = buildRouterEvalCompareVerdict(compareSummary);
    }

    return {
      run,
      adapter,
      baselineRuntime,
      candidateRuntime,
      candidateEval,
      absoluteGate,
      compareSummary,
      compareVerdict,
    };
  }

  async scoreShadowRoutingDecision(input: {
    traceId: string;
    userId?: string;
    command: string;
    actual: {
      routeType: 'routed' | 'llm-simple' | 'llm-complex';
      predictedComplexity?: 'SIMPLE' | 'COMPLEX';
      matchedTool?: string;
    };
    servedRuntime: RouterRuntimeBinding;
    router: CommandRouter;
  }): Promise<void> {
    if (!this.runtimeServices) return;

    const shadowAdapter = this.getShadowAdapter(input.userId ?? 'user');
    if (!shadowAdapter) return;

    const shadowRuntime = this.buildCandidateRouterRuntimeBinding(shadowAdapter, 'shadow-adapter');
    const shadowResult = await this.runtimeServices.llm.withTemporaryRouterRuntimeBinding(
      shadowRuntime,
      () => input.router.route(input.command)
    );

    const evalSummary = shadowAdapter.evalSummary ?? {};
    const shadowStats = ((evalSummary.shadow_stats ?? {}) as Record<string, unknown>);
    const total = toNumber(shadowStats.total) ?? 0;
    const routeMatches = toNumber(shadowStats.route_matches) ?? 0;
    const complexityMatches = toNumber(shadowStats.complexity_matches) ?? 0;

    const nextSummary: Record<string, unknown> = {
      ...evalSummary,
      shadow_stats: {
        total: total + 1,
        route_matches: routeMatches + (shadowResult.type === input.actual.routeType ? 1 : 0),
        complexity_matches:
          complexityMatches + (shadowResult.complexity === input.actual.predictedComplexity ? 1 : 0),
        last_scored_at: new Date().toISOString(),
        last_served_runtime: input.servedRuntime,
        last_shadow_runtime: shadowRuntime,
        last_observation: {
          trace_id: input.traceId,
          input: input.command,
          actual_route_type: input.actual.routeType,
          shadow_route_type: shadowResult.type,
          actual_complexity: input.actual.predictedComplexity,
          shadow_complexity: shadowResult.complexity,
          actual_tool: input.actual.matchedTool,
          shadow_tool: shadowResult.route?.tool,
        },
      },
    };

    this.learning.updateRouterAdapterLifecycle(shadowAdapter.id, {
      evalSummary: nextSummary,
    });
  }

  setAdapterRuntimeBinding(
    adapterId: string,
    binding: { model: string; modelVersion?: string; notes?: string } | null
  ): RouterAdapterRecord {
    const adapter = this.learning.getRouterAdapter({ id: adapterId });
    if (!adapter) {
      throw new Error(`Router adapter not found: ${adapterId}`);
    }

    const runtimeBinding: RouterAdapterRuntimeBinding | null = binding
      ? {
          model: binding.model.trim(),
          modelVersion: binding.modelVersion?.trim() || inferModelVersion(binding.model),
          updatedAt: new Date().toISOString(),
          notes: binding.notes?.trim() || undefined,
        }
      : null;

    if (runtimeBinding && !runtimeBinding.model) {
      throw new Error('Runtime binding model is required');
    }

    const changed = this.learning.updateRouterAdapterLifecycle(adapterId, {
      runtimeBinding,
    });

    if (!changed) {
      throw new Error(`Failed to update runtime binding for adapter ${adapterId}`);
    }

    const updated = this.learning.getRouterAdapter({ id: adapterId });
    if (!updated) {
      throw new Error(`Router adapter missing after runtime binding update: ${adapterId}`);
    }

    return updated;
  }

  async queueTrainingRun(options: QueueTrainingRunOptions = {}): Promise<QueueTrainingRunResult> {
    const userId = options.userId ?? 'user';
    const runNow = options.runNow ?? false;

    const dataset = this.exportDatasetSnapshot({
      userId,
    });

    if (!options.force && dataset.counts.total < this.config.routerTraining.minimumExamplesToTrain) {
      throw new Error(
        `Need at least ${this.config.routerTraining.minimumExamplesToTrain} examples to train (have ${dataset.counts.total})`
      );
    }

    const outputAdapterVersion =
      options.outputAdapterVersion ??
      `adapter_${dataset.datasetVersion}_${Date.now()}`;
    const baseId = options.baseId ?? 'qwen3.5-2b-bf16-v0';
    const baseModel = options.baseModel ?? 'Qwen3.5-2B-BF16';
    const baseModelVersion = options.baseModelVersion ?? inferModelVersion(baseModel);
    const basePath = options.basePath ?? path.join('/Users/env/server/mlx-box/models/router-bases', baseId);

    this.learning.registerRouterModelBase({
      id: baseId,
      baseFamily: 'qwen',
      baseModelName: baseModel,
      basePrecision: 'bf16',
      baseFormat: 'mlx',
      tokenizerId: baseModel,
      sourceUriOrOrigin: baseModel,
      localPath: basePath,
      notes: 'Canonical immutable router training base',
    });

    const runConfig = {
      userId,
      datasetVersion: dataset.datasetVersion,
      datasetDir: dataset.datasetDir,
      trainPath: dataset.trainPath,
      valPath: dataset.valPath,
      testPath: dataset.testPath,
      mlxTrainPath: dataset.mlxTrainPath,
      mlxValPath: dataset.mlxValPath,
      mlxTestPath: dataset.mlxTestPath,
      hardwarePreset: this.config.routerTraining.hardwarePreset,
      shadowEnabled: this.config.routerTraining.shadowEnabled,
      canaryPercent: this.config.routerTraining.canaryPercent,
      retentionDays: this.config.routerTraining.retentionDays,
      baseId,
      basePath,
      baseModel,
      baseModelVersion,
      outputAdapterVersion,
      artifactId: outputAdapterVersion,
      artifactDir: path.join(process.cwd(), 'data', 'router-training', 'artifacts', outputAdapterVersion),
      routerTrainingEnvDir: '/Users/env/server/mlx-box/router-training',
      mlxLmCli: 'mlx_lm.lora',
      simulated: false,
      queuedAt: new Date().toISOString(),
      routerRuntimeBinding: {
        model: baseModel,
        modelVersion: baseModelVersion,
        baseId,
        artifactPath: basePath,
        artifactFormat: 'mlx',
        artifactPrecision: 'bf16',
        notes: 'frozen at queue time',
      },
      mlxLmTrainArgs: {
        batchSize: 4,
        iters: 200,
        learningRate: 1e-4,
        stepsPerReport: 10,
        stepsPerEval: 25,
        saveEvery: 50,
        numLayers: 8,
      },
    };

    const runId = this.learning.createRouterTrainingRun({
      userId,
      datasetVersion: dataset.datasetVersion,
      baseId,
      baseModel,
      baseModelVersion,
      outputAdapterVersion,
      status: 'queued',
      stage: 'preflight',
      config: runConfig,
      metrics: {
        dataset: dataset.counts,
      },
    });

    info('Router training run queued', {
      runId,
      userId,
      datasetVersion: dataset.datasetVersion,
      queuedExamples: dataset.counts.total,
      runNow,
    });

    if (runNow) {
      await this.executeQueuedRun(runId);
    }

    return {
      runId,
      datasetVersion: dataset.datasetVersion,
      queuedExamples: dataset.counts.total,
      started: runNow,
    };
  }

  async runNextQueuedTraining(userId: string = 'user'): Promise<RunExecutionResult | null> {
    const queued = this.learning.listRouterTrainingRuns({
      userId,
      status: 'queued',
      limit: 10,
    });

    if (queued.length === 0) {
      return null;
    }

    // Oldest queued run first.
    const next = queued.sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    )[0];

    return this.executeQueuedRun(next.id);
  }

  async executeQueuedRun(runId: string): Promise<RunExecutionResult> {
    if (this.activeRuns.has(runId)) {
      throw new Error(`Run already active: ${runId}`);
    }

    const run = this.learning.getRouterTrainingRun(runId);
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }

    if (!this.isResumableRunStatus(run.status)) {
      throw new Error(`Run ${runId} is not executable from status ${run.status}`);
    }

    this.activeRuns.add(runId);

    try {
      const runArtifacts = this.ensureRunArtifacts(run);
      let latestRun = this.requireRun(runId);
      let adapterRecord = this.findAdapterForRun(latestRun);

      if (adapterRecord && (latestRun.status === 'queued' || latestRun.status === 'running')) {
        this.transitionRun(runId, {
          status: 'evaluating',
          stage: 'eval',
          outputAdapterVersion: latestRun.outputAdapterVersion ?? adapterRecord.adapterVersion,
        });
        latestRun = this.requireRun(runId);
      }

      if (!adapterRecord && (latestRun.status === 'queued' || latestRun.status === 'running')) {
        if (latestRun.status === 'queued') {
          this.transitionRun(runId, {
            status: 'running',
            stage: 'preflight',
            startedAt: latestRun.startedAt ?? new Date().toISOString(),
          });
          latestRun = this.requireRun(runId);
        }

        this.transitionRun(runId, { stage: 'train' });

        const workerResult = await this.worker.run({
          runId,
          configPath: runArtifacts.configPath,
          runDir: runArtifacts.runDir,
          onEvent: (event) => this.handleWorkerEvent(runId, event),
        });

        latestRun = this.requireRun(runId);

        const mergedMetrics = {
          ...(latestRun.metrics ?? run.metrics ?? {}),
          worker: {
            eventCount: workerResult.eventCount,
            exitCode: workerResult.exitCode,
            adapterPath: workerResult.adapterPath,
            format: workerResult.format,
          },
          artifacts: {
            runDir: runArtifacts.runDir,
            configPath: runArtifacts.configPath,
            stdoutPath: runArtifacts.stdoutPath,
            stderrPath: runArtifacts.stderrPath,
          },
          ...(workerResult.metrics ? { workerMetrics: workerResult.metrics } : {}),
        } as Record<string, unknown>;

        let outputAdapterVersion = latestRun.outputAdapterVersion;
        if (!outputAdapterVersion) {
          outputAdapterVersion = `adapter_${latestRun.datasetVersion}_${Date.now()}`;
        }

        if (!workerResult.adapterPath) {
          return this.rejectRun(runId, 'Worker completed without producing an adapter artifact', mergedMetrics);
        }

        adapterRecord =
          this.findAdapterForRun({
            ...latestRun,
            outputAdapterVersion,
          }) ??
          this.registerAdapterForRun(latestRun, outputAdapterVersion, workerResult);

        this.transitionRun(runId, {
          status: 'evaluating',
          stage: 'eval',
          metrics: mergedMetrics,
          outputAdapterVersion,
        });

        latestRun = this.requireRun(runId);
      }

      if (!adapterRecord) {
        throw new Error(`Run ${runId} cannot resume because no adapter artifact is registered`);
      }

      const finalResult = await this.promoteRunToActive(this.requireRun(runId), adapterRecord.id);

      info('Router training run finalized', {
        runId,
        status: finalResult.status,
        outputAdapterVersion: this.requireRun(runId).outputAdapterVersion,
        adapterPath: adapterRecord.path,
      });

      return finalResult;
    } catch (err) {
      const failureReason = String(err);
      warn('Router training run failed', {
        runId,
        error: failureReason,
      });

      this.transitionRun(runId, {
        status: 'failed',
        failureReason,
        finishedAt: new Date().toISOString(),
      });

      return {
        runId,
        status: 'failed',
        failureReason,
      };
    } finally {
      this.activeRuns.delete(runId);
    }
  }

  exportDatasetSnapshot(options: ExportDatasetOptions = {}): ExportDatasetResult {
    const userId = options.userId ?? 'user';
    const datasetVersion = options.datasetVersion ?? this.newDatasetVersion();
    const maxExamples = options.maxExamples ?? 100000;

    const examples = this.learning
      .listRoutingTrainingExamples({
        userId,
        limit: maxExamples,
      })
      .filter((example) => {
        if (!example.candidateLabel) return false;
        return example.labelStatus === 'auto_accepted' || example.labelStatus === 'reviewed';
      })
      .sort((a, b) => {
        const createdDelta = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        if (createdDelta !== 0) return createdDelta;
        return a.id.localeCompare(b.id);
      });

    if (examples.length === 0) {
      throw new Error(`No exportable training examples for user ${userId}`);
    }

    const datasetDir = path.join(process.cwd(), 'data', 'router-training', 'datasets', datasetVersion);
    fs.mkdirSync(datasetDir, { recursive: true });

    const trainPath = path.join(datasetDir, 'train.jsonl');
    const valPath = path.join(datasetDir, 'val.jsonl');
    const testPath = path.join(datasetDir, 'test.jsonl');
    const mlxTrainPath = path.join(datasetDir, 'mlx-train.jsonl');
    const mlxValPath = path.join(datasetDir, 'mlx-val.jsonl');
    const mlxTestPath = path.join(datasetDir, 'mlx-test.jsonl');

    const trainRows: string[] = [];
    const valRows: string[] = [];
    const testRows: string[] = [];
    const mlxTrainRows: string[] = [];
    const mlxValRows: string[] = [];
    const mlxTestRows: string[] = [];

    const exportedAt = new Date().toISOString();

    for (const example of examples) {
      const split = this.deterministicSplit(example.id);
      const payload = JSON.stringify({
        input: example.sanitizedInput,
        label: example.candidateLabel,
        metadata: {
          source: example.labelStatus,
          confidence: example.candidateLabelConfidence ?? 0,
          user_id: example.userId,
          route: example.chosenRoute,
          final_tier: example.finalTier,
          created_at: example.createdAt,
          dataset_version: datasetVersion,
        },
      });

      const mlxPayload = JSON.stringify({
        prompt: example.sanitizedInput,
        completion: example.candidateLabel,
        metadata: {
          source: example.labelStatus,
          confidence: example.candidateLabelConfidence ?? 0,
          user_id: example.userId,
          route: example.chosenRoute,
          final_tier: example.finalTier,
          created_at: example.createdAt,
          dataset_version: datasetVersion,
        },
      });

      if (split === 'train') {
        trainRows.push(payload);
        mlxTrainRows.push(mlxPayload);
      } else if (split === 'val') {
        valRows.push(payload);
        mlxValRows.push(mlxPayload);
      } else {
        testRows.push(payload);
        mlxTestRows.push(mlxPayload);
      }

      this.learning.updateRoutingTrainingExample(example.id, {
        split,
        datasetVersion,
        exportedAt,
      });
    }

    fs.writeFileSync(trainPath, trainRows.join('\n') + (trainRows.length ? '\n' : ''), 'utf-8');
    fs.writeFileSync(valPath, valRows.join('\n') + (valRows.length ? '\n' : ''), 'utf-8');
    fs.writeFileSync(testPath, testRows.join('\n') + (testRows.length ? '\n' : ''), 'utf-8');
    fs.writeFileSync(mlxTrainPath, mlxTrainRows.join('\n') + (mlxTrainRows.length ? '\n' : ''), 'utf-8');
    fs.writeFileSync(mlxValPath, mlxValRows.join('\n') + (mlxValRows.length ? '\n' : ''), 'utf-8');
    fs.writeFileSync(mlxTestPath, mlxTestRows.join('\n') + (mlxTestRows.length ? '\n' : ''), 'utf-8');

    const result: ExportDatasetResult = {
      datasetVersion,
      datasetDir,
      trainPath,
      valPath,
      testPath,
      mlxTrainPath,
      mlxValPath,
      mlxTestPath,
      counts: {
        train: trainRows.length,
        val: valRows.length,
        test: testRows.length,
        total: trainRows.length + valRows.length + testRows.length,
      },
    };

    info('Router training dataset exported', {
      userId,
      datasetVersion,
      counts: result.counts,
    });

    return result;
  }

  captureFromRoutingEvent(input: CaptureFromRoutingEventInput): string | null {
    const status = this.getStatus();
    if (!status.enabled || !this.shouldCapture(input)) {
      return null;
    }

    const chosenRoute = this.routeTypeToLabel(input.routeType);
    const redaction = this.sanitizeInput(input.input);
    if (redaction.dropCapture) {
      debug('Router training capture skipped due to sensitive-content guardrail', {
        traceId: input.traceId,
      });
      return null;
    }

    const userId = input.userId ?? 'user';
    const dedupeKey = this.createDedupeKey(userId, chosenRoute, redaction.sanitizedInput);
    if (this.isDuplicateCapture(dedupeKey)) {
      debug('Router training capture deduped', { traceId: input.traceId, chosenRoute });
      return null;
    }

    const latencyOutlier = this.isLatencyOutlier(chosenRoute, input.responseTimeMs);
    const hardNegative = this.isHardNegativeInput(
      redaction.sanitizedInput,
      chosenRoute,
      false,
    );
    const qualityScore = this.computeQualityScore({
      success: input.success,
      userCorrectionWithin1Turn: false,
      retryCount: 0,
      escalatedAfterResponse: false,
      chosenRoute,
      responseTimeMs: input.responseTimeMs,
    });

    const autoAccept = input.success && !latencyOutlier && !hardNegative && qualityScore >= 0.75;
    const candidateLabelConfidence = autoAccept
      ? clamp(0.8 + qualityScore * 0.2, 0, 0.99)
      : clamp(0.25 + qualityScore * 0.5, 0.2, 0.85);

    const trainingId = this.learning.recordRoutingTrainingExample({
      routingEventId: input.routingEventId,
      traceId: input.traceId,
      captureMode: this.getCaptureModeForInsert(input),
      userId,
      sanitizedInput: redaction.sanitizedInput,
      piiRedactionVersion: redaction.version,
      predictedComplexity: input.predictedComplexity,
      chosenRoute,
      finalTier: input.finalTier,
      matchedTool: input.matchedTool,
      decisionSignals: input.decisionSignals,
      success: input.success,
      responseTimeMs: input.responseTimeMs,
      userCorrectionWithin1Turn: false,
      retryCount: 0,
      escalatedAfterResponse: false,
      qualityScore,
      candidateLabel: chosenRoute,
      candidateLabelSource: 'heuristic',
      candidateLabelConfidence,
      labelStatus: autoAccept ? 'auto_accepted' : 'pending',
      reviewNotes: hardNegative ? 'hard-negative-candidate: immediate capture rule' : undefined,
    });

    debug('Router training capture recorded', {
      trainingId,
      traceId: input.traceId,
      routeType: input.routeType,
      chosenRoute,
      autoAccept,
      hardNegative,
    });

    return trainingId;
  }

  getReviewQueue(limit: number = this.config.routerTraining.dailyReviewQueueLimit): ReviewQueueItem[] {
    const pending = this.learning.listRoutingTrainingExamples({
      labelStatus: 'pending',
      limit: Math.max(limit * 10, 300),
    });

    const classified: ReviewQueueItem[] = [];
    for (const example of pending) {
      const item = this.classifyForReview(example);
      if (item) {
        classified.push(item);
      }
    }

    const hardNegatives = classified.filter(item => item.bucket === 'hard_negative');
    const uncertain = classified.filter(item => item.bucket === 'uncertain');
    const latencyOutliers = classified.filter(item => item.bucket === 'latency_outlier');

    const hardLimit = Math.ceil(limit * 0.5);
    const uncertainLimit = Math.ceil(limit * 0.35);
    const latencyLimit = Math.max(0, limit - hardLimit - uncertainLimit);

    const selected = [
      ...this.takeByRouteDiversity(hardNegatives, hardLimit),
      ...this.takeByRouteDiversity(uncertain, uncertainLimit),
      ...this.takeByRouteDiversity(latencyOutliers, latencyLimit),
    ];

    if (selected.length < limit) {
      const seen = new Set(selected.map(item => item.example.id));
      const filler = classified
        .filter(item => !seen.has(item.example.id))
        .sort((a, b) => b.priority - a.priority)
        .slice(0, limit - selected.length);
      selected.push(...filler);
    }

    return selected.slice(0, limit);
  }

  getCachedReviewQueue(): ReviewQueueItem[] {
    return this.cachedReviewQueue;
  }

  reviewTrainingExample(input: {
    id: string;
    action: 'approve' | 'reject';
    label?: RouterRouteLabel;
    notes?: string;
    reviewer?: string;
  }): ReviewTrainingExampleResult {
    const example = this.learning.getRoutingTrainingExample(input.id);
    if (!example) {
      throw new Error(`Routing training example not found: ${input.id}`);
    }

    const reviewedAt = new Date().toISOString();
    const reviewer = input.reviewer?.trim() || 'dashboard';
    const notes = input.notes?.trim() || undefined;
    const nextLabelStatus: RoutingLabelStatus = input.action === 'approve' ? 'reviewed' : 'rejected';
    const nextLabel =
      input.action === 'approve'
        ? input.label ?? example.candidateLabel ?? example.chosenRoute
        : example.candidateLabel;

    const changed = this.learning.updateRoutingTrainingExample(example.id, {
      candidateLabel: nextLabel,
      candidateLabelSource: input.action === 'approve' ? 'human' : example.candidateLabelSource,
      candidateLabelConfidence: input.action === 'approve' ? 1 : example.candidateLabelConfidence,
      labelStatus: nextLabelStatus,
      reviewedBy: reviewer,
      reviewedAt,
      reviewNotes: notes,
    });

    if (!changed) {
      throw new Error(`Failed to review routing training example: ${input.id}`);
    }

    const updated = this.learning.getRoutingTrainingExample(example.id);
    if (!updated) {
      throw new Error(`Routing training example disappeared after review: ${input.id}`);
    }

    this.cachedReviewQueue = this.getReviewQueue(this.config.routerTraining.dailyReviewQueueLimit);
    return { example: updated };
  }

  async runOutcomeEnricher(): Promise<void> {
    const status = this.getStatus();
    if (!status.enabled || status.captureMode === 'off') {
      return;
    }

    const examples = this.learning.listRoutingTrainingExamples({
      limit: Math.max(status.dailyReviewQueueLimit * 20, 500),
    });

    if (examples.length === 0) {
      return;
    }

    const byUser = new Map<string, RoutingTrainingExampleRecord[]>();
    for (const example of examples) {
      const list = byUser.get(example.userId) || [];
      list.push(example);
      byUser.set(example.userId, list);
    }

    let updated = 0;

    for (const userExamples of byUser.values()) {
      userExamples.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

      for (let i = 0; i < userExamples.length; i++) {
        const example = userExamples[i];
        const derived = this.deriveOutcomeSignals(userExamples, i);
        const hardNegative = this.isHardNegativeInput(
          example.sanitizedInput,
          example.chosenRoute,
          derived.escalatedAfterResponse,
        );

        const qualityScore = this.computeQualityScore({
          success: example.success,
          userCorrectionWithin1Turn: derived.userCorrectionWithin1Turn,
          retryCount: derived.retryCount,
          escalatedAfterResponse: derived.escalatedAfterResponse,
          chosenRoute: example.chosenRoute,
          responseTimeMs: example.responseTimeMs,
        });

        const autoAccept =
          example.success &&
          !derived.userCorrectionWithin1Turn &&
          derived.retryCount === 0 &&
          !derived.escalatedAfterResponse &&
          !hardNegative &&
          qualityScore >= 0.75;

        const update: RoutingTrainingExampleUpdate = {
          userCorrectionWithin1Turn: derived.userCorrectionWithin1Turn,
          retryCount: derived.retryCount,
          escalatedAfterResponse: derived.escalatedAfterResponse,
          qualityScore,
          candidateLabel: example.chosenRoute,
          candidateLabelSource: 'heuristic',
          candidateLabelConfidence: autoAccept
            ? clamp(0.8 + qualityScore * 0.2, 0, 0.99)
            : clamp(0.25 + qualityScore * 0.5, 0.2, 0.85),
          labelStatus: autoAccept ? 'auto_accepted' : 'pending',
        };

        if (hardNegative) {
          update.labelStatus = 'pending';
          update.reviewNotes = 'hard-negative-candidate: outcome-enricher';
        }

        if (this.learning.updateRoutingTrainingExample(example.id, update)) {
          updated++;
        }
      }
    }

    info('Router training outcome enricher pass complete', {
      scanned: examples.length,
      updated,
      users: byUser.size,
    });
  }

  async runReviewQueueBuilder(): Promise<void> {
    const status = this.getStatus();
    if (!status.enabled || status.captureMode === 'off') {
      this.cachedReviewQueue = [];
      return;
    }

    this.cachedReviewQueue = this.getReviewQueue(status.dailyReviewQueueLimit);

    const bucketCounts = this.cachedReviewQueue.reduce<Record<string, number>>((acc, item) => {
      acc[item.bucket] = (acc[item.bucket] || 0) + 1;
      return acc;
    }, {});

    info('Router training review queue refreshed', {
      size: this.cachedReviewQueue.length,
      buckets: bucketCounts,
    });
  }

  close(): void {
    if (this.enricherTimer) {
      clearInterval(this.enricherTimer);
      this.enricherTimer = undefined;
    }

    if (this.reviewQueueTimer) {
      clearInterval(this.reviewQueueTimer);
      this.reviewQueueTimer = undefined;
    }

    this.cachedReviewQueue = [];
    this.dedupeCache.clear();
    this.activeRuns.clear();
    debug('RouterTrainingService closed');
  }

  /**
   * Exposed for upcoming pipeline phases.
   */
  getLearningService(): LearningService {
    return this.learning;
  }

  private handleWorkerEvent(runId: string, event: RouterTrainingWorkerEvent): void {
    if (event.type === 'status') {
      this.transitionRun(runId, {
        stage: event.stage,
      });
      return;
    }

    if (event.type === 'metrics') {
      this.mergeRunMetrics(runId, {
        workerMetrics: event.metrics,
      });
      return;
    }

    if (event.type === 'progress') {
      this.mergeRunMetrics(runId, {
        progress: {
          stage: event.stage,
          percent: event.percent,
          message: event.message,
          updatedAt: new Date().toISOString(),
        },
      });
      return;
    }

    if (event.type === 'error') {
      this.transitionRun(runId, {
        failureReason: event.message,
      });
    }
  }

  private transitionRun(runId: string, update: {
    status?: RouterTrainingRunStatus;
    stage?: RouterTrainingRunStage;
    outputAdapterVersion?: string;
    metrics?: Record<string, unknown>;
    failureReason?: string;
    startedAt?: string;
    finishedAt?: string;
  }): void {
    const current = this.learning.getRouterTrainingRun(runId);
    if (!current) {
      throw new Error(`Run not found during transition: ${runId}`);
    }

    if (update.status && update.status !== current.status && !this.isAllowedRunTransition(current.status, update.status)) {
      throw new Error(`Illegal router training transition: ${current.status} -> ${update.status}`);
    }

    const changed = this.learning.updateRouterTrainingRunStatus(runId, {
      status: update.status,
      stage: update.stage,
      outputAdapterVersion: update.outputAdapterVersion,
      metrics: update.metrics,
      failureReason: update.failureReason,
      startedAt: update.startedAt,
      finishedAt: update.finishedAt,
    });

    if (!changed) {
      debug('Router training transition skipped (no-op)', {
        runId,
        update,
      });
    }
  }

  private mergeRunMetrics(runId: string, patch: Record<string, unknown>): void {
    const run = this.learning.getRouterTrainingRun(runId);
    if (!run) return;

    const merged = {
      ...(run.metrics ?? {}),
      ...patch,
    };

    this.learning.updateRouterTrainingRunStatus(runId, {
      metrics: merged,
    });
  }

  private requireRun(runId: string): RouterTrainingRunRecord {
    const run = this.learning.getRouterTrainingRun(runId);
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }
    return run;
  }

  private isResumableRunStatus(status: RouterTrainingRunStatus): boolean {
    return status === 'queued' || status === 'running' || status === 'evaluating' || status === 'shadow' || status === 'canary';
  }

  private isAllowedRunTransition(from: RouterTrainingRunStatus, to: RouterTrainingRunStatus): boolean {
    const allowed: Record<RouterTrainingRunStatus, RouterTrainingRunStatus[]> = {
      queued: ['running', 'failed', 'rejected', 'rolled_back'],
      running: ['evaluating', 'failed', 'rejected', 'rolled_back'],
      evaluating: ['shadow', 'canary', 'active', 'failed', 'rejected', 'rolled_back'],
      shadow: ['canary', 'active', 'failed', 'rejected', 'rolled_back'],
      canary: ['active', 'failed', 'rejected', 'rolled_back'],
      active: ['rolled_back'],
      failed: [],
      rejected: [],
      rolled_back: [],
    };

    return allowed[from].includes(to);
  }

  private ensureRunArtifacts(run: RouterTrainingRunRecord): {
    runDir: string;
    configPath: string;
    stdoutPath: string;
    stderrPath: string;
  } {
    const runDir = this.getRunDir(run.id);
    fs.mkdirSync(runDir, { recursive: true });

    const runConfig = {
      ...(run.config ?? {}),
      runId: run.id,
    };
    const configPath = path.join(runDir, 'run-config.json');
    fs.writeFileSync(configPath, JSON.stringify(runConfig, null, 2), 'utf-8');

    return {
      runDir,
      configPath,
      stdoutPath: path.join(runDir, 'worker-stdout.log'),
      stderrPath: path.join(runDir, 'worker-stderr.log'),
    };
  }

  private findAdapterForRun(run: RouterTrainingRunRecord): RouterAdapterRecord | null {
    return this.learning.getRouterAdapter({
      userId: run.userId,
      sourceRunId: run.id,
      adapterVersion: run.outputAdapterVersion,
    });
  }

  private extractRuntimeBinding(adapter: RouterAdapterRecord): {
    model?: string;
    modelVersion?: string;
    baseId?: string;
    artifactId?: string;
    artifactPath?: string;
    artifactFormat?: string;
    artifactPrecision?: string;
  } {
    const runtime = (adapter.evalSummary?.runtime_binding ?? {}) as Record<string, unknown>;
    const model = typeof runtime.model === 'string' && runtime.model.trim()
      ? runtime.model.trim()
      : undefined;
    const modelVersion = typeof runtime.model_version === 'string' && runtime.model_version.trim()
      ? runtime.model_version.trim()
      : undefined;
    const baseId = typeof runtime.base_id === 'string' && runtime.base_id.trim()
      ? runtime.base_id.trim()
      : undefined;
    const artifactId = typeof runtime.artifact_id === 'string' && runtime.artifact_id.trim()
      ? runtime.artifact_id.trim()
      : undefined;
    const artifactPath = typeof runtime.artifact_path === 'string' && runtime.artifact_path.trim()
      ? runtime.artifact_path.trim()
      : undefined;
    const artifactFormat = typeof runtime.artifact_format === 'string' && runtime.artifact_format.trim()
      ? runtime.artifact_format.trim()
      : undefined;
    const artifactPrecision = typeof runtime.artifact_precision === 'string' && runtime.artifact_precision.trim()
      ? runtime.artifact_precision.trim()
      : undefined;

    return { model, modelVersion, baseId, artifactId, artifactPath, artifactFormat, artifactPrecision };
  }

  private buildBaseRouterRuntimeBinding(): RouterRuntimeBinding {
    const baseModel = this.config.llm.router.model;
    const baseModelVersion = inferModelVersion(baseModel);

    return {
      source: 'base',
      model: baseModel,
      modelVersion: baseModelVersion,
      baseModel,
      baseModelVersion,
      baseId: 'qwen3.5-2b-bf16-v0',
    };
  }

  private buildCandidateRouterRuntimeBinding(
    adapter: RouterAdapterRecord,
    source: RouterRuntimeBinding['source'] = 'active-adapter'
  ): RouterRuntimeBinding {
    const binding = adapter.runtimeBinding ?? this.extractRuntimeBinding(adapter);
    const model = binding.model ?? adapter.baseModel;
    const modelVersion = binding.modelVersion ?? inferModelVersion(model) ?? adapter.adapterVersion;

    return {
      source,
      model,
      modelVersion,
      baseModel: adapter.baseModel,
      baseModelVersion: adapter.baseModelVersion,
      baseId: binding.baseId ?? adapter.baseId,
      artifactId: binding.artifactId,
      artifactPath: binding.artifactPath,
      artifactFormat: binding.artifactFormat,
      artifactPrecision: binding.artifactPrecision,
      activeAdapterId: adapter.id,
      activeAdapterVersion: adapter.adapterVersion,
    };
  }

  private sameRouterRuntimeBinding(a: RouterRuntimeBinding, b: RouterRuntimeBinding): boolean {
    return (
      a.model === b.model &&
      (a.modelVersion ?? '') === (b.modelVersion ?? '') &&
      (a.activeAdapterVersion ?? '') === (b.activeAdapterVersion ?? '')
    );
  }

  private getShadowMetrics(adapter: RouterAdapterRecord): RouterTrainingShadowMetrics {
    const shadowStats = ((adapter.evalSummary?.shadow_stats ?? {}) as Record<string, unknown>);
    const totalObserved = toNumber(shadowStats.total) ?? 0;
    const routeMatches = toNumber(shadowStats.route_matches) ?? 0;
    const complexityMatches = toNumber(shadowStats.complexity_matches) ?? 0;

    return {
      totalObserved,
      routeMatchRate: totalObserved > 0 ? routeMatches / totalObserved : 0,
      complexityMatchRate: totalObserved > 0 ? complexityMatches / totalObserved : 0,
      lastScoredAt:
        typeof shadowStats.last_scored_at === 'string' && shadowStats.last_scored_at.trim()
          ? shadowStats.last_scored_at.trim()
          : undefined,
      lastServedRuntime: isRouterRuntimeBinding(shadowStats.last_served_runtime)
        ? shadowStats.last_served_runtime
        : undefined,
      lastShadowRuntime: isRouterRuntimeBinding(shadowStats.last_shadow_runtime)
        ? shadowStats.last_shadow_runtime
        : undefined,
    };
  }

  private getShadowPromotionReadiness(adapter: RouterAdapterRecord): PromotionReadiness {
    const requiredCount = this.config.routerTraining.minimumShadowObservationsToPromote;
    const metrics = this.getShadowMetrics(adapter);

    if (requiredCount <= 0) {
      return {
        ready: true,
        actualCount: metrics.totalObserved,
        requiredCount,
      };
    }

    if (metrics.totalObserved >= requiredCount) {
      return {
        ready: true,
        actualCount: metrics.totalObserved,
        requiredCount,
      };
    }

    return {
      ready: false,
      actualCount: metrics.totalObserved,
      requiredCount,
      reason: `Need at least ${requiredCount} shadow observations before promotion (have ${metrics.totalObserved})`,
    };
  }

  private getCanaryPromotionReadiness(adapter: RouterAdapterRecord): PromotionReadiness {
    const requiredCount = this.config.routerTraining.minimumCanaryRequestsToPromote;
    const metrics = this.learning.summarizeRoutingEvents({
      routerSource: 'canary-adapter',
      routerAdapterVersion: adapter.adapterVersion,
      sinceHours: 24,
      limit: 500,
    });
    const baseline = this.learning.summarizeRoutingEvents({
      routerSource: 'base',
      sinceHours: 24,
      limit: 500,
    });

    if (requiredCount <= 0) {
      return this.applyCanaryHealthThresholds(metrics, baseline, requiredCount);
    }

    if (metrics.totalEvents >= requiredCount) {
      return this.applyCanaryHealthThresholds(metrics, baseline, requiredCount);
    }

    return {
      ready: false,
      actualCount: metrics.totalEvents,
      requiredCount,
      reason: `Need at least ${requiredCount} canary requests in the last 24h before promotion (have ${metrics.totalEvents})`,
    };
  }

  private applyCanaryHealthThresholds(
    canaryMetrics: RoutingEventSummary,
    baselineMetrics: RoutingEventSummary,
    requiredCount: number
  ): PromotionReadiness {
    const minSuccessRate = this.config.routerTraining.minimumCanarySuccessRateToPromote;
    if (canaryMetrics.successRate < minSuccessRate) {
      return {
        ready: false,
        actualCount: canaryMetrics.totalEvents,
        requiredCount,
        reason: `Need canary success rate of at least ${(minSuccessRate * 100).toFixed(1)}% before promotion (have ${(canaryMetrics.successRate * 100).toFixed(1)}%)`,
      };
    }

    if (baselineMetrics.totalEvents > 0) {
      const regressionMs = canaryMetrics.avgResponseTimeMs - baselineMetrics.avgResponseTimeMs;
      const maxRegressionMs = this.config.routerTraining.maxCanaryLatencyRegressionMsToPromote;
      if (regressionMs > maxRegressionMs) {
        return {
          ready: false,
          actualCount: canaryMetrics.totalEvents,
          requiredCount,
          reason: `Canary latency regression exceeds ${Math.round(maxRegressionMs)} ms before promotion (baseline ${Math.round(baselineMetrics.avgResponseTimeMs)} ms, canary ${Math.round(canaryMetrics.avgResponseTimeMs)} ms)`,
        };
      }
    }

    return {
      ready: true,
      actualCount: canaryMetrics.totalEvents,
      requiredCount,
    };
  }

  private persistPromotionGateSummary(
    adapterId: string,
    gate: RouterPromotionDecision,
    lifecycleState: RouterAdapterLifecycleState
  ): void {
    this.learning.updateRouterAdapterLifecycle(adapterId, {
      lifecycleState,
      evalSummary: {
        ...(this.learning.getRouterAdapter({ id: adapterId })?.evalSummary ?? {}),
        ...(gate.evalSummary ? { router_eval: gate.evalSummary as unknown as Record<string, unknown> } : {}),
        ...(gate.gateVerdict ? { gate_verdict: gate.gateVerdict as unknown as Record<string, unknown> } : {}),
        ...(gate.compareSummary ? { router_compare: gate.compareSummary as unknown as Record<string, unknown> } : {}),
        ...(gate.compareVerdict ? { compare_verdict: gate.compareVerdict as unknown as Record<string, unknown> } : {}),
      },
    });
  }

  private activatePromotedRun(
    run: RouterTrainingRunRecord,
    adapterId: string,
    gate?: RouterPromotionDecision
  ): RunExecutionResult {
    if (gate) {
      this.persistPromotionGateSummary(adapterId, gate, 'active');
    }

    const activated = this.learning.setActiveRouterAdapter(run.userId, adapterId);
    if (!activated) {
      return this.rollbackRun(run.id, 'adapter activation failed');
    }

    this.transitionRun(run.id, {
      status: 'active',
      stage: 'activate',
      finishedAt: new Date().toISOString(),
    });

    return {
      runId: run.id,
      status: 'active',
    };
  }

  private resolveRunRuntimeBinding(
    run: RouterTrainingRunRecord,
    outputAdapterVersion: string
  ): RouterAdapterRuntimeBinding | undefined {
    const runtimeBinding = (run.config?.routerRuntimeBinding ?? {}) as Record<string, unknown>;
    const model = typeof runtimeBinding.model === 'string' && runtimeBinding.model.trim()
      ? runtimeBinding.model.trim()
      : '';

    if (!model) {
      return undefined;
    }

    const modelVersion = typeof runtimeBinding.modelVersion === 'string' && runtimeBinding.modelVersion.trim()
      ? runtimeBinding.modelVersion.trim()
      : inferModelVersion(model) ?? outputAdapterVersion;

    return {
      model,
      modelVersion,
      baseId: typeof runtimeBinding.baseId === 'string' ? runtimeBinding.baseId : run.baseId,
      artifactId: typeof runtimeBinding.artifactId === 'string' ? runtimeBinding.artifactId : outputAdapterVersion,
      artifactPath: typeof runtimeBinding.artifactPath === 'string' ? runtimeBinding.artifactPath : undefined,
      artifactFormat: typeof runtimeBinding.artifactFormat === 'string' ? runtimeBinding.artifactFormat : undefined,
      artifactPrecision: typeof runtimeBinding.artifactPrecision === 'string' ? runtimeBinding.artifactPrecision : undefined,
      updatedAt: new Date().toISOString(),
      notes: typeof runtimeBinding.notes === 'string' && runtimeBinding.notes.trim()
        ? runtimeBinding.notes.trim()
        : 'frozen at training run creation',
    };
  }

  private registerAdapterForRun(
    run: RouterTrainingRunRecord,
    outputAdapterVersion: string,
    workerResult: Awaited<ReturnType<RouterTrainingWorker['run']>>
  ): RouterAdapterRecord {
    const adapterId = this.learning.registerRouterAdapter({
      userId: run.userId,
      adapterVersion: outputAdapterVersion,
      baseId: run.baseId,
      baseModel: run.baseModel,
      baseModelVersion: run.baseModelVersion,
      sourceRunId: run.id,
      path: workerResult.adapterPath!,
      format: (workerResult.format as 'safetensors' | 'gguf' | 'other') ?? 'safetensors',
      lifecycleState: 'archived',
      runtimeBinding: this.resolveRunRuntimeBinding(run, outputAdapterVersion),
      evalSummary: workerResult.metrics,
    });

    if (workerResult.artifactPath) {
      this.learning.registerRouterArtifact({
        id: workerResult.artifactId ?? outputAdapterVersion,
        userId: run.userId,
        runId: run.id,
        baseId: run.baseId,
        datasetVersion: run.datasetVersion,
        adapterVersion: outputAdapterVersion,
        artifactPath: workerResult.artifactPath,
        artifactFormat: workerResult.format ?? 'safetensors',
        artifactPrecision: workerResult.precision,
        quantizationRecipe: workerResult.quantizationRecipe,
        manifestPath: workerResult.manifestPath,
        metrics: workerResult.metrics,
      });
    }

    const adapter = this.learning.getRouterAdapter({ id: adapterId });
    if (!adapter) {
      throw new Error(`Adapter registration lookup failed for run ${run.id}`);
    }
    return adapter;
  }

  private async promoteRunToActive(
    run: RouterTrainingRunRecord,
    adapterId: string
  ): Promise<RunExecutionResult> {
    let latestRun = run;
    const gate = await this.evaluateRunForPromotion(latestRun);

    if (!gate.accepted) {
      this.persistPromotionGateSummary(adapterId, gate, 'archived');
      this.rejectRun(latestRun.id, gate.reason, {
        routerEval: gate.evalSummary,
        promotionGate: gate.gateVerdict,
      });
      return {
        runId: latestRun.id,
        status: 'rejected',
        failureReason: gate.reason,
      };
    }

    if (latestRun.status === 'evaluating') {
      if (this.config.routerTraining.shadowEnabled) {
        this.persistPromotionGateSummary(adapterId, gate, 'shadow');
        this.transitionRun(latestRun.id, {
          status: 'shadow',
          stage: 'shadow',
        });
        return { runId: latestRun.id, status: 'shadow' };
      }

      if (this.config.routerTraining.canaryPercent > 0) {
        this.persistPromotionGateSummary(adapterId, gate, 'canary');
        this.transitionRun(latestRun.id, {
          status: 'canary',
          stage: 'canary',
        });
        return { runId: latestRun.id, status: 'canary' };
      }
    }

    return this.activatePromotedRun(latestRun, adapterId, gate);
  }

  private async evaluateRunForPromotion(run: RouterTrainingRunRecord): Promise<RouterPromotionDecision> {
    const compare = await this.compareTrainingRun(run.id);

    const runDir = this.getRunDir(run.id);
    fs.mkdirSync(runDir, { recursive: true });
    fs.writeFileSync(path.join(runDir, 'eval-summary.json'), JSON.stringify(compare.candidateEval, null, 2), 'utf-8');
    fs.writeFileSync(path.join(runDir, 'gate-verdict.json'), JSON.stringify(compare.absoluteGate, null, 2), 'utf-8');
    if (compare.compareSummary) {
      fs.writeFileSync(path.join(runDir, 'compare-summary.json'), JSON.stringify(compare.compareSummary, null, 2), 'utf-8');
    }
    if (compare.compareVerdict) {
      fs.writeFileSync(path.join(runDir, 'compare-verdict.json'), JSON.stringify(compare.compareVerdict, null, 2), 'utf-8');
    }

    this.mergeRunMetrics(run.id, {
      routerEval: compare.candidateEval,
      promotionGate: compare.absoluteGate,
      ...(compare.compareSummary ? { routerCompare: compare.compareSummary } : {}),
      ...(compare.compareVerdict ? { compareGate: compare.compareVerdict } : {}),
    });

    if (!compare.absoluteGate.passed) {
      return {
        accepted: false,
        reason: compare.absoluteGate.reasons.join('; '),
        evalSummary: compare.candidateEval,
        gateVerdict: compare.absoluteGate,
        compareSummary: compare.compareSummary,
        compareVerdict: compare.compareVerdict,
      };
    }

    if (compare.compareVerdict && !compare.compareVerdict.passed) {
      return {
        accepted: false,
        reason: compare.compareVerdict.reasons.join('; '),
        evalSummary: compare.candidateEval,
        gateVerdict: compare.absoluteGate,
        compareSummary: compare.compareSummary,
        compareVerdict: compare.compareVerdict,
      };
    }

    return {
      accepted: true,
      reason: compare.compareVerdict
        ? 'candidate passed router eval and baseline compare gates'
        : 'candidate passed router eval gate',
      evalSummary: compare.candidateEval,
      gateVerdict: compare.absoluteGate,
      compareSummary: compare.compareSummary,
      compareVerdict: compare.compareVerdict,
    };
  }

  private rejectRun(
    runId: string,
    reason: string,
    metricsPatch?: Record<string, unknown>
  ): RunExecutionResult {
    const run = this.requireRun(runId);
    const metrics = metricsPatch
      ? {
          ...(run.metrics ?? {}),
          ...metricsPatch,
        }
      : undefined;

    this.transitionRun(runId, {
      status: 'rejected',
      stage: 'eval',
      metrics,
      failureReason: reason,
      finishedAt: new Date().toISOString(),
    });

    return {
      runId,
      status: 'rejected',
      failureReason: reason,
    };
  }

  private rollbackRun(runId: string, reason: string): RunExecutionResult {
    const run = this.requireRun(runId);
    const adapter = this.findAdapterForRun(run);
    if (adapter) {
      this.learning.updateRouterAdapterLifecycle(adapter.id, {
        lifecycleState: 'rolled_back',
        rolledBackAt: new Date().toISOString(),
        rollbackReason: reason,
      });
    }

    this.transitionRun(runId, {
      status: 'rolled_back',
      failureReason: reason,
      finishedAt: new Date().toISOString(),
    });

    return {
      runId,
      status: 'rolled_back',
      failureReason: reason,
    };
  }

  private getRunDir(runId: string): string {
    return path.join(process.cwd(), 'data', 'router-training', 'runs', runId);
  }

  private newDatasetVersion(): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    return `router_ft_${y}${m}${d}_${hh}${mm}`;
  }

  private deterministicSplit(seed: string): 'train' | 'val' | 'test' {
    const bucket = this.hashBucket(seed);
    if (bucket < 80) return 'train';
    if (bucket < 90) return 'val';
    return 'test';
  }

  private shouldCapture(input: CaptureFromRoutingEventInput): boolean {
    const mode = this.config.routerTraining.captureMode;

    if (!this.config.routerTraining.enabled || mode === 'off') {
      return false;
    }

    if (mode === 'all_local') {
      return true;
    }

    if (mode === 'opt_in') {
      return input.optInCapture === true;
    }

    // canary mode
    const bucket = this.hashBucket(input.traceId || input.input);
    return bucket < this.config.routerTraining.canaryPercent;
  }

  private getCaptureModeForInsert(input: CaptureFromRoutingEventInput): 'canary' | 'opt_in' | 'eval' | 'shadow' | 'all_local' {
    const mode = this.config.routerTraining.captureMode;
    if (mode === 'canary' || mode === 'opt_in' || mode === 'all_local') {
      return mode;
    }

    // Config schema should prevent this, but keep safe fallback.
    return input.optInCapture ? 'opt_in' : 'canary';
  }

  private routeTypeToLabel(routeType: CaptureFromRoutingEventInput['routeType']): RouterRouteLabel {
    if (routeType === 'routed') return 'DIRECT_TOOL';
    if (routeType === 'llm-simple') return 'FAST_AGENT';
    return 'THINKING_AGENT';
  }

  private hashBucket(value: string): number {
    const digest = crypto.createHash('sha256').update(value).digest();
    return digest[0] % 100;
  }

  private sanitizeInput(input: string): { sanitizedInput: string; version: string; dropCapture: boolean } {
    let sanitized = input.trim().replace(/\s+/g, ' ');

    // Guardrail: skip storing private key blobs entirely.
    if (/-----BEGIN [A-Z ]+ PRIVATE KEY-----/.test(sanitized) || /ssh-rsa\s+[A-Za-z0-9+/=]+/.test(sanitized)) {
      return {
        sanitizedInput: '',
        version: 'rt-redactor-v1',
        dropCapture: true,
      };
    }

    const replacements: Array<[RegExp, string]> = [
      [/\bsk-[A-Za-z0-9_-]{16,}\b/g, '[REDACTED_API_KEY]'],
      [/\b(Bearer)\s+[A-Za-z0-9._\-]{16,}\b/gi, '$1 [REDACTED_TOKEN]'],
      [/(password|passwd|api[_-]?key|token|secret)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]'],
      [/\b[0-9a-fA-F]{32,}\b/g, '[REDACTED_HEX_TOKEN]'],
      [/\b[A-Za-z0-9_\-]{40,}\b/g, '[REDACTED_TOKEN]'],
      [/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, '[REDACTED_EMAIL]'],
      [/\b\+?\d{7,15}\b/g, '[REDACTED_PHONE]'],
    ];

    for (const [pattern, replacement] of replacements) {
      sanitized = sanitized.replace(pattern, replacement);
    }

    return {
      sanitizedInput: sanitized,
      version: 'rt-redactor-v1',
      dropCapture: sanitized.length === 0,
    };
  }

  private createDedupeKey(userId: string, chosenRoute: RouterRouteLabel, sanitizedInput: string): string {
    const normalized = sanitizedInput.trim().toLowerCase();
    return crypto
      .createHash('sha256')
      .update(`${userId}|${chosenRoute}|${normalized}`)
      .digest('hex');
  }

  private isDuplicateCapture(key: string): boolean {
    const now = Date.now();
    const previous = this.dedupeCache.get(key);

    // 24-hour local dedupe window.
    if (previous && now - previous < 24 * 60 * 60 * 1000) {
      return true;
    }

    this.dedupeCache.set(key, now);

    // Prune old fingerprints to keep memory bounded.
    if (this.dedupeCache.size > 5000) {
      const cutoff = now - 48 * 60 * 60 * 1000;
      for (const [fp, ts] of this.dedupeCache.entries()) {
        if (ts < cutoff) {
          this.dedupeCache.delete(fp);
        }
      }
    }

    return false;
  }

  private deriveOutcomeSignals(examples: RoutingTrainingExampleRecord[], index: number): DerivedOutcomeSignals {
    const current = examples[index];
    const currentTime = new Date(current.createdAt).getTime();

    let retryCount = 0;
    let correction = false;
    let escalated = false;

    for (let i = index + 1; i < examples.length; i++) {
      const next = examples[i];
      const nextTime = new Date(next.createdAt).getTime();
      const deltaMs = nextTime - currentTime;

      if (deltaMs > 5 * 60 * 1000) {
        break;
      }

      if (deltaMs <= 3 * 60 * 1000) {
        retryCount++;
      }

      if (!correction && this.looksLikeCorrection(current, next, deltaMs)) {
        correction = true;
      }

      if (current.chosenRoute !== 'THINKING_AGENT' && next.chosenRoute === 'THINKING_AGENT') {
        escalated = true;
      }
    }

    return {
      userCorrectionWithin1Turn: correction,
      retryCount,
      escalatedAfterResponse: escalated,
    };
  }

  private looksLikeCorrection(
    current: RoutingTrainingExampleRecord,
    next: RoutingTrainingExampleRecord,
    deltaMs: number,
  ): boolean {
    if (!current.success) {
      return true;
    }

    if (deltaMs > 90 * 1000) {
      return false;
    }

    const currentNorm = current.sanitizedInput.trim().toLowerCase();
    const nextNorm = next.sanitizedInput.trim().toLowerCase();
    return currentNorm !== nextNorm;
  }

  private isHardNegativeInput(
    sanitizedInput: string,
    chosenRoute: RouterRouteLabel,
    escalatedAfterResponse: boolean,
  ): boolean {
    const normalized = sanitizedInput.trim().toLowerCase();
    const shortCommandLike =
      normalized.length <= 80 &&
      /^(show|list|get|view|display|help|status|exit|quit|set|delete|remove|open|edit|new|add|create|complete|done)\b/.test(normalized);

    if (chosenRoute === 'THINKING_AGENT' && shortCommandLike) {
      return true;
    }

    return chosenRoute !== 'THINKING_AGENT' && escalatedAfterResponse;
  }

  private isLatencyOutlier(chosenRoute: RouterRouteLabel, responseTimeMs: number): boolean {
    return responseTimeMs > this.latencyThreshold(chosenRoute) * 1.5;
  }

  private latencyThreshold(chosenRoute: RouterRouteLabel): number {
    if (chosenRoute === 'DIRECT_TOOL') return 1500;
    if (chosenRoute === 'FAST_AGENT') return 9000;
    return 30000;
  }

  private computeQualityScore(input: {
    success: boolean;
    userCorrectionWithin1Turn: boolean;
    retryCount: number;
    escalatedAfterResponse: boolean;
    chosenRoute: RouterRouteLabel;
    responseTimeMs: number;
  }): number {
    let score = input.success ? 1.0 : 0.45;

    if (input.userCorrectionWithin1Turn) score -= 0.25;
    if (input.escalatedAfterResponse) score -= 0.25;
    score -= Math.min(0.3, input.retryCount * 0.1);

    if (input.responseTimeMs > this.latencyThreshold(input.chosenRoute)) {
      score -= 0.15;
    }

    return clamp(score, 0, 1);
  }

  private classifyForReview(example: RoutingTrainingExampleRecord): ReviewQueueItem | null {
    const hardNegative = this.isHardNegativeInput(
      example.sanitizedInput,
      example.chosenRoute,
      example.escalatedAfterResponse,
    );

    if (hardNegative) {
      return {
        example,
        bucket: 'hard_negative',
        reason: 'Hard-negative routing pattern',
        priority: 1.0,
      };
    }

    if ((example.candidateLabelConfidence ?? 0) < 0.65) {
      return {
        example,
        bucket: 'uncertain',
        reason: 'Low candidate confidence',
        priority: 0.8 - (example.candidateLabelConfidence ?? 0),
      };
    }

    if (this.isLatencyOutlier(example.chosenRoute, example.responseTimeMs)) {
      return {
        example,
        bucket: 'latency_outlier',
        reason: 'Latency outlier for selected route',
        priority: 0.4,
      };
    }

    return null;
  }

  private takeByRouteDiversity(items: ReviewQueueItem[], maxCount: number): ReviewQueueItem[] {
    if (maxCount <= 0 || items.length === 0) {
      return [];
    }

    const byRoute = new Map<RouterRouteLabel, ReviewQueueItem[]>();
    for (const item of items.sort((a, b) => b.priority - a.priority)) {
      const route = item.example.chosenRoute;
      const list = byRoute.get(route) || [];
      list.push(item);
      byRoute.set(route, list);
    }

    const routeOrder: RouterRouteLabel[] = ['DIRECT_TOOL', 'FAST_AGENT', 'THINKING_AGENT'];
    const selected: ReviewQueueItem[] = [];

    while (selected.length < maxCount) {
      let progressed = false;

      for (const route of routeOrder) {
        const queue = byRoute.get(route);
        if (!queue || queue.length === 0) continue;

        selected.push(queue.shift()!);
        progressed = true;

        if (selected.length >= maxCount) {
          break;
        }
      }

      if (!progressed) {
        break;
      }
    }

    return selected;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function inferModelVersion(modelName: string): string | undefined {
  const normalized = modelName.trim();
  if (!normalized) return undefined;

  const slashParts = normalized.split('/');
  const tail = slashParts[slashParts.length - 1] || normalized;
  if (!tail) return undefined;

  return tail;
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function isRouterRuntimeBinding(value: unknown): value is RouterRuntimeBinding {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const source = (value as Record<string, unknown>).source;
  const model = (value as Record<string, unknown>).model;
  const baseModel = (value as Record<string, unknown>).baseModel;

  return (
    typeof source === 'string' &&
    typeof model === 'string' &&
    typeof baseModel === 'string'
  );
}
