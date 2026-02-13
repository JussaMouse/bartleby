// src/services/context.ts
// The Context Service - Bartleby's memory of you and your interactions

import { info, debug, warn } from '../utils/logger.js';
import type { Config } from '../config.js';
import type { LearningService } from './learning.js';
import type { LLMService } from './llm.js';

export interface Episode {
  id: string;
  timestamp: string;
  summary: string;
  topics: string[];
  actionsTaken: string[];
  pendingFollowups: string[];
  messageCount: number;
}

export class ContextService {
  private currentSession: { id: string; messages: string[]; startTime: Date } | null = null;
  private learning!: LearningService;
  private llm!: LLMService;

  constructor(private config: Config) {}

  setServices(learning: LearningService, llm: LLMService): void {
    this.learning = learning;
    this.llm = llm;
    debug('ContextService services wired', { hasLearning: !!learning, hasLLM: !!llm });
  }

  async initialize(): Promise<void> {
    if (!this.learning) {
      throw new Error('LearningService must be set before initialize()');
    }
    info('ContextService initialized');
  }

  // === Session Management ===

  startSession(): void {
    const sessionId = crypto.randomUUID();

    // Create session entity in learning system
    this.learning.createEntity('session', {
      startTime: new Date().toISOString(),
      messageCount: 0
    });

    this.currentSession = { id: sessionId, messages: [], startTime: new Date() };
    debug('Session started', { sessionId });
  }

  getCurrentSessionId(): string | undefined {
    return this.currentSession?.id;
  }

  recordMessage(message: string, isUser: boolean): void {
    if (this.currentSession) {
      this.currentSession.messages.push(`${isUser ? 'User' : 'Bartleby'}: ${message}`);
    }
  }

  async endSession(): Promise<void> {
    if (!this.currentSession || this.currentSession.messages.length === 0) return;

    const sessionId = this.currentSession.id;
    const messages = this.currentSession.messages;

    // Try LLM-powered analysis with fallback to basic extraction
    try {
      await this.analyzeSessionWithLLM(sessionId, messages);
    } catch (err) {
      warn('LLM session analysis failed, falling back to basic extraction', { error: String(err) });
      await this.basicSessionAnalysis(sessionId, messages);
    }

    this.currentSession = null;
    debug('Session ended', { sessionId, messageCount: messages.length });
  }

  // === Episodic Memory ===

  getLastSession(): Episode | null {
    // Query most recent session from learning system
    const sessions = this.learning['db'].prepare(`
      SELECT id, data, created_at
      FROM entities
      WHERE type = 'session'
      ORDER BY created_at DESC
      LIMIT 1
    `).all() as Array<{ id: string; data: string; created_at: string }>;

    if (sessions.length === 0) {
      return null;
    }

    return this.sessionEntityToEpisode(sessions[0]);
  }

  getTodayEpisodes(): Episode[] {
    // Query today's sessions from learning system
    const today = new Date().toISOString().split('T')[0];
    const sessions = this.learning['db'].prepare(`
      SELECT id, data, created_at
      FROM entities
      WHERE type = 'session'
      AND created_at >= ?
      ORDER BY created_at DESC
    `).all(`${today}T00:00:00Z`) as Array<{ id: string; data: string; created_at: string }>;

    return sessions.map(s => this.sessionEntityToEpisode(s));
  }

  getPendingFollowups(): Array<{ episodeId: string; text: string }> {
    // Query all unresolved questions from learning system
    const unresolved = this.learning.queryObservationsByKey('unresolved_question', {
      notExpired: true
    });

    return unresolved.map(obs => ({
      episodeId: obs.entityId,
      text: obs.value
    }));
  }

  clearFollowup(episodeId: string, text: string): boolean {
    // Find and expire the unresolved observation
    const observations = this.learning.getObservations(episodeId, {
      keyPrefix: 'unresolved_question'
    });

    for (const obs of observations) {
      if (obs.value === text) {
        // Mark as resolved by expiring it
        this.learning.recordObservation({
          entityId: episodeId,
          key: obs.key,
          value: obs.value,
          sourceType: 'inferred',
          confidence: 1.0,
          expiresAt: new Date(0).toISOString(), // Expire immediately
          supersedes: obs.id
        });
        return true;
      }
    }

    return false;
  }

  clearMatchingFollowup(description: string): string | null {
    // Search for matching unresolved question
    const lower = description.toLowerCase();
    const unresolved = this.learning.queryObservationsByKey('unresolved_question', {
      notExpired: true
    });

    for (const obs of unresolved) {
      if (obs.value.toLowerCase().includes(lower)) {
        // Mark as resolved
        this.learning.recordObservation({
          entityId: obs.entityId,
          key: obs.key,
          value: obs.value,
          sourceType: 'inferred',
          confidence: 1.0,
          expiresAt: new Date(0).toISOString(),
          supersedes: obs.id
        });
        return obs.value;
      }
    }

    return null;
  }

  recallRelevant(query: string, limit = 5): Episode[] {
    // Use full-text search on observations
    const relevantObs = this.learning.searchObservations(query, limit * 3);

    // Get unique session IDs
    const sessionIds = new Set<string>();
    for (const obs of relevantObs) {
      // Check if this is a session entity
      const entity = this.learning.getEntity(obs.entityId);
      if (entity && entity.type === 'session') {
        sessionIds.add(obs.entityId);
      }
    }

    if (sessionIds.size === 0) {
      return [];
    }

    // Convert to Episodes
    const sessions = this.learning['db'].prepare(`
      SELECT id, data, created_at
      FROM entities
      WHERE id IN (${Array.from(sessionIds).map(() => '?').join(',')})
      ORDER BY created_at DESC
      LIMIT ?
    `).all(...Array.from(sessionIds), limit) as Array<{ id: string; data: string; created_at: string }>;

    return sessions.map(s => this.sessionEntityToEpisode(s));
  }

  getEpisodeCount(): number {
    // Count session entities in learning system
    const result = this.learning['db'].prepare(`
      SELECT COUNT(*) as count
      FROM entities
      WHERE type = 'session'
    `).get() as { count: number };

    return result.count;
  }

  // === Facts API (delegates to LearningService) ===

  getFact(category: string, key: string): any | undefined {
    const obs = this.learning.getObservation('user', `fact.${category}.${key}`);
    if (!obs) return undefined;

    try {
      return JSON.parse(obs.value);
    } catch {
      return obs.value;
    }
  }

  setFact(
    category: string,
    key: string,
    value: unknown,
    options: { source?: 'explicit' | 'inferred'; confidence?: number } = {}
  ): void {
    this.learning.recordObservation({
      entityId: 'user',
      key: `fact.${category}.${key}`,
      value: JSON.stringify(value),
      sourceType: options.source === 'explicit' ? 'stated' : 'inferred',
      confidence: options.confidence ?? 0.7
    });
  }

  clearFact(category: string, key: string): boolean {
    const obs = this.learning.getObservation('user', `fact.${category}.${key}`);
    if (!obs) return false;

    // Expire the fact
    this.learning.recordObservation({
      entityId: 'user',
      key: `fact.${category}.${key}`,
      value: obs.value,
      sourceType: 'inferred',
      confidence: obs.confidence,
      expiresAt: new Date(0).toISOString(),
      supersedes: obs.id
    });

    return true;
  }

  // === LLM-Powered Analysis ===

  private async analyzeSessionWithLLM(sessionId: string, messages: string[]): Promise<void> {
    const conversationText = messages.join('\n');

    const prompt = `Analyze this conversation between a user and Bartleby assistant.

CONVERSATION:
${conversationText}

Extract and categorize observations:

1. ABOUT THE USER:
   - Stated preferences or requirements (high confidence)
   - Inferred working patterns or style (medium confidence)
   - Current goals or priorities mentioned
   - Technical context (languages, frameworks, tools used)

2. ABOUT THE CONVERSATION:
   - One-sentence summary of what was accomplished
   - Key topics discussed (technical concepts, not just keywords)
   - Important decisions made
   - Unresolved questions or follow-ups needed
   - Artifacts created (files, code, configs)

For each observation, provide:
- entity_id: "user" for user observations, "${sessionId}" for session observations
- key: structured key like "preference.code_style", "goal.current", "summary", "topic", "decision", "unresolved_question", "artifact.created"
- value: the observed value (be specific and concrete)
- confidence: 0.0 to 1.0

Return as JSON:
{
  "observations": [
    {"entity_id": "user", "key": "preference.code_style", "value": "tabs", "confidence": 1.0},
    {"entity_id": "${sessionId}", "key": "summary", "value": "Implemented command history", "confidence": 0.95}
  ]
}`;

    try {
      const response = await this.llm.chat([
        { role: 'user', content: prompt }
      ], {
        tier: 'router',
        maxTokens: 1500
      });

      // Parse LLM response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        warn('Failed to parse LLM analysis response');
        return;
      }

      const analysis = JSON.parse(jsonMatch[0]);

      // Store all observations
      for (const obs of analysis.observations) {
        this.learning.recordObservation({
          entityId: obs.entity_id,
          key: obs.key,
          value: obs.value,
          sourceType: 'inferred',
          sourceId: sessionId,
          confidence: obs.confidence || 0.8
        });
      }

      // Create relationship: user participated in session
      this.learning.recordRelationship({
        fromEntity: 'user',
        toEntity: sessionId,
        relationType: 'participated_in',
        sourceId: sessionId
      });

      info('LLM session analysis complete', {
        sessionId,
        observationsExtracted: analysis.observations.length
      });
    } catch (err) {
      warn('LLM analysis error', { error: String(err) });
      throw err;
    }
  }

  private async basicSessionAnalysis(sessionId: string, messages: string[]): Promise<void> {
    // Basic extraction for fallback
    const summary = this.summarizeSession(messages);
    const topics = this.extractTopics(messages);

    this.learning.recordObservation({
      entityId: sessionId,
      key: 'summary',
      value: summary,
      sourceType: 'extracted',
      sourceId: sessionId,
      confidence: 0.6
    });

    for (const topic of topics) {
      this.learning.recordObservation({
        entityId: sessionId,
        key: 'topic',
        value: topic,
        sourceType: 'extracted',
        sourceId: sessionId,
        confidence: 0.5
      });
    }
  }

  // === Helper Methods ===

  private summarizeSession(messages: string[]): string {
    const firstUser = messages.find(m => m.startsWith('User:'));
    if (firstUser) {
      return firstUser.replace('User: ', '').slice(0, 100);
    }
    return 'Session with no user messages';
  }

  private extractTopics(messages: string[]): string[] {
    const text = messages.join(' ').toLowerCase();
    const topics: string[] = [];

    const keywords = ['task', 'project', 'calendar', 'meeting', 'email', 'call', 'work', 'home', 'health', 'exercise'];
    for (const kw of keywords) {
      if (text.includes(kw)) topics.push(kw);
    }

    return topics.slice(0, 5);
  }

  /**
   * Convert a session entity from learning system to Episode format
   */
  private sessionEntityToEpisode(session: { id: string; data: string; created_at: string }): Episode {
    const data = session.data ? JSON.parse(session.data) : {};

    // Get observations for this session
    const summary = this.learning.getObservation(session.id, 'summary');
    const topics = this.learning.getObservations(session.id, { keyPrefix: 'topic' });
    const actions = this.learning.getObservations(session.id, { keyPrefix: 'action' });
    const unresolved = this.learning.getObservations(session.id, { keyPrefix: 'unresolved_question' });

    return {
      id: session.id,
      timestamp: session.created_at,
      summary: summary?.value || 'Session summary not available',
      topics: topics.map(o => o.value),
      actionsTaken: actions.map(o => o.value),
      pendingFollowups: unresolved.map(o => o.value),
      messageCount: data.messageCount || 0
    };
  }

  close(): void {
    if (this.currentSession) {
      this.endSession();
    }
  }
}
