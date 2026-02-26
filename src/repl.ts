// src/repl.ts
import readline from 'readline';
import fs from 'fs';
import path from 'path';
import { CommandRouter } from './router/index.js';
import { Agent } from './agent/index.js';
import { ServiceContainer, closeServices } from './services/index.js';
import { DashboardServer } from './server/index.js';
import { info, warn, error, debug } from './utils/logger.js';
import { getDbPath, ensureDir } from './config.js';
import { runFirstLaunch } from './setup/first-launch.js';

/**
 * Load command history from disk
 */
function loadHistory(historyPath: string, maxLines = 1000): string[] {
  try {
    if (fs.existsSync(historyPath)) {
      const content = fs.readFileSync(historyPath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());
      // Return most recent maxLines entries
      return lines.slice(-maxLines);
    }
  } catch (err) {
    warn('Failed to load command history', { error: String(err) });
  }
  return [];
}

/**
 * Append a command to history file
 */
function appendToHistory(historyPath: string, command: string): void {
  try {
    // Skip empty commands and duplicates of the last command
    if (!command.trim()) return;

    const existing = loadHistory(historyPath, 1);
    if (existing.length > 0 && existing[existing.length - 1] === command) {
      return; // Don't save duplicate consecutive commands
    }

    fs.appendFileSync(historyPath, command + '\n', 'utf-8');
  } catch (err) {
    warn('Failed to save command to history', { error: String(err) });
  }
}


/**
 * Process user input (from keyboard or paste)
 */
async function processInput(
  input: string,
  rl: readline.Interface,
  router: CommandRouter,
  agent: Agent,
  services: ServiceContainer,
  dashboardServer: DashboardServer
): Promise<void> {
  // Record user message in personal context
  services.context.recordMessage(input, true);

  try {
    // Route the input
    const routerResult = await router.route(input);
    let response: string;

    switch (routerResult.type) {
      case 'routed':
        // Deterministic match - execute tool directly
        if (routerResult.route) {
          debug('Executing routed tool', { tool: routerResult.route.tool });
          response = await router.execute(routerResult.route, input);
        } else {
          response = "I didn't understand that. Try 'help' for commands.";
        }
        break;

      case 'llm-simple':
        // Simple request, no router match - use Fast model with streaming
        debug('Handling with Fast model (simple, streaming)');
        {
          const startTime = Date.now();
          try {
            // Use non-streaming for now (streaming has UX challenges with tool calls)
            // TODO: Implement smart streaming that detects tool calls before streaming
            response = await agent.handleSimple(input);
            const responseTime = Date.now() - startTime;

            // Record successful routing outcome for learning
            if (routerResult.decision) {
              services.llm.recordRoutingOutcome({
                decision: routerResult.decision,
                success: true,
                responseTimeMs: responseTime,
              });
            }
          } catch (err) {
            const responseTime = Date.now() - startTime;

            // Record failed routing outcome
            if (routerResult.decision) {
              services.llm.recordRoutingOutcome({
                decision: routerResult.decision,
                success: false,
                responseTimeMs: responseTime,
                errorMessage: String(err),
              });
            }
            throw err; // Re-throw to be handled by outer catch
          }
        }
        break;

      case 'llm-complex':
        // Complex request - use Thinking model with agentic loop
        debug('Handling with Thinking model (complex agentic loop)');
        console.log('\n🤔 This looks like a complex request. Let me work on it...\n');
        {
          const startTime = Date.now();
          try {
            response = await agent.handleComplex(input);
            const responseTime = Date.now() - startTime;

            // Record successful routing outcome for learning
            if (routerResult.decision) {
              services.llm.recordRoutingOutcome({
                decision: routerResult.decision,
                success: true,
                responseTimeMs: responseTime,
              });
            }
          } catch (err) {
            const responseTime = Date.now() - startTime;

            // Record failed routing outcome
            if (routerResult.decision) {
              services.llm.recordRoutingOutcome({
                decision: routerResult.decision,
                success: false,
                responseTimeMs: responseTime,
                errorMessage: String(err),
              });
            }
            throw err; // Re-throw to be handled by outer catch
          }
        }
        break;

      default:
        response = "I'm not sure how to help with that. Try 'help' for commands.";
    }

    // Check for exit
    if (response === '__EXIT__') {
      await handleShutdown(rl, services, dashboardServer);
      return;
    }

    // Record response in personal context
    services.context.recordMessage(response, false);

    console.log(`\n${response}`);
  } catch (err) {
    error('REPL error', { error: String(err) });
    console.log(`\nError: ${err}`);
  }

  rl.prompt();
}

/**
 * Tab completion for garden page titles, contexts, and projects.
 */
function createCompleter(services: ServiceContainer) {
  return (line: string): [string[], string] => {
    const lowerLine = line.toLowerCase();
    debug('Completer called', { line, lowerLine });
    
    // Commands that take a project name specifically
    const projectCommands = ['delete project ', 'remove project '];
    const needsProject = projectCommands.some(cmd => lowerLine.startsWith(cmd));
    debug('needsProject check', { needsProject, projectCommands });
    
    if (needsProject) {
      const cmdMatch = line.match(/^((?:delete|remove)\s+project\s+)(.*)$/i);
      debug('Project completion', { cmdMatch: cmdMatch ? [cmdMatch[1], cmdMatch[2]] : null });
      if (cmdMatch) {
        const prefix = cmdMatch[1];
        const partial = cmdMatch[2].toLowerCase();
        
        const projects = services.garden.getByType('project');
        const titles = projects.map(p => p.title);
        const matches = titles.filter(t => t.toLowerCase().startsWith(partial));
        debug('Project matches', { partial, titles, matches });
        
        if (matches.length > 0) {
          const result: [string[], string] = [matches.map(m => prefix + m), line];
          debug('Returning completions', { completions: result[0] });
          return result;
        }
      }
    }
    
    // Commands that take an action title (done, complete)
    const actionCommands = ['done ', 'complete '];
    const needsAction = actionCommands.some(cmd => lowerLine.startsWith(cmd));
    
    if (needsAction) {
      const cmdMatch = line.match(/^(\w+\s+)(.*)$/i);
      if (cmdMatch) {
        const prefix = cmdMatch[1];
        const partial = cmdMatch[2].toLowerCase();
        
        // Only complete active actions
        const actions = services.garden.getByType('action', { status: 'active' });
        const titles = actions.map(a => a.title);
        const matches = titles.filter(t => t.toLowerCase().startsWith(partial));
        
        if (matches.length > 0) {
          return [matches.map(m => prefix + m), line];
        }
      }
    }
    
    // Commands that take any page title
    const titleCommands = ['open ', 'edit ', 'read ', 'delete ', 'remove '];
    // 'show ' is special - only complete titles if not followed by a keyword
    const showKeywords = ['next', 'projects', 'notes', 'contacts', 'inbox', 'overdue', 'waiting', 'someday', 'tagged', 'reminders'];
    const isShowWithTitle = lowerLine.startsWith('show ') && 
      !showKeywords.some(kw => lowerLine.startsWith('show ' + kw));
    
    const needsTitle = (titleCommands.some(cmd => lowerLine.startsWith(cmd)) || isShowWithTitle) && !needsProject;
    
    if (needsTitle) {
      // Extract the partial title after the command
      const cmdMatch = line.match(/^(\w+\s+)(.*)$/i);
      if (cmdMatch) {
        const prefix = cmdMatch[1];
        const partial = cmdMatch[2].toLowerCase();
        
        // Get all record titles
        const pages = [
          ...services.garden.getByType('action', { status: 'active' }),
          ...services.garden.getByType('project'),
          ...services.garden.getByType('note'),
          ...services.garden.getByType('event'),
          ...services.garden.getByType('media'),
          ...services.garden.getByType('contact'),
        ];
        
        const titles = pages.map(p => p.title);
        const matches = titles.filter(t => t.toLowerCase().startsWith(partial));
        
        if (matches.length > 0) {
          return [matches.map(m => prefix + m), line];
        }
      }
    }
    
    // Context completion (@)
    if (line.includes('@') && !line.includes('@inbox')) {
      const atMatch = line.match(/@(\w*)$/);
      if (atMatch) {
        const partial = atMatch[1].toLowerCase();
        const contexts = ['@phone', '@computer', '@errands', '@home', '@office', '@waiting', '@focus', '@anywhere'];
        const matches = contexts.filter(c => c.toLowerCase().startsWith('@' + partial));
        
        if (matches.length > 0) {
          const beforeAt = line.slice(0, line.lastIndexOf('@'));
          return [matches.map(c => beforeAt + c), line];
        }
      }
    }
    
    // Project completion (+)
    if (line.includes('+')) {
      const plusMatch = line.match(/\+([\w-]*)$/);
      if (plusMatch) {
        const partial = plusMatch[1].toLowerCase();
        const projects = services.garden.getByType('project');
        const slugs = projects.map(p => '+' + p.title.toLowerCase().replace(/\s+/g, '-'));
        const matches = slugs.filter(s => s.startsWith('+' + partial));

        if (matches.length > 0) {
          const beforePlus = line.slice(0, line.lastIndexOf('+'));
          return [matches.map(s => beforePlus + s), line];
        }
      }
    }

    // Tag completion (#)
    if (line.includes('#')) {
      const hashMatch = line.match(/#([\w-]*)$/);
      if (hashMatch) {
        const partial = hashMatch[1].toLowerCase();

        // Collect all unique tags from all records
        const allPages = [
          ...services.garden.getByType('action', { status: 'active' }),
          ...services.garden.getByType('project'),
          ...services.garden.getByType('note'),
          ...services.garden.getByType('event'),
          ...services.garden.getByType('media'),
          ...services.garden.getByType('contact'),
        ];

        // Tag autocomplete removed - tags no longer supported
      }
    }
    
    // Command completion
    const commands = [
      'help', 'status', 'quit',
      'new action ', 'new note ', 'new project ',
      'show next actions', 'show projects', 'show notes', 'show contacts',
      'show inbox', 'process inbox', 'show overdue', 'show waiting',
      'capture ', 'done ', 'edit ', 'open ', 'recent',
      'delete ', 'delete project ', 'delete contact ',
      'remove ', 'remove project ', 'remove contact ',
      'today', 'calendar', 'add event ', 'remind me ',
      'ingest ', 'ask shed ', 'list sources',
    ];
    
    const matches = commands.filter(c => c.startsWith(lowerLine));
    return [matches, line];
  };
}

export async function startRepl(
  router: CommandRouter,
  agent: Agent,
  services: ServiceContainer,
  dashboardServer: DashboardServer
): Promise<void> {
  // Load persistent command history
  const historyPath = getDbPath(services.config, 'history.txt');
  ensureDir(path.dirname(historyPath));
  const history = loadHistory(historyPath);
  debug('Command history loaded', { historyPath, lines: history.length });

  // Tab completion requires TTY mode
  debug('Terminal mode', {
    stdinIsTTY: process.stdin.isTTY,
    stdoutIsTTY: process.stdout.isTTY
  });

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '\n> ',
    terminal: !!process.stdin.isTTY,  // Enable terminal mode only if stdin is a TTY
    completer: process.stdin.isTTY ? createCompleter(services) : undefined,
    history,  // Load persistent history
    historySize: 1000,  // Keep last 1000 commands in memory
  });

  // Bracketed paste mode support
  let pasteBuffer: string[] = [];
  let inPasteMode = false;

  // Enable bracketed paste mode (terminal sends \x1b[200~ before paste, \x1b[201~ after)
  if (process.stdin.isTTY) {
    process.stdout.write('\x1b[?2004h'); // Enable bracketed paste
    debug('Bracketed paste mode enabled');
  }

  const dashboardPort = process.env.DASHBOARD_PORT || '3333';
  console.log('\n📋 Bartleby is ready. Type "help" for commands, "quit" to exit.');
  console.log(`📊 Dashboard: http://localhost:${dashboardPort}\n`);

  // === First Launch Setup ===
  if (services.settings.isFirstRun()) {
    await runFirstLaunch(rl, services);
  }

  // Start personal context session
  services.context.startSession();

  rl.prompt();

  rl.on('line', async (line) => {
    // Check for bracketed paste markers
    if (line.includes('\x1b[200~')) {
      // Paste start detected
      inPasteMode = true;
      pasteBuffer = [];
      // Remove the marker and keep any content after it
      const content = line.replace('\x1b[200~', '').trim();
      if (content) {
        pasteBuffer.push(content);
      }
      debug('Paste mode started');
      return;
    }

    if (line.includes('\x1b[201~')) {
      // Paste end detected
      inPasteMode = false;
      // Remove the marker and keep any content before it
      const content = line.replace('\x1b[201~', '').trim();
      if (content) {
        pasteBuffer.push(content);
      }

      // Process the entire paste buffer as one input
      const pastedInput = pasteBuffer.join('\n');
      pasteBuffer = [];

      if (!pastedInput) {
        rl.prompt();
        return;
      }

      debug('Paste mode ended', { lines: pastedInput.split('\n').length });

      // Save pasted input to history
      appendToHistory(historyPath, pastedInput);

      // Process the pasted content
      await processInput(pastedInput, rl, router, agent, services, dashboardServer);
      return;
    }

    // If in paste mode, buffer the line
    if (inPasteMode) {
      pasteBuffer.push(line);
      return;
    }

    // Normal input handling
    const input = line.trim();

    if (!input) {
      rl.prompt();
      return;
    }

    // Save command to history
    appendToHistory(historyPath, input);

    await processInput(input, rl, router, agent, services, dashboardServer);
  });

  // Note: Shutdown is handled by handleShutdown() which is called from:
  // 1. quit command (in processInput)
  // 2. SIGINT/SIGTERM signals (below)
  // No need for separate rl.on('close') handler as it causes race conditions

  // Handle shutdown signals (Ctrl+C, kill, etc.)
  const signalHandler = async () => {
    await handleShutdown(rl, services, dashboardServer);
  };

  process.on('SIGINT', signalHandler);   // Ctrl+C
  process.on('SIGTERM', signalHandler);  // kill command
}

/**
 * Handle graceful shutdown with presence message
 *
 * Used by: quit command, SIGINT (Ctrl+C), SIGTERM (kill)
 */
async function handleShutdown(
  rl: readline.Interface,
  services: ServiceContainer,
  dashboardServer: DashboardServer
): Promise<void> {
  // Disable bracketed paste mode
  if (process.stdin.isTTY) {
    process.stdout.write('\x1b[?2004l');
  }

  console.log('\nGoodbye! 👋\n');
  info('Shutting down...');

  try {
    // Skip session analysis during shutdown (it makes LLM calls which can hang)
    // Just clear the current session
    if (services.context['currentSession']) {
      services.context['currentSession'] = null;
    }
    console.log('[DEBUG] Session cleared, stopping dashboard');
    info('Stopping dashboard...');

    // Stop dashboard with timeout
    await Promise.race([
      dashboardServer.stop(),
      new Promise(resolve => setTimeout(resolve, 3000))
    ]);
    info('Dashboard stopped');
  } catch (err) {
    warn('Shutdown error', { error: String(err) });
  }

  // Always close services to save state
  info('Closing services...');
  closeServices(services);
  info('Services closed');

  rl.close();
  console.log('[DEBUG] About to call process.exit(0)');
  process.exit(0);
}
