// src/services/embedding-relationships.ts
// Discover semantic relationships between garden records using vector embeddings

import { LearningService } from './learning.js';
import { GardenService } from './garden.js';
import { EmbeddingService } from './embeddings.js';
import { info, debug, warn } from '../utils/logger.js';

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have same length');
  }

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    magnitudeA += a[i] * a[i];
    magnitudeB += b[i] * b[i];
  }

  magnitudeA = Math.sqrt(magnitudeA);
  magnitudeB = Math.sqrt(magnitudeB);

  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }

  return dotProduct / (magnitudeA * magnitudeB);
}

export class EmbeddingRelationships {
  constructor(
    private learning: LearningService,
    private garden: GardenService,
    private embeddings: EmbeddingService
  ) {}

  /**
   * Discover semantic relationships between all garden records
   * Uses vector embeddings to find similar notes/projects
   */
  async discoverRelationships(minSimilarity: number = 0.7): Promise<number> {
    if (!this.embeddings.isAvailable()) {
      warn('Embedding service unavailable, skipping relationship discovery');
      return 0;
    }

    info('Starting embedding-based relationship discovery', { minSimilarity });

    // Get all active notes and projects
    const records = this.garden.query()
      .status('active')
      .exec()
      .filter(r => r.type === 'note' || r.type === 'project');

    if (records.length < 2) {
      debug('Not enough records to discover relationships', { count: records.length });
      return 0;
    }

    // Generate embeddings for each record
    const embeddings: Array<{ id: string; embedding: number[]; title: string }> = [];

    for (const record of records) {
      try {
        // Embed title + first 200 chars of content for context
        const text = record.title + (record.content ? ' ' + record.content.slice(0, 200) : '');
        const embedding = await this.embeddings.embed(text);

        if (embedding && embedding.length > 0) {
          embeddings.push({
            id: record.id,
            embedding,
            title: record.title
          });
        }
      } catch (err) {
        warn('Failed to embed record', { id: record.id, error: String(err) });
      }
    }

    debug('Generated embeddings', { count: embeddings.length });

    // Find similar pairs
    let relationshipsCreated = 0;

    for (let i = 0; i < embeddings.length; i++) {
      for (let j = i + 1; j < embeddings.length; j++) {
        const similarity = cosineSimilarity(embeddings[i].embedding, embeddings[j].embedding);

        if (similarity >= minSimilarity) {
          // Check if relationship already exists
          const existing = this.learning.getRelationships(embeddings[i].id, {
            direction: 'from',
            relationType: 'semantically_related'
          });

          const alreadyExists = existing.some(rel => rel.toEntity === embeddings[j].id);

          if (!alreadyExists) {
            // Create bidirectional relationships
            this.learning.recordRelationship({
              fromEntity: embeddings[i].id,
              toEntity: embeddings[j].id,
              relationType: 'semantically_related',
              strength: similarity,
              context: {
                reason: 'Content similarity detected via embeddings',
                similarity: similarity.toFixed(3)
              },
              sourceId: 'embedding_analysis'
            });

            this.learning.recordRelationship({
              fromEntity: embeddings[j].id,
              toEntity: embeddings[i].id,
              relationType: 'semantically_related',
              strength: similarity,
              context: {
                reason: 'Content similarity detected via embeddings',
                similarity: similarity.toFixed(3)
              },
              sourceId: 'embedding_analysis'
            });

            relationshipsCreated += 2;

            debug('Created semantic relationship', {
              from: embeddings[i].title.slice(0, 30),
              to: embeddings[j].title.slice(0, 30),
              similarity: similarity.toFixed(3)
            });
          }
        }
      }
    }

    info('Embedding relationship discovery complete', {
      recordsProcessed: embeddings.length,
      relationshipsCreated
    });

    return relationshipsCreated;
  }

  /**
   * Find records semantically similar to a given record
   */
  async findSimilar(recordId: string, limit: number = 5): Promise<Array<{
    id: string;
    title: string;
    similarity: number;
  }>> {
    // Get existing relationships
    const relationships = this.learning.getRelationships(recordId, {
      direction: 'from',
      relationType: 'semantically_related'
    });

    // Sort by strength and get details
    const results: Array<{ id: string; title: string; similarity: number }> = [];

    for (const rel of relationships.sort((a, b) => (b.strength || 0) - (a.strength || 0)).slice(0, limit)) {
      const record = this.garden.get(rel.toEntity);
      if (record) {
        results.push({
          id: record.id,
          title: record.title,
          similarity: rel.strength || 0
        });
      }
    }

    return results;
  }

  /**
   * Refresh relationships for a specific record
   * Useful when a record is updated
   */
  async refreshRecordRelationships(recordId: string, minSimilarity: number = 0.7): Promise<number> {
    if (!this.embeddings.isAvailable()) {
      return 0;
    }

    const record = this.garden.get(recordId);
    if (!record) {
      return 0;
    }

    // Get embedding for this record
    const text = record.title + (record.content ? ' ' + record.content.slice(0, 200) : '');
    const embedding = await this.embeddings.embed(text);

    if (!embedding || embedding.length === 0) {
      return 0;
    }

    // Remove old semantic relationships
    const oldRelationships = this.learning.getRelationships(recordId, {
      direction: 'from',
      relationType: 'semantically_related'
    });

    // Note: We don't actually delete relationships in the current implementation
    // They'll be superseded by new ones with higher timestamps

    // Compare against all other records
    const otherRecords = this.garden.query()
      .status('active')
      .exec()
      .filter(r => r.id !== recordId && (r.type === 'note' || r.type === 'project'));

    let created = 0;

    for (const other of otherRecords) {
      try {
        const otherText = other.title + (other.content ? ' ' + other.content.slice(0, 200) : '');
        const otherEmbedding = await this.embeddings.embed(otherText);

        if (otherEmbedding && otherEmbedding.length > 0) {
          const similarity = cosineSimilarity(embedding, otherEmbedding);

          if (similarity >= minSimilarity) {
            // Create relationship
            this.learning.recordRelationship({
              fromEntity: recordId,
              toEntity: other.id,
              relationType: 'semantically_related',
              strength: similarity,
              context: {
                reason: 'Content similarity detected via embeddings',
                similarity: similarity.toFixed(3)
              },
              sourceId: 'embedding_analysis'
            });

            created++;
          }
        }
      } catch (err) {
        warn('Failed to compare with record', { otherId: other.id, error: String(err) });
      }
    }

    debug('Refreshed relationships for record', { recordId, created });
    return created;
  }
}
