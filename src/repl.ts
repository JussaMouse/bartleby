// src/repl.ts
import readline from 'readline';
import { CommandRouter } from './router/index.js';
import { Agent } from './agent/index.js';
import { ServiceContainer } from './services/index.js';
import { info, warn, error, debug } from './utils/logger.js';

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

  // === Proactive Session Opener ===
  try {
    const opener = await services.proactive.getSessionOpener();
    if (opener) {
      console.log('─'.repeat(50));
      console.log(opener);
      console.log('─'.repeat(50));
    }
  } catch (err) {
    warn('Proactive opener failed', { error: String(err) });
  }

  // Start memory session
  services.memory.startSession();

  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();

    if (!input) {
      rl.prompt();
      return;
    }

    // Record user message
    services.memory.recordMessage(input, true);

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
        console.log('\nGoodbye! 👋\n');
        await services.memory.endSession();
        rl.close();
        return;
      }

      // Record response
      services.memory.recordMessage(response, false);

      console.log(`\n${response}`);
    } catch (err) {
      error('REPL error', { error: String(err) });
      console.log(`\nError: ${err}`);
    }

    rl.prompt();
  });

  rl.on('close', async () => {
    info('Session ended');
    await services.memory.endSession();
    process.exit(0);
  });

  // Handle Ctrl+C
  process.on('SIGINT', async () => {
    console.log('\n\nGoodbye! 👋\n');
    await services.memory.endSession();
    rl.close();
  });
}
