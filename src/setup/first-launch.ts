// src/setup/first-launch.ts
import readline from 'readline';
import fs from 'fs';
import path from 'path';
import { ServiceContainer } from '../services/index.js';
import { SettingsService } from '../services/settings.js';
import { configureDefaults } from '../tools/first-run-wizard.js';
import {
  SETTINGS_REGISTRY,
  SETTINGS_CATEGORIES,
  getSettingsByCategory,
  type SettingDefinition,
} from '../settings/registry.js';

// ─── Settings Manifest (registry-driven) ─────────────────────────────────────

const ALL_SETTINGS: SettingDefinition[] = SETTINGS_REGISTRY;

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
 * Set a setting only if it's not already in settings files.
 */
function setIfUnset(
  settings: SettingsService,
  key: string,
  value: any,
  category: string,
  description?: string
): void {
  if (!settings.hasSetting(key)) {
    settings.setSetting(key, value, category, description);
  }
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function formatDisplayValue(
  definition: SettingDefinition,
  value: unknown,
  isSet: boolean
): string {
  if (definition.secret) {
    return isSet ? '<hidden>' : '<unset>';
  }

  return formatValue(value);
}

function buildPrompt(
  definition: SettingDefinition,
  displayValue: string,
  isSet: boolean
): string {
  const label = isSet ? `current: ${displayValue}` : `default: ${displayValue}`;
  if (definition.prompt) {
    return `${definition.prompt.trim()} [${label}] (Enter to keep): `;
  }

  const hints: string[] = [];
  if (definition.type === 'enum' && definition.options) {
    hints.push(`options: ${definition.options.join('/')}`);
  }
  if (definition.type === 'boolean') {
    hints.push('true/false');
  }
  const hint = hints.length > 0 ? ` (${hints.join(', ')})` : '';

  return `Set ${definition.key}${hint} [${label}] (Enter to keep): `;
}

async function runCategoryWizard(
  rl: readline.Interface,
  settings: SettingsService,
  category: string,
  restartRequired: Set<string>
): Promise<'back' | 'done' | void> {
  const definitions = getSettingsByCategory(category);

  console.log('\n' + '─'.repeat(50));
  console.log(`⚙️  ${category.toUpperCase()} settings`);
  console.log('Type "back" to return, "done" to finish.\n');

  for (const definition of definitions) {
    while (true) {
      const isSet = settings.hasSetting(definition.key);
      const currentValue = isSet ? settings.getSetting(definition.key) : definition.default;
      const displayValue = formatDisplayValue(definition, currentValue, isSet);
      const prompt = buildPrompt(definition, displayValue, isSet);
      const input = await promptLine(rl, prompt);

      if (!input) break;

      const lowered = input.toLowerCase();
      if (lowered === 'back') return 'back';
      if (lowered === 'done') return 'done';

      if (definition.validate) {
        const error = definition.validate(input);
        if (error) {
          console.log(`✗ ${error}`);
          continue;
        }
      }

      try {
        settings.setSetting(definition.key, input, definition.category, definition.description);
        if (definition.requiresRestart) {
          restartRequired.add(definition.key);
        }
        if (definition.key === 'ocr.url' && input) {
          setIfUnset(settings, 'ocr.enabled', true, 'ocr', 'Enable OCR for image text extraction');
        }
        if (definition.key.startsWith('signal.') && input) {
          setIfUnset(settings, 'signal.enabled', true, 'signal', 'Enable Signal notifications');
        }
        console.log('✓ Saved.');
        break;
      } catch (err) {
        console.log(`✗ ${String(err)}`);
      }
    }
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
        type: 'note',
        title,
        status: 'active',
        content,
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

// ─── Step E: Settings Completion Wizard ──────────────────────────────────────

async function runSettingsWizard(
  rl: readline.Interface,
  settings: SettingsService
): Promise<void> {
  if (ALL_SETTINGS.length === 0) return;

  const restartRequired = new Set<string>();

  while (true) {
    console.log('\n' + '─'.repeat(50));
    console.log('📋 Settings categories:\n');

    SETTINGS_CATEGORIES.forEach((category, index) => {
      const definitions = getSettingsByCategory(category);
      const configured = definitions.filter((definition) => settings.hasSetting(definition.key)).length;
      const label = `${configured}/${definitions.length} configured`;
      console.log(`  ${index + 1}. ${category.padEnd(14)}  ${label}`);
    });

    console.log('\nChoose a number, type "all" for everything, or "done" to finish.');
    console.log('─'.repeat(50));

    const input = await promptLine(rl, '> ');
    const lowered = input.toLowerCase();

    if (!input || lowered === 'done') break;

    if (lowered === 'all') {
      for (const category of SETTINGS_CATEGORIES) {
        const result = await runCategoryWizard(rl, settings, category, restartRequired);
        if (result === 'done') {
          break;
        }
      }
      break;
    }

    const idx = parseInt(input) - 1;
    if (isNaN(idx) || idx < 0 || idx >= SETTINGS_CATEGORIES.length) {
      console.log('Please enter a valid number, "all", or "done".');
      continue;
    }

    const category = SETTINGS_CATEGORIES[idx];
    const result = await runCategoryWizard(rl, settings, category, restartRequired);
    if (result === 'done') break;
  }

  if (restartRequired.size > 0) {
    console.log('\n⚠️  Some settings require a restart to take effect.');
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

    // C. Auto-configure recommended defaults
    await configureDefaults(services.settings, services.llm);

    // D. Optional settings wizard
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
