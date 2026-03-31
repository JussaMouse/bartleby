import { Router } from 'express';
import { sendOk } from '../utils.js';
import type { AppHealth } from '../types/app.js';

export function createHealthRouter(): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    const payload: AppHealth = {
      service: 'bartleby-app-api',
      version: 'v1',
      status: 'ok',
      timestamp: new Date().toISOString(),
    };

    sendOk(res, payload);
  });

  return router;
}
