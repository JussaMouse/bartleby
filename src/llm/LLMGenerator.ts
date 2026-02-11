// src/llm/LLMGenerator.ts
// AI-powered content generation utilities

import { LLMService } from '../services/llm.js';
import { GardenRecord } from '../services/garden.js';
import { CalendarEntry } from '../services/calendar.js';

export interface RelatedData {
  actions: GardenRecord[];
  notes: GardenRecord[];
  contacts: GardenRecord[];
  media: GardenRecord[];
}

export interface LLMGeneratorCache {
  get(key: string): string | null;
  set(key: string, value: string, ttl?: number): void;
  invalidate(key: string): void;
}

/**
 * Simple in-memory cache for LLM responses
 */
class SimpleCache implements LLMGeneratorCache {
  private cache = new Map<string, { value: string; expiresAt: number }>();

  get(key: string): string | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key: string, value: string, ttl = 3600000): void {
    // Default 1 hour TTL
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttl,
    });
  }

  invalidate(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  prune(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }
}

/**
 * LLM-powered content generation for Garden records
 */
export class LLMGenerator {
  private cache: LLMGeneratorCache;

  constructor(private llm: LLMService, cache?: LLMGeneratorCache) {
    this.cache = cache || new SimpleCache();
  }

  /**
   * Generate a summary of a project based on its content and related data
   */
  async summarizeProject(
    project: GardenRecord,
    relatedData: RelatedData
  ): Promise<string> {
    // Check cache first
    const cacheKey = `summary:${project.id}:${project.updated_at}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    // Build prompt
    const prompt = this.buildSummaryPrompt(project, relatedData);

    // Generate summary
    const response = await this.llm.chat(
      [{ role: 'user', content: prompt }],
      {
        tier: 'fast',
        maxTokens: 200,
      }
    );

    const summary = response.trim();

    // Cache result
    this.cache.set(cacheKey, summary);

    return summary;
  }

  /**
   * Suggest next actions based on project state
   */
  async suggestNextActions(
    project: GardenRecord,
    context: string,
    existingActions: GardenRecord[]
  ): Promise<string[]> {
    // Check cache
    const cacheKey = `actions:${project.id}:${project.updated_at}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return JSON.parse(cached);

    // Build prompt
    const prompt = this.buildNextActionsPrompt(project, context, existingActions);

    // Generate suggestions
    const response = await this.llm.chat(
      [{ role: 'user', content: prompt }],
      {
        tier: 'fast',
        maxTokens: 300,
      }
    );

    // Parse response (expecting bullet list)
    const suggestions = response
      .split('\n')
      .map((line: string) => line.trim())
      .filter((line: string) => line.startsWith('-') || line.startsWith('•'))
      .map((line: string) => line.replace(/^[-•]\s*/, '').trim())
      .filter((line: string) => line.length > 0)
      .slice(0, 5); // Max 5 suggestions

    // Cache result
    this.cache.set(cacheKey, JSON.stringify(suggestions));

    return suggestions;
  }

  /**
   * Generate weekly review summary
   */
  async generateWeeklyReview(
    completedActions: GardenRecord[],
    upcomingEvents: CalendarEntry[],
    options?: {
      includeProjects?: boolean;
      includeStats?: boolean;
    }
  ): Promise<string> {
    // Cache key based on date range (weekly reviews don't change often)
    const weekStart = this.getWeekStart();
    const cacheKey = `review:${weekStart.toISOString()}:${completedActions.length}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    // Build prompt
    const prompt = this.buildWeeklyReviewPrompt(
      completedActions,
      upcomingEvents,
      options
    );

    // Generate review
    const response = await this.llm.chat(
      [{ role: 'user', content: prompt }],
      {
        tier: 'fast',
        maxTokens: 500,
      }
    );

    const review = response.trim();

    // Cache for 24 hours
    this.cache.set(cacheKey, review, 86400000);

    return review;
  }

  /**
   * Invalidate cached responses for a project
   */
  invalidateProject(projectId: string): void {
    // In a simple implementation, we can't easily enumerate all keys
    // In production, you'd want a more sophisticated cache with key patterns
    // For now, this is a placeholder that specific callers can use with full keys
    this.cache.invalidate(`summary:${projectId}`);
    this.cache.invalidate(`actions:${projectId}`);
  }

  /**
   * Clear all cached responses
   */
  clearCache(): void {
    if (this.cache instanceof SimpleCache) {
      this.cache.clear();
    }
  }

  // === Private Helpers ===

  private buildSummaryPrompt(
    project: GardenRecord,
    relatedData: RelatedData
  ): string {
    const sections: string[] = [];

    sections.push(`Project: ${project.title}`);
    sections.push(`Status: ${project.status}`);

    if (project.content) {
      sections.push(`\nDescription:\n${project.content}`);
    }

    if (relatedData.actions.length > 0) {
      sections.push(`\nActive Actions (${relatedData.actions.length}):`);
      relatedData.actions.slice(0, 5).forEach(action => {
        sections.push(`- ${action.title}${action.due_date ? ` (due: ${action.due_date})` : ''}`);
      });
      if (relatedData.actions.length > 5) {
        sections.push(`  ... and ${relatedData.actions.length - 5} more`);
      }
    }

    if (relatedData.notes.length > 0) {
      sections.push(`\nNotes: ${relatedData.notes.length} related notes`);
    }

    if (relatedData.contacts.length > 0) {
      sections.push(`\nPeople: ${relatedData.contacts.map(c => c.title).join(', ')}`);
    }

    const dataContext = sections.join('\n');

    return `Generate a brief 2-3 sentence summary of this project's current state and progress.

${dataContext}

Summary:`;
  }

  private buildNextActionsPrompt(
    project: GardenRecord,
    context: string,
    existingActions: GardenRecord[]
  ): string {
    const sections: string[] = [];

    sections.push(`Project: ${project.title}`);
    if (project.content) {
      sections.push(`\nGoal:\n${project.content}`);
    }

    if (context) {
      sections.push(`\nContext:\n${context}`);
    }

    if (existingActions.length > 0) {
      sections.push(`\nCurrent Actions:`);
      existingActions.forEach(action => {
        sections.push(`- ${action.title}${action.status ? ` [${action.status}]` : ''}`);
      });
    } else {
      sections.push(`\nNo actions yet defined for this project.`);
    }

    const dataContext = sections.join('\n');

    return `Based on this project, suggest 3-5 concrete next actions.
Each action should be specific, actionable, and realistic.
Format as a bullet list with one action per line.

${dataContext}

Suggested next actions:`;
  }

  private buildWeeklyReviewPrompt(
    completedActions: GardenRecord[],
    upcomingEvents: CalendarEntry[],
    options?: {
      includeProjects?: boolean;
      includeStats?: boolean;
    }
  ): string {
    const sections: string[] = [];

    sections.push('Generate a weekly review summary based on:');

    if (completedActions.length > 0) {
      sections.push(`\n## Completed This Week (${completedActions.length})`);

      // Group by project if option enabled
      if (options?.includeProjects) {
        const byProject = this.groupByProject(completedActions);
        for (const [project, actions] of Object.entries(byProject)) {
          sections.push(`\n### ${project}`);
          actions.forEach(action => {
            sections.push(`- ${action.title}`);
          });
        }
      } else {
        completedActions.slice(0, 10).forEach(action => {
          sections.push(`- ${action.title}`);
        });
        if (completedActions.length > 10) {
          sections.push(`  ... and ${completedActions.length - 10} more`);
        }
      }
    } else {
      sections.push('\nNo completed actions this week.');
    }

    if (upcomingEvents.length > 0) {
      sections.push(`\n## Upcoming (${upcomingEvents.length})`);
      upcomingEvents.slice(0, 5).forEach(event => {
        sections.push(`- ${event.title} (${event.start_time})`);
      });
      if (upcomingEvents.length > 5) {
        sections.push(`  ... and ${upcomingEvents.length - 5} more`);
      }
    }

    if (options?.includeStats && completedActions.length > 0) {
      sections.push(`\n## Stats`);
      sections.push(`- Completed: ${completedActions.length} actions`);
      sections.push(`- Upcoming: ${upcomingEvents.length} events`);
    }

    const dataContext = sections.join('\n');

    return `${dataContext}

Write a brief 3-4 sentence weekly review highlighting key accomplishments and what's coming up.`;
  }

  private groupByProject(actions: GardenRecord[]): Record<string, GardenRecord[]> {
    const groups: Record<string, GardenRecord[]> = {};

    for (const action of actions) {
      const project = action.project || 'Other';
      if (!groups[project]) {
        groups[project] = [];
      }
      groups[project].push(action);
    }

    return groups;
  }

  private getWeekStart(): Date {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day; // Adjust to Sunday
    return new Date(now.setDate(diff));
  }
}
