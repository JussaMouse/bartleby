// src/services/signal.ts
import { spawn } from 'child_process';
import { Config } from '../config.js';
import { info, warn, error } from '../utils/logger.js';

export interface SignalSendResult {
  ok: boolean;
  code?: number | null;
  error?: string;
  stderr?: string;
  stdout?: string;
  to?: string;
  command?: string;
}

export class SignalService {
  private config: Config;
  private enabled: boolean;

  constructor(config: Config) {
    this.config = config;
    this.enabled = config.signal.enabled;
  }

  async initialize(): Promise<void> {
    if (this.enabled) {
      info('SignalService initialized');
    } else {
      info('SignalService: disabled (optional)');
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async send(message: string, recipient?: string): Promise<boolean> {
    const result = await this.sendDetailed(message, recipient);
    return result.ok;
  }

  async sendDetailed(message: string, recipient?: string): Promise<SignalSendResult> {
    if (!this.enabled) {
      warn('Signal not enabled');
      return { ok: false, error: 'Signal not enabled' };
    }

    const to = recipient || this.config.signal.recipient;
    if (!to) {
      warn('No Signal recipient configured');
      return { ok: false, error: 'No Signal recipient configured' };
    }

    return new Promise((resolve) => {
      const args = [
        '-u', this.config.signal.number || '',
        'send',
        '-m', message,
        to,
      ];

      const command = `${this.config.signal.cliPath} ${args.map((arg) => JSON.stringify(arg)).join(' ')}`;
      let stdout = '';
      let stderr = '';

      const proc = spawn(this.config.signal.cliPath, args, {
        timeout: this.config.signal.timeout,
      });

      proc.stdout?.on('data', (chunk) => {
        stdout += String(chunk);
      });

      proc.stderr?.on('data', (chunk) => {
        stderr += String(chunk);
      });

      proc.on('close', (code) => {
        if (code === 0) {
          info('Signal sent', { to });
          resolve({
            ok: true,
            code,
            stdout: stdout.trim() || undefined,
            stderr: stderr.trim() || undefined,
            to,
            command,
          });
        } else {
          error('Signal send failed', {
            code,
            stderr: stderr.trim() || undefined,
            stdout: stdout.trim() || undefined,
            to,
            command,
          });
          resolve({
            ok: false,
            code,
            error: 'Signal send failed',
            stderr: stderr.trim() || undefined,
            stdout: stdout.trim() || undefined,
            to,
            command,
          });
        }
      });

      proc.on('error', (err) => {
        error('Signal spawn error', { error: String(err), to, command });
        resolve({
          ok: false,
          error: String(err),
          stderr: stderr.trim() || undefined,
          stdout: stdout.trim() || undefined,
          to,
          command,
        });
      });
    });
  }

  close(): void {}
}
