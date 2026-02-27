// src/setup/first-launch.ts
import readline from 'readline';
import fs from 'fs';
import path from 'path';
import { ServiceContainer } from '../services/index.js';
import { SettingsService } from '../services/settings.js';
import { configureDefaults } from '../tools/first-run-wizard.js';
import { SETTINGS_REGISTRY, type SettingDefinition } from '../settings/registry.js';

// ─── Settings Manifest (registry-driven) ─────────────────────────────────────

const PROMPTABLE_SETTINGS: SettingDefinition[] = SETTINGS_REGISTRY.filter(
  (definition) => !!definition.prompt
);

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
  while (true) {
    // Build list of unset settings from manifest
    const unset = PROMPTABLE_SETTINGS.filter(
      (definition) => !settings.hasSetting(definition.key)
    );

    if (unset.length === 0) break;

    console.log('\n' + '─'.repeat(50));
    console.log('📋 Optional settings to configure:\n');

    unset.forEach((definition, i) => {
      console.log(`  ${i + 1}. ${definition.key.padEnd(28)}  ${definition.description}`);
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

    const definition = unset[idx];
    const value = await promptLine(rl, definition.prompt ?? `${definition.key}: `);

    if (!value) {
      console.log('Skipped.');
      continue;
    }

    if (definition.validate) {
      const error = definition.validate(value as any);
      if (error) {
        console.log(`✗ ${error}`);
        continue;
      }
    }

    settings.setSetting(definition.key, value, definition.category, definition.description);

    // Enable OCR if URL was just set
    if (definition.key === 'ocr.url' && value) {
      setIfUnset(settings, 'ocr.enabled', true, 'ocr', 'Enable OCR for image text extraction');
    }

    // Enable Signal if number was just set
    if (definition.key.startsWith('signal.') && value) {
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
