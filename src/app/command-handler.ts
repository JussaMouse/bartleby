import { CommandRouter, RouterResult } from '../router/index.js';
import { Agent } from '../agent/index.js';
import { ServiceContainer } from '../services/index.js';
import { debug } from '../utils/logger.js';

export interface CommandHandleOptions {
  allowExit?: boolean;
  stripMarkdown?: boolean;
  onComplex?: () => void;
}

export interface CommandHandleResult {
  reply: string;
  didExit: boolean;
  routerResult: RouterResult;
}

export async function handleCommand(
  input: string,
  router: CommandRouter,
  agent: Agent,
  services: ServiceContainer,
  options: CommandHandleOptions = {}
): Promise<CommandHandleResult> {
  const normalized = input.trim();

  services.context.recordMessage(normalized, true);

  const routerResult = await router.route(normalized);
  let response: string;

  switch (routerResult.type) {
    case 'routed':
      response = routerResult.route
        ? await router.execute(routerResult.route, normalized)
        : "I didn't understand that. Try 'help' for commands.";
      break;

    case 'llm-simple': {
      const startTime = Date.now();
      try {
        response = await agent.handleSimple(normalized);
        const responseTime = Date.now() - startTime;

        if (routerResult.decision) {
          services.llm.recordRoutingOutcome({
            decision: routerResult.decision,
            success: true,
            responseTimeMs: responseTime,
          });
        }
      } catch (err) {
        const responseTime = Date.now() - startTime;

        if (routerResult.decision) {
          services.llm.recordRoutingOutcome({
            decision: routerResult.decision,
            success: false,
            responseTimeMs: responseTime,
            errorMessage: String(err),
          });
        }
        throw err;
      }
      break;
    }

    case 'llm-complex': {
      if (options.onComplex) {
        options.onComplex();
      }

      const startTime = Date.now();
      try {
        response = await agent.handleComplex(normalized);
        const responseTime = Date.now() - startTime;

        if (routerResult.decision) {
          services.llm.recordRoutingOutcome({
            decision: routerResult.decision,
            success: true,
            responseTimeMs: responseTime,
          });
        }
      } catch (err) {
        const responseTime = Date.now() - startTime;

        if (routerResult.decision) {
          services.llm.recordRoutingOutcome({
            decision: routerResult.decision,
            success: false,
            responseTimeMs: responseTime,
            errorMessage: String(err),
          });
        }
        throw err;
      }
      break;
    }

    default:
      response = "I'm not sure how to help with that. Try 'help' for commands.";
      break;
  }

  let reply = response;
  const didExit = response === '__EXIT__';

  if (didExit && !options.allowExit) {
    reply = 'Goodbye.';
  }

  if (options.stripMarkdown) {
    reply = stripMarkdown(reply);
  }

  services.context.recordMessage(reply, false);
  debug('Command handled', { didExit, replyLength: reply.length });

  return { reply, didExit, routerResult };
}

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/#+\s+/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim();
}
