// src/services/signal.ts
import { spawn } from 'child_process';
import { Config } from '../config.js';
import { info, warn, error } from '../utils/logger.js';

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
    if (!this.enabled) {
      warn('Signal not enabled');
      return false;
    }

    const to = recipient || this.config.signal.recipient;
    if (!to) {
      warn('No Signal recipient configured');
      return false;
    }

    return new Promise((resolve) => {
      const args = [
        '-u', this.config.signal.number || '',
        'send',
        '-m', message,
        to,
      ];

      const proc = spawn(this.config.signal.cliPath, args, {
        timeout: this.config.signal.timeout,
      });

      proc.on('close', (code) => {
        if (code === 0) {
          info('Signal sent', { to });
          resolve(true);
        } else {
          error('Signal send failed', { code });
          resolve(false);
        }
      });

      proc.on('error', (err) => {
        error('Signal spawn error', { error: String(err) });
        resolve(false);
      });
    });
  }

  close(): void {}
}
