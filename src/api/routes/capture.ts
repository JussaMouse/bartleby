import { Router } from 'express';
import type { ServiceContainer } from '../../services/index.js';
import { sendOk } from '../utils.js';
import type { CaptureResponse } from '../types/app.js';

export function createCaptureRouter(services: ServiceContainer): Router {
  const router = Router();

  router.post('/capture', (req, res) => {
    const kind = req.body?.kind === 'voice' ? 'voice' : 'text';
    const text = typeof req.body?.text === 'string' ? req.body.text : undefined;
    const threadId = typeof req.body?.threadId === 'string' ? req.body.threadId : undefined;

    const result = services.mobile.capture.handle({ kind, text, threadId });
    const payload: CaptureResponse = {
      captureId: result.captureId,
      kind: result.kind,
      acceptedAt: result.acceptedAt,
      threadId: result.threadId,
      messageId: result.messageId,
      jobId: result.jobId,
    };

    sendOk(res, payload);
  });

  return router;
}
