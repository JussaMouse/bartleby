import { Tool } from './types.js';
import type { ToolContext } from './types.js';
import type { ActiveWorkflow, WorkflowValidationResult } from '../services/workflow.js';
import { SETTINGS_CATEGORIES, getSettingsByCategory, type SettingDefinition } from '../settings/registry.js';
import { persistWorkflow } from './workflow-registry.js';

export type GuidedSettingsStartMode = 'setup' | 'settings';

type SetupWorkflowStep =
  | 'ask-user-name'
  | 'ask-assistant-name'
  | 'ask-settings-mode'
  | 'ask-settings-category'
  | 'ask-setting-value'
  | 'complete';

interface SetupWorkflowDraft {
  workflowId: string;
  mode: GuidedSettingsStartMode;
  step: SetupWorkflowStep;
  userName?: string;
  assistantName?: string;
  settingsMode?: 'recommended' | 'guided' | 'skip';
  categoryIndex: number;
  settingIndex: number;
  activeCategory?: string;
  restartRequiredKeys: string[];
}

function getDraft(workflow: ActiveWorkflow | null): SetupWorkflowDraft | null {
  if (!workflow || workflow.type !== 'setup_wizard') return null;
  return workflow.draft as SetupWorkflowDraft;
}

function buildWorkflow(draft: SetupWorkflowDraft, current?: ActiveWorkflow): ActiveWorkflow<SetupWorkflowDraft> {
  return {
    id: current?.id ?? crypto.randomUUID(),
    type: 'setup_wizard',
    status: 'active',
    step: draft.step,
    startedAt: current?.startedAt ?? new Date().toISOString(),
    draft,
  };
}

function validateSetupWorkflow(workflow: ActiveWorkflow): WorkflowValidationResult {
  const draft = getDraft(workflow);
  if (!draft) return { ok: false, reason: 'missing setup workflow draft' };
  if (!draft.workflowId) return { ok: false, reason: 'missing setup workflow id' };
  if (!draft.step) return { ok: false, reason: 'missing setup workflow step' };
  if (draft.categoryIndex < 0 || draft.settingIndex < 0) {
    return { ok: false, reason: 'invalid setup workflow index state' };
  }
  return { ok: true };
}

function registerSetupWorkflow(context: ToolContext): void {
  context.services.workflow.register({ type: 'setup_wizard', validate: validateSetupWorkflow });
}

function saveDraft(context: ToolContext, draft: SetupWorkflowDraft): void {
  const workflow = buildWorkflow(draft, context.services.workflow.getActive() ?? undefined);
  persistWorkflow(context, workflow, context.services.workflow.hasActive());
}

function currentDefinition(draft: SetupWorkflowDraft): SettingDefinition | null {
  if (!draft.activeCategory) return null;
  const defs = getSettingsByCategory(draft.activeCategory);
  return defs[draft.settingIndex] ?? null;
}

function formatCurrentValue(context: ToolContext, definition: SettingDefinition): string {
  const isSet = context.services.settings.hasSetting(definition.key);
  const value = isSet ? context.services.settings.getSetting(definition.key) : definition.default;
  if (definition.secret) return isSet ? '<hidden>' : '<unset>';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

function renderCategoryChooser(mode: GuidedSettingsStartMode): string {
  const rows = SETTINGS_CATEGORIES.map((category, index) => `${index + 1}. ${category}`);
  return [
    mode === 'setup'
      ? 'Which settings category would you like to configure?'
      : 'Which settings category would you like to review or change?',
    ...rows,
    '',
    'Reply with a number, a category name, or `done` to finish.',
  ].join('\n');
}

function renderSettingPrompt(context: ToolContext, draft: SetupWorkflowDraft, definition: SettingDefinition): string {
  const currentValue = formatCurrentValue(context, definition);
  const prompt = definition.prompt?.trim() || `Set ${definition.key}`;
  const hints: string[] = [];
  if (definition.type === 'enum' && definition.options) {
    hints.push(`options: ${definition.options.join('/')}`);
  }
  if (definition.type === 'boolean') {
    hints.push('true/false');
  }

  return [
    `${draft.activeCategory} setting ${draft.settingIndex + 1} of ${getSettingsByCategory(draft.activeCategory!).length}`,
    prompt,
    hints.length > 0 ? `(${hints.join(', ')})` : '',
    `Current/default: ${currentValue}`,
    'Reply with a value, `skip`, `back`, or `done`.',
  ].filter(Boolean).join('\n');
}

function parseSettingInput(definition: SettingDefinition, input: string): { ok: true; value: unknown } | { ok: false; message: string } {
  const raw = input.trim();
  let value: unknown = raw;

  if (definition.type === 'boolean') {
    if (raw.toLowerCase() === 'true') value = true;
    else if (raw.toLowerCase() === 'false') value = false;
    else return { ok: false, message: 'Please reply with `true` or `false`.' };
  }

  if (definition.type === 'number') {
    const parsed = Number(raw);
    if (Number.isNaN(parsed)) return { ok: false, message: 'Please reply with a valid number.' };
    value = parsed;
  }

  if (definition.type === 'string_list') {
    value = raw.split(',').map(part => part.trim()).filter(Boolean);
  }

  if (definition.type === 'json') {
    try {
      value = JSON.parse(raw);
    } catch {
      return { ok: false, message: 'Please reply with valid JSON.' };
    }
  }

  if (definition.type === 'enum' && definition.options && !definition.options.includes(raw)) {
    return { ok: false, message: `Please choose one of: ${definition.options.join(', ')}` };
  }

  if (definition.validate) {
    const error = definition.validate(value);
    if (error) return { ok: false, message: error };
  }

  return { ok: true, value };
}

function finishSetup(context: ToolContext, draft: SetupWorkflowDraft): string {
  context.services.workflow.complete(draft.mode === 'setup' ? 'setup wizard completed' : 'guided settings workflow completed');
  if (draft.mode === 'setup') {
    context.services.settings.markFirstRunComplete();
  }

  const lines = [draft.mode === 'setup' ? '✓ Setup workflow complete.' : '✓ Guided settings workflow complete.'];
  if (draft.restartRequiredKeys.length > 0) {
    lines.push('', 'Some settings require a restart to take effect.');
  }
  lines.push('', 'You can review settings with `settings` or rerun this flow later.');
  return lines.join('\n');
}

export async function handleSetupWorkflowReply(input: string, context: ToolContext, workflow: ActiveWorkflow): Promise<string> {
  const draft = getDraft(workflow);
  if (!draft) return 'No active setup workflow.';

  const normalized = input.trim();
  const lowered = normalized.toLowerCase();

  if (lowered === 'quit' || lowered === 'exit') {
    context.services.workflow.cancel('user cancelled setup workflow');
    return draft.mode === 'setup' ? 'Setup wizard cancelled.' : 'Guided settings workflow cancelled.';
  }

  if (draft.step === 'ask-user-name') {
    if (normalized) {
      context.services.learning.recordObservation({
        entityId: 'user',
        key: 'preferred_name',
        value: normalized,
        sourceType: 'stated',
        confidence: 1.0,
      });
    }

    saveDraft(context, { ...draft, userName: normalized || undefined, step: 'ask-assistant-name' });
    return 'What would you like to call me? Reply with a name, or press Enter to keep `Bartleby`.';
  }

  if (draft.step === 'ask-assistant-name') {
    const assistantName = normalized || 'Bartleby';
    context.services.settings.setSetting('assistant.name', assistantName, 'assistant', 'Name used to address the assistant');
    saveDraft(context, { ...draft, assistantName, step: 'ask-settings-mode' });
    return [
      `Thanks${draft.userName ? `, ${draft.userName}` : ''}.`,
      '',
      'How would you like to handle settings?',
      '1. recommended',
      '2. guided',
      '3. skip',
      '',
      'Reply with `recommended`, `guided`, or `skip`.',
    ].join('\n');
  }

  if (draft.step === 'ask-settings-mode') {
    const mode = lowered === '1' ? 'recommended' : lowered === '2' ? 'guided' : lowered === '3' ? 'skip' : lowered;
    if (!['recommended', 'guided', 'skip'].includes(mode)) {
      return 'Reply with `recommended`, `guided`, or `skip`.';
    }

    if (mode === 'skip') {
      return finishSetup(context, { ...draft, settingsMode: 'skip' });
    }

    if (mode === 'recommended') {
      const mod = await import('./first-run-wizard.js');
      await mod.configureDefaults(context.services.settings, context.services.llm);
      return finishSetup(context, { ...draft, settingsMode: 'recommended' });
    }

    saveDraft(context, { ...draft, settingsMode: 'guided', step: 'ask-settings-category' });
    return renderCategoryChooser(draft.mode);
  }

  if (draft.step === 'ask-settings-category') {
    if (lowered === 'done') {
      return finishSetup(context, draft);
    }

    const categoryIndex = Number(normalized) - 1;
    const category = Number.isInteger(categoryIndex) && categoryIndex >= 0 && categoryIndex < SETTINGS_CATEGORIES.length
      ? SETTINGS_CATEGORIES[categoryIndex]
      : SETTINGS_CATEGORIES.find(entry => entry.toLowerCase() === lowered);

    if (!category) {
      return renderCategoryChooser(draft.mode) + '\n\nUnrecognized category.';
    }

    const nextDraft: SetupWorkflowDraft = {
      ...draft,
      activeCategory: category,
      categoryIndex: SETTINGS_CATEGORIES.indexOf(category),
      settingIndex: 0,
      step: 'ask-setting-value',
    };
    saveDraft(context, nextDraft);
    const definition = currentDefinition(nextDraft);
    return definition ? renderSettingPrompt(context, nextDraft, definition) : renderCategoryChooser(draft.mode);
  }

  if (draft.step === 'ask-setting-value') {
    const definition = currentDefinition(draft);
    if (!definition || !draft.activeCategory) {
      saveDraft(context, { ...draft, step: 'ask-settings-category', activeCategory: undefined, settingIndex: 0 });
      return renderCategoryChooser(draft.mode);
    }

    if (lowered === 'done') {
      return finishSetup(context, draft);
    }

    if (lowered === 'back') {
      saveDraft(context, { ...draft, step: 'ask-settings-category', activeCategory: undefined, settingIndex: 0 });
      return renderCategoryChooser(draft.mode);
    }

    if (lowered !== 'skip') {
      const parsed = parseSettingInput(definition, normalized);
      if (!parsed.ok) {
        return renderSettingPrompt(context, draft, definition) + `\n\n${parsed.message}`;
      }

      context.services.settings.setSetting(definition.key, parsed.value, definition.category, definition.description);
      if (definition.requiresRestart) {
        draft.restartRequiredKeys = Array.from(new Set([...draft.restartRequiredKeys, definition.key]));
      }
    }

    const definitions = getSettingsByCategory(draft.activeCategory);
    const nextIndex = draft.settingIndex + 1;
    if (nextIndex >= definitions.length) {
      saveDraft(context, { ...draft, step: 'ask-settings-category', activeCategory: undefined, settingIndex: 0 });
      return renderCategoryChooser(draft.mode);
    }

    const nextDraft = { ...draft, settingIndex: nextIndex };
    saveDraft(context, nextDraft);
    return renderSettingPrompt(context, nextDraft, definitions[nextIndex]!);
  }

  return finishSetup(context, draft);
}

export async function startSetupWorkflow(
  services: ToolContext['services'],
  mode: GuidedSettingsStartMode = 'setup',
): Promise<string> {
  const context: ToolContext = { input: mode === 'setup' ? 'setup wizard' : 'settings wizard', services };
  registerSetupWorkflow(context);
  if (services.workflow.ensureActiveValid().ok && services.workflow.hasActive()) {
    const active = services.workflow.getActive();
    return `A workflow is already active (${active?.type}). Finish it or type quit first.`;
  }

  const draft: SetupWorkflowDraft = {
    workflowId: crypto.randomUUID(),
    mode,
    step: mode === 'setup' ? 'ask-user-name' : 'ask-settings-category',
    categoryIndex: 0,
    settingIndex: 0,
    restartRequiredKeys: [],
  };

  const result = services.workflow.start(buildWorkflow(draft));
  if (!result.ok) return result.message ?? 'Unable to start setup workflow.';

  if (mode === 'setup') {
    return [
      'Welcome to Bartleby setup.',
      '',
      'This guided flow is workflow-driven so it can be reused by future interfaces beyond the CLI.',
      '',
      "What's your name? Reply with your preferred name, or press Enter to skip.",
    ].join('\n');
  }

  return [
    'Guided settings workflow started.',
    '',
    'This flow uses the shared workflow system so future interfaces can drive the same configuration behavior.',
    '',
    renderCategoryChooser(mode),
  ].join('\n');
}

export const setupWizardWorkflow: Tool = {
  name: 'setupWizardWorkflow',
  description: 'Start a guided setup workflow',
  routing: {
    patterns: [/^setup\s+wizard\s*$/i, /^first\s+run\s*$/i, /^initial\s+setup\s*$/i],
    keywords: {
      verbs: ['setup', 'configure', 'initialize'],
      nouns: ['wizard', 'setup', 'first-run'],
    },
    priority: 81,
    intentClass: 'workflow_start',
  },
  parseArgs: () => ({}),
  execute: async (_args, context) => {
    return startSetupWorkflow(context.services, 'setup');
  },
};

export const guidedSettingsWorkflow: Tool = {
  name: 'guidedSettingsWorkflow',
  description: 'Start a guided settings workflow',
  routing: {
    patterns: [/^settings?\s+wizard\s*$/i, /^guided\s+settings?\s*$/i, /^configure\s+settings?\s*$/i],
    keywords: {
      verbs: ['configure', 'review', 'guide'],
      nouns: ['settings', 'configuration', 'config'],
    },
    priority: 76,
    intentClass: 'workflow_start',
  },
  parseArgs: () => ({}),
  execute: async (_args, context) => {
    return startSetupWorkflow(context.services, 'settings');
  },
};
