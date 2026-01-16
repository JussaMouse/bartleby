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

    // Serve static files from web directory
    const webDir = path.join(__dirname, '..', '..', 'web');
    this.app.use(express.static(webDir));

    // Serve media files from garden/media
    const mediaDir = this.garden.getMediaDir();
    this.app.use('/media', express.static(mediaDir));

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

    // Fast capture endpoint for voice - skips routing overhead
    this.app.post('/api/capture', async (req, res) => {
      if (!this.isAuthorized(req)) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
      if (!text) {
        res.status(400).json({ error: 'Text is required' });
        return;
      }

      try {
        const task = this.garden.captureToInbox(text);
        debug('Captured via voice API', { title: task.title });
        res.json({ reply: `Captured: ${task.title}` });
      } catch (err) {
        error('Capture failed', { error: String(err) });
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
      ['@inbox', '@phone', '@computer', '@errands', '@home', '@office', '@waiting', '@focus'].forEach(c => contexts.add(c));
      
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
        console.log('[UPLOAD DEBUG] Original filename:', file.originalname);
        console.log('[UPLOAD DEBUG] Extension:', originalExt);
        console.log('[UPLOAD DEBUG] Temp path with ext:', tempPathWithExt);
        
        const media = this.garden.importMedia(tempPathWithExt, name, projectId);
        
        console.log('[UPLOAD DEBUG] Media created:', {
          id: media.id,
          title: media.title,
          metadata: media.metadata,
        });
        
        // Add tags if specified
        if (tags.length > 0) {
          this.garden.update(media.id, { tags });
        }
        
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
    this.app.post('/api/ocr', upload.single('file'), async (req, res) => {
      const file = req.file;
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
    } else if (view === 'notes') {
      data = this.garden.getByType('note').filter(n => n.status === 'active');
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
