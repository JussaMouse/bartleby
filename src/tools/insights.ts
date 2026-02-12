// src/tools/insights.ts
import { Tool } from './types.js';

export const showInsights: Tool = {
  name: 'showInsights',
  description: 'Show AI insights about your garden and work',

  routing: {
    patterns: [
      /^\/insights$/i,
      /^show insights/i,
      /^what('s| is) important/i,
    ],
    keywords: {
      verbs: ['show', 'what'],
      nouns: ['insights', 'important', 'attention'],
    },
    priority: 75,
  },

  execute: async (args, context) => {
    const learning = context.services.learning;
    const garden = context.services.garden;

    if (!learning) {
      return 'Insights require the learning system to be enabled.';
    }

    let response = '## 🔍 Insights\n\n';
    let hasInsights = false;

    // 1. High-importance records with AI insights
    const importantRecords = learning.queryObservationsByKey('computed.importance', {
      notExpired: true,
      minConfidence: 0.7,
    });

    const highImportance = importantRecords.filter(obs => obs.value === 'high');
    if (highImportance.length > 0) {
      response += '### High-Priority Records\n\n';
      hasInsights = true;

      for (const obs of highImportance.slice(0, 5)) {
        // Get the record
        const record = garden.get(obs.entityId);
        if (!record) continue;

        response += `📌 **${record.title}**\n`;

        // Get AI insight for this record
        const insight = learning.getObservation(obs.entityId, 'ai_insight.importance');
        if (insight) {
          response += `   ${insight.value}\n`;
        }

        // Get next action suggestion if any
        const nextAction = learning.getObservation(obs.entityId, 'ai_insight.next_action');
        if (nextAction) {
          response += `   💡 ${nextAction.value}\n`;
        }

        response += '\n';
      }
    }

    // 2. Semantic relationships discovered
    const semanticRels = learning.getRelationships('user', {
      relationType: 'discovered_pattern',
    });

    if (semanticRels.length > 0) {
      response += '### Discovered Patterns\n\n';
      hasInsights = true;

      for (const rel of semanticRels.slice(0, 3)) {
        const context = typeof rel.context === 'string' ? JSON.parse(rel.context) : (rel.context || {});
        response += `🔗 ${context.description || 'Pattern detected'}\n`;
        if (rel.strength) {
          response += `   Confidence: ${(rel.strength * 100).toFixed(0)}%\n`;
        }
        response += '\n';
      }
    }

    // 3. Unresolved questions from past sessions
    const unresolvedQuestions = learning.queryObservationsByKey('unresolved_question', {
      notExpired: true,
      limit: 5,
    });

    if (unresolvedQuestions.length > 0) {
      response += '### Unresolved from Past Sessions\n\n';
      hasInsights = true;

      for (const obs of unresolvedQuestions) {
        // Get the session this came from
        const sessionEntity = learning.getEntity(obs.entityId);
        if (!sessionEntity) continue;

        const sessionData = sessionEntity.data || {};
        const sessionDate = new Date(sessionEntity.createdAt);
        const relativeDate = formatRelativeDate(sessionDate);

        response += `❓ ${obs.value}\n`;
        response += `   From ${relativeDate}\n\n`;
      }
    }

    // 4. Records that need attention
    const db = learning['db'];
    const staleRecords = db.prepare(`
      SELECT DISTINCT o.entity_id
      FROM observations o
      WHERE o.key = 'last_viewed'
      AND datetime(o.value) < datetime('now', '-30 days')
      AND EXISTS (
        SELECT 1 FROM observations o2
        WHERE o2.entity_id = o.entity_id
        AND o2.key = 'computed.importance'
        AND o2.value IN ('high', 'medium')
      )
      LIMIT 5
    `).all() as Array<{ entity_id: string }>;

    if (staleRecords.length > 0) {
      response += '### May Need Attention\n\n';
      response += '*Important records you haven\'t viewed recently:*\n\n';
      hasInsights = true;

      for (const row of staleRecords) {
        const record = garden.get(row.entity_id);
        if (!record) continue;

        const lastViewed = learning.getObservation(row.entity_id, 'last_viewed');
        if (lastViewed) {
          const lastDate = new Date(lastViewed.value);
          const relativeDate = formatRelativeDate(lastDate);
          response += `⏰ **${record.title}** (last viewed ${relativeDate})\n`;
        }
      }
      response += '\n';
    }

    // 5. Current work context
    const primaryProject = learning.getObservation('user', 'context.primary_project');
    if (primaryProject) {
      response += '### Current Focus\n\n';
      response += `🎯 **Primary project**: ${primaryProject.value}\n\n`;
      hasInsights = true;
    }

    if (!hasInsights) {
      return "I don't have enough insights yet. As you use Bartleby more, I'll learn patterns and surface relevant information here.";
    }

    return response;
  },
};

function formatRelativeDate(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`;
  if (seconds < 2592000) return `${Math.floor(seconds / 604800)} weeks ago`;
  if (seconds < 31536000) return `${Math.floor(seconds / 2592000)} months ago`;

  return date.toLocaleDateString();
}

export const insightsTools: Tool[] = [showInsights];
