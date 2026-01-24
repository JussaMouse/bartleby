// src/services/index.ts
import { Config } from '../config.js';
import { GardenService } from './garden.js';
import { CalendarService } from './calendar.js';
import { ContextService } from './context.js';
import { PresenceService } from './presence.js';
import { LLMService } from './llm.js';
import { EmbeddingService } from './embeddings.js';
import { VectorService } from './vectors.js';
import { ShedService } from './shed.js';
import { SchedulerService } from './scheduler.js';
import { WeatherService } from './weather.js';
import { SignalService } from './signal.js';
import { OCRService } from './ocr.js';
import { DataService } from './data.js';
import { info } from '../utils/logger.js';

export interface ServiceContainer {
  // Config (source of truth)
  config: Config;
  
  // Core data
  garden: GardenService;
  shed: ShedService;
  calendar: CalendarService;
  data: DataService;
  
  // Context - Bartleby's memory of you
  context: ContextService;
  
  // Presence - Bartleby's initiative layer (decides when to speak unprompted)
  presence: PresenceService;
  
  // Infrastructure
  llm: LLMService;
  embeddings: EmbeddingService;
  vectors: VectorService;
  scheduler: SchedulerService;
  
  // Optional integrations
  weather: WeatherService;
  signal: SignalService;
  ocr: OCRService;
}

export async function initServices(config: Config): Promise<ServiceContainer> {
  info('Initializing services...');

  // Create services (order matters for dependencies)
  const llm = new LLMService(config);
  const embeddings = new EmbeddingService(config);
  const vectors = new VectorService(config);
  const signal = new SignalService(config);
  const weather = new WeatherService(config);
  const ocr = new OCRService(config);
  
  // Initialize infrastructure first
  await llm.initialize();
  await embeddings.initialize();
  await vectors.initialize();
  await signal.initialize();
  await weather.initialize();
  await ocr.initialize();

  // Create data services (depend on infrastructure)
  const garden = new GardenService(config);
  const calendar = new CalendarService(config);
  const context = new ContextService(config);
  const shed = new ShedService(config, embeddings, vectors, llm);
  const scheduler = new SchedulerService(config, signal);
  const data = new DataService(config);

  // Initialize data services
  await garden.initialize();
  await calendar.initialize();
  await context.initialize();
  await shed.initialize();
  await scheduler.initialize();

  // Wire up calendar to services that need temporal index
  garden.setCalendar(calendar);
  scheduler.setCalendar(calendar);
  garden.setScheduler(scheduler);

  // Reconcile calendar temporal index with source services
  const gardenTasks = garden.getTasksWithDueDates().map(t => ({
    id: t.id,
    title: t.title,
    due_date: t.due_date!,
  }));
  const schedulerTasks = scheduler.list().map(t => ({
    id: t.id,
    actionPayload: t.actionPayload as string,
    nextRun: t.nextRun,
    scheduleType: t.scheduleType,
  }));
  await calendar.reconcile(gardenTasks, schedulerTasks);

  // Create Presence service (depends on context, garden, calendar, weather)
  const presence = new PresenceService(config, context, garden, calendar, weather);

  // Wire up scheduler to presence for scheduled moments
  scheduler.setPresence(presence);

  // Start scheduler background loop
  scheduler.start();

  info('All services initialized');

  return {
    config,
    garden,
    shed,
    calendar,
    data,
    context,
    presence,
    llm,
    embeddings,
    vectors,
    scheduler,
    weather,
    signal,
    ocr,
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
  services.data.close();
  services.llm.close();
  services.embeddings.close();
  services.weather.close();
  services.signal.close();
}

// Re-export types
export { GardenService, GardenRecord, RecordType, RecordStatus, TaskFilters } from './garden.js';
export { CalendarService, CalendarEntry, CalendarEvent, EntryType, SourceType } from './calendar.js';
export { ContextService, Episode, UserFact } from './context.js';
export { PresenceService, PresenceConfig, MomentType } from './presence.js';
export { LLMService, Tier, Complexity } from './llm.js';
export { EmbeddingService } from './embeddings.js';
export { VectorService, VectorMetadata } from './vectors.js';
export { ShedService, ShedSource, ShedChunk } from './shed.js';
export { SchedulerService, ScheduledTask } from './scheduler.js';
export { WeatherService, WeatherData, ForecastDay } from './weather.js';
export { SignalService } from './signal.js';
export { OCRService } from './ocr.js';
export { DataService, ImportResult, QueryResult, ExportResult, TableInfo, ColumnInfo } from './data.js';
