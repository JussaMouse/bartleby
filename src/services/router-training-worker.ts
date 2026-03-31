// src/services/router-training-worker.ts
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { debug, warn } from '../utils/logger.js';

export type RouterTrainingWorkerEvent =
  | { type: 'status'; stage: 'preflight' | 'train' | 'eval' | 'shadow' | 'canary'; message?: string }
  | { type: 'progress'; stage: string; percent: number; message?: string }
  | { type: 'metrics'; metrics: Record<string, unknown> }
  | {
      type: 'result';
      adapter_path?: string;
      artifact_path?: string;
      manifest_path?: string;
      artifact_id?: string;
      format?: string;
      precision?: string;
      quantization_recipe?: Record<string, unknown>;
      metrics?: Record<string, unknown>;
    }
  | { type: 'log'; level?: string; message: string }
  | { type: 'error'; message: string };

export interface RouterTrainingWorkerRunInput {
  runId: string;
  configPath: string;
  runDir: string;
  onEvent?: (event: RouterTrainingWorkerEvent) => void;
}

export interface RouterTrainingWorkerResult {
  exitCode: number;
  adapterPath?: string;
  artifactPath?: string;
  manifestPath?: string;
  artifactId?: string;
  format?: string;
  precision?: string;
  quantizationRecipe?: Record<string, unknown>;
  metrics?: Record<string, unknown>;
  eventCount: number;
}

export class RouterTrainingWorker {
  private workerScriptPath: string;

  constructor(workerScriptPath: string = path.join(process.cwd(), 'scripts', 'router-train', 'worker.py')) {
    this.workerScriptPath = workerScriptPath;
  }

  async run(input: RouterTrainingWorkerRunInput): Promise<RouterTrainingWorkerResult> {
    fs.mkdirSync(input.runDir, { recursive: true });

    const stdoutPath = path.join(input.runDir, 'worker-stdout.log');
    const stderrPath = path.join(input.runDir, 'worker-stderr.log');
    const stdoutStream = fs.createWriteStream(stdoutPath, { flags: 'a' });
    const stderrStream = fs.createWriteStream(stderrPath, { flags: 'a' });

    const child = spawn('python3', [this.workerScriptPath, '--config', input.configPath, '--run-dir', input.runDir], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let eventCount = 0;
    let adapterPath: string | undefined;
    let artifactPath: string | undefined;
    let manifestPath: string | undefined;
    let artifactId: string | undefined;
    let format: string | undefined;
    let precision: string | undefined;
    let quantizationRecipe: Record<string, unknown> | undefined;
    let metrics: Record<string, unknown> | undefined;

    const handleLine = (line: string): void => {
      const trimmed = line.trim();
      if (!trimmed) return;

      let parsed: RouterTrainingWorkerEvent | null = null;
      try {
        parsed = JSON.parse(trimmed) as RouterTrainingWorkerEvent;
      } catch {
        parsed = { type: 'log', message: trimmed };
      }

      eventCount++;

      if (parsed.type === 'result') {
        adapterPath = parsed.adapter_path || adapterPath;
        artifactPath = parsed.artifact_path || artifactPath;
        manifestPath = parsed.manifest_path || manifestPath;
        artifactId = parsed.artifact_id || artifactId;
        format = parsed.format || format;
        precision = parsed.precision || precision;
        quantizationRecipe = parsed.quantization_recipe || quantizationRecipe;
        if (parsed.metrics) metrics = parsed.metrics;
      } else if (parsed.type === 'metrics') {
        metrics = parsed.metrics;
      } else if (parsed.type === 'error') {
        warn('Router training worker emitted error event', {
          runId: input.runId,
          error: parsed.message,
        });
      }

      try {
        input.onEvent?.(parsed);
      } catch (err) {
        warn('Failed to handle worker event callback', {
          runId: input.runId,
          error: String(err),
        });
      }
    };

    const bindStream = (stream: NodeJS.ReadableStream, sink: fs.WriteStream, tag: 'stdout' | 'stderr'): void => {
      let buffer = '';

      stream.on('data', (chunk: Buffer | string) => {
        const text = typeof chunk === 'string' ? chunk : chunk.toString('utf-8');
        sink.write(text);
        buffer += text;

        let idx = buffer.indexOf('\n');
        while (idx >= 0) {
          const line = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 1);
          handleLine(line);
          idx = buffer.indexOf('\n');
        }
      });

      stream.on('end', () => {
        if (buffer.trim()) handleLine(buffer);
      });

      stream.on('error', (err) => {
        warn('Router training worker stream error', {
          runId: input.runId,
          stream: tag,
          error: String(err),
        });
      });
    };

    bindStream(child.stdout, stdoutStream, 'stdout');
    bindStream(child.stderr, stderrStream, 'stderr');

    const exitCode = await new Promise<number>((resolve, reject) => {
      child.on('error', reject);
      child.on('close', (code) => resolve(code ?? 1));
    }).finally(() => {
      stdoutStream.end();
      stderrStream.end();
    });

    debug('Router training worker completed', {
      runId: input.runId,
      exitCode,
      eventCount,
      adapterPath,
      artifactPath,
      manifestPath,
    });

    if (exitCode !== 0) {
      throw new Error(`Router training worker failed with exit code ${exitCode}`);
    }

    return {
      exitCode,
      adapterPath,
      artifactPath,
      manifestPath,
      artifactId,
      format,
      precision,
      quantizationRecipe,
      metrics,
      eventCount,
    };
  }
}
