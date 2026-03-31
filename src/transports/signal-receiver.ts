import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { CommandRouter } from '../router/index.js';
import { Agent } from '../agent/index.js';
import { ServiceContainer } from '../services/index.js';
import { handleCommand } from '../app/command-handler.js';
import { info, warn, error, debug } from '../utils/logger.js';

interface SignalEnvelope {
  source?: string;
  sourceNumber?: string;
  dataMessage?: {
    message?: string;
    groupInfo?: unknown;
  };
  syncMessage?: unknown;
}

interface SignalPayload {
  envelope?: SignalEnvelope;
  syncMessage?: unknown;
}

export class SignalReceiver {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private buffer = '';
  private running = false;
  private restartTimer: NodeJS.Timeout | null = null;
  private processing: Promise<void> = Promise.resolve();
  private allowedSenders: Set<string>;

  constructor(
    private services: ServiceContainer,
    private router: CommandRouter,
    private agent: Agent
  ) {
    const config = services.config;
    const fallback = config.signal.recipient ? [config.signal.recipient] : [];
    const allowlist = config.signal.allowedSenders.length > 0
      ? config.signal.allowedSenders
      : fallback;

    this.allowedSenders = new Set(allowlist.map(normalizeSender));
  }

  start(): void {
    const { config, signal } = this.services;

    if (!config.signal.receiveEnabled) {
      info('Signal receiver disabled');
      return;
    }

    if (!signal.isEnabled()) {
      warn('Signal receiver requested but Signal is disabled');
      return;
    }

    if (!config.signal.number) {
      warn('Signal receiver requires SIGNAL_NUMBER');
      return;
    }

    if (this.allowedSenders.size === 0) {
      warn('Signal receiver requires SIGNAL_ALLOWED_SENDERS (or SIGNAL_RECIPIENT)');
      return;
    }

    if (this.running) return;
    this.running = true;

    this.spawnReceiver();
  }

  stop(): void {
    this.running = false;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }

    if (this.proc) {
      this.proc.kill();
      this.proc = null;
    }
  }

  private spawnReceiver(): void {
    const { config } = this.services;
    const args = ['-u', config.signal.number || '', '-o', 'json', 'receive', '--timeout', '5'];

    debug('Starting Signal receiver', { allowlist: Array.from(this.allowedSenders) });

    this.proc = spawn(config.signal.cliPath, args);

    this.proc.stdout.on('data', (chunk) => {
      this.handleOutput(chunk.toString());
    });

    this.proc.stderr.on('data', (chunk) => {
      const output = chunk.toString().trim();
      if (output) {
        warn('Signal receiver stderr', { output });
      }
    });

    this.proc.on('close', (code) => {
      this.proc = null;
      if (!this.running) return;
      if (code === 0) {
        debug('Signal receiver cycle complete');
      } else {
        warn('Signal receiver exited', { code });
      }
      this.scheduleRestart();
    });

    this.proc.on('error', (err) => {
      this.proc = null;
      error('Signal receiver error', { error: String(err) });
      this.scheduleRestart();
    });
  }

  private scheduleRestart(): void {
    if (!this.running || this.restartTimer) return;
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      if (this.running) {
        this.spawnReceiver();
      }
    }, 5000);
  }

  private handleOutput(chunk: string): void {
    this.buffer += chunk;
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      this.handleLine(trimmed);
    }
  }

  private handleLine(line: string): void {
    try {
      const parsed = JSON.parse(line) as SignalPayload | SignalPayload[];
      if (Array.isArray(parsed)) {
        parsed.forEach((payload) => this.handlePayload(payload));
        return;
      }
      this.handlePayload(parsed);
    } catch (err) {
      debug('Signal receiver skipped non-JSON output', { line, error: String(err) });
    }
  }

  private handlePayload(payload: SignalPayload): void {
    if (!payload) return;

    if (payload.syncMessage) return;

    const envelope = payload.envelope ?? {};
    if (envelope.syncMessage) return;

    const source = envelope.source || envelope.sourceNumber;
    const message = typeof envelope.dataMessage?.message === 'string'
      ? envelope.dataMessage.message.trim()
      : '';

    if (!source || !message) return;

    if (envelope.dataMessage?.groupInfo) {
      debug('Ignoring Signal group message', { source });
      return;
    }

    if (!this.isAllowedSender(source)) {
      warn('Signal message blocked (sender not allowed)', { source });
      return;
    }

    this.services.runtimeActivity.record({ channel: 'signal', direction: 'inbound', text: message, counterpart: source });
    this.enqueueMessage(source, message);
  }

  private enqueueMessage(source: string, message: string): void {
    this.processing = this.processing
      .then(() => this.processMessage(source, message))
      .catch((err) => {
        error('Signal message processing failed', { error: String(err) });
      });
  }

  private async processMessage(source: string, message: string): Promise<void> {
    try {
      const result = await handleCommand(message, this.router, this.agent, this.services, {
        allowExit: false,
        stripMarkdown: true,
      });

      this.services.runtimeActivity.record({ channel: 'signal', direction: 'outbound', text: result.reply, counterpart: source });
      const sent = await this.services.signal.send(result.reply, source);
      if (!sent) {
        warn('Signal reply failed to send', { source });
      }
    } catch (err) {
      error('Signal message handling error', { error: String(err) });
      const fallback = 'Sorry, something went wrong processing that.';
      this.services.runtimeActivity.record({ channel: 'signal', direction: 'outbound', text: fallback, counterpart: source });
      await this.services.signal.send(fallback, source);
    }
  }

  private isAllowedSender(source: string): boolean {
    return this.allowedSenders.has(normalizeSender(source));
  }
}

function normalizeSender(value: string): string {
  return value.replace(/\s+/g, '');
}
