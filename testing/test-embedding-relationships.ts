// Test script for embedding-based relationship discovery
import { loadConfig } from './src/config.js';
import { GardenService } from './src/services/garden.js';
import { EmbeddingService } from './src/services/embeddings.js';
import { LearningService } from './src/services/learning.js';
import { EmbeddingRelationships } from './src/services/embedding-relationships.js';
import { info } from './src/utils/logger.js';

async function testEmbeddingRelationships() {
  info('=== Testing Embedding Relationships ===');

  const config = loadConfig();

  // Initialize services
  const garden = new GardenService(config);
  const embeddings = new EmbeddingService(config);

  await garden.initialize();
  await embeddings.initialize();

  const learning = new LearningService(garden.getDatabase());
  const embeddingRelationships = new EmbeddingRelationships(learning, garden, embeddings);

  // Check if embeddings are available
  if (!embeddings.isAvailable()) {
    info('⚠️  Embedding service not available - test requires local embeddings');
    info('Configure EMBEDDING_API_URL or use a remote provider');
    return;
  }

  info('✓ Embedding service available');

  // Create test notes if needed
  const existingNotes = garden.query().type('note').exec();
  if (existingNotes.length < 3) {
    info('Creating test notes for semantic analysis...');

    garden.create({
      type: 'note',
      status: 'active',
      title: 'TypeScript Tips',
      content: 'TypeScript is a typed superset of JavaScript that compiles to plain JavaScript. It provides static typing, interfaces, and better IDE support.',
      tags: ['programming', 'typescript']
    });

    garden.create({
      type: 'note',
      status: 'active',
      title: 'JavaScript Best Practices',
      content: 'Modern JavaScript development involves ES6+ features, async/await patterns, and understanding the event loop. Type safety can be added with TypeScript.',
      tags: ['programming', 'javascript']
    });

    garden.create({
      type: 'note',
      status: 'active',
      title: 'Gardening in Spring',
      content: 'Spring is the perfect time to plant tomatoes, peppers, and herbs. Prepare soil with compost and ensure proper drainage.',
      tags: ['gardening', 'spring']
    });

    info('✓ Test notes created');
  }

  // Discover relationships
  info('Running semantic relationship discovery...');
  const relationshipsCreated = await embeddingRelationships.discoverRelationships(0.7);
  info(`✓ Discovery complete: ${relationshipsCreated} relationships created`);

  // Query relationships for each note
  const notes = garden.query().type('note').status('active').exec();
  info(`\n--- Semantic Relationships ---`);

  for (const note of notes.slice(0, 3)) {
    const similar = await embeddingRelationships.findSimilar(note.id, 3);

    info(`\n"${note.title}"`);
    if (similar.length === 0) {
      info('  No similar notes found (similarity threshold not met)');
    } else {
      for (const sim of similar) {
        info(`  → "${sim.title}" (similarity: ${sim.similarity.toFixed(3)})`);
      }
    }
  }

  // Test refresh for a single record
  if (notes.length > 0) {
    info(`\n--- Testing Refresh for Single Record ---`);
    const testNote = notes[0];
    const refreshed = await embeddingRelationships.refreshRecordRelationships(testNote.id, 0.65);
    info(`✓ Refreshed relationships for "${testNote.title}": ${refreshed} new relationships`);
  }

  // Verify relationships are stored in learning system
  const allRelationships = learning.getRelationships(notes[0]?.id || '', {
    direction: 'from',
    relationType: 'semantically_related'
  });
  info(`\n--- Learning System Integration ---`);
  info(`✓ ${allRelationships.length} semantic relationships stored in learning system`);

  garden.close();
  embeddings.close();
  learning.close();

  info('\n✓ Test complete');
}

testEmbeddingRelationships().catch(console.error);
