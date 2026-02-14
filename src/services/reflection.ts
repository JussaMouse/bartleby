/**
 * Reflection Service - Continuous Learning from Interactions
 *
 * Analyzes conversations post-response to:
 * - Learn user preferences and patterns
 * - Detect and learn from mistakes
 * - Discover insights about user behavior
 * - Improve future responses
 *
 * Runs asynchronously to avoid blocking user interactions.
 */

import { LearningService } from './learning.js';
import { LLMService } from './llm.js';
import { debug, info } from '../utils/logger.js';

export interface ConversationTurn {
  userInput: string;
  agentResponse: string;
  timestamp: Date;
  toolsUsed?: string[];
  success: boolean;
}

export interface ReflectionInsight {
  type: 'preference' | 'pattern' | 'mistake' | 'goal' | 'relationship';
  key: string;
  value: string;
  confidence: number;
  reasoning: string;
}

export class ReflectionService {
  private learning: LearningService;
  private llm: LLMService;
  private enabled: boolean = true;
  private reflectionCount: number = 0;

  constructor(learning: LearningService, llm: LLMService) {
    this.learning = learning;
    this.llm = llm;
  }

  /**
   * Analyze a conversation turn and extract learnings
   *
   * Runs asynchronously - does not block the main conversation flow
   */
  async reflect(turn: ConversationTurn): Promise<void> {
    if (!this.enabled) {
      debug('Reflection disabled, skipping');
      return;
    }

    try {
      this.reflectionCount++;
      debug('Starting reflection', { count: this.reflectionCount });

      const insights = await this.analyzeInteraction(turn);

      for (const insight of insights) {
        await this.storeInsight(insight);
      }

      if (insights.length > 0) {
        info('Reflection complete', {
          insights: insights.length,
          types: insights.map(i => i.type),
        });
      }
    } catch (error) {
      debug('Reflection failed', { error: String(error) });
      // Don't throw - reflection failures should not break the main flow
    }
  }

  /**
   * Analyze an interaction to extract insights
   */
  private async analyzeInteraction(turn: ConversationTurn): Promise<ReflectionInsight[]> {
    const insights: ReflectionInsight[] = [];

    // 1. Detect preferences from user statements
    const preferences = this.detectPreferences(turn.userInput);
    insights.push(...preferences);

    // 2. Detect patterns in behavior
    const patterns = await this.detectPatterns(turn);
    insights.push(...patterns);

    // 3. Detect corrections (user fixing agent mistakes)
    if (this.isCorrectionPattern(turn.userInput)) {
      const mistake = await this.extractMistake(turn);
      if (mistake) insights.push(mistake);
    }

    // 4. Detect goals and intentions
    const goals = this.detectGoals(turn.userInput);
    insights.push(...goals);

    return insights;
  }

  /**
   * Detect explicit preference statements
   *
   * Patterns like:
   * - "I prefer X"
   * - "I like/love/hate X"
   * - "I always/never X"
   */
  private detectPreferences(input: string): ReflectionInsight[] {
    const insights: ReflectionInsight[] = [];

    // Match "I prefer X" patterns
    const preferMatch = input.match(/\b(i|I) (prefer|like|love|enjoy|want)\s+(.+)/);
    if (preferMatch) {
      insights.push({
        type: 'preference',
        key: 'preference.general',
        value: preferMatch[3].trim(),
        confidence: 0.85,
        reasoning: `User stated preference: "${preferMatch[0]}"`,
      });
    }

    // Match "I hate/dislike X" patterns
    const dislikeMatch = input.match(/\b(i|I) (hate|dislike|don't like|avoid)\s+(.+)/);
    if (dislikeMatch) {
      insights.push({
        type: 'preference',
        key: 'preference.avoid',
        value: dislikeMatch[3].trim(),
        confidence: 0.85,
        reasoning: `User stated dislike: "${dislikeMatch[0]}"`,
      });
    }

    // Match "I always/never X" patterns
    const habitMatch = input.match(/\b(i|I) (always|never|usually|typically|normally)\s+(.+)/);
    if (habitMatch) {
      insights.push({
        type: 'pattern',
        key: 'behavior.habit',
        value: `${habitMatch[2]} ${habitMatch[3].trim()}`,
        confidence: 0.80,
        reasoning: `User described habit: "${habitMatch[0]}"`,
      });
    }

    return insights;
  }

  /**
   * Detect behavioral patterns over time
   *
   * This is a simplified version - in production, would analyze
   * conversation history to find recurring patterns
   */
  private async detectPatterns(turn: ConversationTurn): Promise<ReflectionInsight[]> {
    const insights: ReflectionInsight[] = [];

    // Detect time-based patterns
    const hour = turn.timestamp.getHours();
    if (hour >= 6 && hour < 12) {
      // Morning activity pattern
      if (turn.userInput.match(/\b(morning|breakfast|coffee)\b/i)) {
        insights.push({
          type: 'pattern',
          key: 'activity.morning',
          value: turn.userInput.slice(0, 100),
          confidence: 0.60,
          reasoning: 'Morning routine activity detected',
        });
      }
    }

    return insights;
  }

  /**
   * Detect if user is correcting a previous mistake
   *
   * Patterns like:
   * - "No, I meant X"
   * - "Actually, it's X"
   * - "That's wrong, it should be X"
   */
  private isCorrectionPattern(input: string): boolean {
    const correctionPatterns = [
      /\b(no,?|nope,?|wrong)\s+/i,
      /\bactually,?\s+/i,
      /\bi meant\s+/i,
      /\bit('s| is) (actually|really)\s+/i,
      /\bthat('s| is) (wrong|incorrect|not right)/i,
    ];

    return correctionPatterns.some(pattern => pattern.test(input));
  }

  /**
   * Extract the mistake from a correction
   */
  private async extractMistake(turn: ConversationTurn): Promise<ReflectionInsight | null> {
    // Use LLM to understand what was corrected
    const prompt = `Analyze this correction and identify what mistake was made:

User said: "${turn.userInput}"

What did the agent get wrong? Respond in one short sentence.`;

    try {
      const analysis = await this.llm.chat(
        [{ role: 'user', content: prompt }],
        { tier: 'fast', maxTokens: 100, skipCache: true }
      );

      return {
        type: 'mistake',
        key: 'learned.mistake',
        value: analysis.trim(),
        confidence: 0.70,
        reasoning: `User correction detected: "${turn.userInput.slice(0, 50)}"`,
      };
    } catch (error) {
      debug('Failed to extract mistake', { error: String(error) });
      return null;
    }
  }

  /**
   * Detect goals and intentions
   *
   * Patterns like:
   * - "I want to X"
   * - "I need to X"
   * - "My goal is X"
   */
  private detectGoals(input: string): ReflectionInsight[] {
    const insights: ReflectionInsight[] = [];

    const goalMatch = input.match(/\b(i|I) (want to|need to|have to|should|must)\s+(.+)/);
    if (goalMatch) {
      insights.push({
        type: 'goal',
        key: 'goal.stated',
        value: goalMatch[3].trim(),
        confidence: 0.80,
        reasoning: `User stated goal: "${goalMatch[0]}"`,
      });
    }

    const goalExplicitMatch = input.match(/\b(my goal|goal) (is|:|=)\s+(.+)/i);
    if (goalExplicitMatch) {
      insights.push({
        type: 'goal',
        key: 'goal.explicit',
        value: goalExplicitMatch[3].trim(),
        confidence: 0.90,
        reasoning: `User explicitly stated goal: "${goalExplicitMatch[0]}"`,
      });
    }

    return insights;
  }

  /**
   * Store an insight in the learning system
   */
  private async storeInsight(insight: ReflectionInsight): Promise<void> {
    try {
      this.learning.recordObservation({
        entityId: 'user',
        key: insight.key,
        value: insight.value,
        valueType: 'string',
        sourceType: 'inferred',
        confidence: insight.confidence,
      });

      debug('Stored reflection insight', {
        type: insight.type,
        key: insight.key,
        value: insight.value.slice(0, 50),
      });
    } catch (error) {
      debug('Failed to store insight', { error: String(error) });
    }
  }

  /**
   * Enable or disable reflection
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    info('Reflection service', { enabled });
  }

  /**
   * Get reflection statistics
   */
  getStats(): { enabled: boolean; reflectionCount: number } {
    return {
      enabled: this.enabled,
      reflectionCount: this.reflectionCount,
    };
  }
}
