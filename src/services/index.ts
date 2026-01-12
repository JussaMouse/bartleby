// src/services/index.ts
import { Config } from '../config.js';
import { GardenService } from './garden.js';
import { CalendarService } from './calendar.js';
import { PersonalContextService } from './personal-context.js';
import { PresenceService } from './presence.js';
import { LLMService } from './llm.js';
import { EmbeddingService } from './embeddings.js';
import { VectorService } from './vectors.js';
import { ShedService } from './shed.js';
import { SchedulerService } from './scheduler.js';
import { WeatherService } from './weather.js';
import { SignalService } from './signal.js';
import { info } from '../utils/logger.js';

export interface ServiceContainer {
  // Config (source of truth)
  config: Config;
  
  // Core data
  garden: GardenService;
  shed: ShedService;
  calendar: CalendarService;
  
  // Personal Context - Bartleby's memory of you
  context: PersonalContextService;
  
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

  // Create Presence service (depends on context, garden, calendar)
  const presence = new PresenceService(config, context, garden, calendar);

  // Start scheduler background loop
  scheduler.start();

  info('All services initialized');

  return {
    config,
    garden,
    shed,
    calendar,
    context,
    presence,
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

// Re-export types
export { GardenService, GardenRecord, RecordType, RecordStatus, TaskFilters } from './garden.js';
export { CalendarService, CalendarEvent } from './calendar.js';
export { PersonalContextService, Episode, UserFact } from './personal-context.js';
export { PresenceService, PresenceConfig, MomentType } from './presence.js';
export { LLMService, Tier, Complexity } from './llm.js';
export { EmbeddingService } from './embeddings.js';
export { VectorService, VectorMetadata } from './vectors.js';
export { ShedService, ShedSource, ShedChunk } from './shed.js';
export { SchedulerService, ScheduledTask } from './scheduler.js';
export { WeatherService, WeatherData } from './weather.js';
export { SignalService } from './signal.js';
