import { Router } from 'express';
import type { ServiceContainer } from '../../services/index.js';
import { sendOk } from '../utils.js';
import type { AppJob } from '../types/app.js';

function toAppJob(job: NonNullable<ReturnType<ServiceContainer['mobile']['jobs']['getJob']>>): AppJob {
  return {
    id: job.id,
    kind: job.kind,
    status: job.status,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    threadId: job.threadId,
    captureId: job.captureId,
    input: job.input,
    output: job.output,
    error: job.error,
  };
}

export function createJobRouter(services: ServiceContainer): Router {
  const router = Router();

  router.get('/jobs', (req, res) => {
    const kind = typeof req.query.kind === 'string' ? req.query.kind : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;

    const jobs = services.mobile.jobs.listJobs({
      kind: kind as any,
      status: status as any,
      limit: 50,
    }).map(toAppJob);

    sendOk(res, { jobs });
  });

  router.post('/voice/messages', (req, res) => {
    const threadId = typeof req.body?.threadId === 'string' && req.body.threadId.trim()
      ? req.body.threadId.trim()
      : services.mobile.chat.getDefaultThreadId();

    const job = services.mobile.voice.createVoiceJob(threadId);
    sendOk(res, { accepted: true, job: toAppJob(job) });
  });

  router.get('/jobs/:jobId', (req, res) => {
    const job = services.mobile.jobs.getJob(req.params.jobId);
    if (!job) {
      res.status(404).json({ ok: false, error: { code: 'job_not_found', message: 'job not found' } });
      return;
    }

    sendOk(res, toAppJob(job));
  });

  return router;
}
