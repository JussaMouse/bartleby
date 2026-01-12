// src/index.ts
import { loadConfig, Config } from './config.js';
import { configureLogger, LogLevel, info, error } from './utils/logger.js';
import { initServices, closeServices, ServiceContainer } from './services/index.js';
import { CommandRouter } from './router/index.js';
import { Agent } from './agent/index.js';
import { startRepl } from './repl.js';

async function main(): Promise<void> {
  // 1. Load config
  let config: Config;
  try {
    config = loadConfig();
  } catch (err) {
    console.error('Failed to load config:', err);
    process.exit(1);
  }

  // 2. Configure logging
  const levelMap: Record<string, LogLevel> = {
    debug: LogLevel.DEBUG,
    info: LogLevel.INFO,
    warn: LogLevel.WARN,
    error: LogLevel.ERROR,
  };

  configureLogger({
    level: levelMap[config.logging.level] ?? LogLevel.INFO,
    file: config.logging.file,
    console: config.logging.console,
  });

  info('Bartleby starting...');

  // 3. Initialize services
  let services: ServiceContainer;
  try {
    services = await initServices(config);
  } catch (err) {
    error('Failed to initialize services', { error: String(err) });
    process.exit(1);
  }

  // 4. Create router and agent
  const router = new CommandRouter();
  await router.initialize(services);

  const agent = new Agent(services);

  // 5. Handle shutdown
  const shutdown = async () => {
    info('Shutting down...');
    closeServices(services);
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);

  // 6. Start REPL
  await startRepl(router, agent, services);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
