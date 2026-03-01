import { loadConfig } from '../src/config.js';
import { SettingsService } from '../src/services/settings.js';

type ServiceKind = 'chat' | 'embeddings';

interface ServiceSpec {
  id: string;
  kind: ServiceKind;
  url?: string;
  model?: string;
  maxTokens?: number;
  budget?: number;
  apiKey?: string;
  enabled?: boolean;
}

interface ModelResult {
  status: 'ok' | 'disabled' | 'error';
  models: string[];
  detail?: string;
}

async function fetchModels(spec: ServiceSpec): Promise<ModelResult> {
  if (!spec.url || spec.enabled === false) {
    return { status: 'disabled', models: [] };
  }

  const headers: Record<string, string> = {};
  if (spec.apiKey) {
    headers['Authorization'] = `Bearer ${spec.apiKey}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(`${spec.url}/models`, {
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return { status: 'error', models: [], detail: `HTTP ${response.status}` };
    }

    const data = await response.json() as { data?: Array<{ id?: string }> };
    const models = Array.isArray(data.data)
      ? data.data.map((entry) => entry.id).filter(Boolean) as string[]
      : [];

    return { status: 'ok', models };
  } catch (err) {
    clearTimeout(timeoutId);
    const message = (err as Error).name === 'AbortError' ? 'timeout' : String(err);
    return { status: 'error', models: [], detail: message };
  }
}

function formatStatus(result: ModelResult): string {
  if (result.status === 'ok') return 'ok';
  if (result.status === 'disabled') return 'disabled';
  return `error (${result.detail ?? 'unknown'})`;
}

function formatModels(models: string[], configured?: string): string {
  if (models.length === 0) return 'none';
  if (configured && models.includes(configured)) {
    const others = models.filter((m) => m !== configured);
    const tail = others.length > 0 ? `, ${others.slice(0, 2).join(', ')}` : '';
    return `${configured}${tail}${others.length > 2 ? ', …' : ''}`;
  }
  const shown = models.slice(0, 3).join(', ');
  return models.length > 3 ? `${shown}, …` : shown;
}

async function main() {
  const settings = new SettingsService();
  await settings.initialize();
  const config = loadConfig(settings);

  const services: ServiceSpec[] = [
    {
      id: 'router',
      kind: 'chat',
      url: config.llm.router.url,
      model: config.llm.router.model,
      maxTokens: config.llm.router.maxTokens,
      apiKey: config.llm.apiKey,
    },
    {
      id: 'fast',
      kind: 'chat',
      url: config.llm.fast.url,
      model: config.llm.fast.model,
      maxTokens: config.llm.fast.maxTokens,
      apiKey: config.llm.apiKey,
    },
    {
      id: 'thinking',
      kind: 'chat',
      url: config.llm.thinking.url,
      model: config.llm.thinking.model,
      maxTokens: config.llm.thinking.maxTokens,
      budget: config.llm.thinking.budget,
      apiKey: config.llm.apiKey,
    },
    {
      id: 'embeddings',
      kind: 'embeddings',
      url: config.embeddings.url,
      model: config.embeddings.model,
      apiKey: config.embeddings.apiKey,
    },
    {
      id: 'ocr',
      kind: 'chat',
      url: config.ocr.url,
      model: config.ocr.model,
      apiKey: config.ocr.apiKey,
      enabled: config.ocr.enabled,
    },
  ];

  console.log('Bartleby model inventory');
  console.log(`Generated: ${new Date().toISOString()}`);
  console.log('');

  for (const spec of services) {
    const result = await fetchModels(spec);
    const status = formatStatus(result);
    const models = formatModels(result.models, spec.model);
    const configured = spec.model ? spec.model : 'n/a';
    const maxTokens = spec.maxTokens ? String(spec.maxTokens) : 'n/a';
    const budget = spec.budget ? String(spec.budget) : 'n/a';
    const url = spec.url ?? 'n/a';

    console.log(`${spec.id.toUpperCase()}`);
    console.log(`- url: ${url}`);
    console.log(`- configured: ${configured}`);
    if (spec.kind === 'chat') {
      console.log(`- max_tokens: ${maxTokens}`);
      if (spec.id === 'thinking') {
        console.log(`- budget: ${budget}`);
      }
    }
    console.log(`- available: ${models}`);
    console.log(`- status: ${status}`);
    console.log('');
  }
}

main().catch((err) => {
  console.error(`Failed to list models: ${String(err)}`);
  process.exit(1);
});
