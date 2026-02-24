// src/setup/first-launch.ts
import readline from 'readline';
import fs from 'fs';
import path from 'path';
import { ServiceContainer } from '../services/index.js';
import { SettingsService } from '../services/settings.js';
import { LLMService } from '../services/llm.js';
import { configureDefaults } from '../tools/first-run-wizard.js';

// ─── ENV → DB Mapping ────────────────────────────────────────────────────────

interface EnvMapping {
  envKey: string;
  dbKey: string;
  category: string;
  description: string;
  transform?: (v: string) => any;
}

const ENV_TO_DB: EnvMapping[] = [
  // LLM models
  { envKey: 'ROUTER_MODEL',    dbKey: 'llm.router-model',      category: 'llm',       description: 'Router tier model for complexity classification' },
  { envKey: 'FAST_MODEL',      dbKey: 'llm.fast-model',        category: 'llm',       description: 'Fast tier model for simple queries' },
  { envKey: 'THINKING_MODEL',  dbKey: 'llm.thinking-model',    category: 'llm',       description: 'Thinking tier model for complex reasoning' },
  { envKey: 'ROUTER_MAX_TOKENS',   dbKey: 'llm.router-max-tokens',   category: 'llm', description: 'Max tokens for router tier', transform: Number },
  { envKey: 'FAST_MAX_TOKENS',     dbKey: 'llm.fast-max-tokens',     category: 'llm', description: 'Max tokens for fast tier',   transform: Number },
  { envKey: 'THINKING_MAX_TOKENS', dbKey: 'llm.thinking-max-tokens', category: 'llm', description: 'Max tokens for thinking tier', transform: Number },
  { envKey: 'HEALTH_TIMEOUT',      dbKey: 'llm.health-timeout',      category: 'llm', description: 'Health check timeout in ms',  transform: Number },
  { envKey: 'AGENT_MAX_ITERATIONS',dbKey: 'llm.agent-max-iterations',category: 'llm', description: 'Max agent loop iterations',   transform: Number },

  // Embeddings
  { envKey: 'EMBEDDINGS_MODEL',      dbKey: 'embeddings.model',      category: 'embeddings', description: 'Embedding model name' },
  { envKey: 'EMBEDDINGS_DIMENSIONS', dbKey: 'embeddings.dimensions', category: 'embeddings', description: 'Embedding vector dimensions', transform: Number },

  // Calendar
  { envKey: 'CALENDAR_TIMEZONE',               dbKey: 'calendar.timezone',         category: 'calendar', description: 'Timezone for calendar events' },
  { envKey: 'CALENDAR_DEFAULT_DURATION',        dbKey: 'calendar.default-duration', category: 'calendar', description: 'Default event duration in minutes', transform: Number },
  { envKey: 'CALENDAR_AMBIGUOUS_TIME',          dbKey: 'calendar.ambiguous-time',   category: 'calendar', description: 'Time preference for ambiguous dates' },
  { envKey: 'CALENDAR_WEEK_START',              dbKey: 'calendar.week-start',       category: 'calendar', description: 'First day of the week' },
  { envKey: 'CALENDAR_EVENT_REMINDER_MINUTES',  dbKey: 'calendar.reminder-minutes', category: 'calendar', description: 'Default reminder minutes before events', transform: Number },
  { envKey: 'CALENDAR_DATE_FORMAT',             dbKey: 'calendar.date-format',      category: 'calendar', description: 'Date format (mdy/dmy)' },

  // Scheduler
  { envKey: 'SCHEDULER_ENABLED',         dbKey: 'scheduler.enabled',          category: 'scheduler', description: 'Enable background scheduler', transform: v => v !== 'false' },
  { envKey: 'SCHEDULER_CHECK_INTERVAL',  dbKey: 'scheduler.check-interval',   category: 'scheduler', description: 'Check interval in ms', transform: Number },
  { envKey: 'SCHEDULER_MISSED_REMINDERS',dbKey: 'scheduler.missed-reminders', category: 'scheduler', description: 'How to handle missed reminders' },

  // Presence
  { envKey: 'PRESENCE_STARTUP',       dbKey: 'presence.startup',        category: 'presence', description: 'Greet on startup',          transform: v => v !== 'false' },
  { envKey: 'PRESENCE_SHUTDOWN',      dbKey: 'presence.shutdown',       category: 'presence', description: 'Say goodbye on shutdown',    transform: v => v !== 'false' },
  { envKey: 'PRESENCE_SCHEDULED',     dbKey: 'presence.scheduled',      category: 'presence', description: 'Scheduled check-ins',        transform: v => v !== 'false' },
  { envKey: 'PRESENCE_CONTEXTUAL',    dbKey: 'presence.contextual',     category: 'presence', description: 'Contextual observations',    transform: v => v !== 'false' },
  { envKey: 'PRESENCE_IDLE',          dbKey: 'presence.idle',           category: 'presence', description: 'Speak when idle',            transform: v => v === 'true' },
  { envKey: 'PRESENCE_IDLE_MINUTES',  dbKey: 'presence.idle-minutes',   category: 'presence', description: 'Minutes until idle',         transform: Number },
  { envKey: 'PRESENCE_MORNING_HOUR',  dbKey: 'presence.morning-hour',   category: 'presence', description: 'Morning check-in hour',      transform: Number },
  { envKey: 'PRESENCE_EVENING_HOUR',  dbKey: 'presence.evening-hour',   category: 'presence', description: 'Evening check-in hour',      transform: Number },
  { envKey: 'PRESENCE_WEEKLY_DAY',    dbKey: 'presence.weekly-day',     category: 'presence', description: 'Weekly review day (0=Sun)', transform: Number },
  { envKey: 'PRESENCE_WEEKLY_HOUR',   dbKey: 'presence.weekly-hour',    category: 'presence', description: 'Weekly review hour',         transform: Number },

  // OCR
  { envKey: 'OCR_URL',        dbKey: 'ocr.url',        category: 'ocr', description: 'OCR service endpoint URL' },
  { envKey: 'OCR_MODEL',      dbKey: 'ocr.model',      category: 'ocr', description: 'OCR model name' },
  { envKey: 'OCR_MAX_TOKENS', dbKey: 'ocr.max-tokens', category: 'ocr', description: 'Max tokens for OCR',     transform: Number },

  // Weather
  { envKey: 'WEATHER_CITY',              dbKey: 'weather.city',    category: 'weather', description: 'City for weather lookups' },
  { envKey: 'OPENWEATHERMAP_API_KEY',    dbKey: 'weather.api-key', category: 'weather', description: 'OpenWeatherMap API key' },
  { envKey: 'WEATHER_UNITS',             dbKey: 'weather.units',   category: 'weather', description: 'Temperature units (F/C)' },

  // Signal
  { envKey: 'SIGNAL_ENABLED',    dbKey: 'signal.enabled',   category: 'signal', description: 'Enable Signal notifications', transform: v => v === 'true' },
  { envKey: 'SIGNAL_CLI_PATH',   dbKey: 'signal.cli-path',  category: 'signal', description: 'Path to signal-cli binary' },
  { envKey: 'SIGNAL_NUMBER',     dbKey: 'signal.number',    category: 'signal', description: 'Your Signal phone number' },
  { envKey: 'SIGNAL_RECIPIENT',  dbKey: 'signal.recipient', category: 'signal', description: 'Signal recipient number' },
  { envKey: 'SIGNAL_TIMEOUT',    dbKey: 'signal.timeout',   category: 'signal', description: 'Signal command timeout in ms', transform: Number },
];

// ─── Settings Manifest (for optional-settings wizard) ─────────────────────────

interface SettingSpec {
  key: string;
  label: string;
  description: string;
  category: string;
  prompt: string;
  validate?: (v: string) => string | null;  // returns error message or null
  sensitive?: boolean;
}

const SETTINGS_MANIFEST: SettingSpec[] = [
  {
    key: 'weather.city',
    label: 'Weather city',
    description: 'City name for weather lookups (e.g. "Austin")',
    category: 'weather',
    prompt: 'City name (e.g. "Austin, TX"): ',
  },
  {
    key: 'weather.api-key',
    label: 'OpenWeatherMap API key',
    description: 'API key for weather data (get free key at openweathermap.org)',
    category: 'weather',
    prompt: 'OpenWeatherMap API key: ',
    sensitive: true,
  },
  {
    key: 'signal.number',
    label: 'Signal phone number',
    description: 'Your Signal-registered phone number for notifications',
    category: 'signal',
    prompt: 'Your Signal phone number (e.g. +15551234567): ',
    validate: (v) => /^\+\d{7,15}$/.test(v) ? null : 'Must be in format +15551234567',
  },
  {
    key: 'signal.recipient',
    label: 'Signal recipient',
    description: 'Phone number to send Signal messages to',
    category: 'signal',
    prompt: 'Recipient phone number (e.g. +15551234567): ',
    validate: (v) => /^\+\d{7,15}$/.test(v) ? null : 'Must be in format +15551234567',
  },
  {
    key: 'ocr.url',
    label: 'OCR service URL',
    description: 'URL for OCR service endpoint (enables image text extraction)',
    category: 'ocr',
    prompt: 'OCR service URL (e.g. http://localhost:8080/v1): ',
    validate: (v) => {
      try { new URL(v); return null; } catch { return 'Must be a valid URL'; }
    },
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Prompt helper: returns a Promise that resolves when the user enters a line.
 * Cleans up the listener before resolving.
 */
function promptLine(rl: readline.Interface, prompt: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    const handler = (line: string) => {
      rl.removeListener('line', handler);
      resolve(line.trim());
    };
    rl.on('line', handler);
  });
}

/**
 * Set a setting only if it's not already in the database.
 */
function setIfUnset(
  settings: SettingsService,
  key: string,
  value: any,
  category: string,
  description?: string
): void {
  if (settings.getSetting(key, null) === null) {
    settings.setSetting(key, value, category, description);
  }
}

// ─── Step A: Import Docs to Garden ───────────────────────────────────────────

const DOC_FILES = [
  { filename: 'README.md',   title: 'Bartleby README' },
  { filename: 'COMMANDS.md', title: 'Bartleby Commands' },
  { filename: 'TECH_SPEC.md',title: 'Bartleby Tech Spec' },
];

function importDocsToGarden(services: ServiceContainer): void {
  const cwd = process.cwd();

  for (const { filename, title } of DOC_FILES) {
    const filePath = path.join(cwd, filename);

    if (!fs.existsSync(filePath)) continue;

    // Skip if already in garden
    const existing = services.garden.getByTitle(title);
    if (existing) continue;

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      services.garden.create({
        type: 'page',
        title,
        status: 'active',
        content,
        privacy: 'private',
      });
    } catch (_err) {
      // Silently skip if read/write fails
    }
  }
}

// ─── Step B: Introduction Dialog ─────────────────────────────────────────────

async function runIntroDialog(
  rl: readline.Interface,
  services: ServiceContainer
): Promise<void> {
  console.log('\n' + '─'.repeat(50));
  console.log("Hello! I'm Bartleby, your personal AI assistant.\n");

  // Ask user's name
  const userName = await promptLine(rl, "What's your name? ");

  if (userName) {
    services.learning.recordObservation({
      entityId: 'user',
      key: 'preferred_name',
      value: userName,
      sourceType: 'stated',
      confidence: 1.0,
    });
    console.log(`\nNice to meet you, ${userName}!`);
  }

  // Ask assistant name
  const assistantName = await promptLine(rl, '\nWhat would you like to call me? [Bartleby] ');
  const finalName = assistantName || 'Bartleby';

  services.settings.setSetting(
    'assistant.name',
    finalName,
    'assistant',
    'Name used to address the assistant'
  );

  if (assistantName && assistantName !== 'Bartleby') {
    console.log(`\nI'll go by "${finalName}" from now on.`);
  }

  console.log('─'.repeat(50));
}

// ─── Step C: Migrate .env → DB ───────────────────────────────────────────────

function migrateEnvToDb(settings: SettingsService): number {
  let count = 0;

  for (const mapping of ENV_TO_DB) {
    const envValue = process.env[mapping.envKey];
    if (envValue === undefined) continue;

    // Only migrate if not already in DB
    if (settings.getSetting(mapping.dbKey, null) !== null) continue;

    const value = mapping.transform ? mapping.transform(envValue) : envValue;
    settings.setSetting(mapping.dbKey, value, mapping.category, mapping.description);
    count++;
  }

  if (count > 0) {
    console.log(`\n✓ Migrated ${count} setting${count === 1 ? '' : 's'} from .env`);
  }

  return count;
}

// ─── Step E: Settings Completion Wizard ──────────────────────────────────────

async function runSettingsWizard(
  rl: readline.Interface,
  settings: SettingsService
): Promise<void> {
  while (true) {
    // Build list of unset settings from manifest
    const unset = SETTINGS_MANIFEST.filter(
      (spec) => settings.getSetting(spec.key, null) === null
    );

    if (unset.length === 0) break;

    console.log('\n' + '─'.repeat(50));
    console.log('📋 Optional settings to configure:\n');

    unset.forEach((spec, i) => {
      console.log(`  ${i + 1}. ${spec.key.padEnd(22)}  ${spec.description}`);
    });

    console.log('\nType a number to configure, "done" to finish, or press Enter to skip.');
    console.log('─'.repeat(50));

    const input = await promptLine(rl, '> ');

    if (!input || input.toLowerCase() === 'done') break;

    const idx = parseInt(input) - 1;
    if (isNaN(idx) || idx < 0 || idx >= unset.length) {
      console.log('Please enter a valid number or "done".');
      continue;
    }

    const spec = unset[idx];
    const value = await promptLine(rl, spec.prompt);

    if (!value) {
      console.log('Skipped.');
      continue;
    }

    if (spec.validate) {
      const error = spec.validate(value);
      if (error) {
        console.log(`✗ ${error}`);
        continue;
      }
    }

    settings.setSetting(spec.key, value, spec.category, spec.description);

    // Enable OCR if URL was just set
    if (spec.key === 'ocr.url') {
      setIfUnset(settings, 'ocr.enabled', true, 'ocr', 'Enable OCR for image text extraction');
    }

    // Enable Signal if number was just set
    if (spec.key === 'signal.number') {
      setIfUnset(settings, 'signal.enabled', true, 'signal', 'Enable Signal notifications');
    }

    console.log(`✓ Saved.`);
  }
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

/**
 * Run the first-launch setup flow.
 *
 * Called from repl.ts once, when services.settings.isFirstRun() is true.
 * Marks first run complete at the end so it never runs again.
 */
export async function runFirstLaunch(
  rl: readline.Interface,
  services: ServiceContainer
): Promise<void> {
  try {
    // A. Import docs to garden (silent)
    importDocsToGarden(services);

    // B. Introduction dialog
    await runIntroDialog(rl, services);

    // C. Migrate .env settings to DB (silent)
    migrateEnvToDb(services.settings);

    // D. Auto-configure remaining defaults (setIfUnset so C's values are preserved)
    await configureDefaults(services.settings, services.llm);

    // E. Optional settings wizard
    await runSettingsWizard(rl, services.settings);

    // Done — mark first run complete
    services.settings.markFirstRunComplete();

    console.log('\n✓ Setup complete! Type "help" to see what you can do.\n');
  } catch (err) {
    // Don't block startup if setup fails
    console.warn(`\n⚠ Setup encountered an error: ${String(err)}`);
    console.warn('You can re-run setup later with: setup wizard\n');
    // Still mark complete to avoid re-running on every startup
    try { services.settings.markFirstRunComplete(); } catch (_) { /* ignore */ }
  }
}
