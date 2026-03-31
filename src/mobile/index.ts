import type { Database as DB } from 'better-sqlite3';
import { MobileActivityService } from './activity-service.js';
import type { RuntimeActivityService } from '../services/runtime-activity.js';
import { MobileChatService } from './chat-service.js';
import { CaptureService } from './capture-service.js';
import { AppEventService } from './events.js';
import { AppJobService } from './job-service.js';
import { initializeMobilePersistence } from './persistence.js';
import { MobileSessionService } from './session-service.js';
import { MobileVoiceOrchestrator } from './voice-orchestrator.js';

export interface MobileServices {
  session: MobileSessionService;
  chat: MobileChatService;
  activity: MobileActivityService;
  events: AppEventService;
  jobs: AppJobService;
  voice: MobileVoiceOrchestrator;
  capture: CaptureService;
}

export function initMobileServices(db: DB, runtimeActivity?: RuntimeActivityService): MobileServices {
  initializeMobilePersistence(db);

  const session = new MobileSessionService();
  const chat = new MobileChatService(db);
  const activity = runtimeActivity as MobileActivityService ?? new MobileActivityService();
  const events = new AppEventService(db);
  const jobs = new AppJobService(db);
  const voice = new MobileVoiceOrchestrator(jobs, chat, activity, events, session);
  const capture = new CaptureService(chat, voice, activity, events, session);

  return { session, chat, activity, events, jobs, voice, capture };
}
