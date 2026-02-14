/**
 * Prompt Optimization Utilities
 *
 * Tools for analyzing and optimizing system prompts to reduce token usage
 * while maintaining effectiveness.
 *
 * Key optimization strategies:
 * 1. Remove redundant phrasing
 * 2. Use bullet points instead of full sentences where appropriate
 * 3. Consolidate similar concepts
 * 4. Dynamic inclusion of sections based on context
 * 5. Template-based composition for better caching
 */

import { debug } from '../utils/logger.js';

export interface PromptAnalysis {
  original: string;
  tokenEstimate: number;
  lines: number;
  sections: number;
  redundancies: string[];
  suggestions: string[];
}

export interface OptimizedPrompt {
  original: string;
  optimized: string;
  originalTokens: number;
  optimizedTokens: number;
  savings: number;
  savingsPercent: number;
}

/**
 * Estimate token count for text
 *
 * Uses rough approximation: ~1.3 tokens per word for English text
 * More accurate than character count, faster than actual tokenization
 */
export function estimateTokens(text: string): number {
  // Remove extra whitespace
  const normalized = text.trim().replace(/\s+/g, ' ');

  // Count words
  const words = normalized.split(' ').length;

  // Apply multiplier (English averages ~1.3 tokens/word)
  return Math.ceil(words * 1.3);
}

/**
 * Analyze a prompt for optimization opportunities
 */
export function analyzePrompt(prompt: string): PromptAnalysis {
  const tokenEstimate = estimateTokens(prompt);
  const lines = prompt.split('\n').length;
  const sections = (prompt.match(/^#/gm) || []).length;

  const redundancies: string[] = [];
  const suggestions: string[] = [];

  // Check for common redundancies
  if (prompt.match(/\b(I|you|we) (will|should|can|must)\b/gi)) {
    redundancies.push('Modal verbs (will/should/can) can often be removed');
  }

  if (prompt.match(/\b(in order to|for the purpose of)\b/gi)) {
    redundancies.push('Verbose phrases like "in order to" → "to"');
  }

  if (prompt.match(/\b(it is|there are|there is)\b/gi)) {
    redundancies.push('Expletive constructions (it is, there are) add bulk');
  }

  if (prompt.match(/\b(very|really|quite|rather)\b/gi)) {
    redundancies.push('Intensifiers (very, really) rarely add value');
  }

  // Generate suggestions
  if (tokenEstimate > 500) {
    suggestions.push('Consider splitting into dynamic sections');
  }

  if (lines > 80) {
    suggestions.push('Consolidate similar concepts into fewer lines');
  }

  if (!prompt.includes('# ')) {
    suggestions.push('Add section headers for better structure');
  }

  const listRatio = (prompt.match(/^- /gm) || []).length / lines;
  if (listRatio < 0.3 && lines > 40) {
    suggestions.push('Convert more content to bullet points for brevity');
  }

  return {
    original: prompt,
    tokenEstimate,
    lines,
    sections,
    redundancies,
    suggestions,
  };
}

/**
 * Optimize a prompt by removing redundancy and improving conciseness
 */
export function optimizePrompt(prompt: string, aggressive: boolean = false): OptimizedPrompt {
  const originalTokens = estimateTokens(prompt);
  let optimized = prompt;

  // Basic optimizations (always apply)

  // Remove verbose phrases
  optimized = optimized.replace(/\bin order to\b/gi, 'to');
  optimized = optimized.replace(/\bfor the purpose of\b/gi, 'to');
  optimized = optimized.replace(/\bat this point in time\b/gi, 'now');
  optimized = optimized.replace(/\bdue to the fact that\b/gi, 'because');

  // Remove intensifiers that don't add value
  optimized = optimized.replace(/\bvery\s+/gi, '');
  optimized = optimized.replace(/\breally\s+/gi, '');

  // Condense common patterns
  optimized = optimized.replace(/\bYou should\b/g, '');
  optimized = optimized.replace(/\bYou can\b/g, '');

  // Remove excessive whitespace
  optimized = optimized.replace(/\n\n\n+/g, '\n\n');
  optimized = optimized.replace(/  +/g, ' ');

  if (aggressive) {
    // Aggressive optimizations (may reduce clarity)

    // Remove example qualifiers
    optimized = optimized.replace(/\bFor example,?\s*/gi, 'e.g. ');
    optimized = optimized.replace(/\bSuch as\s*/gi, 'e.g. ');

    // Condense section headers
    optimized = optimized.replace(/^# (.+) Guidelines$/gm, '# $1');
    optimized = optimized.replace(/^# (.+) Operations$/gm, '# $1');

    // Remove politeness that doesn't affect model behavior
    optimized = optimized.replace(/\bPlease\s+/gi, '');
    optimized = optimized.replace(/\bKindly\s+/gi, '');
  }

  const optimizedTokens = estimateTokens(optimized);
  const savings = originalTokens - optimizedTokens;
  const savingsPercent = (savings / originalTokens) * 100;

  return {
    original: prompt,
    optimized: optimized.trim(),
    originalTokens,
    optimizedTokens,
    savings,
    savingsPercent,
  };
}

/**
 * Build a dynamic prompt from optional sections
 *
 * This allows including only relevant sections based on context,
 * reducing token usage for requests that don't need full prompt.
 */
export interface PromptSection {
  id: string;
  content: string;
  condition?: (context: any) => boolean;
  priority: number; // Lower = higher priority
}

export class DynamicPromptBuilder {
  private sections: Map<string, PromptSection> = new Map();
  private basePrompt: string;

  constructor(basePrompt: string) {
    this.basePrompt = basePrompt;
  }

  /**
   * Add an optional section to the prompt builder
   */
  addSection(section: PromptSection): void {
    this.sections.set(section.id, section);
  }

  /**
   * Build a prompt with only relevant sections
   */
  build(context?: any, maxTokens?: number): string {
    let prompt = this.basePrompt;
    let currentTokens = estimateTokens(prompt);

    // Get applicable sections sorted by priority
    const applicableSections = Array.from(this.sections.values())
      .filter(section => !section.condition || section.condition(context))
      .sort((a, b) => a.priority - b.priority);

    // Add sections until we hit token limit
    for (const section of applicableSections) {
      const sectionTokens = estimateTokens(section.content);

      if (maxTokens && currentTokens + sectionTokens > maxTokens) {
        debug('Prompt builder: Skipping section due to token limit', {
          section: section.id,
          currentTokens,
          maxTokens,
        });
        break;
      }

      prompt += '\n\n' + section.content;
      currentTokens += sectionTokens;
    }

    return prompt.trim();
  }

  /**
   * Get token estimate for current configuration
   */
  estimateTokens(context?: any): number {
    return estimateTokens(this.build(context));
  }
}

/**
 * Create optimized versions of Bartleby's system prompts
 */
export const OPTIMIZED_PROMPTS = {
  thinking: `You are Bartleby, a personal AI assistant with persistent memory.

# Core Principles

1. **Express Uncertainty**: Say "I'm not certain, but..." when unsure. Never fabricate.
2. **Review Context**: Consider available information, user goals, recent work, assumptions.
3. **Thoughtful Awareness**: Show reasoning, alternatives, constraints, limitations.
4. **Continuity**: Reference past context when relevant.

# Before Responding

- Need memory retrieval?
- Multiple valid approaches?
- Break into subtasks?
- Edge cases?

# Memory Tools

- store_observation: Save facts
- retrieve_context: Get relevant info
- update_observation: Supersede outdated data
- forget_observation: Mark irrelevant

# Tool Use

- Choose appropriate tools
- Provide valid parameters
- Explain failures, suggest alternatives
- Chain tools for complex tasks

# Communication

- Concise but thorough
- Active voice
- Explain reasoning
- Admit unknowns
- Ask clarifying questions`,

  fast: `You are Bartleby, a personal AI assistant.

# Guidelines

- Concise and helpful
- Express uncertainty ("I'm not certain...")
- Escalate complex tasks to thinking tier
- Use retrieve_context for memory
- Break down multi-step tasks

# Tool Use

- Use when appropriate
- Complete parameters
- Explain if unavailable

# Escalate to Thinking For

- Code/debugging
- Math reasoning
- Multi-step planning
- Complex analysis
- Deep reasoning

Focus on immediate needs. Don't over-complicate.`,

  router: `Classify query with ONE response:

- TRIVIAL: Greetings, simple facts
- SIMPLE: Tool calls, basic tasks
- COMPLEX: Multi-step, analysis
- REASONING: Code, math, planning, debugging

Output classification only.

Examples:
"What's 2+2?" → TRIVIAL
"Create visa action" → SIMPLE
"Analyze spending" → COMPLEX
"Write JSON parser" → REASONING`,
};

/**
 * Compare original vs optimized prompts
 */
export function comparePrompts(
  original: string,
  optimized: string
): {
  originalTokens: number;
  optimizedTokens: number;
  savings: number;
  savingsPercent: number;
  originalLines: number;
  optimizedLines: number;
} {
  const originalTokens = estimateTokens(original);
  const optimizedTokens = estimateTokens(optimized);
  const savings = originalTokens - optimizedTokens;
  const savingsPercent = (savings / originalTokens) * 100;

  return {
    originalTokens,
    optimizedTokens,
    savings,
    savingsPercent,
    originalLines: original.split('\n').length,
    optimizedLines: optimized.split('\n').length,
  };
}
