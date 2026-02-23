// src/tools/import-batch.ts
import { Tool } from './types.js';
import { importTools } from './import.js';

/**
 * Import all files at once without confirmation
 *
 * Combines staging and confirmation in one step.
 * Useful when using import rules or processing trusted sources.
 */
export const importAll: Tool = {
  name: 'importAll',
  description: 'Import all files from inbox immediately without confirmation',

  routing: {
    patterns: [
      /^import\s+all(\s+--dry-run)?\s*$/i,
      /^import\s+everything(\s+--dry-run)?\s*$/i,
    ],
    keywords: {
      verbs: ['import'],
      nouns: ['all', 'everything', 'batch'],
    },
    examples: [
      'import all',
      'import everything',
      'import all --dry-run',
    ],
    priority: 75,
  },

  parameters: {
    type: 'object',
    properties: {
      enableOcr: { type: 'boolean', description: 'Enable OCR for images' },
      dryRun: { type: 'boolean', description: 'Preview without importing' },
    },
  },

  parseArgs: (input) => {
    const enableOcr = input.includes('--ocr');
    const dryRun = input.includes('--dry-run');
    return { enableOcr, dryRun };
  },

  execute: async (args, context) => {
    const { enableOcr = false, dryRun = false } = args as { enableOcr?: boolean; dryRun?: boolean };
    const { inbox } = context.services;

    try {
      // Get inbox items
      const items = inbox.listInbox();

      if (items.length === 0) {
        return 'Inbox is empty.';
      }

      // Dry-run mode: preview without importing
      if (dryRun) {
        const { formatFileSize, getFileTypeIcon } = await import('../utils/file-type-detection.js');

        const importConfig = context.services.importConfig;
        let output = `🔍 Dry-run mode: Previewing ${items.length} file${items.length === 1 ? '' : 's'}\n\n`;

        let wouldImport = 0;
        let wouldSkip = 0;

        for (const item of items) {
          // Check for duplicates
          const duplicateCheck = await inbox.checkDuplicate(item.file_path);

          if (duplicateCheck.isDuplicate && duplicateCheck.action === 'skip') {
            output += `⊘ ${item.file_name} (${formatFileSize(item.file_size)})\n`;
            output += `  → Skip: ${duplicateCheck.reason}\n\n`;
            wouldSkip++;
            continue;
          }

          // Check rule matches
          const ruleMatches = importConfig.matchRules(item.file_name, item.file_type);

          output += `✓ ${item.file_name} (${formatFileSize(item.file_size)})\n`;
          output += `  → Type: ${item.file_type}`;

          if (ruleMatches.length > 0) {
            const rule = ruleMatches[0].rule;
            const confidence = Math.round(ruleMatches[0].confidence * 100);

            if (rule.actions.project) output += ` | Project: ${rule.actions.project}`;
            if (rule.actions.context) output += ` | Context: ${rule.actions.context}`;
            if (rule.actions.privacy) output += ` | Privacy: ${rule.actions.privacy}`;
            output += `\n  → Rule: "${rule.name}" (${confidence}% confidence)`;
          }

          output += '\n\n';
          wouldImport++;
        }

        output += `Summary:\n`;
        output += `  Would import: ${wouldImport}\n`;
        if (wouldSkip > 0) output += `  Would skip: ${wouldSkip} (duplicates)\n`;
        output += `\nRun without --dry-run to confirm.`;

        return output;
      }

      // Normal mode: actually import
      const importFilesTool = importTools.find(t => t.name === 'importFiles');
      const confirmImportTool = importTools.find(t => t.name === 'confirmImport');

      if (!importFilesTool || !confirmImportTool) {
        return 'Import tools not available';
      }

      // Stage files
      const importResult = await importFilesTool.execute({ enableOcr }, context);

      if (!importResult) {
        return 'No result from import';
      }

      // Check if any files were staged
      if (importResult.includes('Inbox is empty') || importResult.includes('Inbox directory created')) {
        return importResult;
      }

      // Auto-confirm
      const confirmResult = await confirmImportTool.execute({}, context);

      return confirmResult || 'Import completed';
    } catch (err) {
      return `Error during batch import: ${String(err)}`;
    }
  },
};

/**
 * Clear all files from inbox
 *
 * Deletes all staged items without importing.
 */
export const clearInbox: Tool = {
  name: 'clearInbox',
  description: 'Clear all files from import inbox',

  routing: {
    patterns: [
      /^clear\s+inbox\s*$/i,
      /^empty\s+inbox\s*$/i,
      /^delete\s+inbox\s*$/i,
    ],
    keywords: {
      verbs: ['clear', 'empty', 'delete', 'remove'],
      nouns: ['inbox'],
    },
    examples: [
      'clear inbox',
      'empty inbox',
    ],
    priority: 70,
  },

  parameters: {
    type: 'object',
    properties: {},
  },

  parseArgs: () => {
    return {};
  },

  execute: async (args, context) => {
    const { inbox, config } = context.services;
    const { resolvePath } = await import('../config.js');
    const fs = await import('fs');
    const path = await import('path');

    try {
      // Get count first
      const count = inbox.getCount();

      if (count === 0) {
        return 'Inbox is already empty.';
      }

      // Get all items
      const items = inbox.listInbox();

      // Delete from database and filesystem
      let deletedCount = 0;
      for (const item of items) {
        // Delete from inbox service
        inbox.deleteItem(item.id);

        // Delete file from filesystem
        if (fs.existsSync(item.file_path)) {
          fs.unlinkSync(item.file_path);
          deletedCount++;
        }
      }

      return `✓ Cleared ${deletedCount} file${deletedCount === 1 ? '' : 's'} from inbox.`;
    } catch (err) {
      return `Error clearing inbox: ${String(err)}`;
    }
  },
};

/**
 * Import only specific file types
 *
 * Selectively process files by type while leaving others in inbox.
 */
export const importOnly: Tool = {
  name: 'importOnly',
  description: 'Import only specific file types from inbox',

  routing: {
    patterns: [
      /^import\s+only\s+(documents?|spreadsheets?|images?|text|archives?)(\s+--dry-run)?\s*$/i,
      /^import\s+(documents?|spreadsheets?|images?|text|archives?)\s+only(\s+--dry-run)?\s*$/i,
    ],
    keywords: {
      verbs: ['import'],
      nouns: ['only', 'documents', 'images', 'spreadsheets', 'text'],
    },
    examples: [
      'import only images',
      'import only documents',
      'import documents only',
      'import only images --dry-run',
    ],
    priority: 80,
  },

  parameters: {
    type: 'object',
    properties: {
      fileType: {
        type: 'string',
        description: 'File type to import',
      },
      dryRun: { type: 'boolean', description: 'Preview without importing' },
    },
  },

  parseArgs: (input) => {
    const typeMatch = input.match(/\b(document|spreadsheet|image|text|archive)s?\b/i);
    const fileType = typeMatch ? typeMatch[1].toLowerCase() : undefined;
    const enableOcr = input.includes('--ocr');
    const dryRun = input.includes('--dry-run');

    return { fileType, enableOcr, dryRun };
  },

  execute: async (args, context) => {
    const { config, inbox, garden, ocr } = context.services;
    const { fileType, enableOcr = false, dryRun = false } = args as {
      fileType?: string;
      enableOcr?: boolean;
      dryRun?: boolean;
    };

    if (!fileType) {
      return 'Please specify a file type. Examples:\n  import only images\n  import only documents';
    }

    try {
      const { resolvePath } = await import('../config.js');
      const { processFile, buildRecordContent } = await import('../utils/content-processors.js');
      const { formatFileSize, FileType, getFileTypeIcon } = await import('../utils/file-type-detection.js');
      const { ImportRulesManager } = await import('../utils/import-rules.js');
      const fs = await import('fs');
      const path = await import('path');

      // Get filtered inbox items
      const items = inbox.listInbox(fileType as any);

      if (items.length === 0) {
        return `No ${fileType} files in inbox.`;
      }

      // Dry-run mode: preview without importing
      if (dryRun) {
        const importConfig = context.services.importConfig;
        let output = `🔍 Dry-run mode: Previewing ${items.length} ${fileType} file${items.length === 1 ? '' : 's'}\n\n`;

        let wouldImport = 0;
        let wouldSkip = 0;

        for (const item of items) {
          // Check for duplicates
          const duplicateCheck = await inbox.checkDuplicate(item.file_path);

          if (duplicateCheck.isDuplicate && duplicateCheck.action === 'skip') {
            output += `⊘ ${item.file_name} (${formatFileSize(item.file_size)})\n`;
            output += `  → Skip: ${duplicateCheck.reason}\n\n`;
            wouldSkip++;
            continue;
          }

          // Check rule matches
          const ruleMatches = importConfig.matchRules(item.file_name, item.file_type);

          output += `✓ ${item.file_name} (${formatFileSize(item.file_size)})\n`;
          output += `  → Type: ${item.file_type}`;

          if (ruleMatches.length > 0) {
            const rule = ruleMatches[0].rule;
            const confidence = Math.round(ruleMatches[0].confidence * 100);

            if (rule.actions.project) output += ` | Project: ${rule.actions.project}`;
            if (rule.actions.context) output += ` | Context: ${rule.actions.context}`;
            if (rule.actions.privacy) output += ` | Privacy: ${rule.actions.privacy}`;
            output += `\n  → Rule: "${rule.name}" (${confidence}% confidence)`;
          }

          output += '\n\n';
          wouldImport++;
        }

        output += `Summary:\n`;
        output += `  Would import: ${wouldImport} ${fileType} file${wouldImport === 1 ? '' : 's'}\n`;
        if (wouldSkip > 0) output += `  Would skip: ${wouldSkip} (duplicates)\n`;

        // Check remaining files
        const allItems = inbox.listInbox();
        const remaining = allItems.length - items.length;
        if (remaining > 0) {
          output += `  Would remain in inbox: ${remaining} other file${remaining === 1 ? '' : 's'}\n`;
        }

        output += `\nRun without --dry-run to confirm.`;

        return output;
      }

      // Create imports directory
      const gardenPath = resolvePath(config, 'garden');
      const today = new Date().toISOString().split('T')[0];
      const importDir = path.join(gardenPath, 'imports', today);

      if (!fs.existsSync(importDir)) {
        fs.mkdirSync(importDir, { recursive: true });
      }

      // Process each item (similar to confirmImport)
      const processedRecords = [];
      for (const item of items) {
        try {
          const targetPath = path.join(importDir, item.file_name);

          // Handle duplicate filenames
          let finalTargetPath = targetPath;
          let counter = 1;
          while (fs.existsSync(finalTargetPath)) {
            const ext = path.extname(item.file_name);
            const base = path.basename(item.file_name, ext);
            finalTargetPath = path.join(importDir, `${base}-${counter}${ext}`);
            counter++;
          }

          fs.copyFileSync(item.file_path, finalTargetPath);

          // Process file content
          const processingResult = await processFile(finalTargetPath, item.file_type, {
            enableOcr,
            ocrService: ocr,
          });

          // Create Garden record based on file type
          let recordType: 'note' | 'event' | 'media' = 'media';
          let title = path.basename(item.file_name, path.extname(item.file_name));

          // Sanitize title
          title = title.replace(/[-_]/g, ' ').trim();
          title = title.charAt(0).toUpperCase() + title.slice(1);

          // Determine record type
          if (item.file_type === FileType.TEXT || item.file_type === FileType.DOCUMENT) {
            recordType = 'note';
          } else if (item.file_type === FileType.IMAGE) {
            recordType = 'media';
          } else {
            recordType = 'media';
          }

          // Build enriched content
          const content = buildRecordContent(
            item.file_name,
            item.file_type,
            formatFileSize(item.file_size),
            finalTargetPath,
            processingResult
          );

          // Apply import rules
          const ruleMatches = context.services.importConfig.matchRules(
            item.file_name,
            item.file_type,
            processingResult?.content
          );

          // Build record metadata with rules applied
          let recordMetadata: any = {};
          if (ruleMatches.length > 0) {
            recordMetadata = context.services.importConfig.applyRules({}, ruleMatches);
          }

          // Create record
          const record = garden.create({
            type: recordType,
            title: `Imported: ${title}`,
            content,
            status: 'active',
            project: recordMetadata.project,
            context: recordMetadata.context,
            privacy: recordMetadata.privacy,
          });

          // Update record with source_file
          const db = garden.getDatabase();
          db.prepare('UPDATE garden_records SET source_file = ? WHERE id = ?').run(
            finalTargetPath,
            record.id
          );

          processedRecords.push({
            record,
            filename: item.file_name,
            path: finalTargetPath,
          });

          // Delete from inbox
          inbox.deleteItem(item.id);

          // Delete original file
          if (fs.existsSync(item.file_path)) {
            fs.unlinkSync(item.file_path);
          }
        } catch (err) {
          console.error(`Error processing ${item.file_name}:`, err);
        }
      }

      // Build summary
      let summary = `✓ Imported ${processedRecords.length} ${fileType} file${processedRecords.length === 1 ? '' : 's'}:\n\n`;

      for (const { record, filename, path: filePath } of processedRecords) {
        const relPath = filePath.replace(gardenPath, 'garden');
        summary += `  • ${filename}\n    → ${record.type}: "${record.title}"\n    → ${relPath}\n`;
      }

      summary += `\nFiles stored in: ${importDir}`;

      // Check remaining inbox items
      const remaining = inbox.getCount();
      if (remaining > 0) {
        summary += `\n\n${remaining} file${remaining === 1 ? '' : 's'} remaining in inbox.`;
      }

      return summary;
    } catch (err) {
      return `Error importing ${fileType} files: ${String(err)}`;
    }
  },
};

/**
 * Export all batch operation tools
 */
export const batchImportTools: Tool[] = [importAll, clearInbox, importOnly];
