// src/services/context.ts
// The Context Service - Bartleby's memory of you and your interactions

import fs from 'fs';
import path from 'path';
import { Config, resolvePath, ensureDir } from '../config.js';
import { info, debug } from '../utils/logger.js';

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
  private currentSession: { messages: string[]; startTime: Date } | null = null;

  constructor(private config: Config) {
    this.storagePath = path.join(resolvePath(config, 'database'), 'memory');
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
    this.currentSession = { messages: [], startTime: new Date() };
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

    const episode: Episode = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      summary: this.summarizeSession(this.currentSession.messages),
      topics: this.extractTopics(this.currentSession.messages),
      actionsTaken: this.extractActions(this.currentSession.messages),
      pendingFollowups: this.extractFollowups(this.currentSession.messages),
      messageCount: this.currentSession.messages.length,
    };

    this.episodes.push(episode);
    this.currentSession = null;

    await this.save();
  }

  // === Episodic Memory ===

  getLastSession(): Episode | null {
    return this.episodes[this.episodes.length - 1] || null;
  }

  getTodayEpisodes(): Episode[] {
    const today = new Date().toISOString().split('T')[0];
    return this.episodes.filter(e => e.timestamp.startsWith(today));
  }

  getPendingFollowups(): Array<{ episodeId: string; text: string }> {
    const results: Array<{ episodeId: string; text: string }> = [];
    for (const ep of this.episodes) {
      for (const followup of ep.pendingFollowups) {
        results.push({ episodeId: ep.id, text: followup });
      }
    }
    return results;
  }

  clearFollowup(episodeId: string, text: string): boolean {
    const episode = this.episodes.find(e => e.id === episodeId);
    if (!episode) return false;

    const idx = episode.pendingFollowups.indexOf(text);
    if (idx === -1) return false;

    episode.pendingFollowups.splice(idx, 1);
    this.save();
    return true;
  }

  clearMatchingFollowup(description: string): string | null {
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

  recallRelevant(query: string, limit = 5): Episode[] {
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

  getFactsByCategory(category: string): UserFact[] {
    return Array.from(this.facts.values()).filter(f => f.category === category);
  }

  getProfileSummary(): string {
    const sections: string[] = [];
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
    return this.episodes.length;
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

  close(): void {
    if (this.currentSession) {
      this.endSession();
    }
  }
}
