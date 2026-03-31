import { Router } from 'express';
import type { ServiceContainer } from '../../services/index.js';
import { sendOk } from '../utils.js';
import type { AppEventListResponse } from '../types/app.js';

export function createEventsRouter(services: ServiceContainer): Router {
  const router = Router();

  router.get('/events', (_req, res) => {
    const payload: AppEventListResponse = {
      items: services.mobile.events.list(50).map((event) => ({
        id: event.id,
        type: event.type,
        timestamp: event.timestamp,
        payload: event.payload,
      })),
    };

    sendOk(res, payload);
  });

  return router;
}
