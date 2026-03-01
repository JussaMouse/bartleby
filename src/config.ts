// src/config.ts
import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config();

// === Schema ===

const TierSchema = z.object({
  model: z.string(),
  url: z.string().url(),
  maxTokens: z.number().positive(),
});

const ThinkingTierSchema = TierSchema.extend({
  budget: z.number().positive().optional(),
});

const ConfigSchema = z.object({
  llm: z.object({
    router: TierSchema,
    fast: TierSchema,
    thinking: ThinkingTierSchema,
    healthTimeout: z.number().positive(),
    agentMaxIterations: z.number().positive(),
    apiKey: z.string().optional(),
  }),

  embeddings: z.object({
    url: z.string().url(),
    model: z.string(),
    dimensions: z.number().positive(),
    apiKey: z.string().optional(),
  }),

  ocr: z.object({
    enabled: z.boolean(),
    url: z.string().url().optional(),
    model: z.string().optional(),
    maxTokens: z.number().positive(),
    apiKey: z.string().optional(),
  }),

  paths: z.object({
    garden: z.string(),
    shed: z.string(),
    database: z.string(),
    logs: z.string(),
    inbox: z.string(),
  }),

  dashboard: z.object({
    host: z.string(),
    port: z.number().positive(),
    apiToken: z.string().optional(),
    allowedIps: z.array(z.string()),
  }),

  weather: z.object({
    city: z.string().optional(),
    apiKey: z.string().optional(),
    units: z.enum(['C', 'F']),
  }),

  signal: z.object({
    enabled: z.boolean(),
    cliPath: z.string(),
    number: z.string().optional(),
    recipient: z.string().optional(),
    timeout: z.number().positive(),
    receiveEnabled: z.boolean(),
    allowedSenders: z.array(z.string()),
  }),

  scheduler: z.object({
    enabled: z.boolean(),
    checkInterval: z.number().positive(),
    missedReminders: z.enum(['default', 'ask', 'fire', 'skip', 'show']),
  }),

  calendar: z.object({
    timezone: z.string(),
    defaultDuration: z.number().positive(),
    ambiguousTime: z.enum(['morning', 'afternoon', 'ask']),
    weekStart: z.enum(['sunday', 'monday']),
    reminderMinutes: z.number().min(0),
    dateFormat: z.enum(['mdy', 'dmy']),  // Month/Day/Year (US) or Day/Month/Year (intl)
  }),

  presence: z.object({
    startup: z.boolean(),
    shutdown: z.boolean(),
    scheduled: z.boolean(),
    contextual: z.boolean(),
    idle: z.boolean(),
    idleMinutes: z.number().positive(),
    morningHour: z.number().min(0).max(23),
    eveningHour: z.number().min(0).max(23),
    weeklyDay: z.number().min(0).max(6),
    weeklyHour: z.number().min(0).max(23),
  }),

  logging: z.object({
    level: z.enum(['debug', 'info', 'warn', 'error']),
    file: z.string(),
    console: z.boolean(),
    llmVerbose: z.boolean(),  // Show full LLM reasoning (thinking model chain-of-thought)
  }),
});

export type Config = z.infer<typeof ConfigSchema> & {
  firstRun?: boolean;
};

export interface SettingsProvider {
  getSetting<T = unknown>(key: string, defaultValue?: T): T;
}

// === Loader ===

function resolveSetting<T>(settings: SettingsProvider | undefined, key: string, fallback: T): T {
  if (!settings) return fallback;
  return settings.getSetting(key, fallback);
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseEnvBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value !== 'false';
}

/**
 * Load configuration from settings + minimal bootstrap env.
 */
export function loadConfig(settings?: SettingsProvider): Config {
  const llmUrlOverride = process.env.LLM_URL;

  const routerUrl =
    process.env.ROUTER_URL ??
    llmUrlOverride ??
    resolveSetting(settings, 'llm.router.url', 'http://127.0.0.1:11434/v1');

  const fastUrl =
    process.env.FAST_URL ??
    llmUrlOverride ??
    resolveSetting(settings, 'llm.fast.url', 'http://127.0.0.1:11434/v1');

  const thinkingUrl =
    process.env.THINKING_URL ??
    llmUrlOverride ??
    resolveSetting(settings, 'llm.thinking.url', 'http://127.0.0.1:11434/v1');

  const llmApiKey = normalizeOptionalString(
    process.env.LLM_API_KEY ??
    process.env.MLX_API_KEY ??
    resolveSetting(settings, 'llm.api_key', '')
  );

  const embeddingsUrl =
    process.env.EMBEDDINGS_URL ??
    resolveSetting(settings, 'embeddings.url', routerUrl);

  const embeddingsApiKey =
    normalizeOptionalString(
      process.env.EMBEDDINGS_API_KEY ?? resolveSetting(settings, 'embeddings.api_key', '')
    ) ?? llmApiKey;

  const logLevel = (process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error') ??
    resolveSetting(settings, 'logging.level', 'info');

  const logFile = process.env.LOG_FILE ?? resolveSetting(settings, 'logging.file', './logs/bartleby.log');
  const logConsole = parseEnvBoolean(
    process.env.LOG_CONSOLE,
    resolveSetting(settings, 'logging.console', true)
  );
  const logLlmVerbose = parseEnvBoolean(
    process.env.LOG_LLM_VERBOSE,
    resolveSetting(settings, 'logging.llm_verbose', false)
  );

  const config = ConfigSchema.parse({
    llm: {
      router: {
        model: resolveSetting(settings, 'llm.router.model', 'mlx-community/Qwen3-0.6B-4bit'),
        url: routerUrl,
        maxTokens: resolveSetting(settings, 'llm.router.max_tokens', 100),
      },
      fast: {
        model: resolveSetting(settings, 'llm.fast.model', 'mlx-community/Qwen3.5-35B-A3B-4bit'),
        url: fastUrl,
        maxTokens: resolveSetting(settings, 'llm.fast.max_tokens', 4096),
      },
      thinking: {
        model: resolveSetting(settings, 'llm.thinking.model', 'mlx-community/Qwen3.5-122B-A10B-4bit'),
        url: thinkingUrl,
        maxTokens: resolveSetting(settings, 'llm.thinking.max_tokens', 8192),
        budget: resolveSetting(settings, 'llm.thinking.budget', 4096),
      },
      healthTimeout: resolveSetting(settings, 'llm.health_timeout_ms', 35000),
      agentMaxIterations: resolveSetting(settings, 'llm.agent.max_iterations', 10),
      apiKey: llmApiKey,
    },
    embeddings: {
      url: embeddingsUrl,
      model: resolveSetting(settings, 'embeddings.model', 'nomic-embed-text'),
      dimensions: resolveSetting(settings, 'embeddings.dimensions', 4096),
      apiKey: embeddingsApiKey,
    },
    ocr: {
      enabled: resolveSetting(settings, 'ocr.enabled', false),
      url: normalizeOptionalString(resolveSetting(settings, 'ocr.url', '')),
      model: resolveSetting(settings, 'ocr.model', 'olmocr'),
      maxTokens: resolveSetting(settings, 'ocr.max_tokens', 4096),
      apiKey: normalizeOptionalString(resolveSetting(settings, 'ocr.api_key', '')) ?? llmApiKey,
    },
    paths: {
      garden: process.env.GARDEN_PATH ?? resolveSetting(settings, 'paths.garden', './garden'),
      shed: process.env.SHED_PATH ?? resolveSetting(settings, 'paths.shed', './shed'),
      database: process.env.DATABASE_PATH ?? resolveSetting(settings, 'paths.database', './database'),
      logs: process.env.LOG_DIR ?? resolveSetting(settings, 'paths.logs', './logs'),
      inbox: process.env.BARTLEBY_INBOX_PATH ?? resolveSetting(settings, 'paths.inbox', './inbox'),
    },
    dashboard: {
      host: resolveSetting(settings, 'dashboard.host', 'localhost'),
      port: resolveSetting(settings, 'dashboard.port', 3333),
      apiToken: normalizeOptionalString(resolveSetting(settings, 'dashboard.api_token', '')),
      allowedIps: normalizeStringList(resolveSetting(settings, 'dashboard.allowed_ips', [])),
    },
    weather: {
      city: normalizeOptionalString(resolveSetting(settings, 'weather.city', '')),
      apiKey: normalizeOptionalString(resolveSetting(settings, 'weather.api_key', '')),
      units: resolveSetting(settings, 'weather.units', 'F'),
    },
    signal: {
      enabled: resolveSetting(settings, 'signal.enabled', false),
      cliPath: resolveSetting(settings, 'signal.cli_path', '/usr/local/bin/signal-cli'),
      number: normalizeOptionalString(resolveSetting(settings, 'signal.number', '')),
      recipient: normalizeOptionalString(resolveSetting(settings, 'signal.recipient', '')),
      timeout: resolveSetting(settings, 'signal.timeout_ms', 20000),
      receiveEnabled: resolveSetting(settings, 'signal.receive_enabled', false),
      allowedSenders: normalizeStringList(resolveSetting(settings, 'signal.allowed_senders', [])),
    },
    scheduler: {
      enabled: resolveSetting(settings, 'scheduler.enabled', true),
      checkInterval: resolveSetting(settings, 'scheduler.check_interval_ms', 60000),
      missedReminders: resolveSetting(settings, 'scheduler.missed_reminders', 'ask'),
    },
    calendar: {
      timezone: resolveSetting(
        settings,
        'calendar.timezone',
        Intl.DateTimeFormat().resolvedOptions().timeZone
      ),
      defaultDuration: resolveSetting(settings, 'calendar.default_duration_minutes', 60),
      ambiguousTime: resolveSetting(settings, 'calendar.ambiguous_time', 'afternoon'),
      weekStart: resolveSetting(settings, 'calendar.week_start', 'sunday'),
      reminderMinutes: resolveSetting(settings, 'calendar.reminder_minutes', 15),
      dateFormat: resolveSetting(settings, 'calendar.date_format', 'mdy'),
    },
    presence: {
      startup: resolveSetting(settings, 'presence.startup', true),
      shutdown: resolveSetting(settings, 'presence.shutdown', true),
      scheduled: resolveSetting(settings, 'presence.scheduled', true),
      contextual: resolveSetting(settings, 'presence.contextual', true),
      idle: resolveSetting(settings, 'presence.idle', false),
      idleMinutes: resolveSetting(settings, 'presence.idle_minutes', 5),
      morningHour: resolveSetting(settings, 'presence.morning_hour', 8),
      eveningHour: resolveSetting(settings, 'presence.evening_hour', 18),
      weeklyDay: resolveSetting(settings, 'presence.weekly_day', 0),
      weeklyHour: resolveSetting(settings, 'presence.weekly_hour', 9),
    },
    logging: {
      level: logLevel,
      file: logFile,
      console: logConsole,
      llmVerbose: logLlmVerbose,
    },
  });

  return config;
}

// === Path Helpers ===

export function resolvePath(config: Config, key: keyof Config['paths']): string {
  const p = config.paths[key];
  return path.isAbsolute(p) ? p : path.join(process.cwd(), p);
}

export function getDbPath(config: Config, name: string): string {
  return path.join(resolvePath(config, 'database'), name);
}

export function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function normalizeStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry).trim()).filter((entry) => entry.length > 0);
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }

  return [];
}
