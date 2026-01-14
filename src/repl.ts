// src/repl.ts
import readline from 'readline';
import { CommandRouter } from './router/index.js';
import { Agent } from './agent/index.js';
import { ServiceContainer } from './services/index.js';
import { info, warn, error, debug } from './utils/logger.js';

/**
 * Show the list of missed reminders.
 */
function showMissedReminders(missed: Array<{ nextRun: string; actionPayload: unknown }>): void {
  console.log(`\n⏰ **${missed.length} reminder(s) fired while you were away:**\n`);
  
  for (let i = 0; i < missed.length; i++) {
    const task = missed[i];
    const scheduledFor = new Date(task.nextRun).toLocaleString('en-US', {
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
    });
    console.log(`  ${i + 1}. "${task.actionPayload}" (was ${scheduledFor})`);
  }
}

/**
 * One-time wizard to configure missed reminders behavior.
 * Only runs when SCHEDULER_MISSED_REMINDERS is 'default' (unset).
 */
async function runMissedRemindersWizard(
  rl: readline.Interface
): Promise<'ask' | 'fire' | 'skip' | 'show'> {
  console.log('\n' + '─'.repeat(50));
  console.log('📋 **Quick Setup: Missed Reminders**\n');
  console.log('Sometimes you\'ll start Bartleby after reminders were');
  console.log('scheduled to fire. How should I handle these?\n');
  console.log('  **1. ask**  - Show them and ask what to do (recommended)');
  console.log('  **2. fire** - Send all immediately');
  console.log('  **3. skip** - Dismiss silently');
  console.log('  **4. show** - Show them, but don\'t act\n');
  console.log('Type a number or name:');
  console.log('─'.repeat(50));

  return new Promise((resolve) => {
    const handleChoice = (line: string) => {
      const input = line.trim().toLowerCase();
      let choice: 'ask' | 'fire' | 'skip' | 'show' | null = null;

      if (input === '1' || input === 'ask') choice = 'ask';
      else if (input === '2' || input === 'fire') choice = 'fire';
      else if (input === '3' || input === 'skip') choice = 'skip';
      else if (input === '4' || input === 'show') choice = 'show';

      if (choice) {
        console.log(`\n✓ Got it! I'll use "${choice}" for now.\n`);
        rl.removeListener('line', handleChoice);
        resolve(choice);
      } else {
        console.log('Please type 1-4, or: ask, fire, skip, show');
        rl.prompt();
      }
    };

    rl.on('line', handleChoice);
    rl.prompt();
  });
}

/**
 * Interactive handler for when user chooses 'ask' behavior.
 */
async function interactiveRemindersHandler(
  rl: readline.Interface,
  services: ServiceContainer,
  missed: Array<{ id: string; nextRun: string; actionPayload: unknown }>
): Promise<void> {
  // Show the list again so user can see numbers
  console.log('');
  for (let i = 0; i < missed.length; i++) {
    const task = missed[i];
    const scheduledFor = new Date(task.nextRun).toLocaleString('en-US', {
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
    });
    console.log(`  ${i + 1}. "${task.actionPayload}" (was ${scheduledFor})`);
  }
  
  console.log('\n**What would you like to do?**');
  console.log('  **F** = Fire all   **S** = Skip all   **#** = Fire one (e.g. "1")');
  console.log('─'.repeat(50));

  return new Promise((resolve) => {
    const handleResponse = async (line: string) => {
      const input = line.trim().toLowerCase();
      
      if (input === 'f' || input === 'fire' || input === 'fire all' || input === 'send' || input === 'send all') {
        const count = await services.scheduler.fireAllMissed();
        console.log(`\n✓ Sent ${count} reminder(s)`);
        rl.removeListener('line', handleResponse);
        resolve();
      } else if (input === 's' || input === 'skip' || input === 'skip all' || input === 'dismiss' || input === 'dismiss all') {
        const count = services.scheduler.dismissAllMissed();
        console.log(`\n✓ Dismissed ${count} reminder(s)`);
        rl.removeListener('line', handleResponse);
        resolve();
      } else if (/^\d+$/.test(input)) {
        const idx = parseInt(input) - 1;
        if (idx >= 0 && idx < missed.length) {
          const task = missed[idx];
          await services.scheduler.fireReminder(task.id);
          console.log(`\n✓ Sent: "${task.actionPayload}"`);
          
          // Check if more remain
          const remaining = services.scheduler.getMissedReminders();
          if (remaining.length === 0) {
            console.log('All caught up!');
            rl.removeListener('line', handleResponse);
            resolve();
          } else {
            // Show remaining list
            console.log(`\n${remaining.length} remaining:`);
            for (let i = 0; i < remaining.length; i++) {
              const t = remaining[i];
              console.log(`  ${i + 1}. "${t.actionPayload}"`);
            }
            console.log('\n**F** = Fire all   **S** = Skip all   **#** = Fire one');
            rl.prompt();
          }
        } else {
          console.log(`Invalid number. Choose 1-${missed.length}, F, or S.`);
          rl.prompt();
        }
      } else {
        console.log('Type F (fire all), S (skip all), or a number.');
        rl.prompt();
      }
    };

    rl.on('line', handleResponse);
    rl.prompt();
  });
}

/**
 * Check for and handle missed reminders at startup.
 * Behavior controlled by SCHEDULER_MISSED_REMINDERS config:
 * - 'default': First time - run wizard to configure, then handle
 * - 'ask': Show summary and ask what to do
 * - 'fire': Fire all immediately
 * - 'skip': Dismiss all silently
 * - 'show': Show summary only, don't act
 */
async function handleMissedReminders(
  rl: readline.Interface,
  services: ServiceContainer
): Promise<void> {
  const missed = services.scheduler.getMissedReminders();
  debug('Checking for missed reminders', { 
    count: missed.length, 
    config: services.config.scheduler.missedReminders 
  });
  if (missed.length === 0) return;

  let behavior = services.config.scheduler.missedReminders;
  let wizardRan = false;

  // If 'default', run the one-time wizard
  if (behavior === 'default') {
    console.log('─'.repeat(50));
    showMissedReminders(missed);
    behavior = await runMissedRemindersWizard(rl);
    wizardRan = true;
  } else {
    console.log('─'.repeat(50));
    showMissedReminders(missed);
  }

  // Now handle based on chosen/configured behavior
  switch (behavior) {
    case 'fire':
      const firedCount = await services.scheduler.fireAllMissed();
      console.log(`\n✓ Sent ${firedCount} reminder(s)`);
      break;

    case 'skip':
      const skippedCount = services.scheduler.dismissAllMissed();
      console.log(`\n✓ Dismissed ${skippedCount} reminder(s)`);
      break;

    case 'show':
      console.log('\n(Use "show reminders" to manage these later.)');
      break;

    case 'ask':
    default:
      await interactiveRemindersHandler(rl, services, missed);
      break;
  }

  // If wizard ran, remind user to save the setting
  if (wizardRan) {
    console.log('\n' + '─'.repeat(50));
    console.log('💾 **Save this setting** — add to your .env:\n');
    console.log(`   SCHEDULER_MISSED_REMINDERS=${behavior}`);
    console.log('─'.repeat(50));
  }
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
        const actions = services.garden.getTasks({ status: 'active' });
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
        
        // Get all page titles
        const pages = [
          ...services.garden.getTasks({ status: 'active' }),
          ...services.garden.getByType('project'),
          ...services.garden.getByType('note'),
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
  services: ServiceContainer
): Promise<void> {
  // Tab completion requires TTY mode
  debug('Terminal mode', { 
    stdinIsTTY: process.stdin.isTTY, 
    stdoutIsTTY: process.stdout.isTTY 
  });
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '\n> ',
    terminal: true,  // Explicitly enable terminal mode for tab completion
    completer: createCompleter(services),
  });

  const dashboardPort = process.env.DASHBOARD_PORT || '3333';
  console.log('\n📋 Bartleby is ready. Type "help" for commands, "quit" to exit.');
  console.log(`📊 Dashboard: http://localhost:${dashboardPort}\n`);

  // === Handle Missed Reminders First ===
  await handleMissedReminders(rl, services);

  // === Startup Presence ===
  // Bartleby's initiative layer decides what to surface at startup
  try {
    const opener = services.presence.getStartupMessage();
    if (opener) {
      console.log('─'.repeat(50));
      console.log(opener);
      console.log('─'.repeat(50));
    }
  } catch (err) {
    warn('Startup presence failed', { error: String(err) });
  }

  // Start personal context session
  services.context.startSession();

  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();

    if (!input) {
      rl.prompt();
      return;
    }

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
          // Simple request, no router match - use Fast model
          debug('Handling with Fast model (simple)');
          response = await agent.handleSimple(input);
          break;

        case 'llm-complex':
          // Complex request - use Thinking model with agentic loop
          debug('Handling with Thinking model (complex agentic loop)');
          console.log('\n🤔 This looks like a complex request. Let me work on it...\n');
          response = await agent.handleComplex(input);
          break;

        default:
          response = "I'm not sure how to help with that. Try 'help' for commands.";
      }

      // Check for exit
      if (response === '__EXIT__') {
        await handleShutdown(rl, services);
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
  });

  rl.on('close', async () => {
    info('Session ended');
    await services.context.endSession();
    process.exit(0);
  });

  // Handle Ctrl+C
  process.on('SIGINT', async () => {
    await handleShutdown(rl, services);
  });
}

/**
 * Handle graceful shutdown with presence message
 */
async function handleShutdown(
  rl: readline.Interface,
  services: ServiceContainer
): Promise<void> {
  // Show shutdown presence message
  try {
    const shutdownMsg = services.presence.getShutdownMessage();
    if (shutdownMsg) {
      console.log('\n' + '─'.repeat(50));
      console.log(shutdownMsg);
      console.log('─'.repeat(50));
    }
  } catch (err) {
    warn('Shutdown presence failed', { error: String(err) });
  }

  console.log('\nGoodbye! 👋\n');
  await services.context.endSession();
  rl.close();
}
