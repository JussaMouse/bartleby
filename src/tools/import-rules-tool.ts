// src/tools/import-rules-tool.ts
import { Tool } from './types.js';
import { ImportRulesManager } from '../utils/import-rules.js';

/**
 * Show active import rules
 */
export const showImportRules: Tool = {
  name: 'showImportRules',
  description: 'Show active import rules for automatic file organization',

  routing: {
    patterns: [
      /^show\s+import\s+rules\s*$/i,
      /^list\s+import\s+rules\s*$/i,
      /^import\s+rules\s*$/i,
    ],
    keywords: {
      verbs: ['show', 'list', 'view'],
      nouns: ['import', 'rules', 'import-rules'],
    },
    examples: [
      'show import rules',
      'list import rules',
      'import rules',
    ],
    priority: 70,
  },

  parameters: {
    type: 'object',
    properties: {},
  },

  parseArgs: () => {
    return {};
  },

  execute: async (args, context) => {
    try {
      const importConfig = context.services.importConfig;
      const rules = importConfig.getRules();

      if (rules.length === 0) {
        return `No import rules configured.

Create import-rules.json to automatically organize imported files.

Example rule:
{
  "rules": [
    {
      "name": "Financial Documents",
      "match": {
        "filenamePattern": "(?i)(invoice|receipt)",
        "fileTypes": ["document"]
      },
      "actions": {
        "project": "finances",
        "context": "admin"
      },
      "priority": 100
    }
  ]
}`;
      }

      let output = `Active Import Rules (${rules.length}):\n\n`;

      for (const rule of rules) {
        output += `**${rule.name}** (priority: ${rule.priority || 0})\n`;

        if (rule.description) {
          output += `  ${rule.description}\n`;
        }

        // Show match conditions
        output += '  Match:\n';
        if (rule.match.filenamePattern) {
          output += `    • Filename: ${rule.match.filenamePattern}\n`;
        }
        if (rule.match.fileTypes && rule.match.fileTypes.length > 0) {
          output += `    • File types: ${rule.match.fileTypes.join(', ')}\n`;
        }
        if (rule.match.contentPattern) {
          output += `    • Content: ${rule.match.contentPattern}\n`;
        }

        // Show actions
        output += '  Actions:\n';
        if (rule.actions.project) {
          output += `    • Project: +${rule.actions.project}\n`;
        }
        if (rule.actions.context) {
          output += `    • Context: @${rule.actions.context}\n`;
        }
        if (rule.actions.privacy) {
          output += `    • Privacy: ${rule.actions.privacy}\n`;
        }
        if (rule.actions.tags && rule.actions.tags.length > 0) {
          output += `    • Tags: ${rule.actions.tags.map(t => `#${t}`).join(', ')}\n`;
        }

        output += '\n';
      }

      output += `Rules are applied automatically during import confirmation.`;

      return output;
    } catch (err) {
      return `Error showing import rules: ${String(err)}`;
    }
  },
};

/**
 * Export all import rule tools
 */
export const importRuleTools: Tool[] = [showImportRules];
