// src/tools/related.ts
import { Tool } from './types.js';
import * as fmt from '../utils/format.js';

export const showRelated: Tool = {
  name: 'showRelated',
  description: 'Find records related to a given record',

  routing: {
    patterns: [
      /^\/related\s+(.+)/i,
      /^show related to\s+(.+)/i,
      /^what('s| is) related to\s+(.+)/i,
      /^find related\s+(.+)/i,
    ],
    keywords: {
      verbs: ['show', 'find', 'what'],
      nouns: ['related', 'similar', 'connected'],
    },
    priority: 75,
  },

  parseArgs: (input) => {
    const match = input.match(/^(?:\/related|show related to|what(?:'s| is) related to|find related)\s+(.+)/i);
    const recordId = match ? match[1].trim() : input.trim();
    return { recordId };
  },

  execute: async (args, context) => {
    const learning = context.services.learning;
    const garden = context.services.garden;

    if (!learning) {
      return 'Related records require the learning system to be enabled.';
    }

    const { recordId: recordIdOrTitle } = args as { recordId?: string };
    if (!recordIdOrTitle) {
      return 'Please specify a record ID or title. Example: /related authentication-refactor';
    }

    // Try to find the record - could be ID or title
    let recordId: string = recordIdOrTitle;
    let record = garden.get(recordId);

    // If not found by ID, try fuzzy search by title
    if (!record) {
      const allRecords = garden.query().exec();
      const matches = allRecords.filter(r =>
        r.title.toLowerCase().includes(recordIdOrTitle.toLowerCase())
      );

      if (matches.length === 0) {
        return `Record not found: "${recordIdOrTitle}"\n\nTry using the full record ID or a more specific title.`;
      }

      if (matches.length > 1) {
        let response = `Multiple records match "${recordIdOrTitle}":\n\n`;
        for (const match of matches.slice(0, 5)) {
          response += `- **${match.title}** (${match.id})\n`;
        }
        response += '\nPlease use a more specific title or the full record ID.';
        return response;
      }

      record = matches[0];
      recordId = record.id;
    }

    let response = fmt.header(`Related to: ${record.title}`, '🔗');
    let hasRelationships = false;

    // 1. Direct relationships FROM this record (excluding similar_to and discussed_in, handled separately)
    const outgoingRels = learning.getRelationships(recordId, { direction: 'from' })
      .filter(rel => rel.relationType !== 'similar_to' && rel.relationType !== 'discussed_in');
    if (outgoingRels.length > 0) {
      const relsByType = groupByRelationType(outgoingRels);

      for (const [relType, rels] of Object.entries(relsByType)) {
        response += fmt.section(formatRelationType(relType)) + '\n';
        hasRelationships = true;

        for (const rel of rels) {
          const relatedRecord = garden.get(rel.toEntity);
          if (relatedRecord) {
            let relText = `→ ${fmt.bold(relatedRecord.title)}`;
            if (rel.strength !== undefined && rel.strength !== null) {
              relText += ` ${fmt.dim(`(${fmt.percentage(rel.strength)} similar)`)}`;
            }
            response += fmt.bullet(relText, 0, '') + '\n';

            // Show context if available
            if (rel.context) {
              const context = typeof rel.context === 'string' ? JSON.parse(rel.context) : rel.context;
              if (context.reason) {
                response += fmt.indent(fmt.dim(context.reason)) + '\n';
              }
            }
          }
        }
        response += '\n';
      }
    }

    // 2. Direct relationships TO this record (backlinks)
    const incomingRels = learning.getRelationships(recordId, { direction: 'to' });
    if (incomingRels.length > 0) {
      const relsByType = groupByRelationType(incomingRels);

      for (const [relType, rels] of Object.entries(relsByType)) {
        response += fmt.section(`Referenced By (${formatRelationType(relType)})`) + '\n';
        hasRelationships = true;

        for (const rel of rels) {
          const relatedRecord = garden.get(rel.fromEntity);
          if (relatedRecord) {
            response += fmt.bullet(`← ${fmt.bold(relatedRecord.title)}`, 0, '') + '\n';
          }
        }
        response += '\n';
      }
    }

    // 3. Semantic similarity (embedding-based)
    const semanticRels = learning.getRelationships(recordId, {
      relationType: 'similar_to',
      direction: 'from'
    });

    if (semanticRels.length > 0) {
      response += fmt.section('Semantically Similar') + '\n';
      hasRelationships = true;

      // Sort by strength (similarity score)
      const sorted = semanticRels.sort((a, b) => (b.strength || 0) - (a.strength || 0));

      for (const rel of sorted.slice(0, 5)) {
        const relatedRecord = garden.get(rel.toEntity);
        if (relatedRecord) {
          const similarity = rel.strength ? fmt.percentage(rel.strength) : '?';
          response += fmt.bullet(`≈ ${fmt.bold(relatedRecord.title)} ${fmt.dim(`(${similarity} similar)`)}`, 0, '') + '\n';
        }
      }
      response += '\n';
    }

    // 4. Sessions where this was discussed
    const discussedInSessions = learning.getRelationships(recordId, {
      relationType: 'discussed_in',
      direction: 'from'
    });

    if (discussedInSessions.length > 0) {
      response += fmt.section('Discussed In Sessions') + '\n';
      hasRelationships = true;

      for (const rel of discussedInSessions.slice(0, 3)) {
        const session = learning.getEntity(rel.toEntity);
        if (session) {
          const sessionDate = new Date(session.createdAt);
          response += fmt.bullet(`💬 ${formatRelativeDate(sessionDate)}`, 0, '') + '\n';

          // Get session summary if available
          const summary = learning.getObservation(rel.toEntity, 'summary');
          if (summary) {
            response += fmt.indent(fmt.dim(summary.value)) + '\n';
          }
        }
      }
      response += '\n';
    }

    if (!hasRelationships) {
      return fmt.header(`Related to: ${record.title}`, '🔗') +
             fmt.info('No relationships found yet. As you work with this record and link it to other records, relationships will appear here.');
    }

    return response;
  },
};

function groupByRelationType(rels: any[]): Record<string, any[]> {
  const grouped: Record<string, any[]> = {};
  for (const rel of rels) {
    if (!grouped[rel.relationType]) {
      grouped[rel.relationType] = [];
    }
    grouped[rel.relationType].push(rel);
  }
  return grouped;
}

function formatRelationType(relType: string): string {
  // Convert snake_case to Title Case
  return relType
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

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

export const relatedTools: Tool[] = [showRelated];
