import { Tool } from './types.js';
import type { ToolContext } from './types.js';
import type { ActiveWorkflow } from '../services/workflow.js';
import { persistWorkflow, registerWorkflowTypes } from './workflow-registry.js';
import { resolveRecordByTypeAndTitle } from './record-resolution.js';
import type { GardenRecord, RelType } from '../garden/types.js';

const ATTACHMENT_TYPES = ['action', 'contact', 'event', 'media', 'note', 'project', 'tag'] as const;
type AttachmentType = typeof ATTACHMENT_TYPES[number];
type NoteWorkflowMode = 'create' | 'edit';
type NoteWorkflowStep = 'collect-content' | 'choose-attachment-types' | 'resolve-attachment' | 'ask-more-attachments';

interface NoteWorkflowSession {
  active: boolean;
  workflowId: string;
  mode: NoteWorkflowMode;
  noteId: string;
  step: NoteWorkflowStep;
  selectedAttachmentTypes: AttachmentType[];
  currentAttachmentTypeIndex: number;
  startedAt: string;
}

function getSession(workflow: ActiveWorkflow | null): NoteWorkflowSession | null {
  if (!workflow || (workflow.type !== 'note_create' && workflow.type !== 'note_edit')) return null;
  return workflow.draft as NoteWorkflowSession;
}

function buildWorkflow(session: NoteWorkflowSession, current?: ActiveWorkflow): ActiveWorkflow<NoteWorkflowSession> {
  return {
    id: current?.id ?? crypto.randomUUID(),
    type: session.mode === 'create' ? 'note_create' : 'note_edit',
    status: 'active',
    step: session.step,
    startedAt: current?.startedAt ?? session.startedAt,
    draft: session,
    targets: { primaryId: session.noteId },
  };
}

function replaceSession(context: ToolContext, session: NoteWorkflowSession): void {
  const workflow = buildWorkflow(session, context.services.workflow.getActive() ?? undefined);
  persistWorkflow(context, workflow, context.services.workflow.hasActive());
}

function getNote(context: ToolContext, session: NoteWorkflowSession): GardenRecord | null {
  const note = context.services.garden.get(session.noteId);
  if (!note || note.type !== 'note') return null;
  return note;
}

function relationshipForAttachment(type: AttachmentType): RelType {
  switch (type) {
    case 'project':
      return 'belongs_to';
    case 'tag':
      return 'tagged_with';
    case 'note':
      return 'references';
    default:
      return 'related_to';
  }
}

function renderAttachmentQuestion(): string {
  return [
    'Attach this note to any records?',
    '1. action',
    '2. contact',
    '3. event',
    '4. media',
    '5. note',
    '6. project',
    '7. tag',
    '',
    'Enter all that apply, separated by commas, or press Enter to skip.',
  ].join('\n');
}

function parseAttachmentSelection(input: string): AttachmentType[] {
  const normalized = input.trim().toLowerCase();
  if (!normalized) return [];

  const tokens = normalized.split(',').map((part) => part.trim()).filter(Boolean);
  const mapping: Record<string, AttachmentType> = {
    '1': 'action',
    action: 'action',
    '2': 'contact',
    contact: 'contact',
    '3': 'event',
    event: 'event',
    '4': 'media',
    media: 'media',
    '5': 'note',
    note: 'note',
    '6': 'project',
    project: 'project',
    '7': 'tag',
    tag: 'tag',
  };

  return Array.from(new Set(tokens.map((token) => mapping[token]).filter(Boolean))) as AttachmentType[];
}

function nextAttachmentPrompt(session: NoteWorkflowSession): string {
  const type = session.selectedAttachmentTypes[session.currentAttachmentTypeIndex];
  return `Which ${type} should this note attach to? Reply with the exact record title, or 'skip'.`;
}

function finish(context: ToolContext, session: NoteWorkflowSession): string {
  context.services.workflow.complete('note workflow completed');
  const note = getNote(context, session);
  const title = note?.title ?? 'note';
  return session.mode === 'create' ? `Created note: **${title}**` : `Updated note: **${title}**`;
}

export async function handleNoteWorkflowReply(input: string, context: ToolContext, workflow: ActiveWorkflow): Promise<string> {
  const session = getSession(workflow);
  if (!session) return 'No active note workflow.';

  const note = getNote(context, session);
  if (!note) {
    context.services.workflow.fail('target note not found');
    return 'Note workflow stopped because the target note could not be found.';
  }

  const normalized = input.trim().toLowerCase();
  if (normalized === 'quit' || normalized === 'exit') {
    context.services.workflow.cancel('user cancelled note workflow');
    return session.mode === 'create'
      ? `Stopped note creation for **${note.title}**.`
      : `Stopped note editing for **${note.title}**.`;
  }

  if (session.step === 'collect-content') {
    if (input.trim()) {
      const updated = context.services.garden.update(note.id, { content: input.trim() });
      if (updated) {
        context.services.rels.syncBacklinks(updated);
      }
    }

    replaceSession(context, {
      ...session,
      step: 'choose-attachment-types',
      selectedAttachmentTypes: [],
      currentAttachmentTypeIndex: 0,
    });
    return renderAttachmentQuestion();
  }

  if (session.step === 'choose-attachment-types') {
    const selected = parseAttachmentSelection(input);
    if (selected.length === 0) {
      return finish(context, session);
    }

    const nextSession: NoteWorkflowSession = {
      ...session,
      step: 'resolve-attachment',
      selectedAttachmentTypes: selected,
      currentAttachmentTypeIndex: 0,
    };
    replaceSession(context, nextSession);
    return nextAttachmentPrompt(nextSession);
  }

  if (session.step === 'resolve-attachment') {
    const type = session.selectedAttachmentTypes[session.currentAttachmentTypeIndex];
    if (!type) {
      replaceSession(context, { ...session, step: 'ask-more-attachments' });
      return 'Anything else to attach? Reply yes or no.';
    }

    if (normalized !== 'skip') {
      const target = resolveRecordByTypeAndTitle(context, type, input.trim());
      if (!target || target.type !== type) {
        return `${type} not found. Reply with the exact ${type} title, or 'skip'.`;
      }
      context.services.rels.add(note.id, target.id, relationshipForAttachment(type), {
        attached_via_note_workflow: true,
      });
    }

    const nextIndex = session.currentAttachmentTypeIndex + 1;
    if (nextIndex >= session.selectedAttachmentTypes.length) {
      replaceSession(context, { ...session, step: 'ask-more-attachments', currentAttachmentTypeIndex: nextIndex });
      return 'Anything else to attach? Reply yes or no.';
    }

    const nextSession: NoteWorkflowSession = { ...session, currentAttachmentTypeIndex: nextIndex };
    replaceSession(context, nextSession);
    return nextAttachmentPrompt(nextSession);
  }

  if (session.step === 'ask-more-attachments') {
    if (['yes', 'y'].includes(normalized)) {
      replaceSession(context, {
        ...session,
        step: 'choose-attachment-types',
        selectedAttachmentTypes: [],
        currentAttachmentTypeIndex: 0,
      });
      return renderAttachmentQuestion();
    }
    return finish(context, session);
  }

  return 'Note workflow is in an unknown state.';
}

export const createNoteWorkflow: Tool = {
  name: 'createNoteWorkflow',
  description: 'Create a note through a guided workflow',
  routing: {
    patterns: [/^(create|write|add|new) note\s+(.+)/i, /^note:\s+(.+)/i],
    keywords: {
      verbs: ['create', 'write', 'add', 'new'],
      nouns: ['note'],
    },
    priority: 79,
    intentClass: 'workflow_start',
  },
  parseArgs: (input) => {
    const title = input.replace(/^(create|write|add|new)\s*note\s+/i, '').replace(/^note:\s+/i, '').trim();
    return { title };
  },
  execute: async (args, context) => {
    registerWorkflowTypes(context);
    if (context.services.workflow.ensureActiveValid().ok && context.services.workflow.hasActive()) {
      const active = context.services.workflow.getActive();
      return `A workflow is already active (${active?.type}). Finish it or type quit first.`;
    }

    const title = String(args.title ?? '').trim();
    if (!title) return 'What should the note be called?';

    const note = context.services.garden.create({ type: 'note', title });
    const session: NoteWorkflowSession = {
      active: true,
      workflowId: crypto.randomUUID(),
      mode: 'create',
      noteId: note.id,
      step: 'collect-content',
      selectedAttachmentTypes: [],
      currentAttachmentTypeIndex: 0,
      startedAt: new Date().toISOString(),
    };

    const startResult = context.services.workflow.start(buildWorkflow(session));
    if (!startResult.ok) return startResult.message ?? 'Unable to start note workflow.';
    return `Created note shell: **${note.title}**\n\nEnter note content, or press Enter to leave it blank.`;
  },
};

export const editNoteWorkflow: Tool = {
  name: 'editNoteWorkflow',
  description: 'Edit a note through a guided workflow',
  routing: {
    patterns: [/^(edit|update|change) note\s+(.+)/i],
    keywords: {
      verbs: ['edit', 'update', 'change'],
      nouns: ['note'],
    },
    priority: 78,
    intentClass: 'workflow_start',
  },
  parseArgs: (input) => {
    const title = input.replace(/^(edit|update|change)\s*note\s+/i, '').trim();
    return { title };
  },
  execute: async (args, context) => {
    registerWorkflowTypes(context);
    if (context.services.workflow.ensureActiveValid().ok && context.services.workflow.hasActive()) {
      const active = context.services.workflow.getActive();
      return `A workflow is already active (${active?.type}). Finish it or type quit first.`;
    }

    const title = String(args.title ?? '').trim();
    const note = resolveRecordByTypeAndTitle(context, 'note', title);
    if (!note || note.type !== 'note') return 'Note not found.';

    const session: NoteWorkflowSession = {
      active: true,
      workflowId: crypto.randomUUID(),
      mode: 'edit',
      noteId: note.id,
      step: 'collect-content',
      selectedAttachmentTypes: [],
      currentAttachmentTypeIndex: 0,
      startedAt: new Date().toISOString(),
    };

    const startResult = context.services.workflow.start(buildWorkflow(session));
    if (!startResult.ok) return startResult.message ?? 'Unable to start note workflow.';
    return `Editing note: **${note.title}**\n\nEnter replacement content, or press Enter to keep the current content.`;
  },
};
