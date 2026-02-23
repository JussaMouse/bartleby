// src/tools/settings-migration.ts
import { Tool } from './types.js';
import { writeFileSync, readFileSync, existsSync, renameSync } from 'fs';
import { join } from 'path';

/**
 * Migrate settings from .env to database
 *
 * Helps existing users transition to the new settings system:
 * 1. Read current .env file
 * 2. Extract all settings
 * 3. Save to database via SettingsService
 * 4. Backup .env to .env.backup
 * 5. Create new minimal .env
 */
export const migrateSettings: Tool = {
  name: 'migrateSettings',
  description: 'Migrate .env settings to database',

  routing: {
    patterns: [
      /^migrate\s+settings?\s*$/i,
      /^migrate\s+config\s*$/i,
      /^migrate\s+env\s*$/i,
    ],
    keywords: {
      verbs: ['migrate', 'convert', 'transfer'],
      nouns: ['settings', 'config', 'configuration', 'env'],
    },
    examples: [
      'migrate settings',
      'migrate config',
    ],
    priority: 75,
  },

  parameters: {
    type: 'object',
    properties: {
      confirm: { type: 'boolean', description: 'Confirm migration' },
    },
  },

  parseArgs: () => ({ confirm: false }),

  execute: async (args, context) => {
    const { settings, config } = context.services;
    const { confirm = false } = args as { confirm?: boolean };

    try {
      // Check if .env exists
      const envPath = join(process.cwd(), '.env');
      if (!existsSync(envPath)) {
        return 'No .env file found. Nothing to migrate.';
      }

      // Check if already migrated
      const migrationVersion = settings.getMigrationVersion();
      if (migrationVersion > 0 && !confirm) {
        return `Settings have already been migrated (version ${migrationVersion}).\n\nTo re-migrate, use the tool with confirm: true parameter.`;
      }

      // Read and parse .env
      const envContent = readFileSync(envPath, 'utf-8');
      const envVars = parseEnvFile(envContent);

      let output = `📦 Settings Migration\n\n`;
      output += `Found ${Object.keys(envVars).length} settings in .env\n\n`;

      // Preview what will be migrated
      const settingsToMigrate = categorizeEnvVars(envVars);

      output += `Will migrate:\n`;
      for (const [category, settings] of Object.entries(settingsToMigrate)) {
        output += `  ${category}: ${Object.keys(settings).length} settings\n`;
      }
      output += `\n`;

      if (!confirm) {
        output += `⚠️ This will:\n`;
        output += `  1. Save all settings to database\n`;
        output += `  2. Backup .env to .env.backup\n`;
        output += `  3. Create new minimal .env\n\n`;
        output += `To proceed, use the tool with confirm: true parameter.`;
        return output;
      }

      // Migrate settings to database
      let migratedCount = 0;

      for (const [category, categorySettings] of Object.entries(settingsToMigrate)) {
        for (const [key, value] of Object.entries(categorySettings)) {
          const fullKey = `${category}.${key}`;
          settings.setSetting(fullKey, value, category);
          migratedCount++;
        }
      }

      output += `✓ Migrated ${migratedCount} settings to database\n\n`;

      // Backup .env
      const backupPath = join(process.cwd(), '.env.backup');
      renameSync(envPath, backupPath);
      output += `✓ Backed up .env to .env.backup\n\n`;

      // Create new minimal .env
      const minimalEnv = generateMinimalEnv(config);
      writeFileSync(envPath, minimalEnv);
      output += `✓ Created new minimal .env\n\n`;

      // Mark migration complete
      settings.setMigrationVersion(1);

      output += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
      output += `Migration complete!\n\n`;
      output += `Your settings are now in the database.\n`;
      output += `The old .env is saved as .env.backup\n\n`;
      output += `You can now:\n`;
      output += `  • View settings: settings\n`;
      output += `  • Change settings: set <key> to <value>\n`;
      output += `  • Edit categories: edit calendar settings\n\n`;
      output += `⚠️ Note: Some settings require restart to take effect.\n`;
      output += `Recommended: Restart Bartleby now.`;

      return output;
    } catch (err) {
      return `Error migrating settings: ${String(err)}`;
    }
  },
};

/**
 * Parse .env file into key-value pairs
 */
function parseEnvFile(content: string): Record<string, string> {
  const vars: Record<string, string> = {};
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Parse KEY=VALUE
    const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (match) {
      const [, key, value] = match;
      // Remove quotes if present
      const cleanValue = value.replace(/^["']|["']$/g, '');
      vars[key] = cleanValue;
    }
  }

  return vars;
}

/**
 * Categorize environment variables into settings categories
 */
function categorizeEnvVars(envVars: Record<string, string>): Record<string, Record<string, any>> {
  const categorized: Record<string, Record<string, any>> = {
    llm: {},
    embeddings: {},
    calendar: {},
    presence: {},
    scheduler: {},
    ocr: {},
    weather: {},
    signal: {},
  };

  // LLM settings
  if (envVars.ROUTER_MODEL) categorized.llm['router-model'] = envVars.ROUTER_MODEL;
  if (envVars.FAST_MODEL) categorized.llm['fast-model'] = envVars.FAST_MODEL;
  if (envVars.THINKING_MODEL) categorized.llm['thinking-model'] = envVars.THINKING_MODEL;
  if (envVars.ROUTER_MAX_TOKENS) categorized.llm['router-max-tokens'] = parseInt(envVars.ROUTER_MAX_TOKENS);
  if (envVars.FAST_MAX_TOKENS) categorized.llm['fast-max-tokens'] = parseInt(envVars.FAST_MAX_TOKENS);
  if (envVars.THINKING_MAX_TOKENS) categorized.llm['thinking-max-tokens'] = parseInt(envVars.THINKING_MAX_TOKENS);
  if (envVars.THINKING_BUDGET) categorized.llm['thinking-budget'] = parseInt(envVars.THINKING_BUDGET);
  if (envVars.HEALTH_TIMEOUT) categorized.llm['health-timeout'] = parseInt(envVars.HEALTH_TIMEOUT);
  if (envVars.AGENT_MAX_ITERATIONS) categorized.llm['agent-max-iterations'] = parseInt(envVars.AGENT_MAX_ITERATIONS);

  // Embeddings
  if (envVars.EMBEDDINGS_MODEL) categorized.embeddings['model'] = envVars.EMBEDDINGS_MODEL;
  if (envVars.EMBEDDINGS_DIMENSIONS) categorized.embeddings['dimensions'] = parseInt(envVars.EMBEDDINGS_DIMENSIONS);

  // Calendar
  if (envVars.CALENDAR_TIMEZONE) categorized.calendar['timezone'] = envVars.CALENDAR_TIMEZONE;
  if (envVars.CALENDAR_DEFAULT_DURATION) categorized.calendar['default-duration'] = parseInt(envVars.CALENDAR_DEFAULT_DURATION);
  if (envVars.CALENDAR_AMBIGUOUS_TIME) categorized.calendar['ambiguous-time'] = envVars.CALENDAR_AMBIGUOUS_TIME;
  if (envVars.CALENDAR_WEEK_START) categorized.calendar['week-start'] = envVars.CALENDAR_WEEK_START;
  if (envVars.CALENDAR_EVENT_REMINDER_MINUTES) categorized.calendar['reminder-minutes'] = parseInt(envVars.CALENDAR_EVENT_REMINDER_MINUTES);
  if (envVars.CALENDAR_DATE_FORMAT) categorized.calendar['date-format'] = envVars.CALENDAR_DATE_FORMAT;

  // Presence
  if (envVars.PRESENCE_STARTUP) categorized.presence['startup'] = envVars.PRESENCE_STARTUP !== 'false';
  if (envVars.PRESENCE_SHUTDOWN) categorized.presence['shutdown'] = envVars.PRESENCE_SHUTDOWN !== 'false';
  if (envVars.PRESENCE_SCHEDULED) categorized.presence['scheduled'] = envVars.PRESENCE_SCHEDULED !== 'false';
  if (envVars.PRESENCE_CONTEXTUAL) categorized.presence['contextual'] = envVars.PRESENCE_CONTEXTUAL !== 'false';
  if (envVars.PRESENCE_IDLE) categorized.presence['idle'] = envVars.PRESENCE_IDLE === 'true';
  if (envVars.PRESENCE_IDLE_MINUTES) categorized.presence['idle-minutes'] = parseInt(envVars.PRESENCE_IDLE_MINUTES);
  if (envVars.PRESENCE_MORNING_HOUR) categorized.presence['morning-hour'] = parseInt(envVars.PRESENCE_MORNING_HOUR);
  if (envVars.PRESENCE_EVENING_HOUR) categorized.presence['evening-hour'] = parseInt(envVars.PRESENCE_EVENING_HOUR);
  if (envVars.PRESENCE_WEEKLY_DAY) categorized.presence['weekly-day'] = parseInt(envVars.PRESENCE_WEEKLY_DAY);
  if (envVars.PRESENCE_WEEKLY_HOUR) categorized.presence['weekly-hour'] = parseInt(envVars.PRESENCE_WEEKLY_HOUR);

  // Scheduler
  if (envVars.SCHEDULER_ENABLED) categorized.scheduler['enabled'] = envVars.SCHEDULER_ENABLED !== 'false';
  if (envVars.SCHEDULER_CHECK_INTERVAL) categorized.scheduler['check-interval'] = parseInt(envVars.SCHEDULER_CHECK_INTERVAL);
  if (envVars.SCHEDULER_MISSED_REMINDERS) categorized.scheduler['missed-reminders'] = envVars.SCHEDULER_MISSED_REMINDERS;

  // OCR
  if (envVars.OCR_URL) categorized.ocr['enabled'] = true;
  if (envVars.OCR_URL) categorized.ocr['url'] = envVars.OCR_URL;
  if (envVars.OCR_MODEL) categorized.ocr['model'] = envVars.OCR_MODEL;
  if (envVars.OCR_MAX_TOKENS) categorized.ocr['max-tokens'] = parseInt(envVars.OCR_MAX_TOKENS);

  // Weather
  if (envVars.WEATHER_CITY) categorized.weather['city'] = envVars.WEATHER_CITY;
  if (envVars.OPENWEATHERMAP_API_KEY) categorized.weather['api-key'] = envVars.OPENWEATHERMAP_API_KEY;
  if (envVars.WEATHER_UNITS) categorized.weather['units'] = envVars.WEATHER_UNITS;

  // Signal
  if (envVars.SIGNAL_ENABLED) categorized.signal['enabled'] = envVars.SIGNAL_ENABLED === 'true';
  if (envVars.SIGNAL_CLI_PATH) categorized.signal['cli-path'] = envVars.SIGNAL_CLI_PATH;
  if (envVars.SIGNAL_NUMBER) categorized.signal['number'] = envVars.SIGNAL_NUMBER;
  if (envVars.SIGNAL_RECIPIENT) categorized.signal['recipient'] = envVars.SIGNAL_RECIPIENT;
  if (envVars.SIGNAL_TIMEOUT) categorized.signal['timeout'] = parseInt(envVars.SIGNAL_TIMEOUT);

  // Remove empty categories
  for (const [category, settings] of Object.entries(categorized)) {
    if (Object.keys(settings).length === 0) {
      delete categorized[category];
    }
  }

  return categorized;
}

/**
 * Generate minimal .env file content
 */
function generateMinimalEnv(config: any): string {
  return `# ============================================
# Bartleby Configuration (Minimal Bootstrap)
# ============================================
#
# This is the minimal .env after settings migration.
# Most settings are now in the database.
#
# To configure settings:
#   settings                  # View all settings
#   set <key> to <value>     # Change a setting
#   edit <category> settings # Interactive wizard

# --- LLM (Required) ---
LLM_URL=${config.llm.fast.url}
${config.llm.apiKey ? `LLM_API_KEY=${config.llm.apiKey}` : '# LLM_API_KEY='}

# --- Embeddings (Optional) ---
${config.embeddings.url !== config.llm.fast.url ? `EMBEDDINGS_URL=${config.embeddings.url}` : '# EMBEDDINGS_URL='}
${config.embeddings.apiKey ? `EMBEDDINGS_API_KEY=${config.embeddings.apiKey}` : '# EMBEDDINGS_API_KEY='}

# --- Storage Paths ---
DATABASE_PATH=${config.paths.database}
GARDEN_PATH=${config.paths.garden}
SHED_PATH=${config.paths.shed}
LOG_DIR=${config.paths.logs}

# --- Logging ---
LOG_LEVEL=${config.logging.level}

# ============================================
# All other settings are now in the database
# ============================================
#
# Your previous .env is saved as .env.backup
#
# For detailed configuration reference, see:
#   devs-notes/env-reference.md
`;
}

/**
 * Export settings migration tools
 */
export const settingsMigrationTools: Tool[] = [migrateSettings];
