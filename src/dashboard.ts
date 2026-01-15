// src/dashboard.ts
// Standalone dashboard server that watches Garden for changes

import { DashboardServer } from './server/index.js';
import { loadConfig } from './config.js';
import { initServices, closeServices } from './services/index.js';
import { CommandRouter } from './router/index.js';
import { Agent } from './agent/index.js';
import { info, error } from './utils/logger.js';
import chokidar from 'chokidar';
import path from 'path';

async function main() {
  const config = loadConfig();
  
  info('Starting Bartleby Dashboard...');
  
  // Initialize full services for chat + dashboard
  const services = await initServices(config);
  const router = new CommandRouter();
  await router.initialize(services);
  const agent = new Agent(services);
  services.context.startSession();
  
  // Start dashboard server
  const dashboard = new DashboardServer(services, router, agent);
  const port = parseInt(process.env.DASHBOARD_PORT || '3333', 10);
  const host = process.env.DASHBOARD_HOST || 'localhost';
  dashboard.start(port, host);
  
  // Watch Garden directory for changes
  const gardenPath = path.resolve(config.paths.garden);
  info('Watching Garden for changes', { path: gardenPath });
  
  const watcher = chokidar.watch(gardenPath, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 300,
      pollInterval: 100,
    },
  });
  
  let debounceTimer: NodeJS.Timeout | null = null;
  
  const handleChange = () => {
    // Debounce rapid changes
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      info('Garden changed, broadcasting updates');
      // Re-sync Garden from files
      services.garden.syncAll();
      // Broadcast to all dashboard clients
      dashboard.broadcastAll();
    }, 500);
  };
  
  watcher.on('add', handleChange);
  watcher.on('change', handleChange);
  watcher.on('unlink', handleChange);
  
  // Handle shutdown
  process.on('SIGINT', () => {
    info('Shutting down dashboard...');
    watcher.close();
    dashboard.stop();
    closeServices(services);
    process.exit(0);
  });
  
  const displayHost = host === '0.0.0.0' ? 'YOUR_SERVER_IP' : host;
  console.log(`\n📊 Dashboard running at http://${displayHost}:${port}`);
  console.log('   Open in browser while using Bartleby CLI\n');
}

main().catch((err) => {
  error('Dashboard failed to start', { error: String(err) });
  process.exit(1);
});
