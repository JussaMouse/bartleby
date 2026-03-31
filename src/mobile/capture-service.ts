import { randomUUID } from 'crypto';
import { AppEventService } from './events.js';
import { MobileActivityService } from './activity-service.js';
import { MobileChatService } from './chat-service.js';
import { MobileVoiceOrchestrator } from './voice-orchestrator.js';
import { MobileSessionService } from './session-service.js';

export type CaptureKind = 'text' | 'voice';

export interface CaptureRequest {
  kind: CaptureKind;
  text?: string;
  threadId?: string;
}

export interface CaptureResult {
  captureId: string;
  kind: CaptureKind;
  acceptedAt: string;
  threadId: string;
  messageId?: string;
  jobId?: string;
}

export class CaptureService {
  constructor(
    private chat: MobileChatService,
    private voice: MobileVoiceOrchestrator,
    private activity: MobileActivityService,
    private events: AppEventService,
    private session: MobileSessionService,
  ) {}

  handle(request: CaptureRequest): CaptureResult {
    const captureId = randomUUID();
    const acceptedAt = new Date().toISOString();
    const threadId = request.threadId?.trim() || this.chat.getDefaultThreadId();
    this.session.syncActiveThread(threadId);

    this.events.emit('capture.received', {
      captureId,
      kind: request.kind,
      threadId,
    });

    if (request.kind === 'text') {
      const text = request.text?.trim();
      if (!text) {
        throw new Error('text capture requires text');
      }

      const userMessage = this.chat.appendUserMessage(text, threadId);
      this.activity.record({ channel: 'mobile', direction: 'inbound', text: `Capture received: ${text}` });
      this.events.emit('capture.accepted', { captureId, kind: 'text', threadId, messageId: userMessage.id });
      this.events.emit('message.created', { captureId, threadId, messageId: userMessage.id, role: 'user' });

      const reply = this.chat.appendAssistantMessage(`Captured for Bartleby: ${text}`, threadId);
      this.activity.record({ channel: 'mobile', direction: 'outbound', text: reply.text });
      this.events.emit('message.created', { captureId, threadId, messageId: reply.id, role: 'assistant' });

      return {
        captureId,
        kind: 'text',
        acceptedAt,
        threadId,
        messageId: userMessage.id,
      };
    }

    const job = this.voice.createVoiceJob(threadId, captureId);
    this.activity.record({ channel: 'mobile', direction: 'system', text: 'Voice capture accepted.' });
    this.events.emit('capture.accepted', { captureId, kind: 'voice', threadId, jobId: job.id });

    return {
      captureId,
      kind: 'voice',
      acceptedAt,
      threadId,
      jobId: job.id,
    };
  }
}
