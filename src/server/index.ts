// src/server/index.ts
// Minimal WebSocket server for live Garden dashboard

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GardenService } from '../services/garden.js';
import { CalendarService } from '../services/calendar.js';
import { loadConfig } from '../config.js';
import { info, error, debug } from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface DashboardClient {
  ws: WebSocket;
  subscriptions: Set<string>;
}

export class DashboardServer {
  private app = express();
  private server = createServer(this.app);
  private wss = new WebSocketServer({ server: this.server });
  private clients: Set<DashboardClient> = new Set();
  private garden: GardenService;
  private calendar: CalendarService;
  private config = loadConfig();

  constructor(garden: GardenService, calendar: CalendarService) {
    this.garden = garden;
    this.calendar = calendar;
    this.setupRoutes();
    this.setupWebSocket();
  }

  private setupRoutes() {
    // Serve static files from web directory
    const webDir = path.join(__dirname, '..', '..', 'web');
    this.app.use(express.static(webDir));

    // API endpoints for initial data
    this.app.get('/api/inbox', (req, res) => {
      const items = this.garden.getTasks({ status: 'active', context: '@inbox' });
      res.json(items);
    });

    this.app.get('/api/next-actions', (req, res) => {
      const tasks = this.garden.getTasks({ status: 'active' });
      res.json(tasks);
    });

    this.app.get('/api/projects', (req, res) => {
      const projects = this.garden.getByType('project').filter(p => p.status === 'active');
      res.json(projects);
    });

    this.app.get('/api/project/:name', (req, res) => {
      const name = req.params.name;
      const project = this.garden.getByTitle(name);
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      
      const projectSlug = project.title.toLowerCase().replace(/\s+/g, '-');
      const actions = this.garden.getTasks({ status: 'active' })
        .filter(a => 
          a.project?.toLowerCase() === projectSlug || 
          a.project?.toLowerCase() === project.title.toLowerCase()
        );
      
      res.json({ project, actions });
    });

    this.app.get('/api/today', (req, res) => {
      const events = this.calendar.getForDay(new Date());
      const overdue = this.garden.getOverdueTasks();
      res.json({ events, overdue });
    });

    this.app.get('/api/recent', (req, res) => {
      const recent = this.garden.getRecent(10);
      res.json(recent);
    });

    // Get raw file content for editing
    this.app.get('/api/page/:id', (req, res) => {
      const record = this.garden.get(req.params.id);
      if (!record) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      
      const filepath = this.garden.getFilePath(record);
      if (fs.existsSync(filepath)) {
        const content = fs.readFileSync(filepath, 'utf-8');
        res.json({ record, content });
      } else {
        res.json({ record, content: '' });
      }
    });

    // Save raw file content
    this.app.use(express.json());
    this.app.put('/api/page/:id', (req, res) => {
      const record = this.garden.get(req.params.id);
      if (!record) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      
      const { content } = req.body;
      if (typeof content !== 'string') {
        res.status(400).json({ error: 'Content required' });
        return;
      }
      
      const filepath = this.garden.getFilePath(record);
      fs.writeFileSync(filepath, content, 'utf-8');
      debug('Saved page via dashboard', { id: record.id, title: record.title });
      
      // Garden watcher will pick up the change and sync
      res.json({ success: true });
    });
  }

  private setupWebSocket() {
    this.wss.on('connection', (ws) => {
      const client: DashboardClient = { ws, subscriptions: new Set() };
      this.clients.add(client);
      info('Dashboard client connected', { total: this.clients.size });

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          this.handleMessage(client, msg);
        } catch (e) {
          error('Invalid WebSocket message', { error: String(e) });
        }
      });

      ws.on('close', () => {
        this.clients.delete(client);
        info('Dashboard client disconnected', { total: this.clients.size });
      });

      // Send initial connection confirmation
      ws.send(JSON.stringify({ type: 'connected' }));
    });
  }

  private handleMessage(client: DashboardClient, msg: any) {
    switch (msg.type) {
      case 'subscribe':
        // Subscribe to a view (inbox, next-actions, project:name, etc.)
        if (msg.view) {
          client.subscriptions.add(msg.view);
          // Send initial data
          this.sendViewData(client, msg.view);
        }
        break;

      case 'unsubscribe':
        if (msg.view) {
          client.subscriptions.delete(msg.view);
        }
        break;
    }
  }

  private sendViewData(client: DashboardClient, view: string) {
    let data: any;

    if (view === 'inbox') {
      data = this.garden.getTasks({ status: 'active', context: '@inbox' });
    } else if (view === 'next-actions') {
      data = this.garden.getTasks({ status: 'active' });
    } else if (view === 'projects') {
      data = this.garden.getByType('project').filter(p => p.status === 'active');
    } else if (view.startsWith('project:')) {
      const name = view.slice(8);
      const project = this.garden.getByTitle(name);
      if (project) {
        const projectSlug = project.title.toLowerCase().replace(/\s+/g, '-');
        const actions = this.garden.getTasks({ status: 'active' })
          .filter(a => 
            a.project?.toLowerCase() === projectSlug || 
            a.project?.toLowerCase() === project.title.toLowerCase()
          );
        data = { project, actions };
      }
    } else if (view === 'today') {
      data = {
        events: this.calendar.getForDay(new Date()),
        overdue: this.garden.getOverdueTasks(),
      };
    } else if (view === 'recent') {
      data = this.garden.getRecent(10);
    }

    if (data) {
      client.ws.send(JSON.stringify({ type: 'data', view, data }));
    }
  }

  /**
   * Broadcast update to all clients subscribed to a view
   */
  broadcast(view: string) {
    for (const client of this.clients) {
      if (client.subscriptions.has(view)) {
        this.sendViewData(client, view);
      }
    }
  }

  /**
   * Broadcast that something changed - refresh all views
   */
  broadcastAll() {
    for (const client of this.clients) {
      for (const view of client.subscriptions) {
        this.sendViewData(client, view);
      }
    }
  }

  start(port: number = 3333, host: string = 'localhost') {
    this.server.listen(port, host, () => {
      info(`Dashboard server running at http://${host}:${port}`);
    });
  }

  stop() {
    this.server.close();
  }
}
