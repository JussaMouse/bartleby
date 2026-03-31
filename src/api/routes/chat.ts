import { Router } from 'express';
import type { ServiceContainer } from '../../services/index.js';
import type { CommandRouter } from '../../router/index.js';
import type { Agent } from '../../agent/index.js';
import { sendOk } from '../utils.js';
import { submitInteraction } from '../../app/interaction-service.js';
import type { AppMessage, AppThreadSummary } from '../types/app.js';

export function createChatRouter(services: ServiceContainer, routerService: CommandRouter, agent: Agent): Router {
  const router = Router();

  router.get('/chat/threads', (_req, res) => {
    const threads: AppThreadSummary[] = services.mobile.chat.listThreads().map((thread) => ({
      id: thread.id,
      title: thread.title,
      lastMessagePreview: services.mobile.chat.getMessages(thread.id).slice(-1)[0]?.text ?? '',
      updatedAt: thread.updatedAt,
      unreadCount: thread.unreadCount,
    }));
    sendOk(res, { threads });
  });

  router.get('/chat/threads/:threadId/messages', (req, res) => {
    const messages: AppMessage[] = services.mobile.chat.getMessages(req.params.threadId).map((message) => ({
      id: message.id,
      threadId: message.threadId,
      role: message.role,
      format: message.format,
      text: message.text,
      createdAt: message.createdAt,
      status: message.status,
    }));
    sendOk(res, { threadId: req.params.threadId, messages });
  });

  router.post('/chat/messages', async (req, res) => {
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    const threadId = typeof req.body?.threadId === 'string' && req.body.threadId.trim()
      ? req.body.threadId.trim()
      : services.mobile.chat.getDefaultThreadId();

    if (!text) {
      res.status(400).json({ ok: false, error: { code: 'invalid_message', message: 'text is required' } });
      return;
    }

    const result = await submitInteraction({
      text,
      source: 'mobile',
      threadId,
    }, routerService, agent, services);

    sendOk(res, { accepted: true, threadId: result.threadId ?? threadId, messages: result.messages ?? [] });
  });

  return router;
}
