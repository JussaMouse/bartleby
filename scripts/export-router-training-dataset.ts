#!/usr/bin/env tsx

import { configureLogger, LogLevel } from '../src/utils/logger.js';
import { SettingsService } from '../src/services/settings.js';
import { loadConfig } from '../src/config.js';
import { closeServices, initServices } from '../src/services/index.js';

interface CliArgs {
  userId?: string;
  datasetVersion?: string;
  maxExamples?: number;
  json: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  let userId: string | undefined;
  let datasetVersion: string | undefined;
  let maxExamples: number | undefined;
  let json = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--user' && argv[i + 1]) {
      userId = argv[++i];
    } else if (arg === '--dataset-version' && argv[i + 1]) {
      datasetVersion = argv[++i];
    } else if (arg === '--max-examples' && argv[i + 1]) {
      const parsed = Number(argv[++i]);
      if (Number.isFinite(parsed) && parsed > 0) {
        maxExamples = Math.floor(parsed);
      }
    } else if (arg === '--json') {
      json = true;
    }
  }

  return { userId, datasetVersion, maxExamples, json };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  configureLogger({
    level: args.json ? LogLevel.ERROR : LogLevel.INFO,
    console: !args.json,
  });

  const settings = new SettingsService();
  await settings.initialize();
  const config = loadConfig(settings);

  const services = await initServices(config, { settings });

  try {
    const result = services.routerTraining.exportDatasetSnapshot({
      userId: args.userId,
      datasetVersion: args.datasetVersion,
      maxExamples: args.maxExamples,
    });

    if (args.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    console.log('Router training dataset exported:');
    console.log(`  version: ${result.datasetVersion}`);
    console.log(`  dir: ${result.datasetDir}`);
    console.log(`  train: ${result.counts.train}`);
    console.log(`  val: ${result.counts.val}`);
    console.log(`  test: ${result.counts.test}`);
    console.log(`  total: ${result.counts.total}`);
  } finally {
    closeServices(services);
  }
}

main().catch((err) => {
  console.error('Failed to export router training dataset:', err);
  process.exit(1);
});
