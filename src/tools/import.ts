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
    properties: {},
  },

  parseArgs: () => {
    return {};
  },

  execute: async (args, context) => {
    const { config, inbox } = context.services;

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
      context.services.context.setFact('system', 'pendingImport', JSON.stringify({ itemIds, inboxPath }));

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
    const { config, inbox, garden } = context.services;

    try {
      // Check for pending import state
      const pendingFact = context.services.context.getFact('system', 'pendingImport');
      if (!pendingFact) {
        return 'No pending import found. Run "import files" first.';
      }

      const { itemIds, inboxPath } = JSON.parse(pendingFact);

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
      for (const item of items) {
        try {
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

          // Create record with source_file reference
          const record = garden.create({
            type: recordType,
            title: `Imported: ${title}`,
            content: `File: ${item.file_name}\nType: ${item.file_type}\nSize: ${formatFileSize(item.file_size)}\nImported: ${new Date().toISOString()}\n\nPath: ${finalTargetPath}`,
            status: 'active',
          });

          // Update record with source_file using direct SQL
          // (Garden doesn't expose updateRecord yet, so we use direct DB access)
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
      let summary = `✓ Imported ${processedRecords.length} file${processedRecords.length === 1 ? '' : 's'}:\n\n`;

      for (const { record, filename, path: filePath } of processedRecords) {
        const relPath = filePath.replace(gardenPath, 'garden');
        summary += `  • ${filename}\n    → ${record.type}: "${record.title}"\n    → ${relPath}\n`;
      }

      summary += `\nFiles stored in: ${importDir}`;

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
      /^list\s+inbox\s*$/i,
      /^inbox\s*$/i,
    ],
    keywords: {
      verbs: ['show', 'list', 'view'],
      nouns: ['inbox', 'imports'],
    },
    examples: [
      'show inbox',
      'list inbox',
      'inbox',
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
 * Export all import tools
 */
export const importTools: Tool[] = [importFiles, confirmImport, showInbox];
