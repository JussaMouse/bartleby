#!/usr/bin/env node
// Data Migration Script: JSON Memory → Unified Learning System
// Migrates episodes.json and profile.json to the learning system

import fs from 'fs';
import path from 'path';
import { loadConfig } from '../src/config.js';
import { GardenService } from '../src/services/garden.js';
import { LearningService } from '../src/services/learning.js';
import { info, warn } from '../src/utils/logger.js';

interface Episode {
  id: string;
  timestamp: string;
  summary: string;
  topics: string[];
  actionsTaken: string[];
  pendingFollowups: string[];
  messageCount: number;
}

interface UserFact {
  category: string;
  key: string;
  value: unknown;
  confidence: number;
  lastUpdated: string;
  source: 'explicit' | 'inferred';
}

async function migrateMemoryToLearning() {
  info('\n=== Memory Migration: JSON → Unified Learning System ===\n');

  const config = loadConfig();
  const memoryPath = path.join(config.paths.database, 'memory');

  // Check if memory directory exists
  if (!fs.existsSync(memoryPath)) {
    info('No memory directory found - nothing to migrate');
    return;
  }

  // Initialize services
  const garden = new GardenService(config);
  await garden.initialize();

  const learning = new LearningService(garden.getDatabase());
  garden.setLearningService(learning);

  let episodesMigrated = 0;
  let factsMigrated = 0;

  // === Migrate Episodes ===
  const episodesFile = path.join(memoryPath, 'episodes.json');
  if (fs.existsSync(episodesFile)) {
    info('1. Migrating episodes from episodes.json...');

    try {
      const episodes: Episode[] = JSON.parse(fs.readFileSync(episodesFile, 'utf-8'));

      for (const episode of episodes) {
        // Check if session already exists
        const existing = learning.getEntity(episode.id);
        if (existing) {
          info(`  - Skipping episode ${episode.id} (already exists)`);
          continue;
        }

        // Create session entity
        learning.createEntity('session', {
          startTime: episode.timestamp,
          messageCount: episode.messageCount
        }, episode.id);

        // Record summary
        if (episode.summary) {
          learning.recordObservation({
            entityId: episode.id,
            key: 'summary',
            value: episode.summary,
            sourceType: 'extracted',
            sourceId: 'migration',
            confidence: 0.9
          });
        }

        // Record topics
        for (const topic of episode.topics) {
          learning.recordObservation({
            entityId: episode.id,
            key: 'topic',
            value: topic,
            sourceType: 'extracted',
            sourceId: 'migration',
            confidence: 0.9
          });
        }

        // Record actions
        for (const action of episode.actionsTaken) {
          learning.recordObservation({
            entityId: episode.id,
            key: 'action',
            value: action,
            sourceType: 'extracted',
            sourceId: 'migration',
            confidence: 0.9
          });
        }

        // Record unresolved questions
        for (const followup of episode.pendingFollowups) {
          learning.recordObservation({
            entityId: episode.id,
            key: 'unresolved_question',
            value: followup,
            sourceType: 'extracted',
            sourceId: 'migration',
            confidence: 0.9
          });
        }

        episodesMigrated++;
      }

      info(`  ✓ Migrated ${episodesMigrated} episodes\n`);

      // Backup original file
      const backupPath = episodesFile + '.backup';
      fs.copyFileSync(episodesFile, backupPath);
      info(`  ✓ Backup created: ${backupPath}\n`);

    } catch (err) {
      warn('Failed to migrate episodes', { error: String(err) });
    }
  } else {
    info('1. No episodes.json found - skipping episode migration\n');
  }

  // === Migrate User Profile (Facts) ===
  const profileFile = path.join(memoryPath, 'profile.json');
  if (fs.existsSync(profileFile)) {
    info('2. Migrating user profile from profile.json...');

    try {
      const profileData = JSON.parse(fs.readFileSync(profileFile, 'utf-8'));

      // Ensure user entity exists
      if (!learning.entityExists('user')) {
        learning.createEntity('user', {});
      }

      // Migrate each fact
      for (const [fullKey, fact] of Object.entries(profileData)) {
        const userFact = fact as UserFact;

        // Map category to observation key prefix
        const keyPrefix = userFact.category;
        const observationKey = `${keyPrefix}.${userFact.key}`;

        // Check if already exists
        const existing = learning.getObservation('user', observationKey);
        if (existing) {
          info(`  - Skipping ${observationKey} (already exists)`);
          continue;
        }

        // Record observation
        learning.recordObservation({
          entityId: 'user',
          key: observationKey,
          value: JSON.stringify(userFact.value),
          valueType: 'json',
          sourceType: userFact.source === 'explicit' ? 'stated' : 'inferred',
          sourceId: 'migration',
          confidence: userFact.confidence
        });

        factsMigrated++;
      }

      info(`  ✓ Migrated ${factsMigrated} user facts\n`);

      // Backup original file
      const backupPath = profileFile + '.backup';
      fs.copyFileSync(profileFile, backupPath);
      info(`  ✓ Backup created: ${backupPath}\n`);

    } catch (err) {
      warn('Failed to migrate user profile', { error: String(err) });
    }
  } else {
    info('2. No profile.json found - skipping profile migration\n');
  }

  // === Migration Summary ===
  info('=== Migration Summary ===\n');
  info(`Episodes migrated: ${episodesMigrated}`);
  info(`User facts migrated: ${factsMigrated}`);
  info('\nBackup files created:');
  if (fs.existsSync(episodesFile + '.backup')) {
    info(`  - ${episodesFile}.backup`);
  }
  if (fs.existsSync(profileFile + '.backup')) {
    info(`  - ${profileFile}.backup`);
  }

  info('\nYou can now safely delete the original JSON files:');
  if (fs.existsSync(episodesFile)) {
    info(`  rm ${episodesFile}`);
  }
  if (fs.existsSync(profileFile)) {
    info(`  rm ${profileFile}`);
  }

  info('\nOr restore from backups if needed:');
  info(`  cp ${episodesFile}.backup ${episodesFile}`);
  info(`  cp ${profileFile}.backup ${profileFile}`);

  info('\n✅ Migration complete!\n');

  // Cleanup
  garden.close();
  learning.close();
}

// Run migration
migrateMemoryToLearning().catch(console.error);
