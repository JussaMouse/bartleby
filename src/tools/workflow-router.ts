import type { Tool } from './types.js';

export const workflowRouter: Tool = {
  name: 'workflowRouter',
  description: 'Internal: route active workflow replies',
  routing: { intentClass: 'workflow_reply', priority: 1000 },
  shouldHandle: async (_input, context) => {
    return context.services.workflow.ensureActiveValid().ok && context.services.workflow.hasActive();
  },
  execute: async (args, context) => {
    const validation = context.services.workflow.ensureActiveValid();
    if (!validation.ok) {
      return validation.message ?? 'No active workflow.';
    }

    const workflow = validation.workflow;
    if (!workflow) return 'No active workflow.';
    const rawInput = String((args as { __raw_input?: string }).__raw_input ?? '').trim();

    switch (workflow.type) {
      case 'inbox_process': {
        const mod = await import('./inbox-processing.js');
        return mod.handleInboxWorkflowReply(rawInput, context, workflow);
      }
      case 'note_create':
      case 'note_edit': {
        const mod = await import('./note-workflow.js');
        return mod.handleNoteWorkflowReply(rawInput, context, workflow);
      }
      case 'setup_wizard': {
        const mod = await import('./setup-workflow.js');
        return mod.handleSetupWorkflowReply(rawInput, context, workflow);
      }
      default:
        context.services.workflow.clear(`unknown workflow type: ${workflow.type}`);
        return `Cleared unknown active workflow type: ${workflow.type}`;
    }
  },
};
