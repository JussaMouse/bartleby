// src/server/index.ts
// Minimal WebSocket server for live Garden dashboard

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { Agent } from '../agent/index.js';
import { CommandRouter } from '../router/index.js';
import { ServiceContainer } from '../services/index.js';
import { loadConfig } from '../config.js';
import { info, error, debug } from '../utils/logger.js';
import { ViewRegistry } from '../views/ViewRegistry.js';

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
  private services: ServiceContainer;
  private router: CommandRouter;
  private agent: Agent;
  private garden: ServiceContainer['garden'];
  private calendar: ServiceContainer['calendar'];
  private apiToken = process.env.BARTLEBY_API_TOKEN?.trim() || '';
  private config = loadConfig();

  constructor(services: ServiceContainer, router: CommandRouter, agent: Agent) {
    this.services = services;
    this.router = router;
    this.agent = agent;
    this.garden = services.garden;
    this.calendar = services.calendar;
    this.setupRoutes();
    this.setupWebSocket();
  }

  private setupRoutes() {
    this.app.use(express.json({ limit: '1mb' }));

    // IP whitelist middleware - restrict access to specific IPs if configured
    this.app.use((req, res, next) => {
      const allowedIpsEnv = process.env.BARTLEBY_ALLOWED_IPS?.trim();

      // If no whitelist configured, allow all
      if (!allowedIpsEnv) {
        return next();
      }

      const allowedIps = allowedIpsEnv.split(',').map(ip => ip.trim()).filter(ip => ip);

      // Always allow localhost (IPv4 and IPv6)
      const localhostIps = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
      const allAllowedIps = [...allowedIps, ...localhostIps];

      const clientIp = req.ip || req.socket.remoteAddress || 'unknown';

      // Check if client IP is in whitelist
      if (!allAllowedIps.includes(clientIp)) {
        info('[IP] Blocked request from non-whitelisted IP', {
          ip: clientIp,
          path: req.path,
          method: req.method,
        });

        // Log IP block to audit trail
        this.services.audit.log({
          timestamp: new Date().toISOString(),
          ip: clientIp,
          action: 'ip_blocked',
          resource: req.path,
          result: 'denied',
          method: req.method,
          details: 'ip_not_whitelisted',
        });

        return res.status(403).json({ error: 'Forbidden - IP not whitelisted' });
      }

      next();
    });

    // Serve static files from web directory
    const webDir = path.join(__dirname, '..', '..', 'web');
    this.app.use(express.static(webDir));

    // Serve media files from garden/media
    const mediaDir = this.garden.getMediaDir();
    this.app.use('/media', express.static(mediaDir));

    // Auth middleware for all /api/* endpoints
    this.app.use('/api', (req, res, next) => {
      // Public endpoints (for testing)
      const publicPaths: string[] = ['/command', '/test'];

      if (publicPaths.some(p => req.path === p || req.path.startsWith(p + '/'))) {
        return next();
      }

      // All API endpoints require token
      const authHeader = req.headers.authorization;
      const token = authHeader?.replace('Bearer ', '').trim();

      // Server must have token configured (unless localhost)
      if (!this.apiToken) {
        const host = process.env.DASHBOARD_HOST || 'localhost';
        if (host !== 'localhost' && host !== '127.0.0.1') {
          error('[AUTH] BARTLEBY_API_TOKEN not configured - server misconfigured', {
            host,
            path: req.path,
          });
          return res.status(500).json({
            error: 'Server authentication not configured'
          });
        }
        // Localhost without token - allow (for development)
        return next();
      }

      // Request must provide valid token
      if (!token || token !== this.apiToken) {
        const clientIp = req.ip || req.socket.remoteAddress || 'unknown';

        info('[AUTH] Failed auth attempt', {
          ip: clientIp,
          method: req.method,
          path: req.path,
          hasToken: !!token,
        });

        // Log failed auth attempt to audit trail
        this.services.audit.log({
          timestamp: new Date().toISOString(),
          ip: clientIp,
          action: 'auth_failed',
          resource: req.path,
          result: 'denied',
          method: req.method,
          details: token ? 'invalid_token' : 'missing_token',
        });

        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Token valid - log successful auth and proceed
      const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
      this.services.audit.log({
        timestamp: new Date().toISOString(),
        ip: clientIp,
        action: 'auth_success',
        resource: req.path,
        result: 'success',
        method: req.method,
      });

      next();
    });

    // Test endpoint to verify logging is working
    this.app.get('/api/test', (req, res) => {
      const timestamp = new Date().toISOString();
      info('TEST ENDPOINT HIT', { timestamp, query: req.query });
      console.log(`[TEST] Direct console.log at ${timestamp}`);
      res.json({ success: true, message: 'Test endpoint working', timestamp });
    });

    // API endpoints for initial data
    // Support ?voice=true for TTS-friendly summaries
    this.app.get('/api/inbox', (req, res) => {
      const items = this.garden.getByType('item').filter(i => i.status === 'active');
      
      if (req.query.voice === 'true') {
        if (items.length === 0) {
          res.json({ summary: 'Your inbox is empty.' });
        } else {
          const summary = `You have ${items.length} item${items.length === 1 ? '' : 's'} in your inbox. ` +
            items.slice(0, 5).map((item, i) => `${i + 1}: ${item.title}`).join('. ') +
            (items.length > 5 ? `. And ${items.length - 5} more.` : '');
          res.json({ summary, count: items.length });
        }
        return;
      }
      
      res.json(items);
    });

    this.app.get('/api/next-actions', (req, res) => {
      const tasks = this.garden.getTasks({ status: 'active' });
      
      if (req.query.voice === 'true') {
        const nonInbox = tasks; // All actions are non-inbox (items are separate type)
        if (nonInbox.length === 0) {
          res.json({ summary: 'You have no next actions.' });
        } else {
          const summary = `You have ${nonInbox.length} next action${nonInbox.length === 1 ? '' : 's'}. ` +
            nonInbox.slice(0, 5).map((item, i) => `${i + 1}: ${item.title}`).join('. ') +
            (nonInbox.length > 5 ? `. And ${nonInbox.length - 5} more.` : '');
          res.json({ summary, count: nonInbox.length });
        }
        return;
      }
      
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
      
      if (req.query.voice === 'true') {
        const parts: string[] = [];
        
        if (events.length === 0) {
          parts.push('No events scheduled for today.');
        } else {
          parts.push(`You have ${events.length} event${events.length === 1 ? '' : 's'} today.`);
          for (const event of events.slice(0, 5)) {
            const time = new Date(event.start_time).toLocaleTimeString('en-US', { 
              hour: 'numeric', 
              minute: '2-digit' 
            });
            parts.push(`${time}: ${event.title}`);
          }
          if (events.length > 5) {
            parts.push(`And ${events.length - 5} more events.`);
          }
        }
        
        if (overdue.length > 0) {
          parts.push(`You have ${overdue.length} overdue task${overdue.length === 1 ? '' : 's'}.`);
          for (const task of overdue.slice(0, 3)) {
            parts.push(task.title);
          }
        }
        
        res.json({ summary: parts.join(' '), eventCount: events.length, overdueCount: overdue.length });
        return;
      }
      
      res.json({ events, overdue });
    });

    this.app.get('/api/recent', (req, res) => {
      const recent = this.garden.getRecent(10);
      res.json(recent);
    });

    // Memory/learning insights endpoint
    this.app.get('/api/memory', (req, res) => {
      const learning = this.services.learning;

      if (!learning) {
        res.json({
          preferences: [],
          patterns: [],
          context: [],
          goals: [],
          sessionCount: 0,
          message: 'Learning system not enabled'
        });
        return;
      }

      // Get user observations
      const preferences = learning.getObservations('user', { keyPrefix: 'preference.' });
      const patterns = learning.getObservations('user', { keyPrefix: 'pattern.' });
      const contextObs = learning.getObservations('user', { keyPrefix: 'context.' });
      const goals = learning.getObservations('user', { keyPrefix: 'goal.' });

      // Get session count
      const db = learning['db'];
      const sessionCount = db.prepare('SELECT COUNT(*) as count FROM entities WHERE type = ?').get('session') as { count: number };

      // Format observations for display
      const formatObs = (obs: any) => ({
        key: obs.key.replace(/^(preference|pattern|context|goal)\./, ''),
        value: obs.value,
        confidence: obs.confidence,
      });

      res.json({
        preferences: preferences.map(formatObs),
        patterns: patterns.map(formatObs),
        context: contextObs.map(formatObs),
        goals: goals.map(formatObs),
        sessionCount: sessionCount.count,
      });
    });

    // Relationship graph endpoint
    this.app.get('/api/graph', (req, res) => {
      const learning = this.services.learning;

      if (!learning) {
        res.json({
          nodes: [],
          edges: [],
          message: 'Learning system not enabled'
        });
        return;
      }

      // Get all record entities
      const db = learning['db'];
      const records = db.prepare(`
        SELECT entity_id, type, data, created_at
        FROM entities
        WHERE type = 'record'
        ORDER BY created_at DESC
        LIMIT 50
      `).all() as Array<{ entity_id: string, type: string, data: string, created_at: string }>;

      // Build nodes
      const nodes = records.map(rec => {
        const data = rec.data ? JSON.parse(rec.data) : {};
        return {
          id: rec.entity_id,
          label: data.title || rec.entity_id.slice(0, 8),
          type: data.type || 'unknown'
        };
      });

      // Get all relationships between these records
      const recordIds = records.map(r => r.entity_id);
      if (recordIds.length === 0) {
        res.json({ nodes: [], edges: [] });
        return;
      }

      const placeholders = recordIds.map(() => '?').join(',');
      const edges = db.prepare(`
        SELECT from_entity, to_entity, relation_type, strength
        FROM relationships
        WHERE from_entity IN (${placeholders})
        AND to_entity IN (${placeholders})
        AND relation_type != 'discussed_in'
      `).all(...recordIds, ...recordIds) as Array<{
        from_entity: string,
        to_entity: string,
        relation_type: string,
        strength: number | null
      }>;

      // Format edges
      const formattedEdges = edges.map(edge => ({
        from: edge.from_entity,
        to: edge.to_entity,
        type: edge.relation_type,
        strength: edge.strength || 0.5
      }));

      res.json({
        nodes,
        edges: formattedEdges
      });
    });

    // Fast capture endpoint for voice - skips routing overhead
    this.app.post('/api/capture', async (req, res) => {
      info('/api/capture request received', {
        body: req.body,
        hasAuth: this.isAuthorized(req),
        textLength: req.body?.text?.length || 0,
      });

      if (!this.isAuthorized(req)) {
        error('/api/capture authorization failed', { hasToken: !!this.apiToken });
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
      if (!text) {
        error('/api/capture validation failed', { reason: 'Text is required', body: req.body });
        res.status(400).json({ error: 'Text is required' });
        return;
      }

      try {
        const item = this.garden.captureToInbox(text);
        info('Captured to inbox successfully', {
          id: item.id,
          title: item.title,
          type: item.type,
          filePath: this.garden.getFilePath(item),
        });
        res.json({ reply: `Captured: ${item.title}` });
      } catch (err) {
        error('Capture failed', { error: String(err), text });
        res.status(500).json({ error: 'Capture failed' });
      }
    });

    this.app.post('/api/chat', async (req, res) => {
      if (!this.isAuthorized(req)) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
      if (!text) {
        res.status(400).json({ error: 'Text is required' });
        return;
      }

      // Voice mode strips markdown for TTS
      const voiceMode = req.query.voice === 'true' || req.query.voice === '1';

      try {
        this.services.context.recordMessage(text, true);

        const routerResult = await this.router.route(text);
        let response: string;

        switch (routerResult.type) {
          case 'routed':
            if (routerResult.route) {
              response = await this.router.execute(routerResult.route, text);
            } else {
              response = "I didn't understand that. Try 'help' for commands.";
            }
            break;
          case 'llm-simple':
            response = await this.agent.handleSimple(text);
            break;
          case 'llm-complex':
            response = await this.agent.handleComplex(text);
            break;
          default:
            response = "I'm not sure how to help with that. Try 'help' for commands.";
        }

        let reply = response === '__EXIT__' ? 'Goodbye.' : response;
        
        // Strip markdown for voice output
        if (voiceMode) {
          reply = this.stripMarkdownForVoice(reply);
        }

        this.services.context.recordMessage(reply, false);

        res.json({ reply });
      } catch (err) {
        error('Chat request failed', { error: String(err) });
        res.status(500).json({ error: 'Failed to process request' });
      }
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

    // Autocomplete data for inline editing
    this.app.get('/api/autocomplete', (req, res) => {
      const tasks = this.garden.getTasks({ status: 'active' });
      const projects = this.garden.getByType('project').filter(p => p.status === 'active');
      const contacts = this.garden.getByType('contact').filter(c => c.status === 'active');
      const recentPages = this.garden.getRecent(100);

      // Collect unique contexts
      const contexts = new Set<string>();
      for (const task of tasks) {
        if (task.context) contexts.add(task.context);
      }
      // Add common defaults
      ['@phone', '@computer', '@errands', '@home', '@office', '@waiting', '@focus'].forEach(c => contexts.add(c));

      // Collect unique tags from all pages
      const tags = new Set<string>();
      const allPages = [
        ...tasks,
        ...projects,
        ...this.garden.getByType('note'),
        ...this.garden.getByType('entry'),
        ...this.garden.getByType('media'),
        ...contacts,
      ];
      // Tag collection removed - tags no longer supported

      // Common commands
      const commands = [
        'capture', 'show inbox', 'show next', 'show projects', 'show calendar',
        'show overdue', 'show waiting', 'show someday', 'done', 'edit',
        'new action', 'new project', 'new note', 'new entry', 'new event',
        'delete', 'delete project', 'open', 'today', 'calendar', 'help',
        'import', 'process inbox'
      ];

      // Collect unique page titles
      const pageTitles = new Set<string>();
      for (const p of recentPages) {
        pageTitles.add(p.title);
      }
      for (const t of tasks) {
        pageTitles.add(t.title);
      }

      res.json({
        contexts: Array.from(contexts).sort(),
        projects: projects.map(p => p.title),
        contacts: contacts.map(c => c.title),
        tags: Array.from(tags).sort(),
        pages: Array.from(pageTitles).sort(),
        commands,
      });
    });

    // Quick update action metadata (inline edit)
    this.app.patch('/api/action/:id', (req, res) => {
      const record = this.garden.get(req.params.id);
      if (!record || record.type !== 'action') {
        res.status(404).json({ error: 'Action not found' });
        return;
      }
      
      const { title, context, project, due_date } = req.body;
      const updates: any = {};
      
      if (title !== undefined) updates.title = title;
      if (context !== undefined) updates.context = context || null;
      if (due_date !== undefined) updates.due_date = due_date || null;
      
      // Auto-create project if it doesn't exist
      let projectCreated = false;
      if (project !== undefined) {
        if (project) {
          const existingProjects = this.garden.getByType('project');
          const projectSlug = project.toLowerCase();
          const projectExists = existingProjects.some(p => 
            p.title.toLowerCase() === projectSlug || 
            p.title.toLowerCase().replace(/\s+/g, '-') === projectSlug
          );
          
          if (!projectExists) {
            this.garden.create({
              type: 'project',
              title: project.charAt(0).toUpperCase() + project.slice(1),
              status: 'active',
            });
            projectCreated = true;
            debug('Auto-created project via dashboard', { project });
          }
        }
        updates.project = project || null;
      }
      
      const updated = this.garden.update(record.id, updates);
      if (updated) {
        debug('Updated action via dashboard', { id: record.id, updates });
        res.json({ success: true, record: updated, projectCreated });
      } else {
        res.status(500).json({ error: 'Failed to update' });
      }
    });

    // Create a new note
    this.app.post('/api/note', (req, res) => {
      info('/api/note request received', {
        body: req.body,
        contentLength: req.body?.content?.length || 0,
        hasTitle: !!req.body?.title,
        hasContent: !!req.body?.content,
      });

      const { title, content, project, tags } = req.body;

      if (!title?.trim()) {
        error('/api/note validation failed', { reason: 'Title required', body: req.body });
        res.status(400).json({ error: 'Title required' });
        return;
      }

      const note = this.garden.create({
        type: 'note',
        title: title.trim(),
        content: content || '',
        project: project || undefined,
        // tags removed
        status: 'active',
      });

      const filePath = this.garden.getFilePath(note);

      info('Note created successfully', {
        id: note.id,
        title: note.title,
        contentLength: note.content?.length || 0,
        filePath,
      });

      this.broadcastAll();
      res.json({ success: true, note });
    });

    // Create a new item (raw inbox capture)
    this.app.post('/api/item', (req, res) => {
      const { title, content } = req.body;
      
      if (!title?.trim()) {
        res.status(400).json({ error: 'Title required' });
        return;
      }
      
      const item = this.garden.create({
        type: 'item',
        title: title.trim(),
        content: content || '',
        status: 'active',
      });
      
      debug('Captured item via dashboard', { id: item.id, title: item.title });
      this.broadcastAll();
      res.json({ success: true, item });
    });

    // Create a new action
    this.app.post('/api/action', (req, res) => {
      const { title, context, project, tags } = req.body;
      const noBroadcast = req.query.nobroadcast === '1';
      
      // Allow empty title for inline editing flow
      const actionTitle = title?.trim() || 'New action';
      
      const action = this.garden.create({
        type: 'action',
        title: actionTitle,
        context: context || '@home',
        project: project || undefined,
        // tags removed
        status: 'active',
      });
      
      debug('Created action via dashboard', { id: action.id, title: action.title });
      if (!noBroadcast) {
        this.broadcastAll();
      }
      res.json({ success: true, action });
    });

    // Create a new project
    this.app.post('/api/project', (req, res) => {
      const { title, tags } = req.body;
      
      if (!title?.trim()) {
        res.status(400).json({ error: 'Title required' });
        return;
      }
      
      const project = this.garden.create({
        type: 'project',
        title: title.trim(),
        // tags removed
        status: 'active',
      });
      
      debug('Created project via dashboard', { id: project.id, title: project.title });
      this.broadcastAll();
      res.json({ success: true, project });
    });

    // Create a new event
    this.app.post('/api/event', (req, res) => {
      const { title, dateStr, allDay } = req.body;
      
      if (!title?.trim()) {
        res.status(400).json({ error: 'Title required' });
        return;
      }
      
      // Parse date string - try natural language first, then ISO
      let startTime: Date;
      const now = new Date();
      const input = (dateStr || '').toLowerCase().trim();
      
      if (!input) {
        // Default to tomorrow 9am
        startTime = new Date(now);
        startTime.setDate(startTime.getDate() + 1);
        startTime.setHours(9, 0, 0, 0);
      } else if (input.includes('tomorrow')) {
        startTime = new Date(now);
        startTime.setDate(startTime.getDate() + 1);
        const timeMatch = input.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
        if (timeMatch) {
          let hour = parseInt(timeMatch[1]);
          const min = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
          const meridiem = timeMatch[3]?.toLowerCase();
          if (meridiem === 'pm' && hour < 12) hour += 12;
          if (meridiem === 'am' && hour === 12) hour = 0;
          startTime.setHours(hour, min, 0, 0);
        } else {
          startTime.setHours(9, 0, 0, 0);
        }
      } else {
        // Try to parse as date
        const parsed = new Date(input);
        if (!isNaN(parsed.getTime())) {
          startTime = parsed;
        } else {
          // Fallback: tomorrow 9am
          startTime = new Date(now);
          startTime.setDate(startTime.getDate() + 1);
          startTime.setHours(9, 0, 0, 0);
        }
      }
      
      // Default end time is 1 hour after start (or same day for all-day)
      const endTime = new Date(startTime);
      if (allDay) {
        endTime.setHours(23, 59, 59, 999);
      } else {
        endTime.setHours(endTime.getHours() + 1);
      }
      
      const event = this.calendar.create({
        title: title.trim(),
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        all_day: allDay || false,
      });
      
      debug('Created event via dashboard', { id: event.id, title: event.title, start: startTime });
      this.broadcastAll();
      res.json({ success: true, event });
    });

    // Update note metadata (inline edit)
    this.app.patch('/api/note/:id', (req, res) => {
      const record = this.garden.get(req.params.id);
      if (!record || record.type !== 'note') {
        res.status(404).json({ error: 'Note not found' });
        return;
      }
      
      const { title, project, tags } = req.body;
      const updates: any = {};
      
      if (title !== undefined) updates.title = title;
      if (tags !== undefined) updates.tags = tags;
      
      // Auto-create project if it doesn't exist
      let projectCreated = false;
      if (project !== undefined) {
        if (project) {
          const existingProjects = this.garden.getByType('project');
          const projectSlug = project.toLowerCase();
          const projectExists = existingProjects.some(p => 
            p.title.toLowerCase() === projectSlug || 
            p.title.toLowerCase().replace(/\s+/g, '-') === projectSlug
          );
          
          if (!projectExists) {
            this.garden.create({
              type: 'project',
              title: project.charAt(0).toUpperCase() + project.slice(1),
              status: 'active',
            });
            projectCreated = true;
            debug('Auto-created project via dashboard', { project });
          }
        }
        updates.project = project || null;
      }
      
      const updated = this.garden.update(record.id, updates);
      if (updated) {
        debug('Updated note via dashboard', { id: record.id, updates });
        this.broadcastAll();
        res.json({ success: true, record: updated, projectCreated });
      } else {
        res.status(500).json({ error: 'Failed to update' });
      }
    });

    // Update action/item metadata (inline edit)
    this.app.patch('/api/action/:id', (req, res) => {
      const record = this.garden.get(req.params.id);
      if (!record || (record.type !== 'action' && record.type !== 'item')) {
        res.status(404).json({ error: 'Action not found' });
        return;
      }
      
      const { title, context, project, tags } = req.body;
      const updates: any = {};
      
      if (title !== undefined) updates.title = title;
      if (context !== undefined) updates.context = context;
      if (tags !== undefined) updates.tags = tags;
      
      // Auto-create project if it doesn't exist
      let projectCreated = false;
      if (project !== undefined) {
        if (project) {
          const existingProjects = this.garden.getByType('project');
          const projectSlug = project.toLowerCase();
          const projectExists = existingProjects.some(p => 
            p.title.toLowerCase() === projectSlug || 
            p.title.toLowerCase().replace(/\s+/g, '-') === projectSlug
          );
          
          if (!projectExists) {
            this.garden.create({
              type: 'project',
              title: project.charAt(0).toUpperCase() + project.slice(1),
              status: 'active',
            });
            projectCreated = true;
          }
        }
        updates.project = project || null;
      }
      
      const updated = this.garden.update(record.id, updates);
      if (updated) {
        debug('Updated action via dashboard', { id: record.id, updates });
        this.broadcastAll();
        res.json({ success: true, record: updated, projectCreated });
      } else {
        res.status(500).json({ error: 'Failed to update' });
      }
    });

    // Convert a page to a different type
    this.app.post('/api/page/:id/convert', (req, res) => {
      const record = this.garden.get(req.params.id);
      if (!record) {
        res.status(404).json({ error: 'Page not found' });
        return;
      }
      
      const { targetType } = req.body;
      if (!targetType || !['action', 'note', 'project', 'entry', 'event'].includes(targetType)) {
        res.status(400).json({ error: 'Invalid target type' });
        return;
      }
      
      // Update the record type
      const updated = this.garden.update(record.id, { type: targetType as any });
      if (updated) {
        debug('Converted page via dashboard', { id: record.id, from: record.type, to: targetType });
        
        // Broadcast updates to all dashboard clients
        this.broadcastAll();
        
        res.json({ success: true, record: updated });
      } else {
        res.status(500).json({ error: 'Conversion failed' });
      }
    });

    // Mark action as done
    this.app.post('/api/action/:id/done', (req, res) => {
      const completed = this.garden.completeTask(req.params.id);
      if (!completed) {
        res.status(404).json({ error: 'Action not found' });
        return;
      }
      
      debug('Marked action done via dashboard', { id: req.params.id, title: completed.title });
      res.json({ success: true, title: completed.title });
    });

    // Save raw file content
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

    // Delete a page
    this.app.delete('/api/page/:id', (req, res) => {
      const record = this.garden.get(req.params.id);
      if (!record) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      
      try {
        // Delete from database
        this.garden.delete(record.id);
        debug('Deleted page via dashboard', { id: record.id, title: record.title });
        res.json({ success: true });
      } catch (e) {
        error('Failed to delete page', { id: record.id, error: String(e) });
        res.status(500).json({ error: 'Delete failed' });
      }
    });

    // Media upload via drag-and-drop
    const upload = multer({ dest: os.tmpdir() });
    this.app.post('/api/media/upload', upload.single('file'), (req, res) => {
      const file = req.file;
      if (!file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
      }
      
      // Get original extension from filename
      const originalExt = path.extname(file.originalname);
      
      // Rename temp file to include extension (multer strips it)
      const tempPathWithExt = file.path + originalExt;
      fs.renameSync(file.path, tempPathWithExt);
      
      // Parse name and optional +project from the name field
      let name = (req.body.name || file.originalname || 'untitled').toString();
      let projectName: string | undefined;
      
      // Extract +project from name
      const projectMatch = name.match(/\+([^\s#]+)/);
      if (projectMatch) {
        projectName = projectMatch[1];
        name = name.replace(/\+[^\s#]+/g, '').trim();
      }
      
      // Extract #tags from name
      const tagMatches = name.match(/#(\w+)/g);
      const tags = tagMatches ? tagMatches.map((t: string) => t.slice(1)) : [];
      name = name.replace(/#\w+/g, '').trim();
      
      // If no name left, use original filename (without extension)
      if (!name) {
        name = file.originalname.replace(/\.[^.]+$/, '');
      }
      
      // Find or create project
      let projectId: string | undefined;
      if (projectName) {
        const projects = this.garden.getByType('project');
        let project = projects.find(p => p.title.toLowerCase() === projectName!.toLowerCase());
        if (!project) {
          project = this.garden.create({
            type: 'project',
            title: projectName,
            status: 'active',
          });
        }
        projectId = project.id;
      }
      
      try {
        // Import the media file (now with proper extension)
        debug('Importing media file', {
          originalFilename: file.originalname,
          extension: originalExt,
          tempPath: tempPathWithExt,
        });

        const media = this.garden.importMedia(tempPathWithExt, name, projectId);

        debug('Media created successfully', {
          id: media.id,
          title: media.title,
          metadata: media.metadata,
        });
        
        // Tags removed

        // Clean up temp file
        fs.unlinkSync(tempPathWithExt);
        
        debug('Media uploaded via dashboard', { title: media.title, project: projectName });
        
        res.json({ 
          success: true, 
          id: media.id, 
          title: media.title,
          project: projectName,
          metadata: media.metadata,  // Include for debugging
        });
      } catch (err) {
        // Clean up temp file on error
        try { fs.unlinkSync(tempPathWithExt); } catch {}
        error('Media upload failed', { error: String(err) });
        res.status(500).json({ error: 'Upload failed' });
      }
    });

    // OCR endpoint - extract text from uploaded image
    // Use upload.any() to accept any field name (iOS Shortcuts compatibility)
    this.app.post('/api/ocr', upload.any(), async (req, res) => {
      const files = req.files as Express.Multer.File[] | undefined;
      const file = files?.[0];
      if (!file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
      }

      // Check if OCR is available
      if (!this.services.ocr.isAvailable()) {
        res.status(503).json({ error: 'OCR service not configured' });
        return;
      }

      // Get original extension from filename
      const originalExt = path.extname(file.originalname);
      const tempPathWithExt = file.path + originalExt;
      fs.renameSync(file.path, tempPathWithExt);

      // Check if it's an image
      if (!this.services.ocr.isOCRableImage(tempPathWithExt)) {
        fs.unlinkSync(tempPathWithExt);
        res.status(400).json({ error: 'Not a supported image format' });
        return;
      }

      try {
        const text = await this.services.ocr.extractText(tempPathWithExt);
        fs.unlinkSync(tempPathWithExt);

        if (!text) {
          res.status(422).json({ error: 'Could not extract text from image' });
          return;
        }

        res.json({ success: true, text });
      } catch (err) {
        try { fs.unlinkSync(tempPathWithExt); } catch {}
        error('OCR failed', { error: String(err) });
        res.status(500).json({ error: 'OCR failed' });
      }
    });

    // OCR to Note endpoint - extract text and save as note
    // Use upload.any() to accept any field name (iOS Shortcuts compatibility)
    this.app.post('/api/ocr/note', upload.any(), async (req, res) => {
      const files = req.files as Express.Multer.File[] | undefined;
      const file = files?.[0];
      if (!file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
      }

      if (!this.services.ocr.isAvailable()) {
        res.status(503).json({ error: 'OCR service not configured' });
        return;
      }

      const originalExt = path.extname(file.originalname);
      const tempPathWithExt = file.path + originalExt;
      fs.renameSync(file.path, tempPathWithExt);

      // Debug: log file info to verify different files
      const stats = fs.statSync(tempPathWithExt);
      info('OCR/note upload received', {
        originalName: file.originalname,
        tempPath: tempPathWithExt,
        size: stats.size,
      });

      if (!this.services.ocr.isOCRableImage(tempPathWithExt)) {
        fs.unlinkSync(tempPathWithExt);
        res.status(400).json({ error: 'Not a supported image format' });
        return;
      }

      try {
        const text = await this.services.ocr.extractText(tempPathWithExt);
        fs.unlinkSync(tempPathWithExt);

        if (!text) {
          res.status(422).json({ error: 'Could not extract text from image' });
          return;
        }

        // Use custom title if provided, otherwise timestamp
        let title = req.body?.title?.trim();
        if (!title) {
          const now = new Date();
          const timestamp = now.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          });
          title = `OCR ${timestamp}`;
        }

        const note = this.garden.create({
          type: 'note',
          title,
          content: text,
          status: 'active',
          metadata: {
            source: 'ocr',
            originalFile: file.originalname,
          },
        });

        // Get dashboard URL
        const host = process.env.DASHBOARD_HOST || 'localhost';
        const port = process.env.DASHBOARD_PORT || '3333';
        const dashboardUrl = `http://${host}:${port}`;

        debug('OCR saved to note', { id: note.id, title: note.title });

        res.json({ 
          success: true, 
          noteId: note.id,
          title: note.title,
          url: `${dashboardUrl}/#note:${encodeURIComponent(note.title)}`,
          preview: text.slice(0, 200) + (text.length > 200 ? '...' : ''),
        });
      } catch (err) {
        try { fs.unlinkSync(tempPathWithExt); } catch {}
        error('OCR to note failed', { error: String(err) });
        res.status(500).json({ error: 'OCR failed' });
      }
    });

    // ============================================
    // Command API - Unified command interface
    // ============================================

    /**
     * POST /api/command - Parse and preview a command
     * Request: { input: string }
     * Response: ParseResult with intent, parsed, preview
     */
    this.app.post('/api/command', async (req, res) => {
      const { input } = req.body;

      if (!input || typeof input !== 'string') {
        res.status(400).json({ error: 'Input required' });
        return;
      }

      try {
        const { parseCommand } = await import('./command-parser.js');
        const parsed = parseCommand(input);

        // Build preview for display
        const preview = this.buildCommandPreview(parsed);

        res.json({
          intent: parsed.type,
          confidence: parsed.confidence,
          parsed,
          preview,
          error: parsed.type === 'unknown' ? parsed.reason : undefined,
          hint: parsed.type === 'unknown' ? parsed.suggestions?.[0] : undefined,
          suggestions: parsed.type === 'unknown' ? parsed.suggestions : undefined,
        });
      } catch (err) {
        error('Command parsing failed', { input, error: String(err) });
        res.status(500).json({ error: 'Failed to parse command' });
      }
    });

    /**
     * POST /api/command/execute - Execute a parsed command
     * Request: { intent: string, parsed: CommandIntent }
     * Response: CommandResult
     */
    this.app.post('/api/command/execute', async (req, res) => {
      const { parsed } = req.body;

      if (!parsed || !parsed.type) {
        res.status(400).json({ error: 'Parsed command required' });
        return;
      }

      try {
        const { executeCommand } = await import('./command-executor.js');
        // Pass learning service to record observations automatically
        const result = executeCommand(parsed, this.garden, this.services.learning, undefined);

        res.json(result);

        // Broadcast updates if successful
        if (result.success) {
          this.broadcastAll();
        }
      } catch (err) {
        error('Command execution failed', { parsed, error: String(err) });
        res.status(500).json({
          success: false,
          action: 'error',
          message: 'Failed to execute command',
          error: String(err),
        });
      }
    });

    /**
     * GET /api/command/suggestions?q=<input> - Get autocomplete suggestions
     * Response: { input, suggestions[] }
     */
    this.app.get('/api/command/suggestions', (req, res) => {
      const q = req.query.q as string;

      if (!q) {
        res.json({ input: '', suggestions: [] });
        return;
      }

      try {
        const suggestions = this.getCommandSuggestions(q);
        res.json({ input: q, suggestions });
      } catch (err) {
        error('Failed to get suggestions', { query: q, error: String(err) });
        res.status(500).json({ error: 'Failed to get suggestions' });
      }
    });

    /**
     * GET /api/command/history - Get command history
     * Query params: ?limit=50
     * Response: { commands: CommandRecord[] }
     */
    this.app.get('/api/command/history', (req, res) => {
      try {
        const limit = parseInt(req.query.limit as string) || 50;
        const commands = this.services.learning.getRecentCommands(limit);
        res.json({ commands });
      } catch (err) {
        error('Failed to get command history', { error: String(err) });
        res.status(500).json({ error: 'Failed to get command history' });
      }
    });

    /**
     * GET /api/command/search - Search command history
     * Query params: ?q=search&limit=20
     * Response: { commands: CommandRecord[] }
     */
    this.app.get('/api/command/search', (req, res) => {
      try {
        const query = req.query.q as string;
        if (!query) {
          return res.status(400).json({ error: 'Query parameter "q" is required' });
        }
        const limit = parseInt(req.query.limit as string) || 20;
        const commands = this.services.learning.searchCommands(query, limit);
        res.json({ commands });
      } catch (err) {
        error('Failed to search commands', { error: String(err) });
        res.status(500).json({ error: 'Failed to search commands' });
      }
    });

    /**
     * GET /api/command/stats - Get command statistics
     * Response: { stats: CommandStats }
     */
    this.app.get('/api/command/stats', (req, res) => {
      try {
        const stats = this.services.learning.getCommandStats();
        res.json({ stats });
      } catch (err) {
        error('Failed to get command stats', { error: String(err) });
        res.status(500).json({ error: 'Failed to get command stats' });
      }
    });
  }

  private isAuthorized(req: express.Request): boolean {
    if (!this.apiToken) return true;
    const authHeader = req.headers.authorization || '';
    const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    const token = bearerMatch?.[1] || (req.headers['x-bartleby-token'] as string | undefined);
    return token === this.apiToken;
  }

  /**
   * Strip markdown formatting for voice/TTS output
   */
  private stripMarkdownForVoice(text: string): string {
    return text
      // Remove code blocks
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`([^`]+)`/g, '$1')
      // Remove headers
      .replace(/^#{1,6}\s+/gm, '')
      // Remove bold/italic
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/_([^_]+)_/g, '$1')
      // Remove links, keep text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // Remove bullet points
      .replace(/^[\s]*[-*+]\s+/gm, '')
      // Remove numbered lists prefix
      .replace(/^\s*\d+\.\s+/gm, '')
      // Remove horizontal rules
      .replace(/^[-*_]{3,}\s*$/gm, '')
      // Remove blockquotes
      .replace(/^>\s*/gm, '')
      // Collapse multiple newlines
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /**
   * Build command preview for display to user
   */
  private buildCommandPreview(parsed: any): any {
    const fields: any[] = [];

    switch (parsed.type) {
      case 'create_note':
        fields.push({ label: 'Title', value: parsed.title });
        if (parsed.metadata.project) fields.push({ label: 'Project', value: parsed.metadata.project });
        if (parsed.metadata.tags) fields.push({ label: 'Tags', value: parsed.metadata.tags });
        if (parsed.metadata.context) fields.push({ label: 'Context', value: parsed.metadata.context });
        if (parsed.metadata.contact) fields.push({ label: 'With', value: parsed.metadata.contact });
        return {
          action: 'Create note',
          summary: `"${parsed.title}"${parsed.metadata.project ? ' in ' + parsed.metadata.project : ''}`,
          fields,
        };

      case 'create_action':
        fields.push({ label: 'Title', value: parsed.title });
        if (parsed.metadata.context) fields.push({ label: 'Context', value: parsed.metadata.context });
        if (parsed.metadata.project) fields.push({ label: 'Project', value: parsed.metadata.project });
        if (parsed.metadata.dueDate) fields.push({ label: 'Due', value: parsed.metadata.dueDate });
        return {
          action: 'Create action',
          summary: `"${parsed.title}"${parsed.metadata.context || ''}`,
          fields,
        };

      case 'create_project':
        fields.push({ label: 'Name', value: parsed.name });
        if (parsed.tags) fields.push({ label: 'Tags', value: parsed.tags });
        return {
          action: 'Create project',
          summary: `"${parsed.name}"`,
          fields,
        };

      case 'show_panel':
        return {
          action: 'Open panel',
          summary: parsed.panel,
          fields: [{ label: 'Panel', value: parsed.panel }],
        };

      case 'show_project':
        return {
          action: 'Open project',
          summary: parsed.projectName,
          fields: [{ label: 'Project', value: parsed.projectName }],
        };

      default:
        return {
          action: parsed.type,
          summary: 'Command',
          fields: [],
        };
    }
  }

  /**
   * Get autocomplete suggestions for command input
   */
  private getCommandSuggestions(query: string): any[] {
    const lower = query.toLowerCase().trim();
    const suggestions: any[] = [];

    // Check for entity prefix (+project, #tag, @context)
    const projectMatch = lower.match(/\+([^\s]*)$/);
    const tagMatch = lower.match(/#(\w*)$/);
    const contextMatch = lower.match(/@(\w*)$/);

    if (projectMatch) {
      // Suggest projects
      const partial = projectMatch[1];
      const projects = this.garden.getByType('project');
      projects
        .filter(p => p.title.toLowerCase().includes(partial))
        .slice(0, 5)
        .forEach(p => {
          suggestions.push({
            type: 'entity',
            text: '+' + p.title.toLowerCase().replace(/\s+/g, '-'),
            description: `Project (${this.garden.getByType('action').filter(a => a.project === p.title).length} actions)`,
            category: 'project',
          });
        });
    } else if (tagMatch) {
      // Tag autocomplete removed - tags no longer supported
    } else if (contextMatch) {
      // Suggest contexts
      const partial = contextMatch[1];
      const contexts = ['@home', '@work', '@phone', '@computer', '@errands', '@waiting'];
      contexts
        .filter(c => c.toLowerCase().includes('@' + partial))
        .forEach(c => {
          suggestions.push({
            type: 'entity',
            text: c,
            description: 'Context',
            category: 'context',
          });
        });
    } else {
      // Suggest commands
      const commands = [
        { cmd: 'note', desc: 'Create a note' },
        { cmd: 'action', desc: 'Create an action' },
        { cmd: 'project', desc: 'Create a project' },
        { cmd: 'show inbox', desc: 'Open inbox' },
        { cmd: 'show notes', desc: 'Open notes list' },
        { cmd: 'show next actions', desc: 'Open next actions' },
        { cmd: 'list notes', desc: 'List all notes' },
        { cmd: 'list actions', desc: 'List all actions' },
      ];

      commands
        .filter(c => c.cmd.startsWith(lower))
        .slice(0, 5)
        .forEach(c => {
          suggestions.push({
            type: 'completion',
            text: c.cmd,
            description: c.desc,
            category: 'command',
          });
        });
    }

    return suggestions;
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
    let pageView: any = null;

    if (view === 'inbox') {
      data = this.garden.getByType('item').filter(i => i.status === 'active');
    } else if (view === 'next-actions') {
      data = this.garden.getTasks({ status: 'active' });
    } else if (view === 'projects') {
      data = this.garden.getByType('project').filter(p => p.status === 'active');
    } else if (view.startsWith('project:')) {
      const name = view.slice(8);
      const project = this.garden.getByTitle(name);
      if (project) {
        const projectId = project.id;
        const projectSlug = project.title.toLowerCase().replace(/\s+/g, '-');
        const projectTitle = project.title.toLowerCase();

        // Match by project ID or by title/slug (for backwards compat)
        const matchesProject = (p?: string) =>
          p === projectId ||
          p?.toLowerCase() === projectSlug ||
          p?.toLowerCase() === projectTitle;

        const actions = this.garden.getTasks({ status: 'active' })
          .filter(a => matchesProject(a.project));

        const media = this.garden.getByType('media')
          .filter(m => matchesProject(m.project));

        const notes = this.garden.getByType('note')
          .filter(n => matchesProject(n.project));

        data = { project, actions, media, notes };

        // Generate PageView for project
        try {
          const services = {
            garden: this.garden,
            graph: this.garden.graph(),
            facts: this.garden.getFactsService(),
          };
          const view = ViewRegistry.create(project, services);
          pageView = view.toJSON();
        } catch (err: any) {
          debug(`Failed to generate PageView for project: ${err?.message || err}`);
        }
      }
    } else if (view.startsWith('note-edit:')) {
      const noteId = view.slice(10); // Remove 'note-edit:'
      if (noteId !== 'new') {
        const note = this.garden.get(noteId);
        if (note) {
          data = { note };
        }
      } else {
        // New note - send empty data
        data = { note: null };
      }
    } else if (view.startsWith('note:')) {
      const noteId = view.slice(5);
      const note = this.garden.get(noteId);
      if (note) {
        data = { note };

        // Generate PageView for note
        try {
          const services = {
            garden: this.garden,
            graph: this.garden.graph(),
            facts: this.garden.getFactsService(),
          };
          const noteView = ViewRegistry.create(note, services);
          pageView = noteView.toJSON();
        } catch (err: any) {
          debug(`Failed to generate PageView for note: ${err?.message || err}`);
        }
      }
    } else if (view === 'calendar') {
      data = this.calendar.getUpcoming(15);
    } else if (view === 'today') {
      data = {
        events: this.calendar.getForDay(new Date()),
        overdue: this.garden.getOverdueTasks(),
      };
    } else if (view === 'recent') {
      data = this.garden.getRecent(10);
    } else if (view === 'memory') {
      const learning = this.services.learning;

      if (!learning) {
        data = {
          preferences: [],
          patterns: [],
          context: [],
          goals: [],
          sessionCount: 0,
          message: 'Learning system not enabled'
        };
      } else {
        // Get user observations
        const preferences = learning.getObservations('user', { keyPrefix: 'preference.' });
        const patterns = learning.getObservations('user', { keyPrefix: 'pattern.' });
        const contextObs = learning.getObservations('user', { keyPrefix: 'context.' });
        const goals = learning.getObservations('user', { keyPrefix: 'goal.' });

        // Get session count
        const db = learning['db'];
        const sessionCount = db.prepare('SELECT COUNT(*) as count FROM entities WHERE type = ?').get('session') as { count: number };

        // Format observations for display
        const formatObs = (obs: any) => ({
          key: obs.key.replace(/^(preference|pattern|context|goal)\./, ''),
          value: obs.value,
          confidence: obs.confidence,
        });

        data = {
          preferences: preferences.map(formatObs),
          patterns: patterns.map(formatObs),
          context: contextObs.map(formatObs),
          goals: goals.map(formatObs),
          sessionCount: sessionCount.count,
        };
      }
    } else if (view === 'graph') {
      const learning = this.services.learning;

      if (!learning) {
        data = {
          nodes: [],
          edges: [],
          message: 'Learning system not enabled'
        };
      } else {
        // Get all record entities
        const db = learning['db'];
        const records = db.prepare(`
          SELECT entity_id, type, data, created_at
          FROM entities
          WHERE type = 'record'
          ORDER BY created_at DESC
          LIMIT 50
        `).all() as Array<{ entity_id: string, type: string, data: string, created_at: string }>;

        // Build nodes
        const nodes = records.map(rec => {
          const recData = rec.data ? JSON.parse(rec.data) : {};
          return {
            id: rec.entity_id,
            label: recData.title || rec.entity_id.slice(0, 8),
            type: recData.type || 'unknown'
          };
        });

        // Get all relationships between these records
        const recordIds = records.map(r => r.entity_id);
        let edges: any[] = [];

        if (recordIds.length > 0) {
          const placeholders = recordIds.map(() => '?').join(',');
          edges = db.prepare(`
            SELECT from_entity, to_entity, relation_type, strength
            FROM relationships
            WHERE from_entity IN (${placeholders})
            AND to_entity IN (${placeholders})
            AND relation_type != 'discussed_in'
          `).all(...recordIds, ...recordIds) as Array<{
            from_entity: string,
            to_entity: string,
            relation_type: string,
            strength: number | null
          }>;
        }

        // Format edges
        const formattedEdges = edges.map(edge => ({
          from: edge.from_entity,
          to: edge.to_entity,
          type: edge.relation_type,
          strength: edge.strength || 0.5
        }));

        data = {
          nodes,
          edges: formattedEdges
        };
      }
    } else if (view === 'notes') {
      data = this.garden.getByType('note').filter(n => n.status === 'active');
    }

    if (data) {
      const message: any = { type: 'data', view, data };
      if (pageView) {
        message.pageView = pageView;
      }
      client.ws.send(JSON.stringify(message));
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
