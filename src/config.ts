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
  }),

  embeddings: z.object({
    url: z.string().url(),
    model: z.string(),
    dimensions: z.number().positive(),
  }),

  paths: z.object({
    garden: z.string(),
    shed: z.string(),
    database: z.string(),
    logs: z.string(),
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
  }),

  scheduler: z.object({
    enabled: z.boolean(),
    checkInterval: z.number().positive(),
  }),

  calendar: z.object({
    timezone: z.string(),
    defaultDuration: z.number().positive(),
    ambiguousTime: z.enum(['morning', 'afternoon', 'ask']),
    weekStart: z.enum(['sunday', 'monday']),
    reminderMinutes: z.number().min(0),
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
  }),
});

export type Config = z.infer<typeof ConfigSchema>;

// === Loader ===

export function loadConfig(): Config {
  const config = ConfigSchema.parse({
    llm: {
      router: {
        model: process.env.ROUTER_MODEL || 'qwen3:0.6b',
        url: process.env.ROUTER_URL || 'http://localhost:11434/v1',
        maxTokens: parseInt(process.env.ROUTER_MAX_TOKENS || '100'),
      },
      fast: {
        model: process.env.FAST_MODEL || 'qwen3:7b',
        url: process.env.FAST_URL || 'http://localhost:11434/v1',
        maxTokens: parseInt(process.env.FAST_MAX_TOKENS || '4096'),
      },
      thinking: {
        model: process.env.THINKING_MODEL || 'qwen3:32b',
        url: process.env.THINKING_URL || 'http://localhost:11434/v1',
        maxTokens: parseInt(process.env.THINKING_MAX_TOKENS || '8192'),
        budget: process.env.THINKING_BUDGET ? parseInt(process.env.THINKING_BUDGET) : undefined,
      },
      healthTimeout: parseInt(process.env.HEALTH_TIMEOUT || '35000'),
      agentMaxIterations: parseInt(process.env.AGENT_MAX_ITERATIONS || '10'),
    },
    embeddings: {
      url: process.env.EMBEDDINGS_URL || 'http://localhost:11434/v1',
      model: process.env.EMBEDDINGS_MODEL || 'nomic-embed-text',
      dimensions: parseInt(process.env.EMBEDDINGS_DIMENSIONS || '4096'),
    },
    paths: {
      garden: process.env.GARDEN_PATH || './garden',
      shed: process.env.SHED_PATH || './shed',
      database: process.env.DATABASE_PATH || './database',
      logs: process.env.LOG_DIR || './logs',
    },
    weather: {
      city: process.env.WEATHER_CITY || undefined,
      apiKey: process.env.OPENWEATHERMAP_API_KEY || undefined,
      units: (process.env.WEATHER_UNITS as 'C' | 'F') || 'F',
    },
    signal: {
      enabled: process.env.SIGNAL_ENABLED === 'true',
      cliPath: process.env.SIGNAL_CLI_PATH || '/usr/local/bin/signal-cli',
      number: process.env.SIGNAL_NUMBER || undefined,
      recipient: process.env.SIGNAL_RECIPIENT || undefined,
      timeout: parseInt(process.env.SIGNAL_TIMEOUT || '20000'),
    },
    scheduler: {
      enabled: process.env.SCHEDULER_ENABLED !== 'false',
      checkInterval: parseInt(process.env.SCHEDULER_CHECK_INTERVAL || '60000'),
    },
    calendar: {
      timezone: process.env.CALENDAR_TIMEZONE || Intl.DateTimeFormat().resolvedOptions().timeZone,
      defaultDuration: parseInt(process.env.CALENDAR_DEFAULT_DURATION || '60'),
      ambiguousTime: (process.env.CALENDAR_AMBIGUOUS_TIME as 'morning' | 'afternoon' | 'ask') || 'afternoon',
      weekStart: (process.env.CALENDAR_WEEK_START as 'sunday' | 'monday') || 'sunday',
      reminderMinutes: parseInt(process.env.CALENDAR_REMINDER_MINUTES || '0'),
    },
    presence: {
      startup: process.env.PRESENCE_STARTUP !== 'false',
      shutdown: process.env.PRESENCE_SHUTDOWN !== 'false',
      scheduled: process.env.PRESENCE_SCHEDULED !== 'false',
      contextual: process.env.PRESENCE_CONTEXTUAL !== 'false',
      idle: process.env.PRESENCE_IDLE === 'true',
      idleMinutes: parseInt(process.env.PRESENCE_IDLE_MINUTES || '5'),
      morningHour: parseInt(process.env.PRESENCE_MORNING_HOUR || '8'),
      eveningHour: parseInt(process.env.PRESENCE_EVENING_HOUR || '18'),
      weeklyDay: parseInt(process.env.PRESENCE_WEEKLY_DAY || '0'),
      weeklyHour: parseInt(process.env.PRESENCE_WEEKLY_HOUR || '9'),
    },
    logging: {
      level: (process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error') || 'info',
      file: process.env.LOG_FILE || './logs/bartleby.log',
      console: process.env.LOG_CONSOLE !== 'false',
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
