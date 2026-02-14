/**
 * Enhanced Router - Intelligent Model Selection with Learning
 *
 * Tracks routing decisions and outcomes to continuously improve model selection.
 * Learns which types of requests work best on each tier (fast vs thinking).
 *
 * Features:
 * - Success rate tracking per tier
 * - Response time monitoring
 * - Confidence scoring for routing decisions
 * - Adaptive heuristics based on historical performance
 * - Fallback strategies when primary tier fails
 */

import { debug, info } from '../utils/logger.js';
import type { Tier, Complexity } from '../services/llm.js';

export interface RoutingDecision {
  tier: Tier;
  complexity: Complexity;
  confidence: number; // 0.0 - 1.0
  reason: string;
  signals: string[];
}

export interface RoutingOutcome {
  decision: RoutingDecision;
  success: boolean;
  responseTimeMs: number;
  errorMessage?: string;
}

export interface TierStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalResponseTimeMs: number;
  avgResponseTimeMs: number;
  successRate: number;
}

export interface ComplexityStats {
  simple: TierStats;
  complex: TierStats;
}

/**
 * Enhanced Router with learning capabilities
 */
export class EnhancedRouter {
  private stats: Record<Tier, ComplexityStats> = {
    router: this.initComplexityStats(),
    fast: this.initComplexityStats(),
    thinking: this.initComplexityStats(),
  };

  private recentOutcomes: RoutingOutcome[] = [];
  private maxRecentOutcomes = 100;

  /**
   * Decide which tier to route a request to with confidence score
   */
  async routeRequest(
    input: string,
    routerAvailable: boolean,
    routerClassification?: Complexity
  ): Promise<RoutingDecision> {
    const signals: string[] = [];
    let confidence = 1.0;
    let complexity: Complexity;
    let reason: string;

    // If router model provided classification, use it with high confidence
    if (routerAvailable && routerClassification) {
      complexity = routerClassification;
      confidence = 0.95;
      reason = 'Router model classification';
      signals.push('router-model');
    } else {
      // Use enhanced heuristics
      const heuristicResult = this.analyzeWithEnhancedHeuristics(input);
      complexity = heuristicResult.complexity;
      confidence = heuristicResult.confidence;
      reason = heuristicResult.reason;
      signals.push(...heuristicResult.signals);
    }

    // Adjust tier based on historical performance
    const tier = this.selectTier(complexity, signals);

    // Adjust confidence based on historical success rate
    const tierStats = this.getTierStats(tier, complexity);
    if (tierStats.totalRequests > 10) {
      // Blend heuristic confidence with historical success rate
      confidence = confidence * 0.7 + tierStats.successRate * 0.3;
    }

    debug('Enhanced routing decision', {
      tier,
      complexity,
      confidence: confidence.toFixed(2),
      signals,
      successRate: tierStats.successRate.toFixed(2),
    });

    return { tier, complexity, confidence, reason, signals };
  }

  /**
   * Record the outcome of a routing decision for learning
   */
  recordOutcome(outcome: RoutingOutcome): void {
    const { decision, success, responseTimeMs } = outcome;
    const { tier, complexity } = decision;

    // Update tier statistics
    const stats = this.getTierStats(tier, complexity);
    stats.totalRequests++;
    stats.totalResponseTimeMs += responseTimeMs;
    stats.avgResponseTimeMs = stats.totalResponseTimeMs / stats.totalRequests;

    if (success) {
      stats.successfulRequests++;
    } else {
      stats.failedRequests++;
    }

    stats.successRate = stats.successfulRequests / stats.totalRequests;

    // Store recent outcomes (for pattern analysis)
    this.recentOutcomes.push(outcome);
    if (this.recentOutcomes.length > this.maxRecentOutcomes) {
      this.recentOutcomes.shift();
    }

    debug('Routing outcome recorded', {
      tier,
      complexity,
      success,
      responseTimeMs,
      newSuccessRate: stats.successRate.toFixed(2),
    });
  }

  /**
   * Enhanced heuristic analysis with confidence scoring
   */
  private analyzeWithEnhancedHeuristics(input: string): {
    complexity: Complexity;
    confidence: number;
    reason: string;
    signals: string[];
  } {
    const signals: string[] = [];
    let complexityScore = 0; // Negative = simple, positive = complex
    let confidence = 0.7; // Base confidence for heuristics

    // 1. Multi-file operations (STRONG signal)
    if (/\b(all|each|every|multiple)\s+(\d+\s+)?(files?|csvs?|documents?)\b/i.test(input)) {
      complexityScore += 3;
      signals.push('multi-file');
      confidence = Math.max(confidence, 0.9);
    }

    // 2. Wildcard patterns (STRONG signal)
    if (/\/(.*\*.*|.*\?.*)\b/.test(input)) {
      complexityScore += 3;
      signals.push('wildcard-path');
      confidence = Math.max(confidence, 0.9);
    }

    // 3. Sequential operations (STRONG signal)
    if (/\b(and then|after that|first.*then|next)\b/i.test(input)) {
      complexityScore += 2;
      signals.push('sequential-ops');
    }

    // 4. Code generation (STRONG signal)
    if (/\b(write|create|build|implement|code|function|script|program)\b/i.test(input)) {
      complexityScore += 2;
      signals.push('code-generation');
    }

    // 5. Analysis/reasoning (MODERATE signal)
    if (/\b(compare|analyze|review|summarize|explain|why|how does)\b/i.test(input)) {
      complexityScore += 1;
      signals.push('analysis');
    }

    // 6. Planning (MODERATE signal)
    if (/\b(plan|schedule|organize|prepare)\b/i.test(input)) {
      complexityScore += 1;
      signals.push('planning');
    }

    // 7. Conditional logic (MODERATE signal)
    if (/\b(if|when|based on|depending|unless|in case)\b/i.test(input)) {
      complexityScore += 1;
      signals.push('conditional');
    }

    // 8. Multiple clauses (WEAK signal)
    const clauses = input.split(/[,;]| and /).length;
    if (clauses > 3) {
      complexityScore += 1;
      signals.push('multi-clause');
    }

    // 9. Input length (WEAK signal)
    if (input.length > 200) {
      complexityScore += 1;
      signals.push('long-input');
    } else if (input.length < 30) {
      complexityScore -= 1;
      signals.push('short-input');
    }

    // 10. Simple command patterns (NEGATIVE signal - reduces complexity)
    if (/^(show|list|get|view|display|what|when)\s+/i.test(input)) {
      complexityScore -= 1;
      signals.push('simple-query');
    }

    // 11. Single-word commands (NEGATIVE signal)
    if (/^\w+\s*$/.test(input)) {
      complexityScore -= 2;
      signals.push('single-word');
      confidence = Math.max(confidence, 0.85);
    }

    // Determine complexity with confidence
    const complexity: Complexity = complexityScore >= 2 ? 'COMPLEX' : 'SIMPLE';

    // Adjust confidence based on signal strength
    if (Math.abs(complexityScore) >= 3) {
      confidence = Math.max(confidence, 0.85); // Very confident
    } else if (Math.abs(complexityScore) <= 1) {
      confidence = Math.min(confidence, 0.6); // Less confident
    }

    const reason = complexity === 'COMPLEX'
      ? `${signals.length} complexity signals (score: ${complexityScore})`
      : `Simple request (score: ${complexityScore})`;

    return { complexity, confidence, reason, signals };
  }

  /**
   * Select tier based on complexity and historical performance
   */
  private selectTier(complexity: Complexity, signals: string[]): Tier {
    if (complexity === 'SIMPLE') {
      // Check if fast tier is performing well
      const fastStats = this.getTierStats('fast', 'SIMPLE');
      if (fastStats.totalRequests > 5 && fastStats.successRate < 0.7) {
        // Fast tier struggling with simple requests, escalate to thinking
        info('Fast tier underperforming, escalating to thinking', {
          successRate: fastStats.successRate,
        });
        return 'thinking';
      }
      return 'fast';
    }

    // Complex requests always go to thinking tier
    return 'thinking';
  }

  /**
   * Get statistics for a specific tier and complexity
   */
  private getTierStats(tier: Tier, complexity: Complexity): TierStats {
    const complexityKey = complexity.toLowerCase() as 'simple' | 'complex';
    return this.stats[tier][complexityKey];
  }

  /**
   * Get overall routing statistics
   */
  getStats(): Record<Tier, ComplexityStats> {
    return this.stats;
  }

  /**
   * Get recent routing outcomes for analysis
   */
  getRecentOutcomes(limit: number = 10): RoutingOutcome[] {
    return this.recentOutcomes.slice(-limit);
  }

  /**
   * Get recommendations for improving routing
   */
  getRecommendations(): string[] {
    const recommendations: string[] = [];

    // Check if fast tier is underutilized
    const fastSimple = this.getTierStats('fast', 'SIMPLE');
    const thinkingSimple = this.getTierStats('thinking', 'SIMPLE');

    if (thinkingSimple.totalRequests > fastSimple.totalRequests * 2) {
      recommendations.push('Many simple requests going to thinking tier - consider relaxing complexity thresholds');
    }

    // Check if fast tier has low success rate
    if (fastSimple.totalRequests > 20 && fastSimple.successRate < 0.6) {
      recommendations.push(`Fast tier success rate is low (${(fastSimple.successRate * 100).toFixed(0)}%) - consider upgrading fast model`);
    }

    // Check if thinking tier is slow
    const thinkingComplex = this.getTierStats('thinking', 'COMPLEX');
    if (thinkingComplex.totalRequests > 10 && thinkingComplex.avgResponseTimeMs > 5000) {
      recommendations.push(`Thinking tier avg response time is ${(thinkingComplex.avgResponseTimeMs / 1000).toFixed(1)}s - consider optimization`);
    }

    return recommendations;
  }

  /**
   * Initialize empty complexity stats
   */
  private initComplexityStats(): ComplexityStats {
    return {
      simple: this.initTierStats(),
      complex: this.initTierStats(),
    };
  }

  /**
   * Initialize empty tier stats
   */
  private initTierStats(): TierStats {
    return {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalResponseTimeMs: 0,
      avgResponseTimeMs: 0,
      successRate: 0,
    };
  }

  /**
   * Reset all statistics (useful for testing)
   */
  resetStats(): void {
    this.stats = {
      router: this.initComplexityStats(),
      fast: this.initComplexityStats(),
      thinking: this.initComplexityStats(),
    };
    this.recentOutcomes = [];
    info('Enhanced router statistics reset');
  }
}
