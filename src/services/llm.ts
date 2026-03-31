// src/services/llm.ts
import { AsyncLocalStorage } from 'async_hooks';
import OpenAI from 'openai';
import { Config } from '../config.js';
import { info, warn, debug } from '../utils/logger.js';
import { getSystemPrompt, SYSTEM_PROMPTS } from '../llm/system-prompts.js';
import { ResponseCache, type CacheStats } from '../llm/response-cache.js';
import { EnhancedRouter, type RoutingDecision, type RoutingOutcome } from '../llm/enhanced-router.js';

export type Tier = 'router' | 'fast' | 'thinking';
export type Complexity = 'SIMPLE' | 'COMPLEX';

export interface RouterRuntimeBinding {
  source: 'base' | 'active-adapter' | 'canary-adapter' | 'shadow-adapter';
  model: string;
  modelVersion?: string;
  baseModel: string;
  baseModelVersion?: string;
  baseId?: string;
  artifactId?: string;
  artifactPath?: string;
  artifactFormat?: string;
  artifactPrecision?: string;
  activeAdapterId?: string;
  activeAdapterVersion?: string;
}

// NOTE: Router system prompt is now defined in system-prompts.ts
// This classification format is for backwards compatibility
const ROUTER_CLASSIFICATION_PROMPT = `Classify this request: "{input}"`;

// Heuristic fallback patterns for when router model is unavailable
const COMPLEX_PATTERNS = [
  /\b(and then|after that|first|next|finally)\b/i,           // Chaining words
  /\b(email|message|text|send)\b.*\b(about|regarding)\b/i,   // Communication + context
  /\b(write|create|build|implement|design)\b.*\b(code|function|script|app|program)\b/i, // Code
  /\b(plan|schedule|organize|prepare|help me with)\b/i,      // Planning
  /\b(compare|analyze|review|summarize)\b/i,                 // Analysis
  /\b(if|when|based on|depending)\b/i,                       // Conditional logic
  /\b(all|each|every|multiple)\s+(\d+\s+)?(files?|csvs?|documents?)\b/i, // Multiple file operations
  /\/(.*\*.*|.*\?.*)\b/,                                     // Wildcards in paths
  /\b(import|ingest|load|upload).*(and|then)\b/i,           // Multi-step file operations
];

export class LLMService {
  private config: Config;
  private clients: Record<Tier, OpenAI>;
  private healthy: Record<Tier, boolean> = { router: false, fast: false, thinking: false };
  private cache: ResponseCache;
  private router: EnhancedRouter;
  private routerRuntimeResolver?: () => RouterRuntimeBinding | undefined;
  private temporaryRouterRuntimeBinding = new AsyncLocalStorage<RouterRuntimeBinding>();

  constructor(config: Config) {
    this.config = config;

    // Initialize response cache (1000 entries, 1 hour TTL)
    this.cache = new ResponseCache(1000, 3600000);

    // Initialize enhanced router for intelligent model selection
    this.router = new EnhancedRouter();

    // Use configured API key or fallback for local-only setups
    const apiKey = config.llm.apiKey || 'not-needed-for-local';

    this.clients = {
      router: new OpenAI({
        baseURL: config.llm.router.url,
        apiKey,
        timeout: 30000, // 30 second timeout for quick classification
      }),
      fast: new OpenAI({
        baseURL: config.llm.fast.url,
        apiKey,
        timeout: 60000, // 60 second timeout for general responses
      }),
      thinking: new OpenAI({
        baseURL: config.llm.thinking.url,
        apiKey,
        timeout: 90000, // 90 second timeout for complex reasoning
      }),
    };
  }

  async initialize(): Promise<void> {
    await Promise.all([
      this.checkHealth('router'),
      this.checkHealth('fast'),
      this.checkHealth('thinking'),
    ]);

    info('LLMService initialized', { healthy: this.healthy });
  }

  private async checkHealth(tier: Tier): Promise<void> {
    const tierConfig = this.config.llm[tier];
    const timeout = this.config.llm.healthTimeout;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const headers: Record<string, string> = {};
      if (this.config.llm.apiKey) {
        headers['Authorization'] = `Bearer ${this.config.llm.apiKey}`;
      }

      const response = await fetch(`${tierConfig.url}/models`, {
        signal: controller.signal,
        headers,
      });

      clearTimeout(timeoutId);
      this.healthy[tier] = response.ok;
      debug(`LLM ${tier} health check`, { ok: response.ok });
    } catch (err) {
      warn(`LLM ${tier} tier health check failed`, { error: String(err) });
      this.healthy[tier] = false;
    }
  }

  isHealthy(tier: Tier): boolean {
    return this.healthy[tier];
  }

  setRouterRuntimeResolver(resolver: () => RouterRuntimeBinding | undefined): void {
    this.routerRuntimeResolver = resolver;
  }

  getRouterRuntimeBinding(): RouterRuntimeBinding {
    const temporaryBinding = this.temporaryRouterRuntimeBinding.getStore();
    if (temporaryBinding) {
      return temporaryBinding;
    }

    return this.routerRuntimeResolver?.() ?? {
      source: 'base',
      model: this.config.llm.router.model,
      modelVersion: inferModelVersion(this.config.llm.router.model),
      baseModel: this.config.llm.router.model,
      baseModelVersion: inferModelVersion(this.config.llm.router.model),
    };
  }

  async withTemporaryRouterRuntimeBinding<T>(
    binding: RouterRuntimeBinding,
    fn: () => Promise<T>
  ): Promise<T> {
    return this.temporaryRouterRuntimeBinding.run(binding, fn);
  }

  /**
   * Classify input complexity using Router model or heuristics fallback.
   * This determines whether to use Fast (single tool) or Thinking (agentic loop).
   *
   * Now returns full routing decision with confidence and reasoning.
   */
  async classifyComplexity(input: string): Promise<RoutingDecision> {
    let routerClassification: Complexity | undefined;
    const routerRuntime = this.getRouterRuntimeBinding();

    // Try router model first
    if (this.healthy['router']) {
      try {
        // Use new router system prompt (includes classification instructions)
        const prompt = ROUTER_CLASSIFICATION_PROMPT.replace('{input}', input);
        const response = await this.chat(
          [{ role: 'user', content: prompt }],
          {
            tier: 'router',
            maxTokens: 20,
            modelOverride: routerRuntime.model,
          }
        );

        const normalized = response.trim().toUpperCase();

        // New format: TRIVIAL/SIMPLE → SIMPLE, COMPLEX/REASONING → COMPLEX
        if (normalized.includes('TRIVIAL') || normalized.includes('SIMPLE')) {
          routerClassification = 'SIMPLE';
        } else if (normalized.includes('COMPLEX') || normalized.includes('REASONING')) {
          routerClassification = 'COMPLEX';
        } else {
          debug('Router model returned ambiguous response', { response });
        }
      } catch (err) {
        debug('Router classification failed, using heuristics', {
          error: String(err),
          routerModel: routerRuntime.model,
          activeAdapterVersion: routerRuntime.activeAdapterVersion,
        });
      }
    }

    // Use enhanced router for final decision (incorporates router classification if available)
    const decision = await this.router.routeRequest(input, this.healthy['router'], routerClassification);
    return decision;
  }

  /**
   * Record the outcome of a routing decision for continuous learning
   */
  recordRoutingOutcome(outcome: RoutingOutcome): void {
    this.router.recordOutcome(outcome);
  }

  /**
   * Heuristic complexity detection when router model unavailable
   */
  private classifyByHeuristics(input: string): Complexity {
    // Multi-file operations are ALWAYS complex (require listing + iteration)
    const multiFilePattern = /\b(all|each|every|multiple)\s+(\d+\s+)?(files?|csvs?|documents?)\b/i;
    if (multiFilePattern.test(input)) {
      debug('Multi-file operation detected, forcing COMPLEX', { input: input.slice(0, 50) });
      return 'COMPLEX';
    }

    // Wildcard paths are ALWAYS complex (require expansion + iteration)
    const wildcardPattern = /\/(.*\*.*|.*\?.*)\b/;
    if (wildcardPattern.test(input)) {
      debug('Wildcard path detected, forcing COMPLEX', { input: input.slice(0, 50) });
      return 'COMPLEX';
    }

    // Count matching complex patterns
    let complexSignals = 0;
    for (const pattern of COMPLEX_PATTERNS) {
      if (pattern.test(input)) complexSignals++;
    }

    // Check for multiple proper nouns (entities that may need lookup)
    const properNouns = input.match(/\b[A-Z][a-z]+\b/g);
    if (properNouns && properNouns.length > 2) complexSignals++;

    // Long inputs are often complex
    if (input.length > 150) complexSignals++;

    // Multiple clauses suggest complexity (comma, semicolon, or "and" conjunctions)
    const clauses = input.split(/[,;]| and /).length;
    if (clauses > 2) complexSignals++;

    debug('Heuristic complexity check', { signals: complexSignals, clauses, input: input.slice(0, 50) });

    return complexSignals >= 2 ? 'COMPLEX' : 'SIMPLE';
  }

  async chat(
    messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string; toolCallId?: string }>,
    options: {
      tier?: Tier;
      maxTokens?: number;
      tools?: OpenAI.ChatCompletionTool[];
      skipCache?: boolean;
      modelOverride?: string;
    } = {}
  ): Promise<string> {
    const tier = options.tier || 'fast';
    const tierConfig = this.config.llm[tier];
    const client = this.clients[tier];

    // Prepend appropriate system prompt if not already present
    const hasSystemPrompt = messages.some(m => m.role === 'system');
    const messagesWithSystem = hasSystemPrompt
      ? messages
      : [{ role: 'system' as const, content: getSystemPrompt(tier) }, ...messages];

    // Check cache first (unless explicitly skipped)
    if (!options.skipCache) {
      const cached = this.cache.get(tier, messagesWithSystem, options.tools);
      if (cached) {
        debug('LLM cache hit', { tier, model: tierConfig.model });
        return cached;
      }
    }

    debug('LLM chat', { tier, model: tierConfig.model });

    const requestParams: OpenAI.ChatCompletionCreateParamsNonStreaming = {
      model: options.modelOverride || tierConfig.model,
      messages: messagesWithSystem as OpenAI.ChatCompletionMessageParam[],
      max_tokens: options.maxTokens || tierConfig.maxTokens,
    };

    // Add tools if provided
    if (options.tools && options.tools.length > 0) {
      requestParams.tools = options.tools;
      requestParams.tool_choice = 'auto';
    }

    const startTime = Date.now();
    info('Starting LLM HTTP call', { tier, model: requestParams.model });
    const response = await client.chat.completions.create(requestParams);
    const duration = Date.now() - startTime;
    const content = response.choices[0]?.message?.content || '';
    info('LLM HTTP call completed', { tier, duration: `${duration}ms`, responseLength: content.length });

    // Cache the response
    this.cache.set(tier, messagesWithSystem, options.tools, content);

    return content;
  }

  /**
   * Stream chat responses in real-time
   *
   * Yields chunks as they arrive from the LLM for better perceived latency.
   * Returns the full accumulated response at the end.
   *
   * Note: Streaming responses are NOT cached (cache only applies to complete responses)
   */
  async *chatStream(
    messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string; toolCallId?: string }>,
    options: { tier?: Tier; maxTokens?: number; skipCache?: boolean } = {}
  ): AsyncGenerator<string, string, unknown> {
    const tier = options.tier || 'fast';
    const tierConfig = this.config.llm[tier];
    const client = this.clients[tier];

    // Prepend appropriate system prompt if not already present
    const hasSystemPrompt = messages.some(m => m.role === 'system');
    const messagesWithSystem = hasSystemPrompt
      ? messages
      : [{ role: 'system' as const, content: getSystemPrompt(tier) }, ...messages];

    // Check cache first (unless explicitly skipped)
    if (!options.skipCache) {
      const cached = this.cache.get(tier, messagesWithSystem);
      if (cached) {
        debug('LLM cache hit (streaming)', { tier, model: tierConfig.model });
        // Yield cached response in one chunk
        yield cached;
        return cached;
      }
    }

    debug('LLM chat stream', { tier, model: tierConfig.model });

    const requestParams: OpenAI.ChatCompletionCreateParamsStreaming = {
      model: tierConfig.model,
      messages: messagesWithSystem as OpenAI.ChatCompletionMessageParam[],
      max_tokens: options.maxTokens || tierConfig.maxTokens,
      stream: true,
    };

    const stream = await client.chat.completions.create(requestParams);
    let fullContent = '';

    // Stream chunks to caller
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content || '';
      if (delta) {
        fullContent += delta;
        yield delta;
      }
    }

    // Cache the complete response
    this.cache.set(tier, messagesWithSystem, undefined, fullContent);

    return fullContent;
  }

  /**
   * Chat with function calling support - returns full message for tool calls
   */
  async chatWithTools(
    messages: Array<OpenAI.ChatCompletionMessageParam>,
    tools: OpenAI.ChatCompletionTool[],
    tier: Tier = 'thinking'
  ): Promise<OpenAI.ChatCompletionMessage> {
    const tierConfig = this.config.llm[tier];
    const client = this.clients[tier];

    debug('LLM chat with tools', { tier, model: tierConfig.model, toolCount: tools.length });

    // Prepend appropriate system prompt if not already present
    const hasSystemPrompt = messages.some(m => m.role === 'system');
    const messagesWithSystem = hasSystemPrompt
      ? messages
      : [{ role: 'system', content: getSystemPrompt(tier) } as OpenAI.ChatCompletionMessageParam, ...messages];

    const response = await client.chat.completions.create({
      model: tierConfig.model,
      messages: messagesWithSystem as OpenAI.ChatCompletionMessageParam[],
      tools,
      tool_choice: 'auto',
      max_tokens: tierConfig.maxTokens,
    });

    return response.choices[0]?.message;
  }

  getMaxIterations(): number {
    return this.config.llm.agentMaxIterations;
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): CacheStats {
    return this.cache.getStats();
  }

  /**
   * Get enhanced router statistics
   */
  getRouterStats() {
    return this.router.getStats();
  }

  /**
   * Get router recommendations for optimization
   */
  getRouterRecommendations(): string[] {
    return this.router.getRecommendations();
  }

  /**
   * Get recent routing outcomes
   */
  getRecentRoutingOutcomes(limit: number = 10) {
    return this.router.getRecentOutcomes(limit);
  }

  /**
   * Clear the response cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  close(): void {
    // Nothing to close for HTTP clients
  }
}

function inferModelVersion(modelName: string): string | undefined {
  const normalized = modelName.trim();
  if (!normalized) return undefined;

  const slashParts = normalized.split('/');
  const tail = slashParts[slashParts.length - 1] || normalized;
  return tail || undefined;
}
