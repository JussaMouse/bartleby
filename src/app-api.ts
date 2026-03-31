import { loadConfig } from './config.js';
import { initServices, closeServices } from './services/index.js';
import { SettingsService } from './services/settings.js';
import { AppServer } from './api/app-server.js';
import { info, error } from './utils/logger.js';

async function main(): Promise<void> {
  const settings = new SettingsService();
  await settings.initialize();
  const config = loadConfig(settings);
  const services = await initServices(config, { settings });

  const port = config.dashboard.port || 3333;
  const server = new AppServer(services);
  await server.start(port);

  process.on('SIGINT', () => {
    info('Shutting down app api server...');
    server.stop();
    closeServices(services);
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    server.stop();
    closeServices(services);
    process.exit(0);
  });
}

main().catch((err) => {
  error('App API failed to start', { error: String(err) });
  process.exit(1);
});
