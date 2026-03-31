import express from 'express';
import path from 'path';
import { createServer, type Server } from 'http';
import { fileURLToPath } from 'url';
import type { ServiceContainer } from '../services/index.js';
import { info } from '../utils/logger.js';
import { buildRequestContext } from './utils.js';
import { createHealthRouter } from './routes/health.js';
import { createFeedRouter } from './routes/feed.js';
import { createTaskRouter } from './routes/tasks.js';
import { createChatRouter } from './routes/chat.js';
import { CommandRouter } from '../router/index.js';
import { Agent } from '../agent/index.js';
import { createJobRouter } from './routes/jobs.js';
import { createActivityRouter } from './routes/activity.js';
import { createSettingsRouter } from './routes/settings.js';
import { createCaptureRouter } from './routes/capture.js';
import { createEventsRouter } from './routes/events.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class AppServer {
  private routerService: CommandRouter;
  private agent: Agent;
  private app = express();
  private server: Server;

  constructor(private services: ServiceContainer) {
    this.routerService = new CommandRouter();
    this.agent = new Agent(services);
    this.server = createServer(this.app);
    this.setupMiddleware();
    this.setupRoutes();
  }

  async start(port: number): Promise<void> {
    await this.routerService.initialize(this.services);
    await new Promise<void>((resolve) => {
      this.server.listen(port, () => resolve());
    });
    info('App server started', { port });
  }

  stop(): void {
    this.server.close();
  }

  private setupMiddleware(): void {
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use((req, _res, next) => {
      (req as any).bartlebyContext = buildRequestContext(req);
      next();
    });
  }

  private setupRoutes(): void {
    const api = express.Router();
    api.use(createHealthRouter());
    api.use(createFeedRouter(this.services));
    api.use(createTaskRouter(this.services));
    api.use(createChatRouter(this.services, this.routerService, this.agent));
    api.use(createJobRouter(this.services));
    api.use(createActivityRouter(this.services));
    api.use(createSettingsRouter(this.services));
    api.use(createCaptureRouter(this.services));
    api.use(createEventsRouter(this.services));

    this.app.use('/v1', api);

    const mobileDir = path.resolve(__dirname, '../../web-mobile');
    this.app.use('/app', express.static(mobileDir));
    this.app.get('/app', (_req, res) => {
      res.sendFile(path.join(mobileDir, 'index.html'));
    });
  }
}
