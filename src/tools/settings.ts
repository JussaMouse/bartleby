// src/tools/settings.ts
import { Tool } from './types.js';

/**
 * Show all settings or a specific category
 */
export const showSettings: Tool = {
  name: 'showSettings',
  description: 'Show application settings',

  routing: {
    patterns: [
      /^settings?\s*$/i,
      /^show\s+settings?\s*$/i,
      /^settings?\s+(llm|calendar|presence|scheduler|import|weather|signal|ocr|embeddings)\s*$/i,
    ],
    keywords: {
      verbs: ['show', 'view', 'list'],
      nouns: ['settings', 'configuration', 'config'],
    },
    examples: [
      'settings',
      'show settings',
      'settings calendar',
      'settings llm',
    ],
    priority: 70,
  },

  parameters: {
    type: 'object',
    properties: {
      category: {
        type: 'string',
        enum: ['llm', 'calendar', 'presence', 'scheduler', 'import', 'weather', 'signal', 'ocr', 'embeddings'],
        description: 'Settings category to show',
      },
    },
  },

  parseArgs: (input) => {
    const match = input.match(/settings?\s+(\w+)/i);
    const category = match ? match[1].toLowerCase() : undefined;
    return { category };
  },

  execute: async (args, context) => {
    const { settings } = context.services;
    const { category } = args as { category?: string };

    try {
      if (category) {
        // Show specific category
        const categorySettings = settings.getCategory(category);

        if (Object.keys(categorySettings).length === 0) {
          return `No settings found in category "${category}".\n\nAvailable categories: llm, calendar, presence, scheduler, import, weather, signal, ocr, embeddings`;
        }

        let output = `Settings: ${category}\n\n`;

        for (const [key, value] of Object.entries(categorySettings)) {
          const displayValue = typeof value === 'object'
            ? JSON.stringify(value, null, 2)
            : String(value);
          output += `  ${key}: ${displayValue}\n`;
        }

        output += `\nTo edit: "edit ${category} settings" or "set ${category}.<key> to <value>"`;

        return output;
      }

      // Show all settings grouped by category
      const allSettings = settings.getAllSettings();
      const stats = settings.getStats();

      if (stats.total === 0) {
        return 'No settings configured yet. Run the first-time setup wizard or use "set <key> to <value>" to configure settings.';
      }

      let output = `Settings (${stats.total} total)\n\n`;

      const categories = Object.keys(allSettings).sort();

      for (const cat of categories) {
        const catSettings = allSettings[cat];
        const count = Object.keys(catSettings).length;

        output += `${cat.toUpperCase()} (${count}):\n`;

        for (const [key, value] of Object.entries(catSettings)) {
          const displayValue = typeof value === 'object'
            ? JSON.stringify(value)
            : String(value);

          // Truncate long values
          const truncated = displayValue.length > 50
            ? displayValue.substring(0, 50) + '...'
            : displayValue;

          output += `  ${key}: ${truncated}\n`;
        }

        output += '\n';
      }

      output += `To view a category: "settings <category>"\n`;
      output += `To edit: "set <key> to <value>" or "edit <category> settings"`;

      return output;
    } catch (err) {
      return `Error showing settings: ${String(err)}`;
    }
  },
};

/**
 * Set a setting value
 */
export const setSetting: Tool = {
  name: 'setSetting',
  description: 'Set a configuration value',

  routing: {
    patterns: [
      /^set\s+([a-z0-9._-]+)\s+to\s+(.+)$/i,
      /^set\s+([a-z0-9._-]+)\s*=\s*(.+)$/i,
    ],
    keywords: {
      verbs: ['set', 'update', 'change'],
      nouns: ['setting', 'config', 'configuration'],
    },
    examples: [
      'set calendar.timezone to America/New_York',
      'set llm.router-model to qwen3:0.6b',
      'set presence.startup to false',
    ],
    priority: 75,
  },

  parameters: {
    type: 'object',
    properties: {
      key: { type: 'string', description: 'Setting key (e.g., "calendar.timezone")' },
      value: { type: 'string', description: 'Value to set' },
    },
    required: ['key', 'value'],
  },

  parseArgs: (input) => {
    let match = input.match(/^set\s+([a-z0-9._-]+)\s+to\s+(.+)$/i);
    if (!match) {
      match = input.match(/^set\s+([a-z0-9._-]+)\s*=\s*(.+)$/i);
    }

    if (!match) {
      return { key: '', value: '' };
    }

    return {
      key: match[1].trim(),
      value: match[2].trim(),
    };
  },

  execute: async (args, context) => {
    const { settings } = context.services;
    const { key, value } = args as { key: string; value: string };

    if (!key || !value) {
      return 'Error: Invalid format. Usage: set <key> to <value>\n\nExample: set calendar.timezone to America/New_York';
    }

    try {
      // Parse the key to determine category
      const parts = key.split('.');
      if (parts.length < 2) {
        return `Error: Key must include category. Format: <category>.<name>\n\nExample: calendar.timezone, llm.router-model`;
      }

      const category = parts[0];
      const settingKey = key; // Use full key including category

      // Parse value (handle boolean, number, string)
      let parsedValue: any = value;

      if (value.toLowerCase() === 'true') {
        parsedValue = true;
      } else if (value.toLowerCase() === 'false') {
        parsedValue = false;
      } else if (!isNaN(Number(value)) && value.trim() !== '') {
        parsedValue = Number(value);
      } else if (value.startsWith('{') || value.startsWith('[')) {
        try {
          parsedValue = JSON.parse(value);
        } catch {
          // Keep as string if JSON parse fails
        }
      }

      // Set the value
      settings.setSetting(settingKey, parsedValue, category);

      return `✓ Setting updated: ${key} = ${JSON.stringify(parsedValue)}\n\nNote: Restart may be required for some settings to take effect.`;
    } catch (err) {
      return `Error setting value: ${String(err)}`;
    }
  },
};

/**
 * Reset settings (delete all or by category)
 */
export const resetSettings: Tool = {
  name: 'resetSettings',
  description: 'Reset settings to defaults',

  routing: {
    patterns: [
      /^reset\s+settings?\s*$/i,
      /^reset\s+settings?\s+([a-z]+)\s*$/i,
    ],
    keywords: {
      verbs: ['reset', 'clear', 'delete'],
      nouns: ['settings', 'configuration'],
    },
    examples: [
      'reset settings',
      'reset settings calendar',
    ],
    priority: 70,
  },

  parameters: {
    type: 'object',
    properties: {
      category: { type: 'string', description: 'Category to reset (optional)' },
      confirm: { type: 'boolean', description: 'Confirm reset' },
    },
  },

  parseArgs: (input) => {
    const match = input.match(/^reset\s+settings?\s+([a-z]+)\s*$/i);
    const category = match ? match[1].toLowerCase() : undefined;
    return { category, confirm: false };
  },

  execute: async (args, context) => {
    const { settings } = context.services;
    const { category, confirm = false } = args as { category?: string; confirm?: boolean };

    // Require confirmation (this would ideally use a confirmation dialog)
    if (!confirm) {
      if (category) {
        return `⚠️ This will delete all settings in the "${category}" category.\n\nTo confirm, use the tool with confirm: true parameter.`;
      } else {
        return `⚠️ This will delete ALL settings.\n\nTo confirm, use the tool with confirm: true parameter.`;
      }
    }

    try {
      const count = settings.reset(category);

      if (category) {
        return `✓ Reset ${count} setting${count === 1 ? '' : 's'} in category "${category}".`;
      } else {
        return `✓ Reset all ${count} settings.\n\nNote: You may need to run the first-time setup wizard again.`;
      }
    } catch (err) {
      return `Error resetting settings: ${String(err)}`;
    }
  },
};

/**
 * Show settings statistics
 */
export const showSettingsStats: Tool = {
  name: 'showSettingsStats',
  description: 'Show settings statistics and metadata',

  routing: {
    patterns: [
      /^settings?\s+stats?\s*$/i,
      /^settings?\s+info\s*$/i,
    ],
    keywords: {
      verbs: ['show'],
      nouns: ['settings', 'stats', 'statistics', 'info'],
    },
    examples: [
      'settings stats',
      'settings info',
    ],
    priority: 65,
  },

  parameters: {
    type: 'object',
    properties: {},
  },

  parseArgs: () => ({}),

  execute: async (args, context) => {
    const { settings } = context.services;

    try {
      const stats = settings.getStats();

      let output = `Settings Statistics:\n\n`;
      output += `Total settings: ${stats.total}\n`;
      output += `First run completed: ${stats.firstRunCompleted ? 'Yes' : 'No'}\n`;
      output += `Migration version: ${stats.migrationVersion}\n\n`;

      if (Object.keys(stats.byCategory).length > 0) {
        output += `By category:\n`;
        for (const [category, count] of Object.entries(stats.byCategory)) {
          output += `  ${category}: ${count}\n`;
        }
      }

      return output;
    } catch (err) {
      return `Error showing settings stats: ${String(err)}`;
    }
  },
};

/**
 * Export all settings tools
 */
export const settingsTools: Tool[] = [
  showSettings,
  setSetting,
  resetSettings,
  showSettingsStats,
];
