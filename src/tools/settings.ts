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

      // Parse value based on setting type so string values like +17702645161
      // are not coerced into numbers before validation.
      let parsedValue: any = value;

      if (definition.type === 'boolean') {
        if (value.toLowerCase() === 'true') {
          parsedValue = true;
        } else if (value.toLowerCase() === 'false') {
          parsedValue = false;
        }
      } else if (definition.type === 'number') {
        if (!isNaN(Number(value)) && value.trim() !== '') {
          parsedValue = Number(value);
        }
      } else if (definition.type !== 'string' && (value.startsWith('{') || value.startsWith('['))) {
        try {
          parsedValue = JSON.parse(value);
        } catch {
          // Keep as string if JSON parse fails
        }
      }

      if (
        definition.type === 'string' &&
        ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'")))
      ) {
        parsedValue = value.slice(1, -1);
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


/**
 * Show router telemetry and diagnostics
 */
export const showRoutingStats: Tool = {
  name: 'showRoutingStats',
  description: 'Show routing telemetry stats and recent routing events',

  routing: {
    patterns: [
      /^routing\s+stats\s*$/i,
      /^routing\s+recent\s*$/i,
      /^routing\s+recommendations?\s*$/i,
      /^show\s+routing\s+(stats|recent|recommendations?)\s*$/i,
    ],
    keywords: {
      verbs: ['show', 'view'],
      nouns: ['routing', 'router', 'stats', 'recent', 'recommendations', 'telemetry'],
    },
    examples: [
      'routing stats',
      'routing recent',
      'show routing stats',
      'routing recommendations',
    ],
    priority: 70,
  },

  parameters: {
    type: 'object',
    properties: {
      mode: {
        type: 'string',
        enum: ['stats', 'recent', 'recommendations'],
        description: 'Telemetry view mode',
      },
    },
  },

  parseArgs: (input) => {
    const normalized = input.trim().toLowerCase();
    const mode = normalized.includes('recommendation')
      ? 'recommendations'
      : normalized.includes('recent')
        ? 'recent'
        : 'stats';
    return { mode };
  },

  execute: async (args, context) => {
    const { mode = 'stats' } = args as { mode?: 'stats' | 'recent' | 'recommendations' };

    try {
      const events = context.services.learning.getRecentRoutingEvents(100);

      if (events.length === 0) {
        return 'No routing telemetry yet. Run a few commands, then try "routing stats" again.';
      }

      if (mode === 'recommendations') {
        const recommendations = context.services.llm.getRouterRecommendations();
        if (recommendations.length === 0) {
          return 'No routing recommendations right now.';
        }

        const lines = ['Routing Recommendations:', ''];
        for (const rec of recommendations.slice(0, 10)) {
          lines.push(`- ${rec}`);
        }
        return lines.join('\n');
      }

      if (mode === 'recent') {
        const lines: string[] = ['Routing Recent (latest 12):', ''];
        for (const event of events.slice(0, 12)) {
          const status = event.success ? '✓' : '✗';
          const complexity = event.predictedComplexity || '-';
          const tool = event.matchedTool || '-';
          const override = event.overrideApplied ? ' override' : '';
          lines.push(
            `${status} ${event.createdAt} | ${event.routeType} | tier:${event.finalTier} | complexity:${complexity} | tool:${tool} | ${event.responseTimeMs}ms${override}`
          );
        }
        lines.push('');
        lines.push('Tip: use "routing stats" for aggregate metrics.');
        return lines.join('\n');
      }

      const total = events.length;
      const successes = events.filter(e => e.success).length;
      const failures = total - successes;
      const successRate = total > 0 ? Math.round((successes / total) * 100) : 0;

      const avgMs = total > 0
        ? Math.round(events.reduce((sum, e) => sum + e.responseTimeMs, 0) / total)
        : 0;

      const byRoute: Record<string, number> = {};
      const byTier: Record<string, number> = {};
      const byComplexity: Record<string, number> = {};

      for (const event of events) {
        byRoute[event.routeType] = (byRoute[event.routeType] || 0) + 1;
        byTier[event.finalTier] = (byTier[event.finalTier] || 0) + 1;
        const complexityKey = event.predictedComplexity || 'unknown';
        byComplexity[complexityKey] = (byComplexity[complexityKey] || 0) + 1;
      }

      const lines: string[] = ['Routing Stats (last 100):', ''];
      lines.push(`Total events: ${total}`);
      lines.push(`Success rate: ${successRate}% (${successes} success / ${failures} failed)`);
      lines.push(`Average latency: ${avgMs}ms`);
      lines.push('');
      lines.push('By route type:');
      for (const [k, v] of Object.entries(byRoute).sort((a, b) => b[1] - a[1])) {
        lines.push(`  ${k}: ${v}`);
      }
      lines.push('');
      lines.push('By final tier:');
      for (const [k, v] of Object.entries(byTier).sort((a, b) => b[1] - a[1])) {
        lines.push(`  ${k}: ${v}`);
      }
      lines.push('');
      lines.push('By predicted complexity:');
      for (const [k, v] of Object.entries(byComplexity).sort((a, b) => b[1] - a[1])) {
        lines.push(`  ${k}: ${v}`);
      }

      const recommendations = context.services.llm.getRouterRecommendations();
      if (recommendations.length > 0) {
        lines.push('');
        lines.push('Recommendations:');
        for (const rec of recommendations.slice(0, 5)) {
          lines.push(`  - ${rec}`);
        }
      }

      lines.push('');
      lines.push('Tip: use "routing recent" for latest event log or "routing recommendations" for recommendations only.');
      return lines.join('\n');
    } catch (err) {
      return `Error showing routing telemetry: ${String(err)}`;
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
  showRoutingStats,
];
