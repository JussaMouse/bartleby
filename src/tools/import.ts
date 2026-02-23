// src/tools/import.ts
import { Tool } from './types.js';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { resolvePath } from '../config.js';
import {
  getFileMetadata,
  formatFileSize,
  getFileTypeIcon,
  FileType,
} from '../utils/file-type-detection.js';
import { sanitizeFilename } from '../utils/markdown.js';
import { processFile, buildRecordContent } from '../utils/content-processors.js';
import { ImportRulesManager } from '../utils/import-rules.js';
import { Result, Ok, Err } from '../utils/result.js';
import {
  DuplicateError,
  ImportError,
  ValidationError,
  formatError,
} from '../utils/errors.js';

/**
 * Import files from inbox directory
 *
 * Scans the inbox directory, captures file metadata, and stages items for review.
 * User must confirm import before files are processed and added to Garden.
 */
export const importFiles: Tool = {
  name: 'importFiles',
  description: 'Scan and capture files from inbox directory for import',

  routing: {
    patterns: [
      /^import\s+files?\s*$/i,
      /^import\s+from\s+inbox\s*$/i,
      /^scan\s+inbox\s*$/i,
    ],
    keywords: {
      verbs: ['import', 'scan', 'capture', 'inbox'],
      nouns: ['files', 'inbox', 'imports'],
    },
    examples: [
      'import files',
      'import from inbox',
      'scan inbox',
    ],
    priority: 75,
  },

  parameters: {
    type: 'object',
    properties: {
      enableOcr: { type: 'boolean', description: 'Enable OCR for images' },
    },
  },

  parseArgs: (input) => {
    // Check for --ocr flag
    const enableOcr = input.includes('--ocr');
    return { enableOcr };
  },

  execute: async (args, context) => {
    const { config, inbox } = context.services;
    const { enableOcr = false } = args as { enableOcr?: boolean };

    try {
      // Get inbox path
      const inboxPath = resolvePath(config, 'inbox');

      // Ensure inbox directory exists
      if (!fs.existsSync(inboxPath)) {
        fs.mkdirSync(inboxPath, { recursive: true });
        return `Inbox directory created at: ${inboxPath}\n\nAdd files to this directory and run "import files" again.`;
      }

      // Read directory contents
      const files = fs.readdirSync(inboxPath);

      // Filter out hidden files and directories
      const validFiles = files.filter(file => {
        const filePath = path.join(inboxPath, file);
        const stats = fs.statSync(filePath);
        return stats.isFile() && !file.startsWith('.');
      });

      if (validFiles.length === 0) {
        return `Inbox is empty: ${inboxPath}\n\nAdd files to import and try again.`;
      }

      // Capture files to inbox
      const capturedItems = [];
      for (const file of validFiles) {
        const filePath = path.join(inboxPath, file);
        const metadata = await getFileMetadata(filePath);

        // Capture to inbox service
        const item = inbox.captureFile(
          filePath,
          metadata.fileName,
          metadata.fileType,
          metadata.fileSize,
          metadata.mimeType,
          metadata.modifiedAt
        );

        capturedItems.push(item);
      }

      // Store pending import state
      const itemIds = capturedItems.map(item => item.id);
      context.services.context.setFact('system', 'pendingImport', JSON.stringify({
        itemIds,
        inboxPath,
        enableOcr
      }));

      // Build summary
      const filesByType: Record<string, number> = {};
      for (const item of capturedItems) {
        filesByType[item.file_type] = (filesByType[item.file_type] || 0) + 1;
      }

      let summary = `Found ${capturedItems.length} file${capturedItems.length === 1 ? '' : 's'} in inbox:\n\n`;

      // Group by type
      const typeOrder = [
        FileType.DOCUMENT,
        FileType.SPREADSHEET,
        FileType.IMAGE,
        FileType.TEXT,
        FileType.ARCHIVE,
        FileType.EMAIL,
        FileType.WEB,
        FileType.OTHER,
      ];

      for (const fileType of typeOrder) {
        const items = capturedItems.filter(item => item.file_type === fileType);
        if (items.length === 0) continue;

        summary += `${getFileTypeIcon(fileType)} ${fileType.toUpperCase()} (${items.length}):\n`;
        for (const item of items) {
          summary += `  - ${item.file_name} (${formatFileSize(item.file_size)})\n`;
        }
        summary += '\n';
      }

      summary += `Ready to import. Type "confirm" to process these files.`;

      return summary;
    } catch (err) {
      return `Error scanning inbox: ${String(err)}`;
    }
  },
};

/**
 * Confirm and process pending import
 *
 * Processes staged inbox items, copies files to garden/imports/,
 * creates Garden records, and cleans up inbox.
 */
export const confirmImport: Tool = {
  name: 'confirmImport',
  description: 'Confirm and process pending file imports',

  routing: {
    patterns: [
      /^confirm\s+import\s*$/i,
      /^yes,?\s+import\s*$/i,
      /^proceed\s*$/i,
    ],
    keywords: {
      verbs: ['confirm', 'proceed', 'yes'],
      nouns: ['import', 'imports'],
    },
    examples: [
      'confirm import',
      'yes',
      'proceed',
    ],
    priority: 80,
  },

  parameters: {
    type: 'object',
    properties: {},
  },

  parseArgs: () => {
    return {};
  },

  execute: async (args, context) => {
    const { config, inbox, garden, ocr } = context.services;

    try {
      // Check for pending import state
      const pendingFact = context.services.context.getFact('system', 'pendingImport');
      if (!pendingFact) {
        return 'No pending import found. Run "import files" first.';
      }

      const { itemIds, inboxPath, enableOcr = false } = JSON.parse(pendingFact);

      if (!Array.isArray(itemIds) || itemIds.length === 0) {
        context.services.context.clearFact('system', 'pendingImport');
        return 'No items to import.';
      }

      // Get all inbox items
      const items = itemIds
        .map((id: string) => inbox.getItem(id))
        .filter((item): item is NonNullable<typeof item> => item !== undefined);

      if (items.length === 0) {
        context.services.context.clearFact('system', 'pendingImport');
        return 'No inbox items found. They may have been already processed.';
      }

      // Create imports directory structure: garden/imports/YYYY-MM-DD/
      const gardenPath = resolvePath(config, 'garden');
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const importDir = path.join(gardenPath, 'imports', today);

      if (!fs.existsSync(importDir)) {
        fs.mkdirSync(importDir, { recursive: true });
      }

      // Process each item
      const processedRecords = [];
      const skippedDuplicates = [];

      for (const item of items) {
        try {
          // Check for duplicate imports
          const duplicateCheck = await inbox.checkDuplicate(item.file_path);

          if (duplicateCheck.isDuplicate && duplicateCheck.action === 'skip') {
            skippedDuplicates.push({
              filename: item.file_name,
              reason: duplicateCheck.reason || 'Already imported',
              importedAt: duplicateCheck.existingRecord?.imported_at,
            });

            // Delete from inbox but don't reimport
            inbox.deleteItem(item.id);
            if (fs.existsSync(item.file_path)) {
              fs.unlinkSync(item.file_path);
            }

            continue; // Skip to next file
          }

          // Copy file to imports directory
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

          // Create record with source_file reference and rule-based metadata
          const record = garden.create({
            type: recordType,
            title: `Imported: ${title}`,
            content,
            status: 'active',
            project: recordMetadata.project,
            context: recordMetadata.context,
            privacy: recordMetadata.privacy,
          });

          // Update record with source_file using direct SQL
          // (Garden doesn't expose updateRecord yet, so we use direct DB access)
          const db = garden.getDatabase();
          db.prepare('UPDATE garden_records SET source_file = ? WHERE id = ?').run(
            finalTargetPath,
            record.id
          );

          // Record import in history
          const appliedRuleName = ruleMatches.length > 0 ? ruleMatches[0].rule.name : null;
          inbox.recordImport(
            item.file_path,
            item.file_name,
            item.file_type,
            item.file_size,
            record.id,
            appliedRuleName,
            {
              targetPath: finalTargetPath,
              recordType: recordType,
              recordTitle: record.title,
            }
          );

          processedRecords.push({
            record,
            filename: item.file_name,
            path: finalTargetPath,
          });

          // Delete from inbox
          inbox.deleteItem(item.id);

          // Delete original file from inbox directory
          if (fs.existsSync(item.file_path)) {
            fs.unlinkSync(item.file_path);
          }
        } catch (err) {
          console.error(`Error processing ${item.file_name}:`, err);
          // Continue processing other items
        }
      }

      // Clear pending state
      context.services.context.clearFact('system', 'pendingImport');

      // Build summary
      let summary = '';

      if (processedRecords.length > 0) {
        summary += `✓ Imported ${processedRecords.length} file${processedRecords.length === 1 ? '' : 's'}:\n\n`;

        for (const { record, filename, path: filePath } of processedRecords) {
          const relPath = filePath.replace(gardenPath, 'garden');
          summary += `  • ${filename}\n    → ${record.type}: "${record.title}"\n    → ${relPath}\n`;
        }

        summary += `\nFiles stored in: ${importDir}`;
      }

      // Add information about skipped duplicates
      if (skippedDuplicates.length > 0) {
        if (summary) summary += '\n\n';
        summary += `⊘ Skipped ${skippedDuplicates.length} duplicate${skippedDuplicates.length === 1 ? '' : 's'}:\n\n`;

        for (const { filename, reason, importedAt } of skippedDuplicates) {
          const date = importedAt ? new Date(importedAt).toLocaleDateString() : 'unknown';
          summary += `  • ${filename}\n    → ${reason} (${date})\n`;
        }
      }

      if (!processedRecords.length && !skippedDuplicates.length) {
        summary = 'No files were processed.';
      }

      return summary;
    } catch (err) {
      return `Error confirming import: ${String(err)}`;
    }
  },
};

/**
 * Show inbox contents
 *
 * Lists all files currently staged in the inbox with metadata.
 */
export const showInbox: Tool = {
  name: 'showInbox',
  description: 'Show all files in the import inbox',

  routing: {
    patterns: [
      /^show\s+inbox\s*$/i,
      /^show\s+inbox\s+(documents?|spreadsheets?|images?|text|archives?|emails?|web|other)\s*$/i,
      /^list\s+inbox\s*$/i,
      /^inbox\s*$/i,
    ],
    keywords: {
      verbs: ['show', 'list', 'view'],
      nouns: ['inbox', 'imports', 'documents', 'images', 'spreadsheets'],
    },
    examples: [
      'show inbox',
      'show inbox images',
      'show inbox documents',
      'list inbox',
    ],
    priority: 70,
  },

  parameters: {
    type: 'object',
    properties: {
      fileType: {
        type: 'string',
        description: 'Filter by file type',
      },
    },
  },

  parseArgs: (input) => {
    // Check for file type filter
    const typeMatch = input.match(/\b(document|spreadsheet|image|text|archive|email|web|other)s?\b/i);
    const fileType = typeMatch ? typeMatch[1].toLowerCase() : undefined;

    return { fileType };
  },

  execute: async (args, context) => {
    const { inbox } = context.services;

    try {
      const { fileType } = args as { fileType?: string };

      // Get inbox items
      const items = inbox.listInbox(fileType as FileType | undefined);

      if (items.length === 0) {
        if (fileType) {
          return `No ${fileType} files in inbox.`;
        }
        return 'Inbox is empty.';
      }

      // Get stats
      const stats = inbox.getStats();
      const totalSize = items.reduce((sum, item) => sum + item.file_size, 0);

      let output = `Inbox: ${items.length} file${items.length === 1 ? '' : 's'} (${formatFileSize(totalSize)})\n\n`;

      // Group by type
      const typeOrder = [
        FileType.DOCUMENT,
        FileType.SPREADSHEET,
        FileType.IMAGE,
        FileType.TEXT,
        FileType.ARCHIVE,
        FileType.EMAIL,
        FileType.WEB,
        FileType.OTHER,
      ];

      for (const type of typeOrder) {
        const typeItems = items.filter(item => item.file_type === type);
        if (typeItems.length === 0) continue;

        output += `${getFileTypeIcon(type)} ${type.toUpperCase()} (${typeItems.length}):\n`;
        for (const item of typeItems) {
          const size = formatFileSize(item.file_size);
          const date = new Date(item.captured_at).toLocaleDateString();
          output += `  • ${item.file_name} (${size}) - captured ${date}\n`;
        }
        output += '\n';
      }

      output += `Run "import files" to process these files.`;

      return output;
    } catch (err) {
      return `Error showing inbox: ${String(err)}`;
    }
  },
};

/**
 * Show import history
 *
 * Lists previously imported files with metadata and linked garden records.
 */
export const showImportHistory: Tool = {
  name: 'showImportHistory',
  description: 'Show history of imported files',

  routing: {
    patterns: [
      /^import\s+history\s*$/i,
      /^show\s+import\s+history\s*$/i,
      /^list\s+imports?\s*$/i,
    ],
    keywords: {
      verbs: ['show', 'list', 'view'],
      nouns: ['import', 'history', 'imports'],
    },
    examples: [
      'import history',
      'show import history',
      'list imports',
    ],
    priority: 70,
  },

  parameters: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Maximum number of records to show',
      },
    },
  },

  parseArgs: (input) => {
    const limitMatch = input.match(/(\d+)/);
    const limit = limitMatch ? parseInt(limitMatch[1], 10) : 20;
    return { limit };
  },

  execute: async (args, context) => {
    const { inbox } = context.services;

    try {
      const { limit = 20 } = args as { limit?: number };

      // Get import history
      const history = inbox.getImportHistory(limit);

      if (history.length === 0) {
        return 'No import history found. Import some files to see them here.';
      }

      // Get statistics
      const stats = inbox.getImportStats();

      let output = `Import History (${stats.total} total, showing ${history.length}):\n\n`;

      // Group by date
      const byDate: Record<string, typeof history> = {};
      for (const record of history) {
        const date = new Date(record.imported_at).toLocaleDateString();
        if (!byDate[date]) byDate[date] = [];
        byDate[date].push(record);
      }

      for (const [date, records] of Object.entries(byDate)) {
        output += `${date}:\n`;
        for (const record of records) {
          const time = new Date(record.imported_at).toLocaleTimeString();
          const size = formatFileSize(record.file_size);

          output += `  • ${record.file_name} (${size}) - ${time}\n`;

          if (record.garden_record_id) {
            output += `    → Garden record: ${record.garden_record_id}\n`;
          }

          if (record.rule_applied) {
            output += `    → Rule applied: ${record.rule_applied}\n`;
          }
        }
        output += '\n';
      }

      // Add statistics
      output += `Statistics:\n`;
      output += `  Total imports: ${stats.total}\n`;
      output += `  Last 7 days: ${stats.recentCount}\n`;

      if (Object.keys(stats.byType).length > 0) {
        output += `\nBy type:\n`;
        for (const [type, count] of Object.entries(stats.byType)) {
          output += `  ${getFileTypeIcon(type as FileType)} ${type}: ${count}\n`;
        }
      }

      return output;
    } catch (err) {
      return `Error showing import history: ${String(err)}`;
    }
  },
};

/**
 * Export all import tools
 */
export const importTools: Tool[] = [importFiles, confirmImport, showInbox, showImportHistory];
