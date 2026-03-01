// src/tools/settings.ts
import { Tool } from './types.js';
import { SETTINGS_CATEGORIES, getSettingDefinition, getSettingsByCategory } from '../settings/registry.js';

const CATEGORY_PATTERN = SETTINGS_CATEGORIES.join('|');
const CATEGORY_REGEX = new RegExp(`^settings?\\s+(${CATEGORY_PATTERN})\\s*$`, 'i');

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
      CATEGORY_REGEX,
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
        enum: SETTINGS_CATEGORIES,
        description: 'Settings category to show',
      },
    },
  },

  parseArgs: (input) => {
    const match = input.match(CATEGORY_REGEX);
    const category = match ? match[1].toLowerCase() : undefined;
    return { category };
  },

  execute: async (args, context) => {
    const { settings } = context.services;
    const { category } = args as { category?: string };

    try {
      if (category) {
        const definitions = getSettingsByCategory(category);

        if (definitions.length === 0) {
          return `No settings found in category "${category}".\n\nAvailable categories: ${SETTINGS_CATEGORIES.join(', ')}`;
        }

        let output = `Settings: ${category}\n\n`;

        for (const definition of definitions) {
          const shortKey = definition.key.replace(`${category}.`, '');
          const value = settings.getSetting(definition.key);
          const isSet = settings.hasSetting(definition.key);
          const displayValue = definition.secret
            ? (isSet ? '<hidden>' : '<unset>')
            : formatValue(value);

          output += `  ${shortKey}: ${displayValue}\n`;
        }

        output += `\nTo edit: "set ${category}.<key> to <value>"`;

        return output;
      }

      // Show all settings grouped by category
      const stats = settings.getStats();

      if (stats.total === 0) {
        return 'No settings configured yet. Run the first-time setup wizard or use "set <key> to <value>" to configure settings.';
      }

      let output = `Settings (${stats.total} total)\n\n`;

      const categories = SETTINGS_CATEGORIES;

      for (const cat of categories) {
        const definitions = getSettingsByCategory(cat);
        const count = definitions.length;

        output += `${cat.toUpperCase()} (${count}):\n`;

        for (const definition of definitions) {
          const shortKey = definition.key.replace(`${cat}.`, '');
          const value = settings.getSetting(definition.key);
          const isSet = settings.hasSetting(definition.key);
          const displayValue = definition.secret
            ? (isSet ? '<hidden>' : '<unset>')
            : formatValue(value);

          const truncated = displayValue.length > 50
            ? displayValue.substring(0, 50) + '...'
            : displayValue;

          output += `  ${shortKey}: ${truncated}\n`;
        }

        output += '\n';
      }

      output += `To view a category: "settings <category>"\n`;
      output += `To edit: "set <key> to <value>"`;

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
      /^set\s+([_a-z0-9.-]+)\s+to\s+(.+)$/i,
      /^set\s+([_a-z0-9.-]+)\s*=\s*(.+)$/i,
    ],
    keywords: {
      verbs: ['set', 'update', 'change'],
      nouns: ['setting', 'config', 'configuration'],
    },
    examples: [
      'set calendar.timezone to America/New_York',
      'set llm.router.model to mlx-community/Qwen3-0.6B-4bit',
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
    let match = input.match(/^set\s+([_a-z0-9.-]+)\s+to\s+(.+)$/i);
    if (!match) {
      match = input.match(/^set\s+([_a-z0-9.-]+)\s*=\s*(.+)$/i);
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
      const settingKey = key;
      const definition = getSettingDefinition(settingKey);
      if (!definition) {
        return `Error: Unknown setting key "${settingKey}".\n\nAvailable categories: ${SETTINGS_CATEGORIES.join(', ')}`;
      }

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
      settings.setSetting(settingKey, parsedValue, definition.category);

      const restartNote = definition.requiresRestart
        ? '\n\nNote: Restart required for this setting.'
        : '\n\nNote: Restart may be required for some settings to take effect.';

      return `✓ Setting updated: ${key} = ${JSON.stringify(parsedValue)}${restartNote}`;
    } catch (err) {
      return `Error setting value: ${String(err)}`;
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
      output += `\n`;

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

function formatValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}

/**
 * Export all settings tools
 */
export const settingsTools: Tool[] = [
  showSettings,
  setSetting,
  showSettingsStats,
];
