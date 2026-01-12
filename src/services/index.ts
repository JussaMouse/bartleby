// src/services/index.ts
import { Config } from '../config.js';
import { GardenService } from './garden.js';
import { CalendarService } from './calendar.js';
import { PersonalContextService } from './personal-context.js';
import { LLMService } from './llm.js';
import { EmbeddingService } from './embeddings.js';
import { VectorService } from './vectors.js';
import { ShedService } from './shed.js';
import { SchedulerService } from './scheduler.js';
import { WeatherService } from './weather.js';
import { SignalService } from './signal.js';
import { info, debug } from '../utils/logger.js';

export interface ServiceContainer {
  // Config (source of truth)
  config: Config;
  
  // Core data
  garden: GardenService;
  shed: ShedService;
  calendar: CalendarService;
  
  // Personal Context - Bartleby's memory of you
  context: PersonalContextService;
  
  // Infrastructure
  llm: LLMService;
  embeddings: EmbeddingService;
  vectors: VectorService;
  scheduler: SchedulerService;
  
  // Optional integrations
  weather: WeatherService;
  signal: SignalService;
}

export async function initServices(config: Config): Promise<ServiceContainer> {
  info('Initializing services...');

  // Create services (order matters for dependencies)
  const llm = new LLMService(config);
  const embeddings = new EmbeddingService(config);
  const vectors = new VectorService(config);
  const signal = new SignalService(config);
  const weather = new WeatherService(config);
  
  // Initialize infrastructure first
  await llm.initialize();
  await embeddings.initialize();
  await vectors.initialize();
  await signal.initialize();
  await weather.initialize();

  // Create data services (depend on infrastructure)
  const garden = new GardenService(config);
  const calendar = new CalendarService(config);
  const context = new PersonalContextService(config);
  const shed = new ShedService(config, embeddings, vectors, llm);
  const scheduler = new SchedulerService(config, signal);

  // Initialize data services
  await garden.initialize();
  await calendar.initialize();
  await context.initialize();
  await shed.initialize();
  await scheduler.initialize();

  // Start scheduler background loop
  scheduler.start();

  info('All services initialized');

  return {
    config,
    garden,
    shed,
    calendar,
    context,
    llm,
    embeddings,
    vectors,
    scheduler,
    weather,
    signal,
  };
}

export function closeServices(services: ServiceContainer): void {
  info('Closing services...');
  services.scheduler.close();
  services.shed.close();
  services.vectors.close();
  services.garden.close();
  services.calendar.close();
  services.context.close();
  services.llm.close();
  services.embeddings.close();
  services.weather.close();
  services.signal.close();
}

/**
 * Build a session opener message based on current state.
 * This is proactive behavior that happens at startup.
 */
export function buildSessionOpener(services: ServiceContainer): string | null {
  const insights: string[] = [];

  // 1. Pending follow-ups from Personal Context
  const followups = services.context.getPendingFollowups();
  if (followups.length > 0) {
    insights.push(`📝 Pending: "${followups[0].text}"`);
  }

  // 2. Stale inbox items
  try {
    const stale = services.garden.getStaleInboxItems(2);
    if (stale.length > 0) {
      insights.push(`📥 ${stale.length} inbox item(s) waiting > 2 days`);
    }
  } catch (err) {
    debug('Session opener: stale inbox check failed', { error: String(err) });
  }

  // 3. Overdue tasks
  try {
    const overdue = services.garden.getOverdueTasks();
    if (overdue.length > 0) {
      insights.push(`⚠️ ${overdue.length} overdue task(s)`);
    }
  } catch (err) {
    debug('Session opener: overdue check failed', { error: String(err) });
  }

  // 4. Today's events
  try {
    const todayEvents = services.calendar.getForDay(new Date());
    if (todayEvents.length > 0) {
      insights.push(`📅 ${todayEvents.length} event(s) today`);
    }
  } catch (err) {
    debug('Session opener: calendar check failed', { error: String(err) });
  }

  // 5. Last session context
  const lastSession = services.context.getLastSession();
  if (lastSession) {
    const hoursSince = (Date.now() - new Date(lastSession.timestamp).getTime()) / (1000 * 60 * 60);
    if (hoursSince < 24 && lastSession.summary) {
      const summary = lastSession.summary.slice(0, 50);
      insights.push(`💭 Last: "${summary}..."`);
    }
  }

  // 6. Task completion rate (gentle nudge if struggling)
  try {
    const stats = services.garden.getTaskStats(7);
    if (stats.added > 5 && stats.completed / stats.added < 0.3) {
      insights.push(`📊 ${stats.completed}/${stats.added} tasks completed this week`);
    }
  } catch (err) {
    debug('Session opener: task stats failed', { error: String(err) });
  }

  return insights.length > 0 ? insights.join('\n') : null;
}

// Re-export types
export { GardenService, GardenRecord, RecordType, RecordStatus, TaskFilters } from './garden.js';
export { CalendarService, CalendarEvent } from './calendar.js';
export { PersonalContextService, Episode, UserFact } from './personal-context.js';
export { LLMService, Tier, Complexity } from './llm.js';
export { EmbeddingService } from './embeddings.js';
export { VectorService, VectorMetadata } from './vectors.js';
export { ShedService, ShedSource, ShedChunk } from './shed.js';
export { SchedulerService, ScheduledTask } from './scheduler.js';
export { WeatherService, WeatherData } from './weather.js';
export { SignalService } from './signal.js';
