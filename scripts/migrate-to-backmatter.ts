#!/usr/bin/env tsx
/**
 * Migration script: Convert frontmatter files to backmatter format
 *
 * ⚠️  NOTE: This script is likely deprecated. Bartleby now uses backmatter format
 * by default, and most garden files should already be in the correct format.
 * Only run this if you're migrating old frontmatter files.
 *
 * Usage:
 *   pnpm tsx scripts/migrate-to-backmatter.ts
 *
 * This will:
 * 1. Scan all .md files in garden/
 * 2. Convert frontmatter → backmatter format
 * 3. Create .bak backup files
 * 4. Report results
 */

import fs from 'fs';
import path from 'path';
import { parseGardenPage, toGardenPage, isFrontmatterFormat, isBackmatterFormat } from '../src/utils/garden-parser.js';

const GARDEN_PATH = process.env.GARDEN_PATH || './garden';

interface MigrationResult {
  migrated: string[];
  skipped: string[];
  errors: { file: string; error: string }[];
}

async function migrate(): Promise<MigrationResult> {
  const result: MigrationResult = {
    migrated: [],
    skipped: [],
    errors: [],
  };

  // Check garden path exists
  if (!fs.existsSync(GARDEN_PATH)) {
    console.error(`Garden path not found: ${GARDEN_PATH}`);
    process.exit(1);
  }

  const files = fs.readdirSync(GARDEN_PATH).filter(f => f.endsWith('.md'));
  
  console.log(`\n📂 Found ${files.length} markdown files in ${GARDEN_PATH}\n`);
  
  for (const file of files) {
    const filepath = path.join(GARDEN_PATH, file);
    
    try {
      const content = fs.readFileSync(filepath, 'utf8');
      
      // Skip if already backmatter format
      if (isBackmatterFormat(content)) {
        result.skipped.push(file);
        continue;
      }
      
      // Skip if no frontmatter (plain markdown)
      if (!isFrontmatterFormat(content)) {
        result.skipped.push(file);
        continue;
      }
      
      // Parse the file (handles frontmatter)
      const { body, meta } = parseGardenPage(content);
      
      // Skip if no metadata to migrate
      if (Object.keys(meta).length === 0) {
        result.skipped.push(file);
        continue;
      }
      
      // Convert to backmatter format
      const newContent = toGardenPage(body, meta);
      
      // Create backup
      fs.writeFileSync(filepath + '.bak', content);
      
      // Write new format
      fs.writeFileSync(filepath, newContent);
      
      console.log(`✓ Migrated: ${file}`);
      result.migrated.push(file);
      
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`✗ Error: ${file} - ${errorMsg}`);
      result.errors.push({ file, error: errorMsg });
    }
  }
  
  return result;
}

async function main() {
  console.log('═'.repeat(50));
  console.log('  Garden Migration: Frontmatter → Backmatter');
  console.log('═'.repeat(50));
  
  const result = await migrate();
  
  console.log('\n' + '─'.repeat(50));
  console.log('Summary:');
  console.log(`  ✓ Migrated: ${result.migrated.length}`);
  console.log(`  ○ Skipped:  ${result.skipped.length} (already backmatter or no metadata)`);
  console.log(`  ✗ Errors:   ${result.errors.length}`);
  
  if (result.migrated.length > 0) {
    console.log('\nBackup files created with .bak extension.');
    console.log('To remove backups after verifying: rm garden/*.bak');
  }
  
  if (result.errors.length > 0) {
    console.log('\nErrors:');
    for (const { file, error } of result.errors) {
      console.log(`  ${file}: ${error}`);
    }
  }
  
  console.log('─'.repeat(50));
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
