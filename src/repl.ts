import readline from 'readline';
import fs from 'fs';
import path from 'path';
import { CommandRouter } from './router/index.js';
import { Agent } from './agent/index.js';
import { ServiceContainer, closeServices } from './services/index.js';
import { info, warn, error, debug } from './utils/logger.js';
import { getDbPath, ensureDir } from './config.js';
import { runFirstLaunch } from './setup/first-launch.js';
import { handleCommand } from './app/command-handler.js';
import type { SignalReceiver } from './transports/signal-receiver.js';

function formatConversationMirror(channel: string, direction: string, text: string, counterpart?: string): string {
  const channelLabel = channel.toUpperCase();
  const arrow = direction === 'inbound' ? '<-' : '->';
  const peer = counterpart ? ` ${counterpart}` : '';
  return `[${channelLabel} ${arrow}${peer}] ${text}`;
}

function loadHistory(historyPath: string, maxLines = 1000): string[] {
  try {
    if (fs.existsSync(historyPath)) {
      const content = fs.readFileSync(historyPath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());
      return lines.slice(-maxLines);
    }
  } catch (err) {
    warn('Failed to load command history', { error: String(err) });
  }
  return [];
}

function appendToHistory(historyPath: string, command: string): void {
  try {
    if (!command.trim()) return;
    const existing = loadHistory(historyPath, 1);
    if (existing.length > 0 && existing[existing.length - 1] === command) {
      return;
    }
    fs.appendFileSync(historyPath, command + '\n', 'utf-8');
  } catch (err) {
    warn('Failed to save command to history', { error: String(err) });
  }
}

async function processInput(
  input: string,
  rl: readline.Interface,
  router: CommandRouter,
  agent: Agent,
  services: ServiceContainer,
  signalReceiver?: SignalReceiver,
  teardown?: () => void
): Promise<void> {
  services.runtimeActivity.record({ channel: 'cli', direction: 'inbound', text: input });

  try {
    const result = await handleCommand(input, router, agent, services, {
      allowExit: true,
      onComplex: () => {
        debug('Handling with Thinking model (complex agentic loop)');
        console.log('\n🤔 This looks like a complex request. Let me work on it...\n');
      },
    });

    if (result.didExit) {
      await handleShutdown(rl, services, signalReceiver, teardown);
      return;
    }

    services.runtimeActivity.record({ channel: 'cli', direction: 'outbound', text: result.reply });
    console.log(`\n${result.reply}`);
  } catch (err) {
    error('REPL error', { error: String(err) });
    console.log(`\nError: ${err}`);
  }

  rl.prompt();
}

function createCompleter(services: ServiceContainer) {
  return (line: string): [string[], string] => {
    const lowerLine = line.toLowerCase();
    const projectCommands = ['delete project ', 'remove project '];
    const needsProject = projectCommands.some(cmd => lowerLine.startsWith(cmd));

    if (needsProject) {
      const cmdMatch = line.match(/^((?:delete|remove)\s+project\s+)(.*)$/i);
      if (cmdMatch) {
        const prefix = cmdMatch[1];
        const partial = cmdMatch[2].toLowerCase();
        const projects = services.garden.getByType('project');
        const titles = projects.map(p => p.title);
        const matches = titles.filter(t => t.toLowerCase().startsWith(partial));
        if (matches.length > 0) {
          return [matches.map(m => prefix + m), line];
        }
      }
    }

    const actionCommands = ['done ', 'complete '];
    const needsAction = actionCommands.some(cmd => lowerLine.startsWith(cmd));
    if (needsAction) {
      const cmdMatch = line.match(/^(\w+\s+)(.*)$/i);
      if (cmdMatch) {
        const prefix = cmdMatch[1];
        const partial = cmdMatch[2].toLowerCase();
        const actions = services.garden.getByType('action', { status: 'active' });
        const titles = actions.map(a => a.title);
        const matches = titles.filter(t => t.toLowerCase().startsWith(partial));
        if (matches.length > 0) {
          return [matches.map(m => prefix + m), line];
        }
      }
    }

    const titleCommands = ['open ', 'edit ', 'read ', 'delete ', 'remove '];
    const showKeywords = ['next', 'projects', 'notes', 'contacts', 'inbox', 'overdue', 'waiting', 'someday', 'tagged', 'reminders'];
    const isShowWithTitle = lowerLine.startsWith('show ') && !showKeywords.some(kw => lowerLine.startsWith('show ' + kw));
    const needsTitle = (titleCommands.some(cmd => lowerLine.startsWith(cmd)) || isShowWithTitle) && !needsProject;

    if (needsTitle) {
      const cmdMatch = line.match(/^(\w+\s+)(.*)$/i);
      if (cmdMatch) {
        const prefix = cmdMatch[1];
        const partial = cmdMatch[2].toLowerCase();
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
  signalReceiver?: SignalReceiver,
): Promise<void> {
  const historyPath = getDbPath(services.config, 'history.txt');
  ensureDir(path.dirname(historyPath));
  const history = loadHistory(historyPath);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '\n> ',
    terminal: !!process.stdin.isTTY,
    completer: process.stdin.isTTY ? createCompleter(services) : undefined,
    history,
    historySize: 1000,
  });

  let pasteBuffer: string[] = [];
  let inPasteMode = false;

  if (process.stdin.isTTY) {
    process.stdout.write('\x1b[?2004h');
  }

  console.log('\n📋 Bartleby is ready. Type "help" for commands, "quit" to exit.');
  console.log('📊 Dashboard: legacy implementation removed; future rewrite pending.\n');

  if (services.settings.isFirstRun()) {
    await runFirstLaunch(rl, services);
  }

  services.context.startSession();
  rl.prompt();

  const unsubscribeConversationMirror = () => undefined;

  rl.on('line', async (line) => {
    if (line.includes('\x1b[200~')) {
      inPasteMode = true;
      pasteBuffer = [];
      const content = line.replace('\x1b[200~', '').trim();
      if (content) pasteBuffer.push(content);
      return;
    }

    if (line.includes('\x1b[201~')) {
      inPasteMode = false;
      const content = line.replace('\x1b[201~', '').trim();
      if (content) pasteBuffer.push(content);
      const pastedInput = pasteBuffer.join('\n');
      pasteBuffer = [];
      if (!pastedInput) {
        rl.prompt();
        return;
      }
      appendToHistory(historyPath, pastedInput);
      await processInput(pastedInput, rl, router, agent, services, signalReceiver, unsubscribeConversationMirror);
      return;
    }

    if (inPasteMode) {
      pasteBuffer.push(line);
      return;
    }

    const input = line.trim();
    if (!input) {
      rl.prompt();
      return;
    }

    appendToHistory(historyPath, input);
    await processInput(input, rl, router, agent, services, signalReceiver, unsubscribeConversationMirror);
  });

  const signalHandler = async () => {
    await handleShutdown(rl, services, signalReceiver, unsubscribeConversationMirror);
  };

  process.on('SIGINT', signalHandler);
  process.on('SIGTERM', signalHandler);
}

async function handleShutdown(
  rl: readline.Interface,
  services: ServiceContainer,
  signalReceiver?: SignalReceiver,
  teardown?: () => void
): Promise<void> {
  if (services.config.presence.shutdown && services.signal.isEnabled()) {
    const sent = await services.signal.send('Bartleby is shutting down.');
    if (!sent) {
      warn('Shutdown Signal presence failed to send');
    }
  }

  if (process.stdin.isTTY) {
    process.stdout.write('\x1b[?2004l');
  }

  console.log('\nGoodbye! 👋\n');
  info('Shutting down...');

  try {
    if (services.context['currentSession']) {
      services.context['currentSession'] = null;
    }

    if (signalReceiver) {
      info('Stopping Signal receiver...');
      signalReceiver.stop();
    }
  } catch (err) {
    warn('Shutdown error', { error: String(err) });
  }

  info('Closing services...');
  closeServices(services);
  info('Services closed');

  teardown?.();
  rl.close();
  process.exit(0);
}
