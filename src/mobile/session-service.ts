import type { MobileSessionState } from './types.js';

export class MobileSessionService {
  private state: MobileSessionState = {
    mode: 'home',
    activeThreadId: null,
    pendingJobIds: [],
  };

  getState(): MobileSessionState {
    return this.state;
  }

  setMode(mode: MobileSessionState['mode']): void {
    this.state = { ...this.state, mode };
  }

  setActiveThread(threadId: string | null): void {
    this.state = { ...this.state, activeThreadId: threadId };
  }

  addPendingJob(jobId: string): void {
    this.state = {
      ...this.state,
      pendingJobIds: Array.from(new Set([...this.state.pendingJobIds, jobId])),
    };
  }

  removePendingJob(jobId: string): void {
    this.state = {
      ...this.state,
      pendingJobIds: this.state.pendingJobIds.filter((id) => id !== jobId),
    };
  }

  syncActiveThread(threadId: string | null): void {
    this.setActiveThread(threadId);
    if (threadId) {
      this.setMode('chat');
    }
  }
}
