export type SettingType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'enum'
  | 'string_list'
  | 'json';

export interface SettingDefinition<T = unknown> {
  key: string;
  category: string;
  type: SettingType;
  default: T;
  description: string;
  secret?: boolean;
  requiresRestart?: boolean;
  options?: string[];
  prompt?: string;
  placeholder?: string;
  example?: string;
  validate?: (value: T) => string | null;
}

const def = <T>(definition: SettingDefinition<T>): SettingDefinition<T> => definition;

export const SETTINGS_REGISTRY: SettingDefinition[] = [
  // LLM
  def({
    key: 'llm.router.url',
    category: 'llm',
    type: 'string',
    default: 'http://127.0.0.1:11434/v1',
    description: 'Router tier endpoint URL',
    requiresRestart: true,
    prompt: 'Router URL',
  }),
  def({
    key: 'llm.router.model',
    category: 'llm',
    type: 'string',
    default: 'qwen3:0.6b',
    description: 'Router tier model for complexity classification',
    requiresRestart: true,
  }),
  def({
    key: 'llm.router.max_tokens',
    category: 'llm',
    type: 'number',
    default: 100,
    description: 'Max tokens for router tier requests',
    requiresRestart: true,
  }),
  def({
    key: 'llm.fast.url',
    category: 'llm',
    type: 'string',
    default: 'http://127.0.0.1:11434/v1',
    description: 'Fast tier endpoint URL',
    requiresRestart: true,
    prompt: 'Fast model URL',
  }),
  def({
    key: 'llm.fast.model',
    category: 'llm',
    type: 'string',
    default: 'qwen3:7b',
    description: 'Fast tier model for simple queries',
    requiresRestart: true,
  }),
  def({
    key: 'llm.fast.max_tokens',
    category: 'llm',
    type: 'number',
    default: 4096,
    description: 'Max tokens for fast tier requests',
    requiresRestart: true,
  }),
  def({
    key: 'llm.thinking.url',
    category: 'llm',
    type: 'string',
    default: 'http://127.0.0.1:11434/v1',
    description: 'Thinking tier endpoint URL',
    requiresRestart: true,
    prompt: 'Thinking model URL',
  }),
  def({
    key: 'llm.thinking.model',
    category: 'llm',
    type: 'string',
    default: 'qwen3:32b',
    description: 'Thinking tier model for complex reasoning',
    requiresRestart: true,
  }),
  def({
    key: 'llm.thinking.max_tokens',
    category: 'llm',
    type: 'number',
    default: 8192,
    description: 'Max tokens for thinking tier requests',
    requiresRestart: true,
  }),
  def({
    key: 'llm.thinking.budget',
    category: 'llm',
    type: 'number',
    default: 4096,
    description: 'Token budget for thinking tier responses',
    requiresRestart: true,
  }),
  def({
    key: 'llm.health_timeout_ms',
    category: 'llm',
    type: 'number',
    default: 35000,
    description: 'Health check timeout in milliseconds',
    requiresRestart: true,
  }),
  def({
    key: 'llm.agent.max_iterations',
    category: 'llm',
    type: 'number',
    default: 10,
    description: 'Maximum agent loop iterations',
    requiresRestart: true,
  }),
  def({
    key: 'llm.api_key',
    category: 'llm',
    type: 'string',
    default: '',
    description: 'API key for OpenAI-compatible endpoints',
    secret: true,
    requiresRestart: true,
  }),

  // Embeddings
  def({
    key: 'embeddings.url',
    category: 'embeddings',
    type: 'string',
    default: 'http://127.0.0.1:11434/v1',
    description: 'Embeddings endpoint URL',
    requiresRestart: true,
  }),
  def({
    key: 'embeddings.model',
    category: 'embeddings',
    type: 'string',
    default: 'nomic-embed-text',
    description: 'Embedding model name',
    requiresRestart: true,
  }),
  def({
    key: 'embeddings.dimensions',
    category: 'embeddings',
    type: 'number',
    default: 4096,
    description: 'Embedding vector dimensions',
    requiresRestart: true,
  }),
  def({
    key: 'embeddings.api_key',
    category: 'embeddings',
    type: 'string',
    default: '',
    description: 'API key for embeddings endpoint',
    secret: true,
    requiresRestart: true,
  }),

  // OCR
  def({
    key: 'ocr.enabled',
    category: 'ocr',
    type: 'boolean',
    default: false,
    description: 'Enable OCR integration',
    requiresRestart: true,
  }),
  def({
    key: 'ocr.url',
    category: 'ocr',
    type: 'string',
    default: '',
    description: 'OCR endpoint URL',
    requiresRestart: true,
  }),
  def({
    key: 'ocr.model',
    category: 'ocr',
    type: 'string',
    default: 'olmocr',
    description: 'OCR model name',
    requiresRestart: true,
  }),
  def({
    key: 'ocr.max_tokens',
    category: 'ocr',
    type: 'number',
    default: 4096,
    description: 'Max tokens for OCR responses',
    requiresRestart: true,
  }),
  def({
    key: 'ocr.api_key',
    category: 'ocr',
    type: 'string',
    default: '',
    description: 'API key for OCR endpoint',
    secret: true,
    requiresRestart: true,
  }),

  // Paths
  def({
    key: 'paths.database',
    category: 'paths',
    type: 'string',
    default: './database',
    description: 'Database storage path',
    requiresRestart: true,
  }),
  def({
    key: 'paths.garden',
    category: 'paths',
    type: 'string',
    default: './garden',
    description: 'Garden storage path',
    requiresRestart: true,
  }),
  def({
    key: 'paths.shed',
    category: 'paths',
    type: 'string',
    default: './shed',
    description: 'Shed storage path',
    requiresRestart: true,
  }),
  def({
    key: 'paths.logs',
    category: 'paths',
    type: 'string',
    default: './logs',
    description: 'Log directory path',
    requiresRestart: true,
  }),
  def({
    key: 'paths.inbox',
    category: 'paths',
    type: 'string',
    default: './inbox',
    description: 'Inbox import path',
    requiresRestart: true,
  }),

  // Dashboard
  def({
    key: 'dashboard.host',
    category: 'dashboard',
    type: 'string',
    default: 'localhost',
    description: 'Dashboard bind host',
    requiresRestart: true,
  }),
  def({
    key: 'dashboard.port',
    category: 'dashboard',
    type: 'number',
    default: 3333,
    description: 'Dashboard port',
    requiresRestart: true,
  }),
  def({
    key: 'dashboard.api_token',
    category: 'dashboard',
    type: 'string',
    default: '',
    description: 'API token for remote dashboard access',
    secret: true,
    requiresRestart: true,
  }),
  def({
    key: 'dashboard.allowed_ips',
    category: 'dashboard',
    type: 'string_list',
    default: [],
    description: 'Allowlist of IPs for dashboard access',
    requiresRestart: true,
  }),

  // Weather
  def({
    key: 'weather.city',
    category: 'weather',
    type: 'string',
    default: '',
    description: 'City for weather lookups',
  }),
  def({
    key: 'weather.units',
    category: 'weather',
    type: 'enum',
    default: 'F',
    options: ['F', 'C'],
    description: 'Temperature units',
  }),
  def({
    key: 'weather.api_key',
    category: 'weather',
    type: 'string',
    default: '',
    description: 'Weather API key',
    secret: true,
  }),

  // Signal
  def({
    key: 'signal.enabled',
    category: 'signal',
    type: 'boolean',
    default: false,
    description: 'Enable Signal integration',
    requiresRestart: true,
  }),
  def({
    key: 'signal.cli_path',
    category: 'signal',
    type: 'string',
    default: '/usr/local/bin/signal-cli',
    description: 'Path to signal-cli binary',
    requiresRestart: true,
  }),
  def({
    key: 'signal.number',
    category: 'signal',
    type: 'string',
    default: '',
    description: 'Signal phone number',
    secret: true,
    requiresRestart: true,
  }),
  def({
    key: 'signal.recipient',
    category: 'signal',
    type: 'string',
    default: '',
    description: 'Default Signal recipient',
    secret: true,
    requiresRestart: true,
  }),
  def({
    key: 'signal.timeout_ms',
    category: 'signal',
    type: 'number',
    default: 20000,
    description: 'Signal CLI timeout in milliseconds',
    requiresRestart: true,
  }),
  def({
    key: 'signal.receive_enabled',
    category: 'signal',
    type: 'boolean',
    default: false,
    description: 'Enable inbound Signal commands',
    requiresRestart: true,
  }),
  def({
    key: 'signal.allowed_senders',
    category: 'signal',
    type: 'string_list',
    default: [],
    description: 'Allowlist of Signal senders for inbound commands',
    requiresRestart: true,
  }),

  // Scheduler
  def({
    key: 'scheduler.enabled',
    category: 'scheduler',
    type: 'boolean',
    default: true,
    description: 'Enable reminder scheduler',
    requiresRestart: true,
  }),
  def({
    key: 'scheduler.check_interval_ms',
    category: 'scheduler',
    type: 'number',
    default: 60000,
    description: 'Scheduler check interval in milliseconds',
    requiresRestart: true,
  }),
  def({
    key: 'scheduler.missed_reminders',
    category: 'scheduler',
    type: 'enum',
    default: 'default',
    options: ['default', 'ask', 'fire', 'skip', 'show'],
    description: 'How to handle reminders fired while offline',
    requiresRestart: true,
  }),

  // Calendar
  def({
    key: 'calendar.timezone',
    category: 'calendar',
    type: 'string',
    default: Intl.DateTimeFormat().resolvedOptions().timeZone,
    description: 'Calendar timezone',
  }),
  def({
    key: 'calendar.default_duration_minutes',
    category: 'calendar',
    type: 'number',
    default: 60,
    description: 'Default event duration in minutes',
  }),
  def({
    key: 'calendar.ambiguous_time',
    category: 'calendar',
    type: 'enum',
    default: 'afternoon',
    options: ['morning', 'afternoon', 'ask'],
    description: 'Default time for ambiguous dates',
  }),
  def({
    key: 'calendar.week_start',
    category: 'calendar',
    type: 'enum',
    default: 'sunday',
    options: ['sunday', 'monday'],
    description: 'Week start day',
  }),
  def({
    key: 'calendar.reminder_minutes',
    category: 'calendar',
    type: 'number',
    default: 0,
    description: 'Default reminder minutes before events',
  }),
  def({
    key: 'calendar.date_format',
    category: 'calendar',
    type: 'enum',
    default: 'mdy',
    options: ['mdy', 'dmy'],
    description: 'Date format for numeric dates',
  }),

  // Presence
  def({
    key: 'presence.startup',
    category: 'presence',
    type: 'boolean',
    default: true,
    description: 'Send greeting on startup',
  }),
  def({
    key: 'presence.shutdown',
    category: 'presence',
    type: 'boolean',
    default: true,
    description: 'Send goodbye on shutdown',
  }),
  def({
    key: 'presence.scheduled',
    category: 'presence',
    type: 'boolean',
    default: true,
    description: 'Enable scheduled check-ins',
  }),
  def({
    key: 'presence.contextual',
    category: 'presence',
    type: 'boolean',
    default: true,
    description: 'Enable contextual check-ins',
  }),
  def({
    key: 'presence.idle',
    category: 'presence',
    type: 'boolean',
    default: false,
    description: 'Enable idle prompts',
  }),
  def({
    key: 'presence.idle_minutes',
    category: 'presence',
    type: 'number',
    default: 5,
    description: 'Minutes before idle prompts trigger',
  }),
  def({
    key: 'presence.morning_hour',
    category: 'presence',
    type: 'number',
    default: 8,
    description: 'Morning check-in hour (0-23)',
  }),
  def({
    key: 'presence.evening_hour',
    category: 'presence',
    type: 'number',
    default: 18,
    description: 'Evening check-in hour (0-23)',
  }),
  def({
    key: 'presence.weekly_day',
    category: 'presence',
    type: 'number',
    default: 0,
    description: 'Weekly check-in day (0=Sunday)',
  }),
  def({
    key: 'presence.weekly_hour',
    category: 'presence',
    type: 'number',
    default: 9,
    description: 'Weekly check-in hour (0-23)',
  }),

  // Logging
  def({
    key: 'logging.level',
    category: 'logging',
    type: 'enum',
    default: 'info',
    options: ['debug', 'info', 'warn', 'error'],
    description: 'Log level',
    requiresRestart: true,
  }),
  def({
    key: 'logging.file',
    category: 'logging',
    type: 'string',
    default: './logs/bartleby.log',
    description: 'Log file path',
    requiresRestart: true,
  }),
  def({
    key: 'logging.console',
    category: 'logging',
    type: 'boolean',
    default: true,
    description: 'Enable console logging',
    requiresRestart: true,
  }),
  def({
    key: 'logging.llm_verbose',
    category: 'logging',
    type: 'boolean',
    default: false,
    description: 'Log full LLM reasoning output',
    requiresRestart: true,
  }),
];

export const SETTINGS_BY_KEY = new Map(
  SETTINGS_REGISTRY.map((definition) => [definition.key, definition] as const)
);

export const SETTINGS_CATEGORIES = Array.from(
  new Set(SETTINGS_REGISTRY.map((definition) => definition.category))
).sort();

export function getSettingDefinition(key: string): SettingDefinition | undefined {
  return SETTINGS_BY_KEY.get(key);
}

export function getSettingsByCategory(category: string): SettingDefinition[] {
  return SETTINGS_REGISTRY.filter((definition) => definition.category === category);
}
