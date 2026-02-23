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

// === Loader ===

/**
 * Load configuration (legacy .env-based loader)
 *
 * This function loads all settings from environment variables.
 * Use loadHybridConfig() for the new database-backed settings system.
 */
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
      apiKey: process.env.MLX_API_KEY || undefined,
    },
    embeddings: {
      url: process.env.EMBEDDINGS_URL || 'http://localhost:11434/v1',
      model: process.env.EMBEDDINGS_MODEL || 'nomic-embed-text',
      dimensions: parseInt(process.env.EMBEDDINGS_DIMENSIONS || '4096'),
      apiKey: process.env.MLX_API_KEY || undefined,
    },
    ocr: {
      enabled: !!process.env.OCR_URL,
      url: process.env.OCR_URL || undefined,
      model: process.env.OCR_MODEL || 'olmocr',
      maxTokens: parseInt(process.env.OCR_MAX_TOKENS || '4096'),
      apiKey: process.env.MLX_API_KEY || undefined,
    },
    paths: {
      garden: process.env.GARDEN_PATH || './garden',
      shed: process.env.SHED_PATH || './shed',
      database: process.env.DATABASE_PATH || './database',
      logs: process.env.LOG_DIR || './logs',
      inbox: process.env.BARTLEBY_INBOX_PATH || './inbox',
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
      missedReminders: (process.env.SCHEDULER_MISSED_REMINDERS || 'default') as 'default' | 'ask' | 'fire' | 'skip' | 'show',
    },
    calendar: {
      timezone: process.env.CALENDAR_TIMEZONE || Intl.DateTimeFormat().resolvedOptions().timeZone,
      defaultDuration: parseInt(process.env.CALENDAR_DEFAULT_DURATION || '60'),
      ambiguousTime: (process.env.CALENDAR_AMBIGUOUS_TIME as 'morning' | 'afternoon' | 'ask') || 'afternoon',
      weekStart: (process.env.CALENDAR_WEEK_START as 'sunday' | 'monday') || 'sunday',
      reminderMinutes: parseInt(process.env.CALENDAR_EVENT_REMINDER_MINUTES || '0'),
      dateFormat: (process.env.CALENDAR_DATE_FORMAT as 'mdy' | 'dmy') || 'mdy',
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
      llmVerbose: process.env.LOG_LLM_VERBOSE === 'true',
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

// === Hybrid Config Loader (Database + .env) ===

/**
 * Load configuration with hybrid approach:
 * - Bootstrap settings from .env (LLM URL, paths, logging)
 * - All other settings from database via SettingsService
 *
 * @param settingsService - Optional SettingsService for database settings
 * @returns Configuration object
 */
export function loadHybridConfig(settingsService?: any): Config {
  // Load bootstrap settings from .env (required to boot)
  const bootstrap = {
    llm: {
      router: {
        model: process.env.ROUTER_MODEL || 'qwen3:0.6b',
        url: process.env.LLM_URL || process.env.ROUTER_URL || 'http://localhost:11434/v1',
        maxTokens: parseInt(process.env.ROUTER_MAX_TOKENS || '100'),
      },
      fast: {
        model: process.env.FAST_MODEL || 'qwen3:7b',
        url: process.env.LLM_URL || process.env.FAST_URL || 'http://localhost:11434/v1',
        maxTokens: parseInt(process.env.FAST_MAX_TOKENS || '4096'),
      },
      thinking: {
        model: process.env.THINKING_MODEL || 'qwen3:32b',
        url: process.env.LLM_URL || process.env.THINKING_URL || 'http://localhost:11434/v1',
        maxTokens: parseInt(process.env.THINKING_MAX_TOKENS || '8192'),
        budget: process.env.THINKING_BUDGET ? parseInt(process.env.THINKING_BUDGET) : undefined,
      },
      healthTimeout: 35000,
      agentMaxIterations: 10,
      apiKey: process.env.LLM_API_KEY || process.env.MLX_API_KEY || undefined,
    },
    embeddings: {
      url: process.env.EMBEDDINGS_URL || process.env.LLM_URL || 'http://localhost:11434/v1',
      model: 'nomic-embed-text',
      dimensions: 4096,
      apiKey: process.env.EMBEDDINGS_API_KEY || process.env.LLM_API_KEY || undefined,
    },
    paths: {
      garden: process.env.GARDEN_PATH || './garden',
      shed: process.env.SHED_PATH || './shed',
      database: process.env.DATABASE_PATH || './database',
      logs: process.env.LOG_DIR || './logs',
      inbox: process.env.BARTLEBY_INBOX_PATH || './inbox',
    },
    logging: {
      level: (process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error') || 'info',
      file: process.env.LOG_FILE || './logs/bartleby.log',
      console: process.env.LOG_CONSOLE !== 'false',
      llmVerbose: process.env.LOG_LLM_VERBOSE === 'true',
    },
  };

  // If no SettingsService provided, return bootstrap + defaults
  if (!settingsService) {
    return ConfigSchema.parse({
      ...bootstrap,
      ocr: {
        enabled: false,
        maxTokens: 4096,
      },
      weather: {
        units: 'F' as const,
      },
      signal: {
        enabled: false,
        cliPath: '/usr/local/bin/signal-cli',
        timeout: 20000,
      },
      scheduler: {
        enabled: true,
        checkInterval: 60000,
        missedReminders: 'default' as const,
      },
      calendar: {
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        defaultDuration: 60,
        ambiguousTime: 'afternoon' as const,
        weekStart: 'sunday' as const,
        reminderMinutes: 0,
        dateFormat: 'mdy' as const,
      },
      presence: {
        startup: true,
        shutdown: true,
        scheduled: true,
        contextual: true,
        idle: false,
        idleMinutes: 5,
        morningHour: 8,
        eveningHour: 18,
        weeklyDay: 0,
        weeklyHour: 9,
      },
    });
  }

  // Check if first run
  const isFirstRun = settingsService.isFirstRun();

  if (isFirstRun) {
    // First run: use .env fallbacks or defaults
    const config = ConfigSchema.parse({
      ...bootstrap,
      ocr: {
        enabled: !!process.env.OCR_URL,
        url: process.env.OCR_URL || undefined,
        model: process.env.OCR_MODEL || 'olmocr',
        maxTokens: parseInt(process.env.OCR_MAX_TOKENS || '4096'),
        apiKey: process.env.MLX_API_KEY || undefined,
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
        missedReminders: (process.env.SCHEDULER_MISSED_REMINDERS || 'default') as any,
      },
      calendar: {
        timezone: process.env.CALENDAR_TIMEZONE || Intl.DateTimeFormat().resolvedOptions().timeZone,
        defaultDuration: parseInt(process.env.CALENDAR_DEFAULT_DURATION || '60'),
        ambiguousTime: (process.env.CALENDAR_AMBIGUOUS_TIME as 'morning' | 'afternoon' | 'ask') || 'afternoon',
        weekStart: (process.env.CALENDAR_WEEK_START as 'sunday' | 'monday') || 'sunday',
        reminderMinutes: parseInt(process.env.CALENDAR_EVENT_REMINDER_MINUTES || '0'),
        dateFormat: (process.env.CALENDAR_DATE_FORMAT as 'mdy' | 'dmy') || 'mdy',
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
    });

    return { ...config, firstRun: true };
  }

  // Load from database settings
  try {
    const llmSettings = settingsService.getCategory('llm');
    const embeddingsSettings = settingsService.getCategory('embeddings');
    const ocrSettings = settingsService.getCategory('ocr');
    const weatherSettings = settingsService.getCategory('weather');
    const signalSettings = settingsService.getCategory('signal');
    const schedulerSettings = settingsService.getCategory('scheduler');
    const calendarSettings = settingsService.getCategory('calendar');
    const presenceSettings = settingsService.getCategory('presence');

    const config = ConfigSchema.parse({
      llm: {
        router: {
          model: llmSettings['router-model'] || bootstrap.llm.router.model,
          url: bootstrap.llm.router.url, // Always from bootstrap
          maxTokens: llmSettings['router-max-tokens'] || bootstrap.llm.router.maxTokens,
        },
        fast: {
          model: llmSettings['fast-model'] || bootstrap.llm.fast.model,
          url: bootstrap.llm.fast.url, // Always from bootstrap
          maxTokens: llmSettings['fast-max-tokens'] || bootstrap.llm.fast.maxTokens,
        },
        thinking: {
          model: llmSettings['thinking-model'] || bootstrap.llm.thinking.model,
          url: bootstrap.llm.thinking.url, // Always from bootstrap
          maxTokens: llmSettings['thinking-max-tokens'] || bootstrap.llm.thinking.maxTokens,
          budget: llmSettings['thinking-budget'] || bootstrap.llm.thinking.budget,
        },
        healthTimeout: llmSettings['health-timeout'] || 35000,
        agentMaxIterations: llmSettings['agent-max-iterations'] || 10,
        apiKey: bootstrap.llm.apiKey,
      },
      embeddings: {
        url: bootstrap.embeddings.url, // Always from bootstrap
        model: embeddingsSettings['model'] || 'nomic-embed-text',
        dimensions: embeddingsSettings['dimensions'] || 4096,
        apiKey: bootstrap.embeddings.apiKey,
      },
      ocr: {
        enabled: ocrSettings['enabled'] || false,
        url: ocrSettings['url'] || undefined,
        model: ocrSettings['model'] || 'olmocr',
        maxTokens: ocrSettings['max-tokens'] || 4096,
        apiKey: bootstrap.llm.apiKey,
      },
      paths: bootstrap.paths, // Always from bootstrap
      weather: {
        city: weatherSettings['city'] || undefined,
        apiKey: weatherSettings['api-key'] || undefined,
        units: weatherSettings['units'] || 'F',
      },
      signal: {
        enabled: signalSettings['enabled'] || false,
        cliPath: signalSettings['cli-path'] || '/usr/local/bin/signal-cli',
        number: signalSettings['number'] || undefined,
        recipient: signalSettings['recipient'] || undefined,
        timeout: signalSettings['timeout'] || 20000,
      },
      scheduler: {
        enabled: schedulerSettings['enabled'] !== false,
        checkInterval: schedulerSettings['check-interval'] || 60000,
        missedReminders: schedulerSettings['missed-reminders'] || 'default',
      },
      calendar: {
        timezone: calendarSettings['timezone'] || Intl.DateTimeFormat().resolvedOptions().timeZone,
        defaultDuration: calendarSettings['default-duration'] || 60,
        ambiguousTime: calendarSettings['ambiguous-time'] || 'afternoon',
        weekStart: calendarSettings['week-start'] || 'sunday',
        reminderMinutes: calendarSettings['reminder-minutes'] || 0,
        dateFormat: calendarSettings['date-format'] || 'mdy',
      },
      presence: {
        startup: presenceSettings['startup'] !== false,
        shutdown: presenceSettings['shutdown'] !== false,
        scheduled: presenceSettings['scheduled'] !== false,
        contextual: presenceSettings['contextual'] !== false,
        idle: presenceSettings['idle'] || false,
        idleMinutes: presenceSettings['idle-minutes'] || 5,
        morningHour: presenceSettings['morning-hour'] || 8,
        eveningHour: presenceSettings['evening-hour'] || 18,
        weeklyDay: presenceSettings['weekly-day'] || 0,
        weeklyHour: presenceSettings['weekly-hour'] || 9,
      },
      logging: bootstrap.logging, // Always from bootstrap
    });

    return config;
  } catch (err) {
    console.warn('Failed to load settings from database, falling back to .env:', err);
    // Fallback to legacy loader
    return loadConfig();
  }
}
