// src/services/learning.test.ts
// Tests for unified learning system

import assert from 'assert';
import Database from 'better-sqlite3';
import { LearningService } from './learning.js';

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  return db;
}

function test(name: string, fn: () => void | Promise<void>): void {
  try {
    const result = fn();
    if (result instanceof Promise) {
      result
        .then(() => console.log(`✓ ${name}`))
        .catch(err => {
          console.error(`✗ ${name}`);
          console.error(err);
          process.exit(1);
        });
    } else {
      console.log(`✓ ${name}`);
    }
  } catch (err) {
    console.error(`✗ ${name}`);
    console.error(err);
    process.exit(1);
  }
}

// ============================================================================
// Entity Tests
// ============================================================================

test('Schema initializes successfully', () => {
  const db = createTestDb();
  const learning = new LearningService(db);

  // Check that tables exist
  const tables = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type='table'
    AND name IN ('entities', 'observations', 'relationships')
  `).all() as any[];

  assert.strictEqual(tables.length, 3, 'All tables should be created');
  db.close();
});

test('User entity is automatically created', () => {
  const db = createTestDb();
  const learning = new LearningService(db);

  const entity = learning.getEntity('user');
  assert.ok(entity, 'User entity should exist');
  assert.strictEqual(entity.type, 'user');
  db.close();
});

test('Can create and retrieve entities', () => {
  const db = createTestDb();
  const learning = new LearningService(db);

  const sessionId = learning.createEntity('session', { messageCount: 5 });
  assert.ok(sessionId, 'Should return entity ID');

  const entity = learning.getEntity(sessionId);
  assert.ok(entity, 'Should retrieve created entity');
  assert.strictEqual(entity.type, 'session');
  assert.strictEqual(entity.data.messageCount, 5);

  db.close();
});

test('Entity exists check works', () => {
  const db = createTestDb();
  const learning = new LearningService(db);

  assert.ok(learning.entityExists('user'), 'User should exist');
  assert.ok(!learning.entityExists('nonexistent'), 'Nonexistent should not exist');

  db.close();
});

// ============================================================================
// Observation Tests
// ============================================================================

test('Can record and retrieve observations', () => {
  const db = createTestDb();
  const learning = new LearningService(db);

  const obsId = learning.recordObservation({
    entityId: 'user',
    key: 'preference.code_style',
    value: 'tabs',
    sourceType: 'stated',
    confidence: 1.0
  });

  assert.ok(obsId, 'Should return observation ID');

  const obs = learning.getObservation('user', 'preference.code_style');
  assert.ok(obs, 'Should retrieve observation');
  assert.strictEqual(obs.value, 'tabs');
  assert.strictEqual(obs.confidence, 1.0);
  assert.strictEqual(obs.sourceType, 'stated');

  db.close();
});

test('Can get all observations for an entity', () => {
  const db = createTestDb();
  const learning = new LearningService(db);

  learning.recordObservation({
    entityId: 'user',
    key: 'preference.code_style',
    value: 'tabs',
    sourceType: 'stated',
    confidence: 1.0
  });

  learning.recordObservation({
    entityId: 'user',
    key: 'preference.verbosity',
    value: 'concise',
    sourceType: 'inferred',
    confidence: 0.8
  });

  const observations = learning.getObservations('user');
  assert.strictEqual(observations.length, 2, 'Should have 2 observations');

  db.close();
});

test('Can filter observations by key prefix', () => {
  const db = createTestDb();
  const learning = new LearningService(db);

  learning.recordObservation({
    entityId: 'user',
    key: 'preference.code_style',
    value: 'tabs',
    sourceType: 'stated',
    confidence: 1.0
  });

  learning.recordObservation({
    entityId: 'user',
    key: 'pattern.work_hours',
    value: '9-5',
    sourceType: 'inferred',
    confidence: 0.7
  });

  const prefs = learning.getObservations('user', { keyPrefix: 'preference.' });
  assert.strictEqual(prefs.length, 1, 'Should only get preferences');
  assert.ok(prefs[0].key.startsWith('preference.'));

  const patterns = learning.getObservations('user', { keyPrefix: 'pattern.' });
  assert.strictEqual(patterns.length, 1, 'Should only get patterns');
  assert.ok(patterns[0].key.startsWith('pattern.'));

  db.close();
});

test('Can filter observations by confidence', () => {
  const db = createTestDb();
  const learning = new LearningService(db);

  learning.recordObservation({
    entityId: 'user',
    key: 'fact1',
    value: 'high confidence',
    sourceType: 'stated',
    confidence: 1.0
  });

  learning.recordObservation({
    entityId: 'user',
    key: 'fact2',
    value: 'low confidence',
    sourceType: 'inferred',
    confidence: 0.3
  });

  const highConfidence = learning.getObservations('user', { minConfidence: 0.7 });
  assert.strictEqual(highConfidence.length, 1, 'Should only get high confidence observations');
  assert.strictEqual(highConfidence[0].confidence, 1.0);

  db.close();
});

test('Observations can expire (TTL)', () => {
  const db = createTestDb();
  const learning = new LearningService(db);

  // Use SQLite's datetime format
  const past = db.prepare("SELECT datetime('now', '-1 hour') as dt").get() as any;

  learning.recordObservation({
    entityId: 'user',
    key: 'temp_fact',
    value: 'expired',
    sourceType: 'computed',
    confidence: 1.0,
    expiresAt: past.dt
  });

  learning.recordObservation({
    entityId: 'user',
    key: 'permanent_fact',
    value: 'active',
    sourceType: 'stated',
    confidence: 1.0
  });

  const active = learning.getObservations('user', { notExpired: true });
  assert.strictEqual(active.length, 1, 'Should only get non-expired observations');
  assert.strictEqual(active[0].key, 'permanent_fact');

  db.close();
});

test('Can track observation history (supersedes chain)', () => {
  const db = createTestDb();
  const learning = new LearningService(db);

  const obs1 = learning.recordObservation({
    entityId: 'user',
    key: 'preference.theme',
    value: 'light',
    sourceType: 'stated',
    confidence: 1.0
  });

  const obs2 = learning.recordObservation({
    entityId: 'user',
    key: 'preference.theme',
    value: 'dark',
    sourceType: 'stated',
    confidence: 1.0,
    supersedes: obs1
  });

  const history = learning.getObservationHistory('user', 'preference.theme');
  assert.strictEqual(history.length, 2, 'Should have 2 historical observations');
  assert.strictEqual(history[0].value, 'dark', 'Latest should be dark');
  assert.strictEqual(history[1].value, 'light', 'Previous should be light');

  db.close();
});

test('Full-text search works across observations', () => {
  const db = createTestDb();
  const learning = new LearningService(db);

  const sessionId = learning.createEntity('session');

  learning.recordObservation({
    entityId: sessionId,
    key: 'summary',
    value: 'Implemented command history API with comprehensive testing',
    sourceType: 'extracted',
    confidence: 0.95
  });

  learning.recordObservation({
    entityId: sessionId,
    key: 'topic',
    value: 'memory architecture',
    sourceType: 'extracted',
    confidence: 0.9
  });

  const results = learning.searchObservations('command history');
  assert.ok(results.length > 0, 'Should find results for "command history"');
  assert.ok(results[0].value.includes('command history'));

  db.close();
});

test('Can clean expired observations', () => {
  const db = createTestDb();
  const learning = new LearningService(db);

  // Use SQLite's datetime format
  const past = db.prepare("SELECT datetime('now', '-1 hour') as dt").get() as any;

  learning.recordObservation({
    entityId: 'user',
    key: 'expired1',
    value: 'old',
    sourceType: 'computed',
    confidence: 1.0,
    expiresAt: past.dt
  });

  learning.recordObservation({
    entityId: 'user',
    key: 'expired2',
    value: 'old',
    sourceType: 'computed',
    confidence: 1.0,
    expiresAt: past.dt
  });

  const cleaned = learning.cleanExpiredObservations();
  assert.strictEqual(cleaned, 2, 'Should clean 2 expired observations');

  const remaining = learning.getObservations('user');
  assert.strictEqual(remaining.length, 0, 'Should have no remaining observations');

  db.close();
});

// ============================================================================
// Relationship Tests
// ============================================================================

test('Can record and retrieve relationships', () => {
  const db = createTestDb();
  const learning = new LearningService(db);

  const sessionId = learning.createEntity('session');
  const recordId = learning.createEntity('record');

  const relId = learning.recordRelationship({
    fromEntity: 'user',
    toEntity: sessionId,
    relationType: 'participated_in'
  });

  assert.ok(relId, 'Should return relationship ID');

  const rels = learning.getRelationships('user', { direction: 'from' });
  assert.strictEqual(rels.length, 1, 'Should have 1 relationship');
  assert.strictEqual(rels[0].relationType, 'participated_in');
  assert.strictEqual(rels[0].toEntity, sessionId);

  db.close();
});

test('Can filter relationships by direction', () => {
  const db = createTestDb();
  const learning = new LearningService(db);

  const sessionId = learning.createEntity('session');
  const recordId = learning.createEntity('record');

  learning.recordRelationship({
    fromEntity: 'user',
    toEntity: sessionId,
    relationType: 'participated_in'
  });

  learning.recordRelationship({
    fromEntity: recordId,
    toEntity: 'user',
    relationType: 'created_by'
  });

  const outgoing = learning.getRelationships('user', { direction: 'from' });
  assert.strictEqual(outgoing.length, 1, 'Should have 1 outgoing relationship');

  const incoming = learning.getRelationships('user', { direction: 'to' });
  assert.strictEqual(incoming.length, 1, 'Should have 1 incoming relationship');

  const both = learning.getRelationships('user', { direction: 'both' });
  assert.strictEqual(both.length, 2, 'Should have 2 total relationships');

  db.close();
});

test('Can filter relationships by type', () => {
  const db = createTestDb();
  const learning = new LearningService(db);

  const sessionId = learning.createEntity('session');
  const recordId = learning.createEntity('record');

  learning.recordRelationship({
    fromEntity: 'user',
    toEntity: sessionId,
    relationType: 'participated_in'
  });

  learning.recordRelationship({
    fromEntity: 'user',
    toEntity: recordId,
    relationType: 'created'
  });

  const created = learning.getRelationships('user', {
    direction: 'from',
    relationType: 'created'
  });

  assert.strictEqual(created.length, 1, 'Should only get "created" relationships');
  assert.strictEqual(created[0].relationType, 'created');

  db.close();
});

test('Relationships can have strength and context', () => {
  const db = createTestDb();
  const learning = new LearningService(db);

  const record1 = learning.createEntity('record');
  const record2 = learning.createEntity('record');

  learning.recordRelationship({
    fromEntity: record1,
    toEntity: record2,
    relationType: 'semantically_related',
    strength: 0.85,
    context: { reason: 'Both about authentication' }
  });

  const rels = learning.getRelationships(record1, {
    direction: 'from',
    minStrength: 0.8
  });

  assert.strictEqual(rels.length, 1, 'Should find high-strength relationship');
  assert.strictEqual(rels[0].strength, 0.85);
  assert.strictEqual(rels[0].context.reason, 'Both about authentication');

  db.close();
});

// ============================================================================
// High-Level Query Tests
// ============================================================================

test('Can get user profile', () => {
  const db = createTestDb();
  const learning = new LearningService(db);

  learning.recordObservation({
    entityId: 'user',
    key: 'preference.code_style',
    value: 'tabs',
    sourceType: 'stated',
    confidence: 1.0
  });

  learning.recordObservation({
    entityId: 'user',
    key: 'pattern.work_hours',
    value: '{"start": "09:00", "end": "17:00"}',
    valueType: 'json',
    sourceType: 'inferred',
    confidence: 0.7
  });

  learning.recordObservation({
    entityId: 'user',
    key: 'context.primary_project',
    value: 'bartleby',
    sourceType: 'computed',
    confidence: 0.9
  });

  learning.recordObservation({
    entityId: 'user',
    key: 'goal.current',
    value: 'Implement unified learning system',
    sourceType: 'stated',
    confidence: 1.0
  });

  const profile = learning.getUserProfile();

  assert.strictEqual(profile.preferences.code_style, 'tabs');
  assert.deepStrictEqual(profile.patterns.work_hours, { start: '09:00', end: '17:00' });
  assert.strictEqual(profile.context.primary_project, 'bartleby');
  assert.strictEqual(profile.goals.length, 1);
  assert.strictEqual(profile.goals[0], 'Implement unified learning system');

  db.close();
});

test('Can get session summary', () => {
  const db = createTestDb();
  const learning = new LearningService(db);

  const sessionId = learning.createEntity('session');

  learning.recordObservation({
    entityId: sessionId,
    key: 'summary',
    value: 'Implemented command history API',
    sourceType: 'extracted',
    confidence: 0.95
  });

  learning.recordObservation({
    entityId: sessionId,
    key: 'topic',
    value: 'API design',
    sourceType: 'extracted',
    confidence: 0.9
  });

  learning.recordObservation({
    entityId: sessionId,
    key: 'topic',
    value: 'testing',
    sourceType: 'extracted',
    confidence: 0.85
  });

  learning.recordObservation({
    entityId: sessionId,
    key: 'decision',
    value: 'Use SQLite for persistence',
    sourceType: 'extracted',
    confidence: 1.0
  });

  learning.recordObservation({
    entityId: sessionId,
    key: 'unresolved_question',
    value: 'Should we add vector embeddings?',
    sourceType: 'extracted',
    confidence: 0.8
  });

  learning.recordObservation({
    entityId: sessionId,
    key: 'artifact.created',
    value: 'command-parser.ts',
    sourceType: 'computed',
    confidence: 1.0
  });

  const summary = learning.getSessionSummary(sessionId);

  assert.ok(summary, 'Should return session summary');
  assert.strictEqual(summary.summary, 'Implemented command history API');
  assert.strictEqual(summary.topics.length, 2);
  assert.ok(summary.topics.includes('API design'));
  assert.ok(summary.topics.includes('testing'));
  assert.strictEqual(summary.decisions.length, 1);
  assert.strictEqual(summary.unresolved.length, 1);
  assert.strictEqual(summary.artifacts.length, 1);

  db.close();
});

test('Can get complete entity view', () => {
  const db = createTestDb();
  const learning = new LearningService(db);

  const recordId = learning.createEntity('record', { title: 'Test Note' });

  learning.recordObservation({
    entityId: recordId,
    key: 'view_count',
    value: '15',
    valueType: 'number',
    sourceType: 'computed',
    confidence: 1.0
  });

  learning.recordRelationship({
    fromEntity: 'user',
    toEntity: recordId,
    relationType: 'created'
  });

  const complete = learning.getEntityComplete(recordId);

  assert.ok(complete.entity, 'Should have entity');
  assert.strictEqual(complete.entity.data.title, 'Test Note');
  assert.strictEqual(complete.observations.length, 1);
  assert.strictEqual(complete.relationships.length, 1);

  db.close();
});

// ============================================================================
// Run Tests
// ============================================================================

console.log('\n=================================');
console.log('Running LearningService Tests');
console.log('=================================\n');

// Wait a tick to ensure all tests complete
setTimeout(() => {
  console.log('\n=================================');
  console.log('All tests passed! ✓');
  console.log('=================================\n');
}, 100);
