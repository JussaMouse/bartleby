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
  console.log('\n' + '─'.repeat(50));
  console.log(`⏰ **${missed.length} reminder(s) fired while you were away:**\n`);
  
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
 * Check for and handle missed reminders at startup.
 * Behavior controlled by SCHEDULER_MISSED_REMINDERS config:
 * - 'ask': Show summary and ask what to do (default)
 * - 'fire': Fire all immediately
 * - 'skip': Dismiss all silently
 * - 'show': Show summary only, don't act
 */
async function handleMissedReminders(
  rl: readline.Interface,
  services: ServiceContainer
): Promise<void> {
  const missed = services.scheduler.getMissedReminders();
  if (missed.length === 0) return;

  const behavior = services.config.scheduler.missedReminders;

  switch (behavior) {
    case 'fire':
      // Fire all immediately (old behavior)
      showMissedReminders(missed);
      const firedCount = await services.scheduler.fireAllMissed();
      console.log(`\n✓ Auto-fired ${firedCount} reminder(s) (SCHEDULER_MISSED_REMINDERS=fire)`);
      console.log('─'.repeat(50));
      return;

    case 'skip':
      // Dismiss all silently
      services.scheduler.dismissAllMissed();
      info('Dismissed missed reminders silently', { count: missed.length });
      return;

    case 'show':
      // Just show, user can handle manually later
      showMissedReminders(missed);
      console.log('\n(Showing only. Use "show reminders" to manage.)');
      console.log('─'.repeat(50));
      return;

    case 'ask':
    default:
      // Interactive: ask user what to do
      showMissedReminders(missed);
      console.log('\n**What would you like to do?**');
      console.log('  → **fire** - Send all now');
      console.log('  → **skip** - Dismiss without sending');
      console.log('  → **#** - Fire just that one (e.g., "1")');
      console.log('─'.repeat(50));

      return new Promise((resolve) => {
        const handleResponse = async (line: string) => {
          const input = line.trim().toLowerCase();
          
          if (input === 'fire' || input === 'fire all' || input === 'send' || input === 'send all') {
            const count = await services.scheduler.fireAllMissed();
            console.log(`\n✓ Sent ${count} reminder(s)`);
            rl.removeListener('line', handleResponse);
            resolve();
          } else if (input === 'skip' || input === 'skip all' || input === 'dismiss' || input === 'dismiss all') {
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
                console.log(`\n${remaining.length} remaining. Type another number, "fire", or "skip".`);
                rl.prompt();
              }
            } else {
              console.log(`Invalid number. Choose 1-${missed.length}, "fire", or "skip".`);
              rl.prompt();
            }
          } else {
            console.log('Please type "fire", "skip", or a number.');
            rl.prompt();
          }
        };

        rl.on('line', handleResponse);
        rl.prompt();
      });
  }
}

export async function startRepl(
  router: CommandRouter,
  agent: Agent,
  services: ServiceContainer
): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '\n> ',
  });

  console.log('\n📋 Bartleby is ready. Type "help" for commands, "quit" to exit.\n');

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
