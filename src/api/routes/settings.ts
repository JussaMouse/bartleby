import { Router } from 'express';
import type { ServiceContainer } from '../../services/index.js';
import { sendOk } from '../utils.js';
import type { SettingsSummaryResponse } from '../types/app.js';

export function createSettingsRouter(services: ServiceContainer): Router {
  const router = Router();

  router.get('/settings/summary', (_req, res) => {
    const payload: SettingsSummaryResponse = {
      items: [
        {
          key: 'dashboard.host',
          value: services.config.dashboard.host,
          category: 'server',
        },
        {
          key: 'dashboard.port',
          value: String(services.config.dashboard.port),
          category: 'server',
        },
        {
          key: 'signal.enabled',
          value: services.config.signal.enabled ? 'enabled' : 'disabled',
          category: 'mobile',
        },
        {
          key: 'dashboard.api_token',
          value: services.config.dashboard.apiToken ? 'configured' : 'not configured',
          category: 'privacy',
        },
      ],
    };

    sendOk(res, payload);
  });

  return router;
}
