export interface ActiveWorkflow<TDraft = unknown> {
  id: string;
  type: string;
  status: 'active' | 'completed' | 'cancelled' | 'failed';
  step: string;
  startedAt: string;
  draft: TDraft;
  targets?: {
    primaryId?: string;
    relatedIds?: string[];
  };
  meta?: Record<string, unknown>;
}

export interface WorkflowValidationResult {
  ok: boolean;
  reason?: string;
}

export interface WorkflowRegistration {
  type: string;
  validate?: (workflow: ActiveWorkflow) => WorkflowValidationResult;
}

export interface WorkflowTransitionResult {
  ok: boolean;
  workflow?: ActiveWorkflow | null;
  message?: string;
  reason?: string;
}

type WorkflowStatus = ActiveWorkflow['status'];

interface WorkflowLifecycleEvent {
  kind: 'started' | 'advanced' | 'completed' | 'cancelled' | 'failed' | 'stale_cleared' | 'cleared';
  workflowType?: string;
  workflowId?: string;
  step?: string;
  reason?: string;
  at: string;
}

function missingField(field: string): WorkflowValidationResult {
  return { ok: false, reason: `missing ${field}` };
}

export class WorkflowService {
  private activeWorkflow: ActiveWorkflow | null = null;
  private registrations = new Map<string, WorkflowRegistration>();
  private lifecycleLog: WorkflowLifecycleEvent[] = [];

  register(registration: WorkflowRegistration): void {
    this.registrations.set(registration.type, registration);
  }

  getRegisteredTypes(): string[] {
    return Array.from(this.registrations.keys()).sort();
  }

  getActive(): ActiveWorkflow | null {
    return this.activeWorkflow;
  }

  hasActive(): boolean {
    return !!this.activeWorkflow;
  }

  peekLifecycleLog(limit = 50): WorkflowLifecycleEvent[] {
    return this.lifecycleLog.slice(-limit);
  }

  validate(workflow: ActiveWorkflow | null = this.activeWorkflow): WorkflowValidationResult {
    if (!workflow) return { ok: false, reason: 'no active workflow' };
    if (!workflow.id) return missingField('workflow.id');
    if (!workflow.type) return missingField('workflow.type');
    if (!workflow.step) return missingField('workflow.step');
    if (!workflow.startedAt) return missingField('workflow.startedAt');
    if (workflow.status !== 'active') {
      return { ok: false, reason: `workflow status is ${workflow.status}` };
    }

    const registration = this.registrations.get(workflow.type);
    if (!registration) {
      return { ok: false, reason: `unknown workflow type: ${workflow.type}` };
    }

    if (registration.validate) {
      return registration.validate(workflow);
    }

    return { ok: true };
  }

  ensureActiveValid(): WorkflowTransitionResult {
    const workflow = this.activeWorkflow;
    const validation = this.validate(workflow);
    if (validation.ok) {
      return { ok: true, workflow };
    }

    const staleWorkflow = workflow;
    this.activeWorkflow = null;
    this.recordLifecycle('stale_cleared', staleWorkflow, validation.reason);
    return {
      ok: false,
      workflow: null,
      reason: validation.reason,
      message: staleWorkflow
        ? `Cleared stale workflow ${staleWorkflow.type}: ${validation.reason}`
        : 'No active workflow.',
    };
  }

  start(workflow: ActiveWorkflow): WorkflowTransitionResult {
    if (this.activeWorkflow) {
      const activeCheck = this.ensureActiveValid();
      if (activeCheck.ok && this.activeWorkflow) {
      return {
        ok: false,
        workflow: this.activeWorkflow,
        reason: 'workflow already active',
        message: `A workflow is already active (${this.activeWorkflow.type}). Finish it or type quit first.`,
      };
      }
    }

    const validation = this.validate(workflow);
    if (!validation.ok) {
      return { ok: false, reason: validation.reason, message: `Cannot start workflow: ${validation.reason}` };
    }

    this.activeWorkflow = workflow;
    this.recordLifecycle('started', workflow);
    return { ok: true, workflow };
  }

  advance(workflow: ActiveWorkflow): WorkflowTransitionResult {
    const validation = this.validate(workflow);
    if (!validation.ok) {
      return { ok: false, reason: validation.reason, message: `Cannot advance workflow: ${validation.reason}` };
    }

    this.activeWorkflow = workflow;
    this.recordLifecycle('advanced', workflow);
    return { ok: true, workflow };
  }

  replace(workflow: ActiveWorkflow): WorkflowTransitionResult {
    return this.advance(workflow);
  }

  complete(reason?: string): WorkflowTransitionResult {
    return this.finishWithStatus('completed', 'completed', reason);
  }

  cancel(reason?: string): WorkflowTransitionResult {
    return this.finishWithStatus('cancelled', 'cancelled', reason);
  }

  fail(reason?: string): WorkflowTransitionResult {
    return this.finishWithStatus('failed', 'failed', reason);
  }

  clear(reason?: string): WorkflowTransitionResult {
    const workflow = this.activeWorkflow;
    this.activeWorkflow = null;
    this.recordLifecycle('cleared', workflow ?? undefined, reason);
    return { ok: true, workflow: null, reason };
  }

  private finishWithStatus(status: WorkflowStatus, kind: WorkflowLifecycleEvent['kind'], reason?: string): WorkflowTransitionResult {
    const workflow = this.activeWorkflow;
    if (!workflow) {
      return { ok: false, workflow: null, reason: 'no active workflow', message: 'No active workflow.' };
    }

    const finishedWorkflow: ActiveWorkflow = {
      ...workflow,
      status,
    };

    this.activeWorkflow = null;
    this.recordLifecycle(kind, finishedWorkflow, reason);
    return { ok: true, workflow: finishedWorkflow, reason };
  }

  private recordLifecycle(kind: WorkflowLifecycleEvent['kind'], workflow?: ActiveWorkflow | null, reason?: string): void {
    this.lifecycleLog.push({
      kind,
      workflowType: workflow?.type,
      workflowId: workflow?.id,
      step: workflow?.step,
      reason,
      at: new Date().toISOString(),
    });

    if (this.lifecycleLog.length > 200) {
      this.lifecycleLog = this.lifecycleLog.slice(-200);
    }
  }
}
