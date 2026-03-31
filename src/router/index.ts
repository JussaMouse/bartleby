// src/router/index.ts
import { Tool, ToolContext, RouteResult } from '../tools/types.js';
import { allTools, getToolsByPriority, getToolByName, getToolDescriptions } from '../tools/index.js';
import { ServiceContainer } from '../services/index.js';
import { SemanticMatcher } from './semantic.js';
import { Complexity } from '../services/llm.js';
import type { RoutingDecision } from '../llm/enhanced-router.js';
import { debug, info, warn } from '../utils/logger.js';

const INTENT_CLASS_PRECEDENCE: Record<string, number> = {
  workflow_reply: 100,
  record_open: 90,
  workflow_start: 80,
  mutation_create: 70,
  mutation_update: 65,
  mutation_delete: 60,
  collection_list: 50,
  system: 40,
  operator: 35,
  fallback: 0,
};

export interface RouterResult {
  /** How the request was handled */
  type: 'routed' | 'llm-simple' | 'llm-complex';
  /** Tool route if matched */
  route?: RouteResult;
  /** Complexity classification */
  complexity: Complexity;
  /** Full routing decision with confidence and reasoning */
  decision?: RoutingDecision;
}

export class CommandRouter {
  private tools: Tool[];
  private semantic: SemanticMatcher | null = null;
  private services?: ServiceContainer;

  constructor() {
    this.tools = getToolsByPriority();
  }

  async initialize(services: ServiceContainer): Promise<void> {
    this.services = services;

    // Initialize semantic matcher if embeddings available (with timeout)
    this.semantic = new SemanticMatcher(services.embeddings);
    try {
      await Promise.race([
        this.semantic.initialize(this.tools),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Semantic matcher initialization timeout')), 10000))
      ]);
    } catch (err) {
      warn('Semantic matcher initialization failed or timed out', { error: String(err) });
    }

    info(`CommandRouter initialized with ${this.tools.length} tools`);
  }

  /**
   * Main routing method. Returns routing result with complexity info.
   * 
   * Flow:
   * 0. Check pending context states FIRST (note editing, etc.) - bypass all routing
   * 1. Try high-confidence pattern routes first (cheap + deterministic)
   * 2. Classify complexity for non-pattern requests (Router model or heuristics)
   * 3. If COMPLEX → skip to LLM (Thinking model with agentic loop)
   * 4. If SIMPLE → try keyword → semantic → LLM (Fast model)
   */
  async route(input: string): Promise<RouterResult> {
    const normalized = input.trim();
    if (!normalized) {
      return { type: 'routed', complexity: 'SIMPLE' };
    }

    // === Step 0: Check pending context states FIRST ===
    // These bypass ALL routing including complexity classification
    // (e.g., note editing mode - just append, don't analyze)
    const contextResult = await this.matchContextual(normalized);
    if (contextResult) {
      debug('Layer 0 match (contextual) - bypassing complexity check', { tool: contextResult.tool });
      return { type: 'routed', route: contextResult, complexity: 'SIMPLE' };
    }

    // === Step 1: High-confidence pattern matching BEFORE complexity ===
    // Prevents obvious command-like requests from being over-escalated.
    const patternResult = this.matchPattern(normalized);
    if (patternResult) {
      debug('Layer 1 match (pattern) - bypassing complexity check', { tool: patternResult.tool });
      return { type: 'routed', route: patternResult, complexity: 'SIMPLE' };
    }

    // === Step 2: Classify complexity ===
    const decision = await this.services!.llm.classifyComplexity(normalized);
    const complexity = decision.complexity;
    debug('Complexity classification', {
      complexity,
      confidence: decision.confidence.toFixed(2),
      reason: decision.reason,
      input: input.slice(0, 50)
    });

    // === Step 3: Complex requests skip router entirely ===
    if (complexity === 'COMPLEX') {
      debug('Complex request - routing to Thinking model agentic loop');
      return { type: 'llm-complex', complexity, decision };
    }

    // === Step 4: Simple requests go through remaining deterministic router ===

    // Layer 2: Keyword matching
    const keywordResult = this.matchKeywords(normalized);
    if (keywordResult && keywordResult.confidence >= 0.7) {
      debug('Layer 2 match (keyword)', { tool: keywordResult.tool, confidence: keywordResult.confidence.toFixed(2) });
      return { type: 'routed', route: keywordResult, complexity, decision };
    }

    // Layer 3: Semantic matching (embeddings)
    if (this.semantic) {
      const semanticResult = await this.matchSemantic(normalized);
      if (semanticResult) {
        debug('Layer 3 match (semantic)', { tool: semanticResult.tool, confidence: semanticResult.confidence.toFixed(2) });
        return { type: 'routed', route: semanticResult, complexity, decision };
      }
    }

    // Layer 4: No match - use Fast LLM for simple single-tool call
    debug('No router match - using Fast model for simple LLM fallback');
    return { type: 'llm-simple', complexity, decision };
  }

  async execute(result: RouteResult, input: string): Promise<string> {
    if (!this.services) {
      throw new Error('Router not initialized');
    }

    const tool = getToolByName(result.tool);
    if (!tool) {
      throw new Error(`Tool not found: ${result.tool}`);
    }

    const context: ToolContext = {
      input,
      services: this.services,
      match: result.match,
    };

    const output = await tool.execute(result.args, context);
    return output ?? '';  // Handle null returns
  }

  // Layer 0: Context-dependent matching (tools with shouldHandle)
  private async matchContextual(input: string): Promise<RouteResult | null> {
    if (!this.services) return null;

    const context: ToolContext = {
      input,
      services: this.services,
    };

    for (const tool of this.tools) {
      if (!tool.shouldHandle) continue;

      const shouldHandle = await tool.shouldHandle(input, context);
      if (shouldHandle) {
        // Pass raw input for context-dependent tools
        const args = tool.parseArgs 
          ? tool.parseArgs(input, null) 
          : { __raw_input: input };
        
        return {
          tool: tool.name,
          args: { ...args, __raw_input: input },
          confidence: 1.0,
          source: 'pattern',  // Treat as high-confidence match
        };
      }
    }

    return null;
  }

  // Layer 1: Pattern matching
  private matchPattern(input: string): RouteResult | null {
    let best: { tool: Tool; match: RegExpMatchArray; precedence: number; priority: number } | null = null;

    for (const tool of this.tools) {
      if (!tool.routing?.patterns) continue;

      for (const pattern of tool.routing.patterns) {
        const match = input.match(pattern);
        if (!match) continue;

        const precedence = INTENT_CLASS_PRECEDENCE[tool.routing.intentClass ?? 'fallback'] ?? 0;
        const priority = tool.routing.priority ?? 0;

        if (!best || precedence > best.precedence || (precedence === best.precedence && priority > best.priority)) {
          best = { tool, match, precedence, priority };
        }
      }
    }

    if (!best) return null;
    const args = best.tool.parseArgs ? best.tool.parseArgs(input, best.match) : {};
    return {
      tool: best.tool.name,
      args,
      match: best.match,
      confidence: 1.0,
      source: 'pattern',
    };
  }

  // Layer 2: Keyword matching
  private matchKeywords(input: string): RouteResult | null {
    const words = input.toLowerCase().split(/\s+/);
    const inputLower = input.toLowerCase();

    let bestMatch: { tool: Tool; score: number } | null = null;

    for (const tool of this.tools) {
      if (!tool.routing?.keywords) continue;

      const { verbs = [], nouns = [] } = tool.routing.keywords;
      let verbMatch = false;
      let nounMatch = false;

      // Single word matching
      for (const word of words) {
        if (verbs.some(v => v.toLowerCase() === word)) verbMatch = true;
        if (nouns.some(n => n.toLowerCase() === word)) nounMatch = true;
      }

      // Multi-word noun matching
      for (const noun of nouns) {
        if (inputLower.includes(noun.toLowerCase())) nounMatch = true;
      }

      // Score
      let score = 0;
      if (verbMatch && nounMatch) score = 0.9;
      else if (nounMatch) score = 0.7;
      else if (verbMatch) score = 0.5;

      if (score > 0 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { tool, score };
      }
    }

    if (bestMatch && bestMatch.score >= 0.9) {
      const args = bestMatch.tool.parseArgs ? bestMatch.tool.parseArgs(input, null) : {};
      return {
        tool: bestMatch.tool.name,
        args,
        confidence: bestMatch.score,
        source: 'keyword',
      };
    }

    return null;
  }

  // Layer 3: Semantic matching
  private async matchSemantic(input: string): Promise<RouteResult | null> {
    if (!this.semantic) return null;

    const result = await this.semantic.match(input, 0.75);

    if (result) {
      const args = result.tool.parseArgs ? result.tool.parseArgs(input, null) : {};
      return {
        tool: result.tool.name,
        args,
        confidence: result.confidence,
        source: 'semantic',
      };
    }

    return null;
  }

  getToolDescriptions(): string {
    return getToolDescriptions();
  }
}
