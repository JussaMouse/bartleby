import { randomUUID } from 'crypto';
import type { Request, Response } from 'express';
import type { ApiRequestContext, ApiSuccess } from './types/app.js';

export function buildRequestContext(req: Request): ApiRequestContext {
  return {
    requestId: randomUUID(),
    deviceId: getSingleHeader(req, 'x-bartleby-device-id'),
    sessionId: getSingleHeader(req, 'x-bartleby-session-id'),
  };
}

export function sendOk<T>(res: Response, data: T): void {
  const body: ApiSuccess<T> = { ok: true, data };
  res.json(body);
}

function getSingleHeader(req: Request, name: string): string | null {
  const value = req.header(name);
  return value && value.trim().length > 0 ? value.trim() : null;
}
