#!/usr/bin/env tsx

import { configureLogger, LogLevel } from '../src/utils/logger.js';
import { SettingsService } from '../src/services/settings.js';
import { loadConfig } from '../src/config.js';
import { closeServices, initServices } from '../src/services/index.js';

async function main(): Promise<void> {
  configureLogger({ level: LogLevel.INFO, console: true });

  const settings = new SettingsService();
  await settings.initialize();
  const config = loadConfig(settings);
  const services = await initServices(config, { settings });

  try {
    const userId = 'user';
    const baseId = 'qwen3.5-2b-bf16-v0';
    const baseModel = 'Qwen3.5-2B-BF16';
    const basePath = '/Users/env/server/mlx-box/models/router-bases/qwen3.5-2b-bf16-v0';
    const artifactId = 'router-v0a-4bit';
    const artifactPath = '/Users/env/server/mlx-box/models/router-artifacts/router-v0a-4bit';

    services.learning.registerRouterModelBase({
      id: baseId,
      baseFamily: 'qwen',
      baseModelName: baseModel,
      basePrecision: 'bf16',
      baseFormat: 'mlx',
      tokenizerId: baseModel,
      sourceUriOrOrigin: 'mlx-community/Qwen3.5-2B-bf16',
      localPath: basePath,
      notes: 'Canonical immutable bootstrap router base',
    });

    const existing = services.learning.getRouterAdapter({ userId, adapterVersion: artifactId });
    const adapterId = existing?.id ?? services.learning.registerRouterAdapter({
      userId,
      adapterVersion: artifactId,
      baseId,
      baseModel,
      baseModelVersion: 'v0',
      path: artifactPath,
      format: 'other',
      lifecycleState: 'archived',
      runtimeBinding: {
        model: artifactPath,
        modelVersion: artifactId,
        baseId,
        artifactId,
        artifactPath,
        artifactFormat: 'mlx',
        artifactPrecision: '4bit',
        updatedAt: new Date().toISOString(),
        notes: 'Initial bootstrap serving artifact',
      },
      evalSummary: {
        bootstrap: true,
        runtime_binding: {
          model: artifactPath,
          model_version: artifactId,
          base_id: baseId,
          artifact_id: artifactId,
          artifact_path: artifactPath,
          artifact_format: 'mlx',
          artifact_precision: '4bit',
        },
      },
    });

    services.learning.registerRouterArtifact({
      id: artifactId,
      userId,
      baseId,
      adapterVersion: artifactId,
      artifactPath,
      artifactFormat: 'mlx',
      artifactPrecision: '4bit',
      quantizationRecipe: { method: 'mlx_lm.convert', q_bits: 4 },
      metrics: { bootstrap: true },
    });

    if (!services.learning.setActiveRouterAdapter(userId, adapterId)) {
      throw new Error('Failed to activate bootstrap router artifact');
    }

    const active = services.routerTraining.getActiveAdapter(userId);
    console.log(JSON.stringify({ ok: true, adapterId, active }, null, 2));
  } finally {
    closeServices(services);
  }
}

main().catch((err) => {
  console.error('Failed to bootstrap router artifact:', err);
  process.exit(1);
});
