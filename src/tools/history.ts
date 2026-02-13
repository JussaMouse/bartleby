// src/tools/history.ts
import { Tool } from './types.js';
import * as fmt from '../utils/format.js';

export const showHistory: Tool = {
  name: 'showHistory',
  description: 'Show recent command history',

  routing: {
    patterns: [
      /^history$/i,
      /^show history$/i,
      /^\/history$/i,
      /^command history$/i,
    ],
    keywords: {
      verbs: ['show', 'list', 'view'],
      nouns: ['history', 'commands'],
    },
    priority: 75,
  },

  parseArgs: (input) => {
    // Could extract limit from input like "history 50"
    const match = input.match(/history\s+(\d+)/i);
    const limit = match ? parseInt(match[1]) : 20;
    return { limit };
  },

  execute: async (args, context) => {
    const { limit = 20 } = args as { limit?: number };
    const commands = context.services.learning.getRecentCommands(limit);

    if (commands.length === 0) {
      return fmt.info('No command history yet. Commands you execute will appear here.');
    }

    let response = fmt.header('Command History', '📜');
    response += '\n\n';

    for (const cmd of commands) {
      const time = new Date(cmd.timestamp).toLocaleTimeString();
      const date = new Date(cmd.timestamp).toLocaleDateString();
      const status = cmd.success ? fmt.success('✓') : fmt.errorText('✗');
      const duration = cmd.executionTimeMs > 0 ? fmt.dim(` (${cmd.executionTimeMs}ms)`) : '';
      const source = cmd.source !== 'api' ? fmt.dim(` [${cmd.source}]`) : '';

      response += `${status} ${fmt.dim(date)} ${time}${duration}${source}\n`;
      response += `  ${cmd.rawInput}\n`;

      if (!cmd.success && cmd.errorMessage) {
        response += `  ${fmt.errorText('Error:')} ${fmt.dim(cmd.errorMessage.slice(0, 80))}\n`;
      }

      if (cmd.resultId) {
        response += `  ${fmt.dim('→ ' + cmd.resultId)}\n`;
      }

      response += '\n';
    }

    // Add stats
    const stats = context.services.learning.getCommandStats();
    if (stats.totalCommands > 0) {
      response += fmt.hr() + '\n';
      response += fmt.dim(`Total: ${stats.totalCommands} commands`);
      response += fmt.dim(` | Success rate: ${Math.round((stats.successfulCommands / stats.totalCommands) * 100)}%`);
      if (stats.topIntents.length > 0) {
        const topIntent = stats.topIntents[0];
        response += fmt.dim(` | Most used: ${topIntent.intent} (${topIntent.count}×)`);
      }
    }

    return response;
  },
};

export const searchHistory: Tool = {
  name: 'searchHistory',
  description: 'Search command history',

  routing: {
    patterns: [
      /^search history\s+(.+)/i,
      /^history search\s+(.+)/i,
    ],
    keywords: {
      verbs: ['search'],
      nouns: ['history'],
    },
    priority: 75,
  },

  parseArgs: (input) => {
    const match = input.match(/(?:search history|history search)\s+(.+)/i);
    const query = match ? match[1].trim() : '';
    return { query };
  },

  execute: async (args, context) => {
    const { query } = args as { query: string };

    if (!query) {
      return fmt.errorText('Please specify a search query. Example: search history "create note"');
    }

    const commands = context.services.learning.searchCommands(query, 10);

    if (commands.length === 0) {
      return fmt.info(`No commands found matching "${query}"`);
    }

    let response = fmt.header(`History Search: "${query}"`, '🔍');
    response += '\n\n';

    response += fmt.dim(`Found ${commands.length} matching command(s):\n\n`);

    for (const cmd of commands) {
      const time = new Date(cmd.timestamp).toLocaleTimeString();
      const date = new Date(cmd.timestamp).toLocaleDateString();
      const status = cmd.success ? fmt.success('✓') : fmt.errorText('✗');

      response += `${status} ${fmt.dim(date + ' ' + time)}\n`;
      response += `  ${cmd.rawInput}\n\n`;
    }

    return response;
  },
};

export const historyTools: Tool[] = [showHistory, searchHistory];
