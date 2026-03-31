import type { ActiveWorkflow, WorkflowValidationResult } from '../services/workflow.js';
import type { ToolContext } from './types.js';

export function validateInboxProcessWorkflow(workflow: ActiveWorkflow): WorkflowValidationResult {
  const session = workflow.draft as {
    active?: boolean;
    sessionId?: string;
    currentItemId?: string;
    step?: string;
    processedCount?: number;
    skippedCount?: number;
    totalCount?: number;
  } | undefined;

  if (!session) return { ok: false, reason: 'missing inbox workflow draft' };
  if (!session.active) return { ok: false, reason: 'inactive inbox workflow draft' };
  if (!session.sessionId) return { ok: false, reason: 'missing inbox session id' };
  if (!session.step) return { ok: false, reason: 'missing inbox workflow step' };
  if ((session.processedCount ?? 0) < 0 || (session.skippedCount ?? 0) < 0) {
    return { ok: false, reason: 'invalid inbox workflow counters' };
  }
  if ((session.totalCount ?? -1) < 0) return { ok: false, reason: 'invalid inbox total count' };
  if (workflow.targets?.primaryId && session.currentItemId && workflow.targets.primaryId !== session.currentItemId) {
    return { ok: false, reason: 'workflow target does not match current inbox item' };
  }

  return { ok: true };
}

export function validateNoteWorkflow(workflow: ActiveWorkflow): WorkflowValidationResult {
  const session = workflow.draft as {
    active?: boolean;
    workflowId?: string;
    noteId?: string;
    step?: string;
    currentAttachmentTypeIndex?: number;
  } | undefined;

  if (!session) return { ok: false, reason: 'missing note workflow draft' };
  if (!session.active) return { ok: false, reason: 'inactive note workflow draft' };
  if (!session.workflowId) return { ok: false, reason: 'missing note workflow id' };
  if (!session.noteId) return { ok: false, reason: 'missing note target id' };
  if (!session.step) return { ok: false, reason: 'missing note workflow step' };
  if ((session.currentAttachmentTypeIndex ?? 0) < 0) return { ok: false, reason: 'invalid attachment index' };
  if (workflow.targets?.primaryId && workflow.targets.primaryId !== session.noteId) {
    return { ok: false, reason: 'workflow target does not match note id' };
  }

  return { ok: true };
}

export function registerWorkflowTypes(context: ToolContext): void {
  context.services.workflow.register({ type: 'inbox_process', validate: validateInboxProcessWorkflow });
  context.services.workflow.register({ type: 'note_create', validate: validateNoteWorkflow });
  context.services.workflow.register({ type: 'note_edit', validate: validateNoteWorkflow });
}

export function persistWorkflow(
  context: ToolContext,
  workflow: ActiveWorkflow,
  hasActive = context.services.workflow.hasActive(),
): void {
  const result = hasActive
    ? context.services.workflow.advance(workflow)
    : context.services.workflow.start(workflow);

  if (!result.ok) {
    throw new Error(result.message ?? 'Failed to persist workflow state.');
  }
}
