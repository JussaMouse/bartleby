import { Router } from 'express';
import type { GardenRecord } from '../../garden/types.js';
import type { ServiceContainer } from '../../services/index.js';
import { sendOk } from '../utils.js';
import type { MobileFeedResponse } from '../types/app.js';

export function createFeedRouter(services: ServiceContainer): Router {
  const router = Router();

  router.get('/me/feed', (_req, res) => {
    const inboxItems = services.garden.getByType('item').slice(0, 5);
    const nextActions = services.garden.getByType('action', { status: 'active' }).slice(0, 5);
    const recentActivity = services.runtimeActivity.list(10);
    const jobs = services.mobile.voice.listJobs(5);

    const payload: MobileFeedResponse = {
      generatedAt: new Date().toISOString(),
      nav: [
        { id: 'home', label: 'Home' },
        { id: 'chat', label: 'Chat', badge: services.mobile.chat.listThreads().reduce((sum, thread) => sum + thread.unreadCount, 0) || undefined },
        { id: 'lists', label: 'Lists', badge: nextActions.length },
        { id: 'capture', label: 'Capture' },
        { id: 'activity', label: 'Activity', badge: recentActivity.length || undefined },
        { id: 'settings', label: 'Settings' },
      ],
      cards: [
        {
          id: 'summary-today',
          type: 'summary',
          title: 'Today',
          body: `You have ${nextActions.length} visible actions and ${inboxItems.length} inbox items in the mobile summary.`,
        },
        {
          id: 'tasks-next',
          type: 'task-list',
          title: 'Next Actions',
          body: nextActions.slice(0, 3).map((item: GardenRecord) => item.title).join(' • ') || 'No next actions.',
          meta: { count: nextActions.length },
        },
        {
          id: 'inbox-summary',
          type: 'task-list',
          title: 'Inbox',
          body: inboxItems.slice(0, 3).map((item: GardenRecord) => item.title).join(' • ') || 'Inbox empty.',
          meta: { count: inboxItems.length },
        },
        {
          id: 'activity-summary',
          type: 'job',
          title: 'Recent Activity',
          body: recentActivity[0]?.text || 'No recent mobile activity yet.',
          meta: { count: recentActivity.length },
        },
        {
          id: 'voice-summary',
          type: 'job',
          title: 'Voice Jobs',
          body: String(jobs[0]?.output?.replyText ?? jobs[0]?.output?.transcript ?? 'No voice jobs yet.'),
          meta: { count: jobs.length },
        },
      ],
    };

    sendOk(res, payload);
  });

  return router;
}
