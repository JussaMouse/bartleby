// src/dashboard.ts
// Standalone dashboard server that watches Garden for changes

import { DashboardServer } from './server/index.js';
import { GardenService } from './services/garden.js';
import { CalendarService } from './services/calendar.js';
import { loadConfig } from './config.js';
import { info, error } from './utils/logger.js';
import chokidar from 'chokidar';
import path from 'path';

async function main() {
  const config = loadConfig();
  
  info('Starting Bartleby Dashboard...');
  
  // Initialize services (read-only, no REPL)
  const calendar = new CalendarService(config);
  const garden = new GardenService(config);
  
  // Start dashboard server
  const dashboard = new DashboardServer(garden, calendar);
  const port = parseInt(process.env.DASHBOARD_PORT || '3333', 10);
  dashboard.start(port);
  
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
      garden.syncAll();
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
    process.exit(0);
  });
  
  console.log(`\n📊 Dashboard running at http://localhost:${port}`);
  console.log('   Open in browser while using Bartleby CLI in iTerm2\n');
}

main().catch((err) => {
  error('Dashboard failed to start', { error: String(err) });
  process.exit(1);
});
