// src/services/background-analysis.ts
// Background jobs for pattern detection and analysis

import { LearningService } from './learning.js';
import { GardenService } from './garden.js';
import { EmbeddingRelationships } from './embedding-relationships.js';
import { info, debug } from '../utils/logger.js';

export class BackgroundAnalysis {
  private embeddingRelationships?: EmbeddingRelationships;

  constructor(
    private learning: LearningService,
    private garden: GardenService
  ) {}

  /**
   * Wire up embedding relationships service for semantic analysis.
   */
  setEmbeddingRelationships(embeddingRelationships: EmbeddingRelationships): void {
    this.embeddingRelationships = embeddingRelationships;
  }

  /**
   * Run all background analysis jobs
   * Should be called periodically (e.g., daily via scheduler)
   */
  async runAll(): Promise<void> {
    info('Starting background analysis');

    await this.analyzeWorkHours();
    await this.analyzePrimaryProject();
    await this.analyzeWorkflowPatterns();
    await this.analyzeGardenRecordImportance();
    await this.discoverSemanticRelationships();
    await this.consolidateMemory();
    await this.decayActivation();
    await this.cleanupExpiredData();

    info('Background analysis complete');
  }

  /**
   * Discover semantic relationships between garden records using embeddings.
   */
  private async discoverSemanticRelationships(): Promise<void> {
    if (!this.embeddingRelationships) {
      debug('Embedding relationships service not available');
      return;
    }

    const relationshipsCreated = await this.embeddingRelationships.discoverRelationships(0.7);
    debug('Semantic relationship discovery complete', { relationshipsCreated });
  }

  /**
   * Clean up expired observations and optimize database.
   * Runs maintenance tasks to keep the learning system healthy.
   */
  private async cleanupExpiredData(): Promise<void> {
    // Clean up expired observations
    const deletedCount = this.learning.cleanupExpiredObservations();
    if (deletedCount > 0) {
      info('Cleaned up expired observations', { count: deletedCount });
    }

    // Get database stats
    const stats = this.learning.getStats();
    debug('Database stats', stats);

    // Optimize database if it's getting large (> 50 MB)
    if (stats.databaseSizeMB > 50) {
      const result = this.learning.optimizeDatabase();
      info('Database optimized', result);
    }
  }

  /**
   * Detect user's work hours from command timestamps
   */
  private async analyzeWorkHours(): Promise<void> {
    const db = this.learning['db']; // Access private db for raw queries

    // Get command timestamps from last 30 days
    const commands = db.prepare(`
      SELECT e.created_at
      FROM entities e
      WHERE e.type = 'command'
      AND e.created_at > datetime('now', '-30 days')
    `).all() as Array<{ created_at: string }>;

    if (commands.length < 10) {
      debug('Not enough commands to analyze work hours', { count: commands.length });
      return;
    }

    // Group by hour
    const hourCounts: Record<number, number> = {};
    for (const cmd of commands) {
      const date = new Date(cmd.created_at);
      const hour = date.getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    }

    // Find peak hours (hours with > 5% of total commands)
    const totalCommands = commands.length;
    const threshold = totalCommands * 0.05;
    const peakHours = Object.entries(hourCounts)
      .filter(([_, count]) => count > threshold)
      .map(([hour, _]) => parseInt(hour))
      .sort((a, b) => a - b);

    if (peakHours.length > 0) {
      const startHour = Math.min(...peakHours);
      const endHour = Math.max(...peakHours) + 1; // Include the full hour

      const workHours = {
        start: `${String(startHour).padStart(2, '0')}:00`,
        end: `${String(endHour).padStart(2, '0')}:00`,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      };

      // Record observation
      const existing = this.learning.getObservation('user', 'pattern.work_hours');
      this.learning.recordObservation({
        entityId: 'user',
        key: 'pattern.work_hours',
        value: JSON.stringify(workHours),
        valueType: 'json',
        sourceType: 'computed',
        confidence: 0.7,
        supersedes: existing?.id
      });

      debug('Work hours detected', { workHours, commandsSampled: commands.length });
    }
  }

  /**
   * Identify user's primary project from usage patterns
   */
  private async analyzePrimaryProject(): Promise<void> {
    const db = this.learning['db'];

    // Get project usage from observations (from command metadata)
    const projects = db.prepare(`
      SELECT value, COUNT(*) as count
      FROM observations
      WHERE key = 'project'
      AND observed_at > datetime('now', '-30 days')
      GROUP BY value
      ORDER BY count DESC
      LIMIT 1
    `).get() as { value: string; count: number } | undefined;

    if (!projects || projects.count < 5) {
      debug('Not enough project usage to determine primary', { count: projects?.count });
      return;
    }

    // Record primary project
    const existing = this.learning.getObservation('user', 'context.primary_project');
    this.learning.recordObservation({
      entityId: 'user',
      key: 'context.primary_project',
      value: projects.value,
      sourceType: 'computed',
      confidence: 0.8,
      supersedes: existing?.id
    });

    debug('Primary project identified', { project: projects.value, usageCount: projects.count });
  }

  /**
   * Detect workflow patterns (e.g., "creates actions after projects")
   */
  private async analyzeWorkflowPatterns(): Promise<void> {
    const db = this.learning['db'];

    // Detect: "creates action after creating note" pattern
    const sequences = db.prepare(`
      SELECT
        e1.created_at as first_time,
        e2.created_at as second_time,
        (julianday(e2.created_at) - julianday(e1.created_at)) * 24 * 60 as minutes_between
      FROM entities e1
      JOIN entities e2 ON e2.created_at > e1.created_at
      WHERE e1.type = 'command'
      AND e2.type = 'command'
      AND e1.created_at > datetime('now', '-30 days')
      AND EXISTS (
        SELECT 1 FROM observations o1
        WHERE o1.entity_id = e1.id AND o1.key = 'intent_type' AND o1.value = 'create_note'
      )
      AND EXISTS (
        SELECT 1 FROM observations o2
        WHERE o2.entity_id = e2.id AND o2.key = 'intent_type' AND o2.value = 'create_action'
      )
      AND (julianday(e2.created_at) - julianday(e1.created_at)) * 24 * 60 < 10
    `).all() as Array<{ first_time: string; second_time: string; minutes_between: number }>;

    if (sequences.length >= 3) {
      // Pattern detected: frequently creates actions shortly after notes
      const existing = this.learning.getObservation('user', 'pattern.workflow.note_to_action');
      this.learning.recordObservation({
        entityId: 'user',
        key: 'pattern.workflow.note_to_action',
        value: 'true',
        valueType: 'boolean',
        sourceType: 'computed',
        confidence: 0.7,
        supersedes: existing?.id
      });

      debug('Workflow pattern detected', {
        pattern: 'note_to_action',
        occurrences: sequences.length
      });
    }
  }

  /**
   * Analyze garden records to determine importance
   */
  private async analyzeGardenRecordImportance(): Promise<void> {
    const records = this.garden.query().status('active').exec();

    for (const record of records) {
      // Get view count if it exists
      const viewCountObs = this.learning.getObservation(record.id, 'view_count');
      const viewCount = viewCountObs ? parseInt(viewCountObs.value) : 0;

      // Get edit count
      const editHistory = this.learning.getRelationships(record.id, {
        relationType: 'edited',
        direction: 'to'
      });
      const editCount = editHistory.length;

      // Get last viewed time
      const lastViewedObs = this.learning.getObservation(record.id, 'last_viewed');
      const lastViewed = lastViewedObs?.value;
      const daysSinceViewed = lastViewed
        ? (Date.now() - new Date(lastViewed).getTime()) / (1000 * 60 * 60 * 24)
        : 999;

      // Calculate importance score
      let importance: 'high' | 'medium' | 'low' = 'low';
      let confidence = 0.6;

      if (viewCount >= 10 || editCount >= 5) {
        importance = 'high';
        confidence = 0.9;
      } else if (viewCount >= 5 || editCount >= 2) {
        importance = 'medium';
        confidence = 0.8;
      } else if (daysSinceViewed < 7) {
        importance = 'medium';
        confidence = 0.7;
      }

      // Record importance observation
      const existing = this.learning.getObservation(record.id, 'computed.importance');
      this.learning.recordObservation({
        entityId: record.id,
        key: 'computed.importance',
        value: importance,
        sourceType: 'computed',
        confidence,
        supersedes: existing?.id
      });

      // Add insight for high-importance records
      if (importance === 'high') {
        const insightKey = 'ai_insight.importance';
        const existingInsight = this.learning.getObservation(record.id, insightKey);

        this.learning.recordObservation({
          entityId: record.id,
          key: insightKey,
          value: `Frequently accessed (${viewCount} views, ${editCount} edits) - likely active priority`,
          sourceType: 'inferred',
          confidence: 0.85,
          supersedes: existingInsight?.id
        });
      }
    }

    debug('Garden record importance analyzed', { recordCount: records.length });
  }

  /**
   * Consolidate redundant observations to prevent memory bloat.
   * Merges similar observations into high-confidence consolidated observations.
   * Phase 5 enhancement: Memory Consolidation
   */
  private async consolidateMemory(): Promise<void> {
    // Consolidate user observations
    const userConsolidated = this.learning.consolidateObservations('user');

    if (userConsolidated > 0) {
      info('Memory consolidation complete', {
        entity: 'user',
        consolidatedGroups: userConsolidated
      });
    } else {
      debug('No observations to consolidate');
    }

    // Could extend to consolidate session/record observations if needed
  }

  /**
   * Decay activation scores for observations not accessed recently.
   * Prevents old memories from consuming context space.
   * Phase 5 enhancement: Activation Decay
   */
  private async decayActivation(): Promise<void> {
    const decayed = this.learning.decayActivationScores();

    if (decayed > 0) {
      debug('Activation decay complete', { observationsDecayed: decayed });
    }
  }
}
