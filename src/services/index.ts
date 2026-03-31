// src/services/index.ts
import { Config, getDbPath } from '../config.js';
import { GardenService }      from '../garden/GardenService.js';
import { RelationshipService } from '../garden/RelationshipService.js';
import { ViewService }         from '../garden/ViewService.js';
import { ContextService }      from './context.js';
import { LLMService }          from './llm.js';
import { EmbeddingService }    from './embeddings.js';
import { VectorService }       from './vectors.js';
import { ShedService }         from './shed.js';
import { WeatherService }      from './weather.js';
import { SignalService }       from './signal.js';
import { OCRService }          from './ocr.js';
import { DataService }         from './data.js';
import { AuditService }        from './audit.js';
import { LearningService }     from './learning.js';
import { ReflectionService }   from './reflection.js';
import { SettingsService }     from './settings.js';
import { RouterTrainingService } from './router-training.js';
import { RuntimeActivityService } from './runtime-activity.js';
import { WorkflowService } from './workflow.js';
import { initMobileServices, type MobileServices } from '../mobile/index.js';
import { info } from '../utils/logger.js';

export interface ServiceContainer {
  config: Config;

  // Garden (4-layer architecture)
  garden: GardenService;
  rels:   RelationshipService;
  views:  ViewService;

  // Memory and context
  context:    ContextService;
  learning:   LearningService;
  reflection: ReflectionService;
  settings:   SettingsService;
  routerTraining: RouterTrainingService;

  // Reference library
  shed: ShedService;

  // Infrastructure
  llm:        LLMService;
  embeddings: EmbeddingService;
  vectors:    VectorService;
  audit:      AuditService;

  // Optional integrations
  weather: WeatherService;
  signal:  SignalService;
  ocr:     OCRService;
  data:    DataService;
  runtimeActivity: RuntimeActivityService;
  workflow: WorkflowService;
  mobile: MobileServices;
}

export async function initServices(
  config: Config,
  options: { settings?: SettingsService } = {}
): Promise<ServiceContainer> {
  info('Initializing services...');

  // ── Infrastructure ──────────────────────────────────────────────────────────

  const llm        = new LLMService(config);
  const embeddings = new EmbeddingService(config);
  const vectors    = new VectorService(config);
  const signal     = new SignalService(config);
  const weather    = new WeatherService(config);
  const ocr        = new OCRService(config);
  const audit      = new AuditService(config);

  await llm.initialize();
  await embeddings.initialize();
  await vectors.initialize();
  await signal.initialize();
  await weather.initialize();
  await ocr.initialize();
  audit.initialize();

  // ── Garden (new 4-layer architecture) ───────────────────────────────────────
  // GardenService owns the SQLite connection; all other services share getDB()

  const dbPath = getDbPath(config, 'bartleby.db');
  const garden = new GardenService(dbPath);
  const rels   = new RelationshipService(garden.getDB(), garden);
  const views  = new ViewService(garden.getDB(), garden, rels);

  // ── Settings and Learning ──────────────────────────────────────────────────

  const settings = options.settings ?? new SettingsService();
  if (!options.settings) {
    await settings.initialize();
  }

  const learning = new LearningService(garden.getDB());

  const routerTraining = new RouterTrainingService(config, learning);

  // ── Reference library (Shed) ─────────────────────────────────────────────────

  const shed = new ShedService(config, embeddings, vectors, llm);
  await shed.initialize();

  // ── Context and Reflection ───────────────────────────────────────────────────

  const context = new ContextService(config);
  context.setServices(learning, llm);
  await context.initialize();

  const reflection = new ReflectionService(learning, llm);

  // ── Data (separate DB for CSV/SQL work) ─────────────────────────────────────

  const data = new DataService(config);
  const runtimeActivity = new RuntimeActivityService();
  const workflow = new WorkflowService();
  const mobile = initMobileServices(garden.getDB(), runtimeActivity);

  const services: ServiceContainer = {
    config,
    garden,
    rels,
    views,
    context,
    learning,
    reflection,
    settings,
    routerTraining,
    shed,
    llm,
    embeddings,
    vectors,
    audit,
    weather,
    signal,
    ocr,
    data,
    runtimeActivity,
    workflow,
    mobile,
  };

  routerTraining.attachServices(services);
  llm.setRouterRuntimeResolver(() => routerTraining.getRouterRuntimeBinding());
  await routerTraining.initialize();

  info('All services initialized');

  return services;
}

export function closeServices(services: ServiceContainer): void {
  info('Closing services...');
  services.shed.close();
  services.vectors.close();
  // learning.close() is a no-op (db managed by garden)
  services.learning.close();
  services.routerTraining.close();
  services.garden.close();  // closes the shared DB connection
  services.context.close();
  services.data.close();
  services.llm.close();
  services.embeddings.close();
  services.weather.close();
  services.signal.close();
}

// Re-export services
export { GardenService }      from '../garden/GardenService.js';
export { RuntimeActivityService } from './runtime-activity.js';
export { RelationshipService } from '../garden/RelationshipService.js';
export { ViewService }         from '../garden/ViewService.js';
export { ContextService }      from './context.js';
export { LearningService }     from './learning.js';
export { ReflectionService }   from './reflection.js';
export { SettingsService }     from './settings.js';
export { RouterTrainingService } from './router-training.js';
export { ShedService }         from './shed.js';
export { LLMService }          from './llm.js';
export { EmbeddingService }    from './embeddings.js';
export { VectorService }       from './vectors.js';
export { WeatherService }      from './weather.js';
export { SignalService }       from './signal.js';
export { OCRService }          from './ocr.js';
export { DataService }         from './data.js';
export { AuditService }        from './audit.js';

// Re-export types
export type { Episode }                                                         from './context.js';
export type { Entity, Observation, Relationship as LearningRelationship,
              UserProfile, WorkContext, SessionSummary, CommandRecord,
              CommandStats }                                                    from './learning.js';
export type { ConversationTurn, ReflectionInsight }                            from './reflection.js';
export type { Tier, Complexity }                                                from './llm.js';
export type { VectorMetadata }                                                  from './vectors.js';
export type { ShedSource, ShedChunk }                                          from './shed.js';
export type { WeatherData, ForecastDay }                                       from './weather.js';
export type { ImportResult, QueryResult, ExportResult, TableInfo, ColumnInfo } from './data.js';
export type { AuditEvent }                                                      from './audit.js';
// Garden types re-exported from their canonical location
export type { GardenRecord, RecordType, RecordStatus, Relationship,
              RelType, ViewData, Section, RecordSummary, QuerySpec,
              FilterExpr, GardenView }                                         from '../garden/types.js';
