import { Tool } from './types.js';

export const exitBartleby: Tool = {
  name: 'exitBartleby',
  description: 'Shut down Bartleby',

  routing: {
    patterns: [
      /^(?:quit|exit)$/i,
      /^(?:quit|exit)\s+(?:bartleby|app|application|program)$/i,
      /^shut\s+down$/i,
      /^shutdown$/i,
    ],
    keywords: {
      verbs: ['quit', 'exit', 'shutdown'],
      nouns: ['bartleby', 'app', 'application'],
    },
    examples: ['quit', 'exit', 'shutdown'],
    priority: 100,
    intentClass: 'system',
  },

  parseArgs: () => ({}),

  execute: async () => '__EXIT__',
};

export const sendSignalMessage: Tool = {
  name: 'sendSignalMessage',
  description: 'Send a Signal message to the configured recipient',

  routing: {
    patterns: [
      /^send\s+signal\s+(.+)$/i,
      /^send\s+a\s+signal\s+(.+)$/i,
      /^signal\s+(.+)$/i,
    ],
    keywords: {
      verbs: ['send', 'signal', 'message', 'text'],
      nouns: ['signal', 'message', 'text'],
    },
    examples: ['send signal test msg', 'signal hello from bartleby'],
    priority: 96,
    intentClass: 'mutation_create',
  },

  parseArgs: (input) => {
    const match = input.match(/^send\s+(?:a\s+)?signal\s+(.+)$/i) || input.match(/^signal\s+(.+)$/i);
    return { message: match?.[1]?.trim() ?? '' };
  },

  execute: async (args, context) => {
    const message = String(args.message ?? '').trim();
    if (!message) {
      return 'Error: Usage: send signal <message>';
    }

    const signal = context.services.signal;
    if (!signal.isEnabled()) {
      return 'Signal is disabled. Set signal.enabled to true and restart Bartleby.';
    }

    const recipient = context.services.config.signal.recipient;
    if (!recipient) {
      return 'Signal recipient is not configured. Set signal.recipient first.';
    }

    const result = await signal.sendDetailed(message);
    if (!result.ok) {
      if (result.error?.includes('ENOENT')) {
        return `Signal send failed: signal-cli not found at ${context.services.config.signal.cliPath}.`;
      }
      if (result.stderr) {
        return `Signal send failed: ${result.stderr}`;
      }
      return `Signal send failed: ${result.error || 'unknown error'}`;
    }

    return `Signal sent to ${recipient}.`;
  },
};

export const showHelp: Tool = {
  name: 'showHelp',
  description: 'Show a concise command reference',

  routing: {
    patterns: [
      /^help$/i,
      /^\/help$/i,
      /^commands?$/i,
      /^what can you do\??$/i,
    ],
    keywords: {
      verbs: ['show', 'view'],
      nouns: ['help', 'commands', 'command list'],
    },
    examples: ['help', 'commands', 'what can you do'],
    priority: 95,
    intentClass: 'system',
  },

  parseArgs: () => ({}),

  execute: async (_args, context) => {
    const host = context.services.config.dashboard.host || 'localhost';
    const port = context.services.config.dashboard.port || 3333;

    return [
      'Bartleby command reference',
      '',
      'Core:',
      '  help',
      '  status',
      '  send signal <message>',
      '  settings',
      '  show history',
      '  quit',
      '',
      'Garden:',
      '  show inbox',
      '  show next actions',
      '  new action <title>',
      '  new note <title>',
      '  show contacts',
      '  calendar',
      '',
      'Data:',
      '  tables',
      '  sql <query>',
      '  tax status',
      '',
      'Router training:',
      '  routing training status',
      '  routing training review',
      '  routing training run',
      '  routing training compare <run-id>',
      '  routing training promote <run-id>',
      '  routing training rollback',
      '  open the Router Training panel in the dashboard',
      '',
      `Dashboard: http://${host}:${port}`,
    ].join('\n');
  },
};

export const showStatus: Tool = {
  name: 'showStatus',
  description: 'Show a concise system and workspace status summary',

  routing: {
    patterns: [
      /^status$/i,
      /^show status$/i,
      /^system status$/i,
    ],
    keywords: {
      verbs: ['show', 'view'],
      nouns: ['status', 'system status'],
    },
    examples: ['status', 'show status', 'system status'],
    priority: 94,
    intentClass: 'system',
  },

  parseArgs: () => ({}),

  execute: async (_args, context) => {
    const { garden, llm, routerTraining, config } = context.services;
    const host = config.dashboard.host || 'localhost';
    const port = config.dashboard.port || 3333;

    const actions = garden.getByType('action', { status: 'active' }).length;
    const projects = garden.getByType('project', { status: 'active' }).length;
    const notes = garden.getByType('note').length;
    const contacts = garden.getByType('contact', { status: 'active' }).length;
    const training = routerTraining.getStatus();

    return [
      'Bartleby status',
      '',
      `Dashboard: http://${host}:${port}`,
      `LLM router tier healthy: ${llm.isHealthy('router') ? 'yes' : 'no'}`,
      `LLM fast tier healthy: ${llm.isHealthy('fast') ? 'yes' : 'no'}`,
      `LLM thinking tier healthy: ${llm.isHealthy('thinking') ? 'yes' : 'no'}`,
      '',
      'Workspace:',
      `  active actions: ${actions}`,
      `  active projects: ${projects}`,
      `  notes: ${notes}`,
      `  active contacts: ${contacts}`,
      '',
      'Router training:',
      `  enabled: ${training.enabled ? 'yes' : 'no'}`,
      `  capture mode: ${training.captureMode}`,
      `  shadow enabled: ${training.shadowEnabled ? 'yes' : 'no'}`,
      `  canary percent: ${training.canaryPercent}`,
      `  shadow promotion gate: ${training.minimumShadowObservationsToPromote} observations`,
      `  canary promotion gate: ${training.minimumCanaryRequestsToPromote} requests`,
      `  canary success gate: ${(training.minimumCanarySuccessRateToPromote * 100).toFixed(1)}%`,
      `  canary latency regression gate: ${Math.round(training.maxCanaryLatencyRegressionMsToPromote)} ms`,
    ].join('\n');
  },
};

export const systemTools: Tool[] = [exitBartleby, sendSignalMessage, showHelp, showStatus];
