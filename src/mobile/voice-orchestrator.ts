import type { AppJobService } from './job-service.js';
import { MobileChatService } from './chat-service.js';
import { MobileSessionService } from './session-service.js';
import { MobileActivityService } from './activity-service.js';
import { AppEventService } from './events.js';

export class MobileVoiceOrchestrator {
  constructor(
    private jobs: AppJobService,
    private chat: MobileChatService,
    private activity: MobileActivityService,
    private events: AppEventService,
    private session: MobileSessionService,
  ) {}

  createVoiceJob(threadId = this.chat.getDefaultThreadId(), captureId?: string) {
    this.session.syncActiveThread(threadId);

    const job = this.jobs.createJob({
      kind: 'voice_transcription',
      threadId,
      captureId,
      input: { transport: 'mobile', mode: 'async' },
    });

    this.session.addPendingJob(job.id);
    this.activity.record({ channel: 'mobile', direction: 'system', text: 'Voice job queued.' });
    this.events.emit('job.queued', { jobId: job.id, captureId, threadId, kind: job.kind });
    this.advanceJob(job.id);
    return this.jobs.getJob(job.id)!;
  }

  getJob(id: string) {
    return this.jobs.getJob(id);
  }

  listJobs(limit = 20) {
    return this.jobs.listJobs({ limit });
  }

  private advanceJob(id: string): void {
    const processing = this.jobs.updateJob(id, {
      status: 'processing',
      output: { transcript: 'Placeholder transcript from queued mobile voice note.' },
    });
    if (!processing) return;

    this.activity.record({ channel: 'mobile', direction: 'system', text: 'Voice job processing started.' });
    this.events.emit('job.processing', { jobId: processing.id, captureId: processing.captureId, threadId: processing.threadId, kind: processing.kind });

    const transcript = String(processing.output?.transcript ?? '');
    const reply = 'I transcribed your voice note and I am ready to turn this into a task, note, or reply.';

    const completed = this.jobs.updateJob(id, {
      status: 'completed',
      output: { transcript, replyText: reply },
    });
    if (!completed) return;

    if (completed.threadId) {
      const userMessage = this.chat.appendUserMessage(transcript, completed.threadId);
      const assistantMessage = this.chat.appendAssistantMessage(reply, completed.threadId, 'transcript');
      this.events.emit('message.created', { jobId: completed.id, captureId: completed.captureId, threadId: completed.threadId, messageId: userMessage.id, role: 'user' });
      this.events.emit('message.created', { jobId: completed.id, captureId: completed.captureId, threadId: completed.threadId, messageId: assistantMessage.id, role: 'assistant' });
    }

    this.session.removePendingJob(id);
    this.activity.record({ channel: 'mobile', direction: 'outbound', text: 'Voice job completed with a reply.' });
    this.events.emit('job.completed', { jobId: completed.id, captureId: completed.captureId, threadId: completed.threadId, kind: completed.kind });
  }
}
