import { Tool } from './types.js';
import { SETTINGS_MANIFEST, SettingSpec } from '../setup/first-launch.js';

const WIZARD_FACT = 'pending_settings_wizard';

interface WizardState {
  category: string;
  index: number;
  keys: string[];
}

export const settingsWizardHandler: Tool = {
  name: 'settingsWizardHandler',
  description: 'Internal: Handle pending settings wizard prompts',
  routing: {
    priority: -1,
  },

  shouldHandle: async (_input, context) => {
    const pending = context.services.context.getFact('system', WIZARD_FACT);
    return !!pending;
  },

  execute: async (args, context) => {
    const { __raw_input: input } = args as { __raw_input: string };
    const state = context.services.context.getFact('system', WIZARD_FACT) as WizardState | undefined;
    if (!state) {
      return 'No settings wizard is active.';
    }

    const trimmed = input.trim();

    if (trimmed.toLowerCase() === 'done') {
      context.services.context.setFact('system', WIZARD_FACT, false, { source: 'explicit' });
      return '✓ Settings wizard complete.';
    }

    const spec = getSpecByKey(state.keys[state.index]);
    if (!spec) {
      context.services.context.setFact('system', WIZARD_FACT, false, { source: 'explicit' });
      return 'No settings found for that wizard step.';
    }

    if (trimmed === '' || trimmed.toLowerCase() === 'skip') {
      return advanceWizard(state, context, spec, false);
    }

    if (spec.validate) {
      const error = spec.validate(trimmed);
      if (error) {
        return `${error}

${formatPrompt(state, spec, context)}`;
      }
    }

    const finalValue = spec.transform ? spec.transform(trimmed) : trimmed;
    context.services.settings.setSetting(spec.key, finalValue, spec.category, spec.description);

    applySideEffects(spec, finalValue, context);

    return advanceWizard(state, context, spec, true);
  },
};

export const editSettingsWizard: Tool = {
  name: 'editSettingsWizard',
  description: 'Interactive wizard for editing a settings category',

  routing: {
    patterns: [
      /^edit\s+settings?\s+([a-z-]+)\s*$/i,
      /^edit\s+([a-z-]+)\s+settings?\s*$/i,
      /^configure\s+([a-z-]+)\s+settings?\s*$/i,
    ],
    keywords: {
      verbs: ['edit', 'configure', 'update'],
      nouns: ['settings', 'configuration'],
    },
    examples: ['edit signal settings', 'edit calendar settings'],
    priority: 85,
  },

  parseArgs: (input) => {
    const match = input.match(/(?:edit|configure)\s+(?:settings\s+)?([a-z-]+)\s*settings?/i);
    return { category: match ? match[1].toLowerCase() : '' };
  },

  execute: async (args, context) => {
    const { category } = args as { category: string };
    const specs = getSpecsForCategory(category);

    if (!category) {
      return `Which settings category would you like to edit?

Available: ${getCategories().join(', ')}`;
    }

    if (specs.length === 0) {
      return `No wizard entries found for category "${category}".

Available: ${getCategories().join(', ')}`;
    }

    const state: WizardState = {
      category,
      index: 0,
      keys: specs.map((spec) => spec.key),
    };

    context.services.context.setFact('system', WIZARD_FACT, state, { source: 'explicit' });

    return formatPrompt(state, specs[0], context);
  },
};

function getCategories(): string[] {
  const categories = new Set(SETTINGS_MANIFEST.map((spec) => spec.category));
  return Array.from(categories).sort();
}

function getSpecsForCategory(category: string): SettingSpec[] {
  return SETTINGS_MANIFEST.filter((spec) => spec.category === category);
}

function getSpecByKey(key?: string): SettingSpec | undefined {
  if (!key) return undefined;
  return SETTINGS_MANIFEST.find((spec) => spec.key === key);
}

function formatPrompt(state: WizardState, spec: SettingSpec, context: any): string {
  const total = state.keys.length;
  const position = state.index + 1;
  const currentValue = context.services.settings.getSetting(spec.key, null as any);
  const currentText = spec.sensitive
    ? '<hidden>'
    : currentValue !== null && currentValue !== undefined
      ? JSON.stringify(currentValue)
      : 'unset';

  return `Settings wizard: ${state.category} (${position}/${total})

${spec.key}: ${spec.description}
Current: ${currentText}

Enter a value, or type "skip" or "done".`;
}

function advanceWizard(state: WizardState, context: any, spec: SettingSpec, saved: boolean): string {
  const nextIndex = state.index + 1;
  if (nextIndex >= state.keys.length) {
    context.services.context.setFact('system', WIZARD_FACT, false, { source: 'explicit' });
    return saved
      ? `✓ Saved ${spec.key}. Settings wizard complete.`
      : '✓ Settings wizard complete.';
  }

  const nextSpec = getSpecByKey(state.keys[nextIndex]);
  if (!nextSpec) {
    context.services.context.setFact('system', WIZARD_FACT, false, { source: 'explicit' });
    return 'Settings wizard complete.';
  }

  const nextState: WizardState = { ...state, index: nextIndex };
  context.services.context.setFact('system', WIZARD_FACT, nextState, { source: 'explicit' });

  const prefix = saved ? `✓ Saved ${spec.key}.

` : '';
  return `${prefix}${formatPrompt(nextState, nextSpec, context)}`;
}

function applySideEffects(spec: SettingSpec, value: any, context: any): void {
  if (spec.key === 'ocr.url' && value) {
    context.services.settings.setSetting('ocr.enabled', true, 'ocr', 'Enable OCR for image text extraction');
  }
}
