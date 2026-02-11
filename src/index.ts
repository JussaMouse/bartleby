// src/index.ts
import { loadConfig, Config } from './config.js';
import { configureLogger, LogLevel, info, error } from './utils/logger.js';
import { initServices, closeServices, ServiceContainer } from './services/index.js';
import { CommandRouter } from './router/index.js';
import { Agent } from './agent/index.js';
import { startRepl } from './repl.js';

function validateSecurityPosture(config: Config): void {
  const errors: string[] = [];
  const warnings: string[] = [];

  const dashboardHost = process.env.DASHBOARD_HOST || 'localhost';
  const apiToken = process.env.BARTLEBY_API_TOKEN?.trim() || '';

  // Check dashboard host binding
  if (dashboardHost === '0.0.0.0') {
    errors.push('DASHBOARD_HOST=0.0.0.0 exposes Bartleby to ALL networks');
    errors.push('Use localhost (server-only) or Tailscale IP (VPN-only)');
  }

  // Require API token if not localhost
  if (dashboardHost !== 'localhost' && dashboardHost !== '127.0.0.1') {
    if (!apiToken) {
      errors.push('BARTLEBY_API_TOKEN required when DASHBOARD_HOST is not localhost');
      errors.push('Generate with: openssl rand -hex 32');
    } else if (apiToken.length < 32) {
      warnings.push('BARTLEBY_API_TOKEN should be at least 32 characters for security');
    }
  }

  // Check LLM endpoints are local (or have API key if remote)
  const endpoints = [
    { name: 'ROUTER_URL', url: config.llm.router.url },
    { name: 'FAST_URL', url: config.llm.fast.url },
    { name: 'THINKING_URL', url: config.llm.thinking.url },
    { name: 'EMBEDDINGS_URL', url: config.embeddings.url },
  ];

  if (config.ocr.enabled && config.ocr.url) {
    endpoints.push({ name: 'OCR_URL', url: config.ocr.url });
  }

  for (const { name, url } of endpoints) {
    const isLocal = url.includes('localhost') || url.includes('127.0.0.1');

    if (!isLocal) {
      // Remote endpoint - warn about data leaving machine
      warnings.push(`${name} points to remote service (${url})`);
      warnings.push('Your queries may be visible to the service provider');

      // Require API key for remote endpoints
      if (!config.llm.apiKey && !process.env.MLX_API_KEY) {
        warnings.push(`${name} is remote but no MLX_API_KEY set - endpoint may be exposed`);
      }
    }
  }

  // Check logging level
  if (config.logging.level === 'debug') {
    warnings.push('LOG_LEVEL=debug may log sensitive data. Use info in production.');
  }

  if (config.logging.llmVerbose) {
    warnings.push('LOG_LLM_VERBOSE=true logs full conversations including sensitive data');
    warnings.push('Disable this in production');
  }

  // Display warnings
  if (warnings.length > 0) {
    console.warn('\n⚠️  Security Warnings:\n');
    warnings.forEach(w => console.warn(`  - ${w}`));
    console.warn('');
  }

  // Display errors and exit
  if (errors.length > 0) {
    console.error('\n❌ Security Errors:\n');
    errors.forEach(e => console.error(`  - ${e}`));
    console.error('\nBartleby will not start with insecure configuration.');
    console.error('See devs-notes/security-implementation-plan.md for guidance.\n');
    process.exit(1);
  }
}

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

  // 2.5. Validate security posture
  validateSecurityPosture(config);

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
