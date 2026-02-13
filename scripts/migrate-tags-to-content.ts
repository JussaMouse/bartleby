#!/usr/bin/env tsx
/**
 * Migrate tags to content
 *
 * This script:
 * 1. Finds all records with tags
 * 2. Appends tags to content field as searchable text
 * 3. Clears the tags field
 * 4. Records migration in learning observations
 */

import { loadConfig } from '../src/config.js';
import { initServices } from '../src/services/index.js';

interface MigrationStats {
  total: number;
  migrated: number;
  skipped: number;
  errors: number;
}

async function migrateTags() {
  console.log('🔄 Migrating tags to content field...\n');

  const config = loadConfig();
  const services = await initServices(config);
  const { garden, learning } = services;

  const stats: MigrationStats = {
    total: 0,
    migrated: 0,
    skipped: 0,
    errors: 0
  };

  try {
    // Get all records using query builder
    const allRecords = garden.query().exec();
    stats.total = allRecords.length;

    console.log(`Found ${stats.total} total records\n`);

    for (const record of allRecords) {
      // Skip if no tags
      if (!record.tags || record.tags.length === 0) {
        stats.skipped++;
        continue;
      }

      try {
        console.log(`📝 ${record.title} (${record.type})`);
        console.log(`   Tags: ${record.tags.join(', ')}`);

        // Format tags as hashtags for backward compatibility
        const tagText = record.tags.map(t => `#${t}`).join(' ');

        // Append to content (or create content if empty)
        const newContent = record.content
          ? `${record.content}\n\n${tagText}`
          : tagText;

        // Update record
        garden.update(record.id, {
          content: newContent,
          tags: []  // Clear tags
        });

        console.log(`   ✓ Migrated → content`);
        stats.migrated++;

      } catch (err) {
        console.error(`   ❌ Error: ${err}`);
        stats.errors++;
      }
    }

    console.log('\n' + '='.repeat(50));
    console.log('Migration Complete');
    console.log('='.repeat(50));
    console.log(`Total records:     ${stats.total}`);
    console.log(`Migrated:          ${stats.migrated}`);
    console.log(`Skipped (no tags): ${stats.skipped}`);
    console.log(`Errors:            ${stats.errors}`);
    console.log('');

    if (stats.errors > 0) {
      console.log('⚠️  Some records had errors. Check logs above.');
      process.exit(1);
    } else {
      console.log('✅ All tags successfully migrated to content!');
      console.log('📝 Tags are now searchable via full-text search.');
      console.log('🔍 Try: find <keyword> instead of: show tagged <keyword>');
    }

  } finally {
    await services.context.close();
    garden.close();
  }
}

// Run migration
migrateTags().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
