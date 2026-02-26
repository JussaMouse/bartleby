// src/dashboard.ts
// Standalone dashboard server (no REPL)

import { DashboardServer } from './server/index.js';
import { loadConfig } from './config.js';
import { initServices, closeServices } from './services/index.js';
import { CommandRouter } from './router/index.js';
import { Agent } from './agent/index.js';
import { info, error } from './utils/logger.js';

async function main() {
  const config = loadConfig();

  info('Starting Bartleby Dashboard...');

  const services = await initServices(config);
  const router = new CommandRouter();
  await router.initialize(services);
  const agent = new Agent(services);
  services.context.startSession();

  const port = parseInt(process.env.DASHBOARD_PORT || '3333', 10);
  const dashboard = new DashboardServer(services, router, agent);
  await dashboard.start(port);

  const displayHost = process.env.DASHBOARD_HOST || 'localhost';
  console.log(`\n📊 Dashboard running at http://${displayHost}:${port}`);
  console.log('   Open in browser while using Bartleby CLI\n');

  process.on('SIGINT', () => {
    info('Shutting down dashboard...');
    dashboard.stop();
    closeServices(services);
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    dashboard.stop();
    closeServices(services);
    process.exit(0);
  });
}

main().catch((err) => {
  error('Dashboard failed to start', { error: String(err) });
  process.exit(1);
});
