// src/utils/logger.ts
import fs from 'fs';
import path from 'path';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

const LEVEL_NAMES = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
const COLORS = ['\x1b[36m', '\x1b[32m', '\x1b[33m', '\x1b[31m'];
const RESET = '\x1b[0m';

let minLevel = LogLevel.INFO;
let logFile: string | null = null;
let consoleEnabled = true;

export function configureLogger(options: {
  level?: LogLevel;
  file?: string;
  console?: boolean;
}): void {
  if (options.level !== undefined) minLevel = options.level;
  if (options.file) {
    logFile = options.file;
    const dir = path.dirname(logFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
  if (options.console !== undefined) consoleEnabled = options.console;
}

export function log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  if (level < minLevel) return;

  const timestamp = new Date().toISOString();
  const levelName = LEVEL_NAMES[level];
  const metaStr = meta ? ' ' + JSON.stringify(meta) : '';
  const line = `[${timestamp}] [${levelName}] ${message}${metaStr}`;

  if (consoleEnabled) {
    console.log(`${COLORS[level]}${line}${RESET}`);
  }

  if (logFile) {
    fs.appendFileSync(logFile, line + '\n');
  }
}

export const debug = (msg: string, meta?: Record<string, unknown>) => log(LogLevel.DEBUG, msg, meta);
export const info = (msg: string, meta?: Record<string, unknown>) => log(LogLevel.INFO, msg, meta);
export const warn = (msg: string, meta?: Record<string, unknown>) => log(LogLevel.WARN, msg, meta);
export const error = (msg: string, meta?: Record<string, unknown>) => log(LogLevel.ERROR, msg, meta);
