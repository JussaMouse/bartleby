// src/services/context.ts
// The Context Service - Bartleby's memory of you and your interactions

import fs from 'fs';
import path from 'path';
import { Config, resolvePath, ensureDir } from '../config.js';
import { info, debug, warn } from '../utils/logger.js';
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

export interface UserFact {
  category: 'preference' | 'habit' | 'goal' | 'relationship' | 'schedule' | 'interest' | 'health' | 'system';
  key: string;
  value: unknown;
  confidence: number;
  lastUpdated: string;
  source: 'explicit' | 'inferred';
}

export class ContextService {
  private storagePath: string;
  private episodes: Episode[] = [];
  private facts = new Map<string, UserFact>();
  private currentSession: { id: string; messages: string[]; startTime: Date } | null = null;
  private learning?: LearningService;
  private llm?: LLMService;

  constructor(private config: Config) {
    this.storagePath = path.join(resolvePath(config, 'database'), 'memory');
  }

  setServices(learning: LearningService, llm: LLMService): void {
    this.learning = learning;
    this.llm = llm;
    debug('ContextService services wired', { hasLearning: !!learning, hasLLM: !!llm });
  }

  async initialize(): Promise<void> {
    ensureDir(this.storagePath);

    // Load episodes
    const episodesFile = path.join(this.storagePath, 'episodes.json');
    if (fs.existsSync(episodesFile)) {
      try {
        this.episodes = JSON.parse(fs.readFileSync(episodesFile, 'utf-8'));
      } catch {
        this.episodes = [];
      }
    }

    // Load profile
    const profileFile = path.join(this.storagePath, 'profile.json');
    if (fs.existsSync(profileFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(profileFile, 'utf-8'));
        for (const [k, v] of Object.entries(data)) {
          this.facts.set(k, v as UserFact);
        }
      } catch {
        // Start fresh
      }
    }

    info('ContextService initialized', {
      episodes: this.episodes.length,
      facts: this.facts.size,
    });
  }

  // === Session Management ===

  startSession(): void {
    const sessionId = crypto.randomUUID();

    // Create session entity in learning system if available
    if (this.learning) {
      this.learning.createEntity('session', {
        startTime: new Date().toISOString(),
        messageCount: 0
      });
    }

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

    // Extract facts from user messages
    if (isUser) {
      this.extractFacts(message);
    }
  }

  async endSession(): Promise<void> {
    if (!this.currentSession || this.currentSession.messages.length === 0) return;

    const sessionId = this.currentSession.id;
    const messages = this.currentSession.messages;

    // Try LLM-powered analysis if services available
    if (this.learning && this.llm) {
      try {
        await this.analyzeSessionWithLLM(sessionId, messages);
      } catch (err) {
        warn('LLM session analysis failed, falling back to basic extraction', { error: String(err) });
        // Fall back to basic extraction
        await this.basicSessionAnalysis(sessionId, messages);
      }
    } else {
      // No LLM available, use basic extraction
      await this.basicSessionAnalysis(sessionId, messages);
    }

    // Legacy: Still save to episodes array for backward compatibility during migration
    // This will be removed once full migration is complete
    const episode: Episode = {
      id: sessionId,
      timestamp: new Date().toISOString(),
      summary: await this.getSummaryFromLearning(sessionId) || this.summarizeSession(messages),
      topics: await this.getTopicsFromLearning(sessionId) || this.extractTopics(messages),
      actionsTaken: this.extractActions(messages),
      pendingFollowups: await this.getUnresolvedFromLearning(sessionId) || this.extractFollowups(messages),
      messageCount: messages.length,
    };

    this.episodes.push(episode);
    this.currentSession = null;

    // Note: No longer saving to JSON file - data persists in learning system
    debug('Session ended', { sessionId, messageCount: messages.length });
  }

  // === Episodic Memory ===

  getLastSession(): Episode | null {
    if (!this.learning) {
      // Fallback to legacy in-memory episodes
      return this.episodes[this.episodes.length - 1] || null;
    }

    // Query most recent session from learning system
    const sessions = this.learning['db'].prepare(`
      SELECT id, data, created_at
      FROM entities
      WHERE type = 'session'
      ORDER BY created_at DESC
      LIMIT 1
    `).all() as Array<{ id: string; data: string; created_at: string }>;

    if (sessions.length === 0) {
      return this.episodes[this.episodes.length - 1] || null;
    }

    return this.sessionEntityToEpisode(sessions[0]);
  }

  getTodayEpisodes(): Episode[] {
    if (!this.learning) {
      // Fallback to legacy in-memory episodes
      const today = new Date().toISOString().split('T')[0];
      return this.episodes.filter(e => e.timestamp.startsWith(today));
    }

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
    if (!this.learning) {
      // Fallback to legacy in-memory episodes
      const results: Array<{ episodeId: string; text: string }> = [];
      for (const ep of this.episodes) {
        for (const followup of ep.pendingFollowups) {
          results.push({ episodeId: ep.id, text: followup });
        }
      }
      return results;
    }

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
    if (!this.learning) {
      // Fallback to legacy in-memory episodes
      const episode = this.episodes.find(e => e.id === episodeId);
      if (!episode) return false;

      const idx = episode.pendingFollowups.indexOf(text);
      if (idx === -1) return false;

      episode.pendingFollowups.splice(idx, 1);
      this.save();
      return true;
    }

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
    if (!this.learning) {
      // Fallback to legacy in-memory episodes
      const lower = description.toLowerCase();
      for (const ep of this.episodes) {
        for (let i = 0; i < ep.pendingFollowups.length; i++) {
          if (ep.pendingFollowups[i].toLowerCase().includes(lower)) {
            const cleared = ep.pendingFollowups[i];
            ep.pendingFollowups.splice(i, 1);
            this.save();
            return cleared;
          }
        }
      }
      return null;
    }

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
    if (!this.learning) {
      // Fallback to legacy in-memory scoring
      const words = query.toLowerCase().split(/\s+/);
      const scored = this.episodes.map(ep => {
        let score = 0;
        for (const word of words) {
          if (ep.summary.toLowerCase().includes(word)) score += 2;
          if (ep.topics.some(t => t.includes(word))) score += 1;
        }
        return { ep, score };
      });

      return scored
        .filter(s => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(s => s.ep);
    }

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

  // === Semantic Profile ===

  getFact(category: string, key: string): UserFact | undefined {
    return this.facts.get(`${category}:${key}`);
  }

  setFact(
    category: UserFact['category'],
    key: string,
    value: unknown,
    options: { source?: 'explicit' | 'inferred'; confidence?: number } = {}
  ): void {
    const fullKey = `${category}:${key}`;
    this.facts.set(fullKey, {
      category,
      key,
      value,
      confidence: options.confidence ?? 0.7,
      lastUpdated: new Date().toISOString(),
      source: options.source ?? 'inferred',
    });
    this.save();
  }

  clearFact(category: UserFact['category'], key: string): boolean {
    const fullKey = `${category}:${key}`;
    const existed = this.facts.has(fullKey);
    this.facts.delete(fullKey);
    this.save();
    return existed;
  }

  getFactsByCategory(category: string): UserFact[] {
    return Array.from(this.facts.values()).filter(f => f.category === category);
  }

  getProfileSummary(): string {
    const sections: string[] = [];
    
    // System context goes first (e.g., tax mode instructions)
    const systemFacts = this.getFactsByCategory('system');
    if (systemFacts.length > 0) {
      const items = systemFacts.map(f => `${f.key}: ${f.value}`).join('\n');
      sections.push(`## Current Context\n${items}`);
    }
    
    const categories = ['preference', 'habit', 'goal', 'relationship', 'schedule', 'interest', 'health'];

    for (const cat of categories) {
      const facts = this.getFactsByCategory(cat);
      if (facts.length > 0) {
        const items = facts.map(f => `${f.key}: ${f.value}`).join(', ');
        sections.push(`**${cat.charAt(0).toUpperCase() + cat.slice(1)}**: ${items}`);
      }
    }

    return sections.join('\n');
  }

  getEpisodeCount(): number {
    if (!this.learning) {
      return this.episodes.length;
    }

    // Count session entities in learning system
    const result = this.learning['db'].prepare(`
      SELECT COUNT(*) as count
      FROM entities
      WHERE type = 'session'
    `).get() as { count: number };

    return result.count + this.episodes.length; // Include legacy episodes
  }

  // === Fact Extraction ===

  private extractFacts(message: string): void {
    const lower = message.toLowerCase();

    // Preference patterns
    const prefPatterns = [
      /i (prefer|like|love|enjoy)\s+(.+?)(?:\.|,|$)/i,
      /my favorite\s+(.+?)\s+is\s+(.+?)(?:\.|,|$)/i,
    ];
    for (const pattern of prefPatterns) {
      const match = lower.match(pattern);
      if (match) {
        this.setFact('preference', match[match.length - 1].trim(), true);
      }
    }

    // Goal patterns
    const goalMatch = lower.match(/i want to\s+(.+?)(?:\.|,|$)/i);
    if (goalMatch) {
      this.setFact('goal', goalMatch[1].trim(), true);
    }

    // Relationship patterns
    const relMatch = lower.match(/my (wife|husband|son|daughter|brother|sister|mom|dad|partner|friend)\s+(\w+)?/i);
    if (relMatch) {
      const relation = relMatch[1];
      const name = relMatch[2];
      if (name) {
        this.setFact('relationship', relation, name);
      }
    }

    // Habit patterns
    const habitMatch = lower.match(/i (usually|always|every)\s+(.+?)(?:\.|,|$)/i);
    if (habitMatch) {
      this.setFact('habit', habitMatch[2].trim(), true);
    }

    // Health patterns
    const healthPatterns = [
      /i('m| am)\s+(trying to|working on)\s+(lose weight|exercise|eat better|sleep more)/i,
      /my goal is to\s+(run|walk|exercise|meditate)\s+(\d+)/i,
    ];
    for (const pattern of healthPatterns) {
      const match = lower.match(pattern);
      if (match) {
        this.setFact('health', match[match.length - 1], true);
      }
    }
  }

  // === Session Analysis ===

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

  private extractActions(messages: string[]): string[] {
    const actions: string[] = [];
    for (const msg of messages) {
      if (msg.startsWith('Bartleby:') && msg.includes('✓')) {
        actions.push(msg.replace('Bartleby: ', '').slice(0, 50));
      }
    }
    return actions;
  }

  private extractFollowups(messages: string[]): string[] {
    const followups: string[] = [];
    for (const msg of messages) {
      if (msg.startsWith('User:')) {
        const lower = msg.toLowerCase();
        if (lower.includes("i'll") || lower.includes('i will') || lower.includes('remind me')) {
          followups.push(msg.replace('User: ', '').slice(0, 50));
        }
      }
    }
    return followups;
  }

  // === Persistence ===

  private async save(): Promise<void> {
    const episodesFile = path.join(this.storagePath, 'episodes.json');
    fs.writeFileSync(episodesFile, JSON.stringify(this.episodes, null, 2));

    const profileFile = path.join(this.storagePath, 'profile.json');
    const profile: Record<string, UserFact> = {};
    for (const [k, v] of this.facts) {
      profile[k] = v;
    }
    fs.writeFileSync(profileFile, JSON.stringify(profile, null, 2));
  }

  // === LLM-Powered Analysis ===

  private async analyzeSessionWithLLM(sessionId: string, messages: string[]): Promise<void> {
    if (!this.learning || !this.llm) return;

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
    if (!this.learning) return;

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

  private async getSummaryFromLearning(sessionId: string): Promise<string | null> {
    if (!this.learning) return null;
    const obs = this.learning.getObservation(sessionId, 'summary');
    return obs?.value || null;
  }

  private async getTopicsFromLearning(sessionId: string): Promise<string[]> {
    if (!this.learning) return [];
    const observations = this.learning.getObservations(sessionId, { keyPrefix: 'topic' });
    return observations.map(o => o.value);
  }

  private async getUnresolvedFromLearning(sessionId: string): Promise<string[]> {
    if (!this.learning) return [];
    const observations = this.learning.getObservations(sessionId, { keyPrefix: 'unresolved_question' });
    return observations.map(o => o.value);
  }

  /**
   * Convert a session entity from learning system to Episode format
   */
  private sessionEntityToEpisode(session: { id: string; data: string; created_at: string }): Episode {
    if (!this.learning) {
      throw new Error('LearningService not available');
    }

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
