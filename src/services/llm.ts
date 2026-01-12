// src/services/llm.ts
import OpenAI from 'openai';
import { Config } from '../config.js';
import { info, warn, debug } from '../utils/logger.js';

export type Tier = 'router' | 'fast' | 'thinking';
export type Complexity = 'SIMPLE' | 'COMPLEX';

// Prompt for complexity classification
const ROUTER_PROMPT = `Classify this request as SIMPLE or COMPLEX.

SIMPLE: Single action, direct command, one tool needed
- "show my tasks"
- "add milk to list"
- "weather"
- "what time is it"

COMPLEX: Multiple steps, references needing lookup, code, planning
- "email Sarah about tomorrow's meeting" (needs contact + calendar lookup)
- "write a function to parse CSV"
- "help me plan my week"
- "compare my tasks with my calendar"

Request: "{input}"

Answer with one word (SIMPLE or COMPLEX):`;

// Heuristic fallback patterns for when router model is unavailable
const COMPLEX_PATTERNS = [
  /\b(and then|after that|first|next|finally)\b/i,           // Chaining words
  /\b(email|message|text|send)\b.*\b(about|regarding)\b/i,   // Communication + context
  /\b(write|create|build|implement|design)\b.*\b(code|function|script|app|program)\b/i, // Code
  /\b(plan|schedule|organize|prepare|help me with)\b/i,      // Planning
  /\b(compare|analyze|review|summarize)\b/i,                 // Analysis
  /\b(if|when|based on|depending)\b/i,                       // Conditional logic
];

export class LLMService {
  private config: Config;
  private clients: Record<Tier, OpenAI>;
  private healthy: Record<Tier, boolean> = { router: false, fast: false, thinking: false };

  constructor(config: Config) {
    this.config = config;

    this.clients = {
      router: new OpenAI({
        baseURL: config.llm.router.url,
        apiKey: 'not-needed-for-local',
      }),
      fast: new OpenAI({
        baseURL: config.llm.fast.url,
        apiKey: 'not-needed-for-local',
      }),
      thinking: new OpenAI({
        baseURL: config.llm.thinking.url,
        apiKey: 'not-needed-for-local',
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

      const response = await fetch(`${tierConfig.url}/models`, {
        signal: controller.signal,
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

  /**
   * Classify input complexity using Router model or heuristics fallback.
   * This determines whether to use Fast (single tool) or Thinking (agentic loop).
   */
  async classifyComplexity(input: string): Promise<Complexity> {
    // Try router model first
    if (this.healthy['router']) {
      try {
        const prompt = ROUTER_PROMPT.replace('{input}', input);
        const response = await this.chat(
          [{ role: 'user', content: prompt }],
          { tier: 'router', maxTokens: 10 }
        );

        const normalized = response.trim().toUpperCase();
        if (normalized.includes('COMPLEX')) return 'COMPLEX';
        if (normalized.includes('SIMPLE')) return 'SIMPLE';

        debug('Router model returned ambiguous response', { response });
      } catch (err) {
        debug('Router classification failed, using heuristics', { error: String(err) });
      }
    }

    // Heuristic fallback
    return this.classifyByHeuristics(input);
  }

  /**
   * Heuristic complexity detection when router model unavailable
   */
  private classifyByHeuristics(input: string): Complexity {
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

    // Multiple clauses suggest complexity
    if (input.split(/[,;]/).length > 2) complexSignals++;

    debug('Heuristic complexity check', { signals: complexSignals, input: input.slice(0, 50) });

    return complexSignals >= 2 ? 'COMPLEX' : 'SIMPLE';
  }

  async chat(
    messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string; toolCallId?: string }>,
    options: { tier?: Tier; maxTokens?: number; tools?: OpenAI.ChatCompletionTool[] } = {}
  ): Promise<string> {
    const tier = options.tier || 'fast';
    const tierConfig = this.config.llm[tier];
    const client = this.clients[tier];

    debug('LLM chat', { tier, model: tierConfig.model });

    const requestParams: OpenAI.ChatCompletionCreateParamsNonStreaming = {
      model: tierConfig.model,
      messages: messages as OpenAI.ChatCompletionMessageParam[],
      max_tokens: options.maxTokens || tierConfig.maxTokens,
    };

    // Add tools if provided
    if (options.tools && options.tools.length > 0) {
      requestParams.tools = options.tools;
      requestParams.tool_choice = 'auto';
    }

    const response = await client.chat.completions.create(requestParams);

    return response.choices[0]?.message?.content || '';
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

    const response = await client.chat.completions.create({
      model: tierConfig.model,
      messages,
      tools,
      tool_choice: 'auto',
      max_tokens: tierConfig.maxTokens,
    });

    return response.choices[0]?.message;
  }

  getMaxIterations(): number {
    return this.config.llm.agentMaxIterations;
  }

  close(): void {
    // Nothing to close for HTTP clients
  }
}
