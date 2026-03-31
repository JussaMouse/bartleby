import { Tool } from './types.js';
import type { GardenRecord } from '../garden/types.js';
import type { ToolContext } from './types.js';
import type { ActiveWorkflow } from '../services/workflow.js';
import { resolveRecordByTypeAndTitle } from './record-resolution.js';
import { persistWorkflow, registerWorkflowTypes } from './workflow-registry.js';

interface InboxProcessingSession {
  active: boolean;
  sessionId: string;
  queue: string[];
  currentItemId?: string;
  step: 'choose-disposition' | 'collect-project-actions' | 'select-note-target' | 'collect-event-details';
  draft?: {
    disposition?: 'action' | 'project' | 'note' | 'note_append' | 'event' | 'someday' | 'skip';
  };
  startedAt: string;
  processedCount: number;
  skippedCount: number;
  totalCount: number;
}

function getSession(context: ToolContext): InboxProcessingSession | null {
  const workflow = context.services.workflow.getActive();
  if (!workflow || workflow.type !== 'inbox_process') return null;
  return workflow.draft as InboxProcessingSession;
}

function buildWorkflow(session: InboxProcessingSession, current?: ActiveWorkflow): ActiveWorkflow<InboxProcessingSession> {
  return {
    id: current?.id ?? crypto.randomUUID(),
    type: 'inbox_process',
    status: 'active',
    step: session.step,
    startedAt: current?.startedAt ?? session.startedAt,
    draft: session,
    targets: session.currentItemId ? { primaryId: session.currentItemId } : undefined,
    meta: { totalCount: session.totalCount },
  };
}

function replaceSession(context: ToolContext, session: InboxProcessingSession): void {
  const workflow = buildWorkflow(session, context.services.workflow.getActive() ?? undefined);
  if (context.services.workflow.ensureActiveValid().ok && context.services.workflow.hasActive()) {
    context.services.workflow.replace(workflow);
  } else {
    context.services.workflow.start(workflow);
  }
}

function currentItem(context: ToolContext, session: InboxProcessingSession): GardenRecord | null {
  if (!session.currentItemId) return null;
  return context.services.garden.get(session.currentItemId);
}

function renderChoicePrompt(item: GardenRecord, session: InboxProcessingSession): string {
  return [
    '# Process Inbox',
    '',
    `Item ${session.processedCount + session.skippedCount + 1} of ${session.totalCount}`,
    '',
    `Inbox item: **${item.title}**`,
    item.content ? `\n${item.content}` : '',
    '',
    'Choose what this should become:',
    '  action (a)',
    '  project (p)',
    '  note (n)',
    '  append to note (l)',
    '  event (e)',
    '  idea / someday (i)',
    '  skip (s)',
    '  quit (q)',
  ].filter(Boolean).join('\n');
}

function normalizeDisposition(input: string): 'action' | 'project' | 'note' | 'note_append' | 'event' | 'someday' | 'skip' | 'quit' | null {
  const normalized = input.trim().toLowerCase();
  if (['a', 'action'].includes(normalized)) return 'action';
  if (['p', 'project'].includes(normalized)) return 'project';
  if (['n', 'note'].includes(normalized)) return 'note';
  if (['l', 'append', 'append to note', 'list'].includes(normalized)) return 'note_append';
  if (['e', 'event'].includes(normalized)) return 'event';
  if (['i', 'idea', 'someday', 'someday maybe'].includes(normalized)) return 'someday';
  if (['s', 'skip'].includes(normalized)) return 'skip';
  if (['q', 'quit', 'exit'].includes(normalized)) return 'quit';
  return null;
}

function cancelMessage(session: InboxProcessingSession): string {
  return `Exited inbox processing. Processed ${session.processedCount}, skipped ${session.skippedCount}.`;
}

function completeMessage(session: InboxProcessingSession): string {
  return `Inbox processing complete. Processed ${session.processedCount}, skipped ${session.skippedCount}.`;
}

function advanceQueue(context: ToolContext, session: InboxProcessingSession): string {
  const nextQueue = [...session.queue];
  const nextId = nextQueue.shift();
  if (!nextId) {
    context.services.workflow.complete('inbox queue exhausted');
    context.services.runtimeActivity.record({ channel: 'cli', direction: 'system', text: `Inbox processing complete (${session.processedCount} processed, ${session.skippedCount} skipped)` });
    return completeMessage(session);
  }

  const nextSession: InboxProcessingSession = {
    ...session,
    queue: nextQueue,
    currentItemId: nextId,
    step: 'choose-disposition',
    draft: {},
  };
  replaceSession(context, nextSession);
  const item = currentItem(context, nextSession);
  if (!item) {
    context.services.workflow.fail('next inbox item not found');
    return 'Inbox processing stopped: next item not found.';
  }
  return renderChoicePrompt(item, nextSession);
}

function markProcessed(context: ToolContext, item: GardenRecord): void {
  context.services.garden.update(item.id, { status: 'processed' });
}

function addProvenance(context: ToolContext, source: GardenRecord, targetId: string): void {
  context.services.rels.add(targetId, source.id, 'related_to', { derived_from_item: true });
}

export const processInboxStart: Tool = {
  name: 'processInboxStart',
  description: 'Start guided inbox processing',
  routing: {
    patterns: [/^process\s+inbox$/i, /^start\s+inbox\s+processing$/i, /^review\s+inbox$/i],
    keywords: { verbs: ['process', 'review', 'start'], nouns: ['inbox'] },
    priority: 98,
    intentClass: 'workflow_start',
  },
  parseArgs: () => ({}),
  execute: async (_args, context) => {
    registerWorkflowTypes(context);
    if (context.services.workflow.ensureActiveValid().ok && context.services.workflow.hasActive()) {
      const active = context.services.workflow.getActive();
      return `A workflow is already active (${active?.type}). Finish it or type quit first.`;
    }
    const items = context.services.garden.getInboxItemsOldestFirst();
    if (items.length === 0) return 'Inbox is empty.';
    const [first, ...rest] = items;
    const session: InboxProcessingSession = {
      active: true,
      sessionId: crypto.randomUUID(),
      queue: rest.map(item => item.id),
      currentItemId: first.id,
      step: 'choose-disposition',
      draft: {},
      startedAt: new Date().toISOString(),
      processedCount: 0,
      skippedCount: 0,
      totalCount: items.length,
    };
    const startResult = context.services.workflow.start(buildWorkflow(session));
    if (!startResult.ok) return startResult.message ?? 'Unable to start inbox processing workflow.';
    context.services.runtimeActivity.record({ channel: 'cli', direction: 'system', text: `Started inbox processing (${items.length} items)` });
    return renderChoicePrompt(first, session);
  },
};

export async function handleInboxWorkflowReply(input: string, context: ToolContext, workflow: ActiveWorkflow): Promise<string> {
  const session = workflow.draft as InboxProcessingSession;
  if (!session || !session.active) return 'No inbox processing session is active.';
  const item = currentItem(context, session);
  if (!item) {
    context.services.workflow.fail('current inbox item not found');
    return 'Inbox processing stopped because the current item could not be found.';
  }

  if (session.step === 'choose-disposition') {
    const disposition = normalizeDisposition(input);
    if (!disposition) {
      return `${renderChoicePrompt(item, session)}\n\nUnrecognized choice. Reply with action/project/note/append/event/idea/skip/quit.`;
    }
    if (disposition === 'quit') {
      context.services.workflow.cancel('user exited inbox processing');
      return cancelMessage(session);
    }
    if (disposition === 'skip') {
      return advanceQueue(context, { ...session, skippedCount: session.skippedCount + 1 });
    }
    if (disposition === 'project') {
      replaceSession(context, { ...session, step: 'collect-project-actions', draft: { disposition } });
      return `Create project: **${item.title}**\n\nReply with one or more next actions separated by semicolons.`;
    }
    if (disposition === 'note_append') {
      replaceSession(context, { ...session, step: 'select-note-target', draft: { disposition } });
      return 'Append to which note? Reply with the note title.';
    }
    if (disposition === 'event') {
      replaceSession(context, { ...session, step: 'collect-event-details', draft: { disposition } });
      return `Create event from **${item.title}**\n\nReply with the event start time in ISO format or natural language date text.`;
    }
    if (disposition === 'action') {
      const created = context.services.garden.create({ type: 'action', title: item.title, content: item.content ?? undefined });
      markProcessed(context, item);
      addProvenance(context, item, created.id);
      return `Created action: **${created.title}**\n\n${advanceQueue(context, { ...session, processedCount: session.processedCount + 1 })}`;
    }
    if (disposition === 'note') {
      const created = context.services.garden.create({ type: 'note', title: item.title, content: item.content ?? undefined });
      markProcessed(context, item);
      addProvenance(context, item, created.id);
      return `Created note: **${created.title}**\n\n${advanceQueue(context, { ...session, processedCount: session.processedCount + 1 })}`;
    }
    if (disposition === 'someday') {
      const created = context.services.garden.create({ type: 'action', title: item.title, content: item.content ?? undefined, status: 'someday' });
      markProcessed(context, item);
      addProvenance(context, item, created.id);
      return `Created someday item: **${created.title}**\n\n${advanceQueue(context, { ...session, processedCount: session.processedCount + 1 })}`;
    }
  }

  if (session.step === 'collect-project-actions') {
    if (['quit', 'exit'].includes(input.trim().toLowerCase())) {
      context.services.workflow.cancel('user exited inbox project branch');
      return cancelMessage(session);
    }
    const actionTitles = input.split(';').map(part => part.trim()).filter(Boolean);
    if (actionTitles.length === 0) return 'Please provide at least one next action, separated by semicolons if needed.';
    const project = context.services.garden.create({ type: 'project', title: item.title, content: item.content ?? undefined });
    for (const title of actionTitles) {
      const action = context.services.garden.create({ type: 'action', title });
      context.services.rels.add(action.id, project.id, 'belongs_to');
      addProvenance(context, item, action.id);
    }
    markProcessed(context, item);
    addProvenance(context, item, project.id);
    return `Created project: **${project.title}** with ${actionTitles.length} next action(s).\n\n${advanceQueue(context, { ...session, processedCount: session.processedCount + 1 })}`;
  }

  if (session.step === 'select-note-target') {
    const normalized = input.trim().toLowerCase();
    if (['quit', 'exit'].includes(normalized)) {
      context.services.workflow.cancel('user exited inbox note append branch');
      return cancelMessage(session);
    }
    if (normalized === 'skip') {
      return advanceQueue(context, { ...session, processedCount: session.processedCount + 1 });
    }
    const note = resolveRecordByTypeAndTitle(context, 'note', input.trim());
    if (!note || note.type !== 'note') {
      return 'Note not found. Reply with the exact note title, `skip`, or `quit`.';
    }
    const existing = note.content?.trim() ?? '';
    const appended = existing ? `${existing}\n- ${item.title}` : `- ${item.title}`;
    context.services.garden.update(note.id, { content: appended });
    markProcessed(context, item);
    addProvenance(context, item, note.id);
    return `Appended to note: **${note.title}**\n\n${advanceQueue(context, { ...session, processedCount: session.processedCount + 1 })}`;
  }

  if (session.step === 'collect-event-details') {
    if (['quit', 'exit'].includes(input.trim().toLowerCase())) {
      context.services.workflow.cancel('user exited inbox event branch');
      return cancelMessage(session);
    }
    const event = context.services.garden.create({ type: 'event', title: item.title, content: item.content ?? undefined, starts_at: input });
    markProcessed(context, item);
    addProvenance(context, item, event.id);
    return `Created event: **${event.title}**\n\n${advanceQueue(context, { ...session, processedCount: session.processedCount + 1 })}`;
  }

  return 'Inbox processing is in an unknown state.';
}
