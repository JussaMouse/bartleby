// src/tools/media.ts
import { Tool } from './types.js';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

export const addMedia: Tool = {
  name: 'addMedia',
  description: 'Add multimedia files (images, audio, video, documents) to Garden',

  routing: {
    patterns: [
      /^add\s+media\s+(.+)$/i,
      /^upload\s+(.+)$/i,
    ],
    keywords: {
      verbs: ['add', 'upload', 'attach'],
      nouns: ['media', 'image', 'photo', 'file', 'document', 'audio', 'video'],
    },
    examples: [
      'add media photo.jpg +project #tag',
      'add media contract.pdf +visa #legal --ocr',
      'upload voice-memo.m4a +project',
    ],
    priority: 75,
  },

  parameters: {
    type: 'object',
    properties: {
      filepath: { type: 'string', description: 'Path to the media file' },
      projects: { type: 'array', items: { type: 'string' }, description: 'Project names (prefixed with +)' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Tags (prefixed with #)' },
      ocr: { type: 'boolean', description: 'Extract text from image using OCR' },
    },
    required: ['filepath'],
  },

  parseArgs: (input, match) => {
    let rawInput = '';
    if (match) {
      rawInput = match[match.length - 1]?.trim() || '';
    } else {
      rawInput = input.replace(/^(add\s+media|upload)\s*/i, '').trim();
    }

    // Extract projects (+project-name) and keywords
    const projects: string[] = [];
    const keywords: string[] = [];
    let ocr = false;

    // Match all +word patterns
    const projectMatches = rawInput.matchAll(/\+([a-zA-Z0-9_-]+)/g);
    for (const match of projectMatches) {
      projects.push(match[1]);
    }

    // Match all #word patterns (keep as keywords for content)
    const keywordMatches = rawInput.matchAll(/#([a-zA-Z0-9_-]+)/g);
    for (const match of keywordMatches) {
      keywords.push(match[1]);
    }

    // Check for --ocr flag
    if (rawInput.includes('--ocr')) {
      ocr = true;
    }

    // Remove projects and flags from filepath (keep keywords for content)
    const filepath = rawInput
      .replace(/\+[a-zA-Z0-9_-]+/g, '')
      .replace(/#[a-zA-Z0-9_-]+/g, '')
      .replace(/--ocr/g, '')
      .trim();

    return { filepath, projects, keywords, ocr };
  },

  execute: async (args, context) => {
    const { filepath, projects = [], keywords = [], ocr = false } = args as {
      filepath: string;
      projects?: string[];
      keywords?: string[];
      ocr?: boolean;
    };

    if (!filepath) {
      return 'Please provide a file path. Examples:\n  add media photo.jpg +project #tag\n  add media document.pdf --ocr';
    }

    try {
      // Resolve file path
      const absolutePath = path.isAbsolute(filepath)
        ? filepath
        : path.resolve(process.cwd(), filepath);

      if (!fs.existsSync(absolutePath)) {
        return `File not found: ${filepath}`;
      }

      const stats = fs.statSync(absolutePath);
      if (!stats.isFile()) {
        return `Not a file: ${filepath}`;
      }

      // Get file info
      const originalFilename = path.basename(absolutePath);
      const ext = path.extname(originalFilename).toLowerCase();
      const baseName = path.basename(originalFilename, ext);

      // Determine file type
      const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.heic', '.webp'];
      const audioExts = ['.mp3', '.m4a', '.wav', '.ogg'];
      const videoExts = ['.mp4', '.mov', '.avi', '.mkv'];
      const docExts = ['.pdf', '.doc', '.docx', '.txt', '.md'];

      let fileType = 'file';
      if (imageExts.includes(ext)) fileType = 'image';
      else if (audioExts.includes(ext)) fileType = 'audio';
      else if (videoExts.includes(ext)) fileType = 'video';
      else if (docExts.includes(ext)) fileType = 'document';

      // Generate unique filename to avoid collisions
      const uniqueId = uuidv4().slice(0, 8);
      const newFilename = `${baseName}-${uniqueId}${ext}`;

      // Copy to media directory
      const mediaDir = context.services.garden.getMediaDir();
      const targetPath = path.join(mediaDir, newFilename);

      fs.copyFileSync(absolutePath, targetPath);

      // Build tags array
      // Build classification keywords for content
      const classificationKeywords = ['media', fileType, ...keywords].join(' ');

      // Build content
      let content = `**File:** ${originalFilename}\n`;
      content += `**Type:** ${fileType}\n`;
      content += `**Size:** ${(stats.size / 1024).toFixed(1)} KB\n`;
      content += `**Added:** ${new Date().toLocaleDateString()}\n\n`;
      content += `[View file](/media/${newFilename})\n`;

      // OCR if requested and is image
      let ocrText: string | null = null;
      if (ocr && fileType === 'image') {
        try {
          ocrText = await context.services.ocr.processFile(targetPath);
          if (ocrText) {
            content += `\n## Extracted Text (OCR)\n\n${ocrText}\n`;
          }
        } catch (ocrError) {
          content += `\n*Note: OCR failed - ${ocrError instanceof Error ? ocrError.message : 'Unknown error'}*\n`;
        }
      }

      // Add classification keywords to content for search
      if (classificationKeywords) {
        content += `\n\n${classificationKeywords}`;
      }

      // Create Garden page
      const mediaPage = context.services.garden.create({
        type: 'media',
        title: baseName,
        status: 'active',
        // tags removed - keywords in content
        content,
        metadata: {
          file_path: `/media/${newFilename}`,
          original_filename: originalFilename,
          file_type: fileType,
          file_size: stats.size,
          has_ocr: !!ocrText,
          projects: projects.length > 0 ? projects : undefined,
        },
      });

      // Link to projects if specified
      for (const projectSlug of projects) {
        const projectPages = context.services.garden.getByType('project');
        const project = projectPages.find(p =>
          p.title.toLowerCase().replace(/\s+/g, '-') === projectSlug.toLowerCase()
        );

        if (project) {
          context.services.garden.update(mediaPage.id, {
            content: mediaPage.content + `\n\n**Project:** [[${project.title}]]`,
          });
        }
      }

      // Build output
      const metadataDisplay =
        (projects.length > 0 ? `\n  Projects: ${projects.map(p => '+' + p).join(' ')}` : '') +
        (keywords.length > 0 ? `\n  Keywords: ${keywords.map(k => k).join(' ')}` : '');

      const ocrDisplay = ocrText ? `\n  OCR: ${ocrText.length} chars extracted` : '';

      return `✓ Added media: "${baseName}"\n  Type: ${fileType}\n  Size: ${(stats.size / 1024).toFixed(1)} KB\n  File: ${newFilename}${ocrDisplay}${metadataDisplay}\n  Page created: open "${mediaPage.title}"`;

    } catch (err) {
      return `Failed to add media: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

export const mediaTools: Tool[] = [addMedia];
