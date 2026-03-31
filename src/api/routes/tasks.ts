import { Router } from 'express';
import type { GardenRecord } from '../../garden/types.js';
import type { ServiceContainer } from '../../services/index.js';
import { sendOk } from '../utils.js';
import type { TaskListItem, TaskListResponse } from '../types/app.js';

function mapAction(record: GardenRecord): TaskListItem {
  return {
    id: String(record.id),
    title: record.title,
    context: record.context ?? null,
    dueDate: record.due_date ?? null,
    status: record.status ?? 'active',
  };
}

function mapInboxItem(record: GardenRecord): TaskListItem {
  return {
    id: String(record.id),
    title: record.title,
    context: null,
    dueDate: null,
    status: record.status ?? 'processed',
  };
}

export function createTaskRouter(services: ServiceContainer): Router {
  const router = Router();

  router.get('/tasks/next', (_req, res) => {
    const items = services.garden.getByType('action', { status: 'active' }).slice(0, 25).map(mapAction);
    const payload: TaskListResponse = { title: 'Next Actions', items };
    sendOk(res, payload);
  });

  router.get('/tasks/inbox', (_req, res) => {
    const items = services.garden.getByType('item').slice(0, 25).map(mapInboxItem);
    const payload: TaskListResponse = { title: 'Inbox', items };
    sendOk(res, payload);
  });

  return router;
}
