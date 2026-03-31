import { randomUUID } from 'crypto';
import type { Agent } from '../agent/index.js';
import { handleCommand } from './command-handler.js';
import type { CommandRouter } from '../router/index.js';
import type { ServiceContainer } from '../services/index.js';
import type { AppMessage } from '../api/types/app.js';

export interface SubmitInteractionInput {
  text: string;
  source: 'cli' | 'signal' | 'mobile';
  threadId?: string;
  counterpart?: string;
}

export interface SubmitInteractionResult {
  threadId?: string;
  reply: string;
  messages?: AppMessage[];
}

export async function submitInteraction(
  input: SubmitInteractionInput,
  router: CommandRouter,
  agent: Agent,
  services: ServiceContainer,
): Promise<SubmitInteractionResult> {
  const text = input.text.trim();
  if (!text) {
    throw new Error('text is required');
  }

  if (input.source === 'mobile') {
    const threadId = input.threadId?.trim() || services.mobile.chat.getDefaultThreadId();
    const userMessage = services.mobile.chat.appendUserMessage(text, threadId);
    services.mobile.activity.record({ channel: 'mobile', direction: 'inbound', text });

    const result = await handleCommand(text, router, agent, services, {
      allowExit: false,
      stripMarkdown: false,
    });

    const assistantMessage = services.mobile.chat.appendAssistantMessage(result.reply, threadId);
    services.mobile.activity.record({ channel: 'mobile', direction: 'outbound', text: result.reply });

    return {
      threadId,
      reply: result.reply,
      messages: [
        {
          id: userMessage.id,
          threadId: userMessage.threadId,
          role: userMessage.role,
          format: userMessage.format,
          text: userMessage.text,
          createdAt: userMessage.createdAt,
          status: userMessage.status,
        },
        {
          id: assistantMessage.id,
          threadId: assistantMessage.threadId,
          role: assistantMessage.role,
          format: assistantMessage.format,
          text: assistantMessage.text,
          createdAt: assistantMessage.createdAt,
          status: assistantMessage.status,
        },
      ],
    };
  }

  const result = await handleCommand(text, router, agent, services, {
    allowExit: input.source === 'cli',
  });

  return {
    reply: result.reply,
  };
}

export function createSyntheticThreadId(prefix: string = 'interaction'): string {
  return `${prefix}-${randomUUID()}`;
}
