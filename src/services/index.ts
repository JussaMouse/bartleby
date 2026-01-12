// src/services/index.ts
import { Config } from '../config.js';
import { GardenService } from './garden.js';
import { CalendarService } from './calendar.js';
import { MemoryService } from './memory.js';
import { ProactiveService } from './proactive.js';
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
  
  // Intelligence
  memory: MemoryService;
  proactive: ProactiveService;
  
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
  const memory = new MemoryService(config);
  const shed = new ShedService(config, embeddings, vectors, llm);
  const scheduler = new SchedulerService(config, signal);

  // Initialize data services
  await garden.initialize();
  await calendar.initialize();
  await memory.initialize();
  await shed.initialize();
  await scheduler.initialize();

  // ProactiveService depends on others
  const proactive = new ProactiveService(garden, calendar, memory);

  // Start scheduler background loop
  scheduler.start();

  info('All services initialized');

  return {
    config,
    garden,
    shed,
    calendar,
    memory,
    proactive,
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
  services.memory.close();
  services.llm.close();
  services.embeddings.close();
  services.weather.close();
  services.signal.close();
}

// Re-export types
export { GardenService, GardenRecord, RecordType, RecordStatus, TaskFilters } from './garden.js';
export { CalendarService, CalendarEvent } from './calendar.js';
export { MemoryService, Episode, UserFact } from './memory.js';
export { ProactiveService } from './proactive.js';
export { LLMService, Tier, Complexity } from './llm.js';
export { EmbeddingService } from './embeddings.js';
export { VectorService, VectorMetadata } from './vectors.js';
export { ShedService, ShedSource, ShedChunk } from './shed.js';
export { SchedulerService, ScheduledTask } from './scheduler.js';
export { WeatherService, WeatherData } from './weather.js';
export { SignalService } from './signal.js';
