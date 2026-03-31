import type { Response } from 'express';
import type { ApiErrorBody } from './types/app.js';

export function sendError(
  res: Response,
  status: number,
  code: string,
  message: string,
  details?: unknown,
): void {
  const body: ApiErrorBody = {
    ok: false,
    error: { code, message, details },
  };
  res.status(status).json(body);
}
