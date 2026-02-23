// src/tools/import-rules-mgmt.ts
import { Tool } from './types.js';
import { ImportRulesManager, ImportRule, validateRegexPattern } from '../utils/import-rules.js';
import { FileType } from '../utils/file-type-detection.js';

/**
 * Create a new import rule with interactive wizard
 */
export const createImportRule: Tool = {
  name: 'createImportRule',
  description: 'Create a new import rule with interactive wizard',

  routing: {
    patterns: [
      /^create\s+import\s+rule\s*$/i,
      /^new\s+import\s+rule\s*$/i,
      /^add\s+import\s+rule\s*$/i,
    ],
    keywords: {
      verbs: ['create', 'new', 'add'],
      nouns: ['import', 'rule'],
    },
    examples: [
      'create import rule',
      'new import rule',
      'add import rule',
    ],
    priority: 75,
  },

  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Rule name' },
      filenamePattern: { type: 'string', description: 'Filename regex pattern' },
      fileTypes: { type: 'array', items: { type: 'string' }, description: 'File types to match' },
      project: { type: 'string', description: 'Project tag to apply' },
      context: { type: 'string', description: 'Context tag to apply' },
      privacy: { type: 'string', enum: ['public', 'private', 'confidential'], description: 'Privacy level' },
      priority: { type: 'number', description: 'Rule priority (0-1000)' },
    },
  },

  parseArgs: () => ({}),

  execute: async (args, context) => {
    const rulesManager = new ImportRulesManager();

    try {
      const params = args as Partial<{
        name: string;
        filenamePattern: string;
        fileTypes: string[];
        project: string;
        context: string;
        privacy: 'public' | 'private' | 'confidential';
        priority: number;
      }>;

      // Build rule from parameters
      if (!params.name) {
        return 'Error: Rule name is required. Usage: create import rule with parameters or use the interactive wizard.';
      }

      const rule: ImportRule = {
        name: params.name,
        match: {
          filenamePattern: params.filenamePattern,
          fileTypes: params.fileTypes as FileType[] | undefined,
        },
        actions: {
          project: params.project,
          context: params.context,
          privacy: params.privacy,
        },
        priority: params.priority || 50,
        enabled: true,
      };

      // Validate regex patterns if provided
      if (rule.match.filenamePattern) {
        const validation = validateRegexPattern(rule.match.filenamePattern);
        if (!validation.valid) {
          return `Error: Invalid filename pattern: ${validation.error}`;
        }
      }

      // Add rule
      const result = rulesManager.addRule(rule);

      if (!result.success) {
        return `Error creating rule: ${result.error}`;
      }

      // Show preview of created rule
      let output = `✓ Import rule "${rule.name}" created successfully!\n\n`;
      output += `Match criteria:\n`;

      if (rule.match.filenamePattern) {
        output += `  • Filename pattern: /${rule.match.filenamePattern}/i\n`;
      }

      if (rule.match.fileTypes && rule.match.fileTypes.length > 0) {
        output += `  • File types: ${rule.match.fileTypes.join(', ')}\n`;
      }

      output += `\nActions:\n`;

      if (rule.actions.project) {
        output += `  • Project: ${rule.actions.project}\n`;
      }

      if (rule.actions.context) {
        output += `  • Context: ${rule.actions.context}\n`;
      }

      if (rule.actions.privacy) {
        output += `  • Privacy: ${rule.actions.privacy}\n`;
      }

      output += `\nPriority: ${rule.priority}\n`;
      output += `\nUse "test import rule ${rule.name}" to test this rule against inbox files.`;

      return output;
    } catch (err) {
      return `Error creating import rule: ${String(err)}`;
    }
  },
};

/**
 * Edit an existing import rule
 */
export const editImportRule: Tool = {
  name: 'editImportRule',
  description: 'Edit an existing import rule',

  routing: {
    patterns: [
      /^edit\s+import\s+rule\s+(.+)$/i,
      /^update\s+import\s+rule\s+(.+)$/i,
      /^modify\s+import\s+rule\s+(.+)$/i,
    ],
    keywords: {
      verbs: ['edit', 'update', 'modify'],
      nouns: ['import', 'rule'],
    },
    examples: [
      'edit import rule Financial Documents',
      'update import rule Work Files',
    ],
    priority: 75,
  },

  parameters: {
    type: 'object',
    properties: {
      ruleName: { type: 'string', description: 'Name of the rule to edit' },
      updates: { type: 'object', description: 'Updates to apply' },
    },
  },

  parseArgs: (input) => {
    const match = input.match(/^(?:edit|update|modify)\s+import\s+rule\s+(.+)$/i);
    const ruleName = match ? match[1].trim() : '';
    return { ruleName };
  },

  execute: async (args, context) => {
    const { ruleName } = args as { ruleName: string };

    if (!ruleName) {
      return 'Error: Rule name is required. Usage: edit import rule <name>';
    }

    const rulesManager = new ImportRulesManager();
    const existingRule = rulesManager.getRule(ruleName);

    if (!existingRule) {
      return `Error: Rule "${ruleName}" not found. Use "show import rules" to see available rules.`;
    }

    // Show current rule configuration
    let output = `Current configuration for "${ruleName}":\n\n`;
    output += `Match criteria:\n`;

    if (existingRule.match.filenamePattern) {
      output += `  • Filename pattern: /${existingRule.match.filenamePattern}/i\n`;
    }

    if (existingRule.match.fileTypes && existingRule.match.fileTypes.length > 0) {
      output += `  • File types: ${existingRule.match.fileTypes.join(', ')}\n`;
    }

    output += `\nActions:\n`;

    if (existingRule.actions.project) {
      output += `  • Project: ${existingRule.actions.project}\n`;
    }

    if (existingRule.actions.context) {
      output += `  • Context: ${existingRule.actions.context}\n`;
    }

    if (existingRule.actions.privacy) {
      output += `  • Privacy: ${existingRule.actions.privacy}\n`;
    }

    output += `\nPriority: ${existingRule.priority || 50}\n`;
    output += `Enabled: ${existingRule.enabled !== false}\n`;
    output += `\nTo update this rule, use the LLM tool call with the desired changes.`;

    return output;
  },
};

/**
 * Delete an import rule
 */
export const deleteImportRule: Tool = {
  name: 'deleteImportRule',
  description: 'Delete an import rule',

  routing: {
    patterns: [
      /^delete\s+import\s+rule\s+(.+)$/i,
      /^remove\s+import\s+rule\s+(.+)$/i,
    ],
    keywords: {
      verbs: ['delete', 'remove'],
      nouns: ['import', 'rule'],
    },
    examples: [
      'delete import rule Financial Documents',
      'remove import rule Work Files',
    ],
    priority: 75,
  },

  parameters: {
    type: 'object',
    properties: {
      ruleName: { type: 'string', description: 'Name of the rule to delete' },
    },
  },

  parseArgs: (input) => {
    const match = input.match(/^(?:delete|remove)\s+import\s+rule\s+(.+)$/i);
    const ruleName = match ? match[1].trim() : '';
    return { ruleName };
  },

  execute: async (args, context) => {
    const { ruleName } = args as { ruleName: string };

    if (!ruleName) {
      return 'Error: Rule name is required. Usage: delete import rule <name>';
    }

    const rulesManager = new ImportRulesManager();
    const deleted = rulesManager.removeRule(ruleName);

    if (deleted) {
      return `✓ Import rule "${ruleName}" deleted successfully.`;
    } else {
      return `Error: Rule "${ruleName}" not found. Use "show import rules" to see available rules.`;
    }
  },
};

/**
 * Test an import rule against inbox files (dry-run)
 */
export const testImportRule: Tool = {
  name: 'testImportRule',
  description: 'Test an import rule against current inbox files',

  routing: {
    patterns: [
      /^test\s+import\s+rule\s+(.+)$/i,
      /^try\s+import\s+rule\s+(.+)$/i,
    ],
    keywords: {
      verbs: ['test', 'try'],
      nouns: ['import', 'rule'],
    },
    examples: [
      'test import rule Financial Documents',
      'try import rule Work Files',
    ],
    priority: 75,
  },

  parameters: {
    type: 'object',
    properties: {
      ruleName: { type: 'string', description: 'Name of the rule to test' },
    },
  },

  parseArgs: (input) => {
    const match = input.match(/^(?:test|try)\s+import\s+rule\s+(.+)$/i);
    const ruleName = match ? match[1].trim() : '';
    return { ruleName };
  },

  execute: async (args, context) => {
    const { ruleName } = args as { ruleName: string };
    const { inbox } = context.services;

    if (!ruleName) {
      return 'Error: Rule name is required. Usage: test import rule <name>';
    }

    const rulesManager = new ImportRulesManager();
    const rule = rulesManager.getRule(ruleName);

    if (!rule) {
      return `Error: Rule "${ruleName}" not found. Use "show import rules" to see available rules.`;
    }

    // Get inbox items
    const items = inbox.listInbox();

    if (items.length === 0) {
      return 'Inbox is empty. Add files to test the rule against.';
    }

    // Test rule against each item
    const matches = [];
    const nonMatches = [];

    for (const item of items) {
      const ruleMatches = rulesManager.matchRules(item.file_name, item.file_type);
      const thisRuleMatch = ruleMatches.find(m => m.rule.name === ruleName);

      if (thisRuleMatch) {
        matches.push({ item, confidence: thisRuleMatch.confidence });
      } else {
        nonMatches.push(item);
      }
    }

    let output = `Test results for rule "${ruleName}":\n\n`;

    if (matches.length > 0) {
      output += `✓ Would match ${matches.length} file${matches.length === 1 ? '' : 's'}:\n\n`;

      for (const { item, confidence } of matches) {
        const confidencePercent = Math.round(confidence * 100);
        output += `  • ${item.file_name} (${confidencePercent}% confidence)\n`;

        if (rule.actions.project) {
          output += `    → Project: ${rule.actions.project}\n`;
        }

        if (rule.actions.context) {
          output += `    → Context: ${rule.actions.context}\n`;
        }

        if (rule.actions.privacy) {
          output += `    → Privacy: ${rule.actions.privacy}\n`;
        }
      }

      output += '\n';
    } else {
      output += '⊘ No files would match this rule.\n\n';
    }

    if (nonMatches.length > 0) {
      output += `Files that would NOT match:\n`;
      for (const item of nonMatches) {
        output += `  • ${item.file_name}\n`;
      }
    }

    return output;
  },
};

/**
 * Export all import rule management tools
 */
export const importRuleMgmtTools: Tool[] = [
  createImportRule,
  editImportRule,
  deleteImportRule,
  testImportRule,
];
