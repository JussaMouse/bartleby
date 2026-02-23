// src/tools/first-run-wizard.ts
import { Tool } from './types.js';
import { SettingsService } from '../services/settings.js';

/**
 * First-run wizard for interactive setup
 *
 * Guides new users through initial configuration:
 * 1. LLM model selection
 * 2. Calendar basics (timezone, format)
 * 3. Optional features (OCR, weather, presence)
 */
export const firstRunWizard: Tool = {
  name: 'firstRunWizard',
  description: 'Interactive first-run setup wizard',

  routing: {
    patterns: [
      /^setup\s+wizard\s*$/i,
      /^first\s+run\s*$/i,
      /^initial\s+setup\s*$/i,
    ],
    keywords: {
      verbs: ['setup', 'configure', 'initialize'],
      nouns: ['wizard', 'setup', 'first-run'],
    },
    examples: [
      'setup wizard',
      'first run',
      'initial setup',
    ],
    priority: 80,
  },

  parameters: {
    type: 'object',
    properties: {
      step: { type: 'string', description: 'Current wizard step' },
      responses: { type: 'object', description: 'User responses collected so far' },
    },
  },

  parseArgs: () => ({}),

  execute: async (args, context) => {
    const { settings, llm } = context.services;

    try {
      // Check if already completed
      if (!settings.isFirstRun()) {
        return `Setup has already been completed.\n\nTo reconfigure settings, use:\n  settings calendar\n  settings llm\n  edit <category> settings`;
      }

      // Run the wizard
      let output = `🎉 Welcome to Bartleby!\n\n`;
      output += `Let's get you set up. This will take about 2 minutes.\n\n`;
      output += `I'll configure:\n`;
      output += `  1. LLM models (which models to use)\n`;
      output += `  2. Calendar settings (timezone, format)\n`;
      output += `  3. Optional features (OCR, weather, presence)\n\n`;

      // Step 1: LLM Models
      output += `━━━ Step 1: LLM Models ━━━\n\n`;

      // Detect available models from LLM URL
      output += `Checking your LLM endpoint...\n`;

      try {
        // Try to detect models (this is optional, we'll use defaults if it fails)
        const availableModels = await detectModels(llm);

        if (availableModels.length > 0) {
          output += `✓ Found ${availableModels.length} models\n\n`;
          output += `Available models:\n`;
          for (const model of availableModels.slice(0, 5)) {
            output += `  • ${model}\n`;
          }

          // Suggest models based on size
          const routerModel = findModelBySize(availableModels, 'small') || 'qwen3:0.6b';
          const fastModel = findModelBySize(availableModels, 'medium') || 'qwen3:7b';
          const thinkingModel = findModelBySize(availableModels, 'large') || 'qwen3:32b';

          output += `\nRecommended configuration:\n`;
          output += `  Router (0.5-1B): ${routerModel}\n`;
          output += `  Fast (7-30B): ${fastModel}\n`;
          output += `  Thinking (30B+): ${thinkingModel}\n\n`;

          // Save LLM settings
          settings.setSetting('llm.router-model', routerModel, 'llm', 'Router tier model for complexity classification');
          settings.setSetting('llm.fast-model', fastModel, 'llm', 'Fast tier model for simple queries');
          settings.setSetting('llm.thinking-model', thinkingModel, 'llm', 'Thinking tier model for complex reasoning');
        } else {
          output += `⚠ Could not detect models. Using defaults.\n\n`;

          // Use defaults
          settings.setSetting('llm.router-model', 'qwen3:0.6b', 'llm');
          settings.setSetting('llm.fast-model', 'qwen3:7b', 'llm');
          settings.setSetting('llm.thinking-model', 'qwen3:32b', 'llm');
        }
      } catch (err) {
        output += `⚠ Could not connect to LLM. Using default models.\n\n`;

        // Use defaults
        settings.setSetting('llm.router-model', 'qwen3:0.6b', 'llm');
        settings.setSetting('llm.fast-model', 'qwen3:7b', 'llm');
        settings.setSetting('llm.thinking-model', 'qwen3:32b', 'llm');
      }

      // Set LLM defaults
      settings.setSetting('llm.router-max-tokens', 100, 'llm');
      settings.setSetting('llm.fast-max-tokens', 4096, 'llm');
      settings.setSetting('llm.thinking-max-tokens', 8192, 'llm');
      settings.setSetting('llm.health-timeout', 35000, 'llm');
      settings.setSetting('llm.agent-max-iterations', 10, 'llm');

      output += `✓ LLM models configured\n\n`;

      // Step 2: Embeddings
      output += `━━━ Step 2: Embeddings ━━━\n\n`;
      settings.setSetting('embeddings.model', 'nomic-embed-text', 'embeddings', 'Embedding model for semantic search');
      settings.setSetting('embeddings.dimensions', 4096, 'embeddings', 'Embedding dimensions');
      output += `✓ Using: nomic-embed-text (4096 dimensions)\n\n`;

      // Step 3: Calendar
      output += `━━━ Step 3: Calendar ━━━\n\n`;

      // Auto-detect timezone
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      settings.setSetting('calendar.timezone', timezone, 'calendar', 'Timezone for events');
      settings.setSetting('calendar.default-duration', 60, 'calendar', 'Default event duration in minutes');
      settings.setSetting('calendar.ambiguous-time', 'afternoon', 'calendar', 'Time to use for ambiguous dates (morning/afternoon/ask)');
      settings.setSetting('calendar.week-start', 'sunday', 'calendar', 'First day of week (sunday/monday)');
      settings.setSetting('calendar.reminder-minutes', 15, 'calendar', 'Default reminder minutes before events');
      settings.setSetting('calendar.date-format', 'mdy', 'calendar', 'Date format (mdy=US, dmy=international)');

      output += `✓ Timezone: ${timezone}\n`;
      output += `✓ Default duration: 60 minutes\n`;
      output += `✓ Reminders: 15 minutes before\n\n`;

      // Step 4: Presence (Bartleby's initiative)
      output += `━━━ Step 4: Presence ━━━\n\n`;
      output += `Presence controls when Bartleby speaks unprompted.\n\n`;

      settings.setSetting('presence.startup', true, 'presence', 'Greet on startup');
      settings.setSetting('presence.shutdown', true, 'presence', 'Say goodbye on shutdown');
      settings.setSetting('presence.scheduled', true, 'presence', 'Scheduled moments (morning/evening check-ins)');
      settings.setSetting('presence.contextual', true, 'presence', 'Contextual observations');
      settings.setSetting('presence.idle', false, 'presence', 'Speak when idle');
      settings.setSetting('presence.idle-minutes', 5, 'presence', 'Minutes until considered idle');
      settings.setSetting('presence.morning-hour', 8, 'presence', 'Morning moment hour (24h format)');
      settings.setSetting('presence.evening-hour', 18, 'presence', 'Evening moment hour (24h format)');
      settings.setSetting('presence.weekly-day', 0, 'presence', 'Weekly review day (0=Sunday)');
      settings.setSetting('presence.weekly-hour', 9, 'presence', 'Weekly review hour (24h format)');

      output += `✓ Enabled: Startup, shutdown, scheduled moments\n`;
      output += `✓ Morning check-ins: 8:00 AM\n`;
      output += `✓ Evening check-ins: 6:00 PM\n\n`;

      // Step 5: Scheduler
      output += `━━━ Step 5: Scheduler ━━━\n\n`;
      settings.setSetting('scheduler.enabled', true, 'scheduler', 'Enable background scheduler');
      settings.setSetting('scheduler.check-interval', 60000, 'scheduler', 'Check interval in milliseconds');
      settings.setSetting('scheduler.missed-reminders', 'ask', 'scheduler', 'How to handle missed reminders (ask/fire/skip/show)');
      output += `✓ Scheduler enabled (checks every minute)\n\n`;

      // Step 6: Optional Features
      output += `━━━ Step 6: Optional Features ━━━\n\n`;

      // OCR
      settings.setSetting('ocr.enabled', false, 'ocr', 'Enable OCR for image text extraction');
      settings.setSetting('ocr.model', 'olmocr', 'ocr', 'OCR model name');
      settings.setSetting('ocr.max-tokens', 4096, 'ocr', 'Max tokens for OCR extraction');
      output += `OCR: Disabled (enable with: set ocr.enabled to true)\n`;

      // Weather
      settings.setSetting('weather.units', 'F', 'weather', 'Temperature units (F/C)');
      output += `Weather: Set units to Fahrenheit (configure with: settings weather)\n`;

      // Signal
      settings.setSetting('signal.enabled', false, 'signal', 'Enable Signal notifications');
      settings.setSetting('signal.cli-path', '/usr/local/bin/signal-cli', 'signal', 'Path to signal-cli binary');
      settings.setSetting('signal.timeout', 20000, 'signal', 'Signal command timeout in milliseconds');
      output += `Signal: Disabled (configure with: settings signal)\n\n`;

      // Mark first run as complete
      settings.markFirstRunComplete();

      output += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
      output += `✓ Setup complete!\n\n`;
      output += `Your settings have been saved to the database.\n`;
      output += `You can change any setting later with:\n\n`;
      output += `  settings                  # View all settings\n`;
      output += `  set <key> to <value>     # Change a setting\n`;
      output += `  edit calendar settings   # Interactive wizard\n\n`;
      output += `To configure optional features:\n`;
      output += `  settings ocr             # OCR settings\n`;
      output += `  settings weather         # Weather integration\n`;
      output += `  settings signal          # Signal notifications\n\n`;
      output += `🎉 Welcome to Bartleby! Type "help" to see what you can do.`;

      return output;
    } catch (err) {
      return `Error running setup wizard: ${String(err)}\n\nYou can try again with: setup wizard`;
    }
  },
};

/**
 * Helper: Detect available models from LLM service
 */
async function detectModels(llm: any): Promise<string[]> {
  try {
    // Try to list models (OpenAI-compatible API)
    const response = await fetch(`${llm.config.fast.url}/models`, {
      headers: llm.config.fast.apiKey ? {
        'Authorization': `Bearer ${llm.config.fast.apiKey}`
      } : {}
    });

    if (response.ok) {
      const data = await response.json() as any;
      if (data.data && Array.isArray(data.data)) {
        return data.data.map((m: any) => m.id);
      }
    }
  } catch (err) {
    // Silently fail - we'll use defaults
  }

  return [];
}

/**
 * Helper: Find a model by approximate size
 */
function findModelBySize(models: string[], size: 'small' | 'medium' | 'large'): string | null {
  const patterns = {
    small: /0\.[5-9]b|1b/i,
    medium: /[7-9]b|1[0-9]b|2[0-9]b/i,
    large: /3[0-9]b|[4-9][0-9]b/i,
  };

  const pattern = patterns[size];
  const match = models.find(m => pattern.test(m));

  return match || null;
}

/**
 * Export first-run wizard tool
 */
export const firstRunTools: Tool[] = [firstRunWizard];
