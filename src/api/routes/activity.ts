import { Router } from 'express';
import type { ServiceContainer } from '../../services/index.js';
import { sendOk } from '../utils.js';
import type { ActivityResponse } from '../types/app.js';

export function createActivityRouter(services: ServiceContainer): Router {
  const router = Router();

  router.get('/activity', (_req, res) => {
    const payload: ActivityResponse = {
      generatedAt: new Date().toISOString(),
      items: services.runtimeActivity.list(25),
    };

    sendOk(res, payload);
  });

  return router;
}
