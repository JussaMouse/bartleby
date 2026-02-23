// src/tools/import-profiles.ts
import { Tool } from './types.js';
import { ImportProfile } from '../utils/import-profiles.js';

/**
 * List all import profiles
 */
export const listImportProfiles: Tool = {
  name: 'listImportProfiles',
  description: 'List all import profiles',

  routing: {
    patterns: [
      /^(list|show)?\s*import\s+profiles?\s*$/i,
      /^profiles?\s*$/i,
    ],
    keywords: {
      verbs: ['list', 'show'],
      nouns: ['profiles', 'import-profiles'],
    },
    examples: [
      'import profiles',
      'list profiles',
      'show import profiles',
    ],
    priority: 70,
  },

  parameters: {
    type: 'object',
    properties: {},
  },

  parseArgs: () => ({}),

  execute: async (args, context) => {
    const profiles = context.services.importConfig.getProfiles();

    if (profiles.length === 0) {
      return 'No import profiles defined.\n\nCreate one with: create import profile';
    }

    let output = `📋 Import Profiles (${profiles.length})\n\n`;

    for (const profile of profiles) {
      output += `${profile.name}\n`;
      output += `  ${profile.description}\n`;

      const settings: string[] = [];
      if (profile.defaultProject) settings.push(`Project: ${profile.defaultProject}`);
      if (profile.defaultContext) settings.push(`Context: ${profile.defaultContext}`);
      if (profile.defaultPrivacy) settings.push(`Privacy: ${profile.defaultPrivacy}`);
      if (profile.enableOcr) settings.push('OCR: enabled');
      settings.push(`Duplicate: ${profile.duplicateAction}`);
      settings.push(`Auto-confirm: ${profile.autoConfirm ? 'yes' : 'no'}`);
      settings.push(`Rules: ${profile.rulesEnabled ? 'enabled' : 'disabled'}`);

      output += `  ${settings.join(' | ')}\n\n`;
    }

    output += `Use with: import with profile <name>`;

    return output;
  },
};

/**
 * Create a new import profile (interactive wizard)
 */
export const createImportProfile: Tool = {
  name: 'createImportProfile',
  description: 'Create a new import profile interactively',

  routing: {
    patterns: [
      /^create\s+import\s+profile\s*$/i,
      /^new\s+profile\s*$/i,
    ],
    keywords: {
      verbs: ['create', 'new'],
      nouns: ['profile', 'import-profile'],
    },
    examples: [
      'create import profile',
      'new profile',
    ],
    priority: 75,
  },

  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Profile name (lowercase, hyphen-separated)' },
      description: { type: 'string', description: 'Profile description' },
      defaultProject: { type: 'string', description: 'Default project tag (optional)' },
      defaultContext: { type: 'string', description: 'Default context tag (optional)' },
      defaultPrivacy: { type: 'string', enum: ['public', 'private', 'confidential'], description: 'Default privacy level (optional)' },
      enableOcr: { type: 'boolean', description: 'Enable OCR by default' },
      autoConfirm: { type: 'boolean', description: 'Auto-confirm imports without prompting' },
      duplicateAction: { type: 'string', enum: ['skip', 'prompt', 'reimport'], description: 'How to handle duplicates' },
      rulesEnabled: { type: 'boolean', description: 'Enable import rules matching' },
    },
    required: ['name', 'description'],
  },

  parseArgs: () => ({}),

  execute: async (args, context) => {
    const {
      name,
      description,
      defaultProject,
      defaultContext,
      defaultPrivacy,
      enableOcr = false,
      autoConfirm = false,
      duplicateAction = 'prompt',
      rulesEnabled = true,
    } = args as Partial<ImportProfile>;

    if (!name || !description) {
      return 'Interactive profile creation:\n\nPlease provide:\n' +
        '  name: Profile name (lowercase-hyphen-format)\n' +
        '  description: Brief description\n' +
        '  defaultProject: (optional) e.g., "+work"\n' +
        '  defaultContext: (optional) e.g., "@office"\n' +
        '  defaultPrivacy: (optional) public|private|confidential\n' +
        '  enableOcr: true|false (default: false)\n' +
        '  autoConfirm: true|false (default: false)\n' +
        '  duplicateAction: skip|prompt|reimport (default: prompt)\n' +
        '  rulesEnabled: true|false (default: true)';
    }

    try {
      const profile: ImportProfile = {
        name,
        description,
        defaultProject,
        defaultContext,
        defaultPrivacy: defaultPrivacy as 'public' | 'private' | 'confidential' | undefined,
        enableOcr,
        autoConfirm,
        duplicateAction: duplicateAction as 'skip' | 'prompt' | 'reimport',
        rulesEnabled,
      };

      context.services.importConfig.createProfile(profile);

      let output = `✓ Created import profile: ${name}\n\n`;
      output += `${description}\n\n`;
      output += 'Settings:\n';
      if (defaultProject) output += `  Project: ${defaultProject}\n`;
      if (defaultContext) output += `  Context: ${defaultContext}\n`;
      if (defaultPrivacy) output += `  Privacy: ${defaultPrivacy}\n`;
      output += `  OCR: ${enableOcr ? 'enabled' : 'disabled'}\n`;
      output += `  Auto-confirm: ${autoConfirm ? 'yes' : 'no'}\n`;
      output += `  Duplicate handling: ${duplicateAction}\n`;
      output += `  Rules: ${rulesEnabled ? 'enabled' : 'disabled'}\n\n`;
      output += `Use with: import with profile ${name}`;

      return output;
    } catch (err) {
      return `Error creating profile: ${String(err)}`;
    }
  },
};

/**
 * Edit an existing import profile
 */
export const editImportProfile: Tool = {
  name: 'editImportProfile',
  description: 'Edit an existing import profile',

  routing: {
    patterns: [
      /^edit\s+import\s+profile\s+(.+)$/i,
      /^edit\s+profile\s+(.+)$/i,
    ],
    keywords: {
      verbs: ['edit', 'update'],
      nouns: ['profile', 'import-profile'],
    },
    examples: [
      'edit import profile work-documents',
      'edit profile personal',
    ],
    priority: 75,
  },

  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Profile name' },
      description: { type: 'string', description: 'Profile description' },
      defaultProject: { type: 'string', description: 'Default project tag' },
      defaultContext: { type: 'string', description: 'Default context tag' },
      defaultPrivacy: { type: 'string', enum: ['public', 'private', 'confidential'] },
      enableOcr: { type: 'boolean', description: 'Enable OCR by default' },
      autoConfirm: { type: 'boolean', description: 'Auto-confirm imports' },
      duplicateAction: { type: 'string', enum: ['skip', 'prompt', 'reimport'] },
      rulesEnabled: { type: 'boolean', description: 'Enable import rules' },
    },
    required: ['name'],
  },

  parseArgs: (input) => {
    const match = input.match(/^edit\s+(?:import\s+)?profile\s+(.+)$/i);
    return { name: match?.[1]?.trim() };
  },

  execute: async (args, context) => {
    const { name, ...updates } = args as Partial<ImportProfile> & { name: string };

    if (!name) {
      return 'Usage: edit import profile <name>\n\nProvide fields to update:\n' +
        '  description, defaultProject, defaultContext, defaultPrivacy,\n' +
        '  enableOcr, autoConfirm, duplicateAction, rulesEnabled';
    }

    try {
      const existing = context.services.importConfig.getProfile(name);
      if (!existing) {
        return `Profile not found: ${name}\n\nAvailable profiles:\n${context.services.importConfig.getProfiles().map(p => `  - ${p.name}`).join('\n')}`;
      }

      // Only update provided fields
      const filteredUpdates = Object.fromEntries(
        Object.entries(updates).filter(([, v]) => v !== undefined)
      );

      if (Object.keys(filteredUpdates).length === 0) {
        let output = `📝 Edit profile: ${name}\n\n`;
        output += `Current settings:\n`;
        output += `  description: ${existing.description}\n`;
        output += `  defaultProject: ${existing.defaultProject || '(none)'}\n`;
        output += `  defaultContext: ${existing.defaultContext || '(none)'}\n`;
        output += `  defaultPrivacy: ${existing.defaultPrivacy || '(none)'}\n`;
        output += `  enableOcr: ${existing.enableOcr}\n`;
        output += `  autoConfirm: ${existing.autoConfirm}\n`;
        output += `  duplicateAction: ${existing.duplicateAction}\n`;
        output += `  rulesEnabled: ${existing.rulesEnabled}\n\n`;
        output += 'Provide fields to update.';
        return output;
      }

      context.services.importConfig.updateProfile(name, filteredUpdates);

      return `✓ Updated import profile: ${name}\n\nUpdated fields: ${Object.keys(filteredUpdates).join(', ')}`;
    } catch (err) {
      return `Error updating profile: ${String(err)}`;
    }
  },
};

/**
 * Delete an import profile
 */
export const deleteImportProfile: Tool = {
  name: 'deleteImportProfile',
  description: 'Delete an import profile',

  routing: {
    patterns: [
      /^delete\s+import\s+profile\s+(.+)$/i,
      /^delete\s+profile\s+(.+)$/i,
      /^remove\s+profile\s+(.+)$/i,
    ],
    keywords: {
      verbs: ['delete', 'remove'],
      nouns: ['profile', 'import-profile'],
    },
    examples: [
      'delete import profile work',
      'delete profile personal',
    ],
    priority: 75,
  },

  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Profile name' },
      confirm: { type: 'boolean', description: 'Confirm deletion' },
    },
    required: ['name'],
  },

  parseArgs: (input) => {
    const match = input.match(/^(?:delete|remove)\s+(?:import\s+)?profile\s+(.+)$/i);
    return { name: match?.[1]?.trim(), confirm: false };
  },

  execute: async (args, context) => {
    const { name, confirm = false } = args as { name?: string; confirm?: boolean };

    if (!name) {
      return 'Usage: delete import profile <name>';
    }

    try {
      const existing = context.services.importConfig.getProfile(name);
      if (!existing) {
        return `Profile not found: ${name}`;
      }

      if (!confirm) {
        return `⚠️ Delete profile "${name}"?\n\n` +
          `${existing.description}\n\n` +
          'This cannot be undone.\n\n' +
          'To confirm, use parameter: confirm: true';
      }

      context.services.importConfig.deleteProfile(name);
      return `✓ Deleted import profile: ${name}`;
    } catch (err) {
      return `Error deleting profile: ${String(err)}`;
    }
  },
};

/**
 * Import files using a profile
 */
export const importWithProfile: Tool = {
  name: 'importWithProfile',
  description: 'Import files using a named profile',

  routing: {
    patterns: [
      /^import\s+with\s+profile\s+(.+)$/i,
      /^import\s+using\s+profile\s+(.+)$/i,
    ],
    keywords: {
      verbs: ['import'],
      nouns: ['profile', 'with-profile'],
    },
    examples: [
      'import with profile work',
      'import using profile personal-photos',
    ],
    priority: 80,
  },

  parameters: {
    type: 'object',
    properties: {
      profileName: { type: 'string', description: 'Profile to use' },
    },
    required: ['profileName'],
  },

  parseArgs: (input) => {
    const match = input.match(/^import\s+(?:with|using)\s+profile\s+(.+)$/i);
    return { profileName: match?.[1]?.trim() };
  },

  execute: async (args, context) => {
    const { profileName } = args as { profileName?: string };

    if (!profileName) {
      return 'Usage: import with profile <name>\n\nSee available profiles: import profiles';
    }

    try {
      const profile = context.services.importConfig.getProfile(profileName);
      if (!profile) {
        return `Profile not found: ${profileName}\n\nAvailable profiles:\n${context.services.importConfig.getProfiles().map(p => `  - ${p.name}`).join('\n')}`;
      }

      // Get importFiles tool
      const { allTools } = await import('./index.js');
      const importFilesTool = allTools.find(t => t.name === 'importFiles');
      if (!importFilesTool) {
        return 'Error: importFiles tool not found';
      }

      // Execute import with profile settings
      let output = `📋 Using profile: ${profile.name}\n`;
      output += `${profile.description}\n\n`;

      const importArgs = {
        enableOcr: profile.enableOcr,
      };

      const result = await importFilesTool.execute(importArgs, context);

      // Add profile info to output
      return output + result;
    } catch (err) {
      return `Error importing with profile: ${String(err)}`;
    }
  },
};

/**
 * Export import profile tools
 */
export const importProfileTools: Tool[] = [
  listImportProfiles,
  createImportProfile,
  editImportProfile,
  deleteImportProfile,
  importWithProfile,
];
