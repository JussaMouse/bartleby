// src/server/index.ts
// HTTP + WebSocket server for the Bartleby garden dashboard.
// Garden endpoints use the new 4-layer architecture.
// Chat and OCR endpoints are preserved unchanged.

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { Agent } from '../agent/index.js';
import { CommandRouter } from '../router/index.js';
import { ServiceContainer } from '../services/index.js';
import { loadConfig } from '../config.js';
import { info, error } from '../utils/logger.js';
import { handleCommand } from '../app/command-handler.js';
import type { GardenService } from '../garden/GardenService.js';
import type { RelationshipService } from '../garden/RelationshipService.js';
import type { ViewService } from '../garden/ViewService.js';
import { DashboardRenderer } from '../garden/renderers/DashboardRenderer.js';
import type { GardenRecord, QuerySpec } from '../garden/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Types ─────────────────────────────────────────────────────────────────────

interface DashboardClient {
  ws: WebSocket;
  subscriptions: Set<string>; // view names
}

interface GardenChangeEvent {
  op: 'create' | 'update' | 'delete';
  record: GardenRecord;
}

// Map record types to the view names that might show them
const TYPE_VIEW_MAP: Record<string, string[]> = {
  item:    ['Inbox'],
  action:  ['Next Actions', 'Waiting For', 'Someday Maybe'],
  project: ['All Projects'],
  note:    ['All Notes'],
  event:   ['All Events'],
  contact: ['Contacts'],
  tag:     [],
  media:   [],
};

// ── DashboardServer ───────────────────────────────────────────────────────────

export class DashboardServer {
  private app = express();
  private server = createServer(this.app);
  private wss = new WebSocketServer({ server: this.server });
  private clients: Set<DashboardClient> = new Set();
  private services: ServiceContainer;
  private router: CommandRouter;
  private agent: Agent;
  private dashRenderer = new DashboardRenderer();
  private apiToken = process.env.BARTLEBY_API_TOKEN?.trim() || '';
  private config = loadConfig();

  // New garden services (wired in Phase 7, accessed as any until then)
  private get garden(): GardenService  { return (this.services as any).garden as GardenService; }
  private get rels(): RelationshipService { return (this.services as any).rels as RelationshipService; }
  private get views(): ViewService     { return (this.services as any).views as ViewService; }

  constructor(services: ServiceContainer, router: CommandRouter, agent: Agent) {
    this.services = services;
    this.router = router;
    this.agent = agent;
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
    this.watchGardenChanges();
  }

  // ── Middleware ────────────────────────────────────────────────────────────────

  private setupMiddleware() {
    this.app.use(express.json({ limit: '10mb' }));

    // IP whitelist
    this.app.use((req, res, next) => {
      const allowedIpsEnv = process.env.BARTLEBY_ALLOWED_IPS?.trim();
      if (!allowedIpsEnv) return next();

      const allowedIps = allowedIpsEnv.split(',').map(ip => ip.trim()).filter(Boolean);
      const localhostIps = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
      const allAllowed = [...allowedIps, ...localhostIps];
      const clientIp = req.ip || req.socket.remoteAddress || '';

      if (!allAllowed.includes(clientIp)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      next();
    });

    // Serve static web files
    const webDir = path.join(__dirname, '..', '..', 'web');
    this.app.use(express.static(webDir));

    // API auth middleware
    this.app.use('/api', (req, res, next) => {
      // /api/chat and /api/test are public
      if (req.path === '/test' || req.path.startsWith('/chat')) return next();

      if (!this.apiToken) {
        const host = process.env.DASHBOARD_HOST || 'localhost';
        if (host !== 'localhost' && host !== '127.0.0.1') {
          return res.status(500).json({ error: 'Server authentication not configured' });
        }
        return next();
      }

      const token = req.headers.authorization?.replace('Bearer ', '').trim();
      if (!token || token !== this.apiToken) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      next();
    });
  }

  // ── Routes ────────────────────────────────────────────────────────────────────

  private setupRoutes() {
    // ── Health ────────────────────────────────────────────────────────────────
    this.app.get('/api/test', (_req, res) => {
      res.json({ ok: true, timestamp: new Date().toISOString() });
    });

    // ── Garden: Views ─────────────────────────────────────────────────────────

    // GET /api/catalogue — list all view types
    this.app.get('/api/catalogue', (_req, res) => {
      const catalogue = this.views.catalogue();
      res.json(catalogue);
    });

    // GET /api/view/:name — resolve a named view → DashboardViewData
    this.app.get('/api/view/:name', (req, res) => {
      const name = decodeURIComponent(req.params.name);
      const viewData = this.views.resolve(name);
      if (!viewData) {
        return res.status(404).json({ error: `View not found: ${name}` });
      }
      res.json(this.dashRenderer.render(viewData));
    });

    // POST /api/views — create user-defined view
    this.app.post('/api/views', (req, res) => {
      const { name, query_spec, description } = req.body as {
        name?: string;
        query_spec?: QuerySpec;
        description?: string;
      };
      if (!name) return res.status(400).json({ error: 'name is required' });
      const view = this.views.createUserView(name, query_spec ?? {}, description);
      res.status(201).json(view);
    });

    // DELETE /api/views/:id — delete user view
    this.app.delete('/api/views/:id', (req, res) => {
      const deleted = this.views.deleteUserView(req.params.id);
      if (!deleted) return res.status(400).json({ error: 'View not found or is a system view' });
      res.json({ ok: true });
    });

    // ── Garden: Records ───────────────────────────────────────────────────────

    // GET /api/record/:id — get single record
    this.app.get('/api/record/:id', (req, res) => {
      const record = this.garden.get(req.params.id);
      if (!record) return res.status(404).json({ error: 'Not found' });
      res.json(record);
    });

    // POST /api/record — create record
    this.app.post('/api/record', (req, res) => {
      const { type, title, ...rest } = req.body as Partial<GardenRecord>;
      if (!type) return res.status(400).json({ error: 'type is required' });
      if (!title) return res.status(400).json({ error: 'title is required' });

      const record = this.garden.create({ type, title, ...rest } as any);

      // Sync backlinks if content has wiki links
      if (record.content) this.rels.syncBacklinks(record);

      res.status(201).json(record);
    });

    // PATCH /api/record/:id — update record fields
    this.app.patch('/api/record/:id', (req, res) => {
      const record = this.garden.get(req.params.id);
      if (!record) return res.status(404).json({ error: 'Not found' });

      const updated = this.garden.update(req.params.id, req.body);
      if (!updated) return res.status(500).json({ error: 'Update failed' });

      if (req.body.content !== undefined) this.rels.syncBacklinks(updated);

      res.json(updated);
    });

    // DELETE /api/record/:id — delete record
    this.app.delete('/api/record/:id', (req, res) => {
      const deleted = this.garden.delete(req.params.id);
      if (!deleted) return res.status(404).json({ error: 'Not found' });
      res.json({ ok: true });
    });

    // POST /api/record/:id/relate — add relationship
    this.app.post('/api/record/:id/relate', (req, res) => {
      const { to_id, type } = req.body as { to_id?: string; type?: string };
      if (!to_id || !type) return res.status(400).json({ error: 'to_id and type are required' });

      const rel = this.rels.add(req.params.id, to_id, type as any);
      res.status(201).json(rel);
    });

    // DELETE /api/record/:id/relate — remove relationship
    this.app.delete('/api/record/:id/relate', (req, res) => {
      const { to_id, type } = req.body as { to_id?: string; type?: string };
      if (!to_id || !type) return res.status(400).json({ error: 'to_id and type are required' });

      const removed = this.rels.remove(req.params.id, to_id, type as any);
      if (!removed) return res.status(404).json({ error: 'Relationship not found' });
      res.json({ ok: true });
    });

    // ── Garden: Media upload ──────────────────────────────────────────────────

    const upload = multer({ dest: path.join(__dirname, '..', '..', 'garden') });
    this.app.post('/api/media/upload', upload.single('file'), (req: any, res) => {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

      const record = this.garden.create({
        type: 'media',
        title: req.file.originalname ?? req.file.filename,
        file_path: req.file.path,
        mime_type: req.file.mimetype,
        file_size: req.file.size,
      });

      res.status(201).json(record);
    });

    // ── Garden: Autocomplete ──────────────────────────────────────────────────

    this.app.get('/api/autocomplete', (_req, res) => {
      const projects = this.garden.getByType('project', { status: 'active' });
      const contacts = this.garden.getByType('contact', { status: 'active' });
      const tags     = this.garden.getByType('tag',     { status: 'active' });

      res.json({
        projects: projects.map(p => ({ id: p.id, title: p.title })),
        contacts: contacts.map(c => ({ id: c.id, title: c.title })),
        tags:     tags.map(t => ({ id: t.id, title: t.title })),
      });
    });

    // ── Agent chat ────────────────────────────────────────────────────────────

    this.app.post('/api/chat', async (req, res) => {
      if (!this.isAuthorized(req)) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
      if (!text) return res.status(400).json({ error: 'Text is required' });

      const voiceMode = req.query.voice === 'true' || req.query.voice === '1';

      try {
        const result = await handleCommand(text, this.router, this.agent, this.services, {
          stripMarkdown: voiceMode,
          allowExit: false,
        });

        res.json({ reply: result.reply });
      } catch (err) {
        error('Chat request failed', { error: String(err) });
        res.status(500).json({ error: 'Failed to process request' });
      }
    });

    // ── OCR ───────────────────────────────────────────────────────────────────

    const ocrUpload = multer({ dest: '/tmp/bartleby-ocr' });
    this.app.post('/api/ocr', ocrUpload.single('file'), async (req: any, res) => {
      if (!this.isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

      try {
        const text = await this.services.ocr.extractText(req.file.path);
        res.json({ text: text ?? '' });
      } catch (err) {
        res.status(500).json({ error: String(err) });
      }
    });
  }

  // ── WebSocket ─────────────────────────────────────────────────────────────────

  private setupWebSocket() {
    this.wss.on('connection', (ws) => {
      const client: DashboardClient = { ws, subscriptions: new Set() };
      this.clients.add(client);
      info('[WS] Client connected', { total: this.clients.size });

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.type === 'subscribe' && msg.view) {
            client.subscriptions.add(msg.view);
            // Send initial data on subscribe
            const viewData = this.views.resolve(msg.view);
            if (viewData) {
              ws.send(JSON.stringify({
                type: 'data',
                view: msg.view,
                viewData: this.dashRenderer.render(viewData),
              }));
            }
          } else if (msg.type === 'unsubscribe' && msg.view) {
            client.subscriptions.delete(msg.view);
          }
        } catch {
          // ignore malformed messages
        }
      });

      ws.on('close', () => {
        this.clients.delete(client);
        info('[WS] Client disconnected', { total: this.clients.size });
      });
    });
  }

  private watchGardenChanges() {
    this.garden.on('change', (event: GardenChangeEvent) => {
      const { record } = event;
      const affectedViews = TYPE_VIEW_MAP[record.type] ?? [];

      // Also push update for the record's own view
      const recordViewName = record.title;

      for (const client of this.clients) {
        if (client.ws.readyState !== WebSocket.OPEN) continue;

        for (const viewName of [...affectedViews, recordViewName]) {
          if (!client.subscriptions.has(viewName)) continue;

          const viewData = this.views.resolve(viewName);
          if (!viewData) continue;

          client.ws.send(JSON.stringify({
            type: 'data',
            view: viewName,
            viewData: this.dashRenderer.render(viewData),
          }));
        }
      }
    });
  }

  // ── Start / Stop ──────────────────────────────────────────────────────────────

  start(port: number = 3000): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(port, () => {
        info(`[Server] Listening on port ${port}`);
        resolve();
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.close((err) => err ? reject(err) : resolve());
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────────

  private isAuthorized(req: express.Request): boolean {
    if (!this.apiToken) return true;
    const token = req.headers.authorization?.replace('Bearer ', '').trim();
    return token === this.apiToken;
  }
}
