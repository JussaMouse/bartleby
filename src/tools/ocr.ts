// src/tools/ocr.ts
// OCR tool for extracting text from images

import { Tool } from './types.js';
import path from 'path';
import fs from 'fs';

export const ocrImage: Tool = {
  name: 'ocrImage',
  description: 'Extract text from an image using OCR',

  routing: {
    patterns: [
      /^ocr\s+(.+)$/i,
      /^read\s+(?:text\s+(?:from|in)\s+)?image\s+(.+)$/i,
      /^extract\s+text\s+(?:from\s+)?(.+)$/i,
    ],
    keywords: {
      verbs: ['ocr', 'extract', 'read'],
      nouns: ['text', 'image', 'screenshot', 'photo'],
    },
    examples: ['ocr ~/Desktop/screenshot.png', 'extract text from receipt.jpg'],
    priority: 85,
  },

  parseArgs: (input) => {
    const match = input.match(/^(?:ocr|read\s+(?:text\s+(?:from|in)\s+)?image|extract\s+text\s+(?:from\s+)?)\s*(.+)$/i);
    let filePath = match ? match[1].trim() : input.trim();
    
    // Handle quoted paths
    filePath = filePath.replace(/^["'](.*)["']$/, '$1');
    
    // Expand ~ to home directory
    if (filePath.startsWith('~')) {
      filePath = filePath.replace('~', process.env.HOME || '');
    }
    
    return { filePath };
  },

  execute: async (args, context) => {
    const { filePath } = args as { filePath: string };

    if (!filePath) {
      return 'Please provide an image path. Example: ocr ~/Desktop/screenshot.png';
    }

    // Check if OCR is available
    if (!context.services.ocr.isAvailable()) {
      return 'OCR is not configured. Set OCR_URL in .env to enable it.';
    }

    // Resolve path
    const resolvedPath = path.isAbsolute(filePath) 
      ? filePath 
      : path.join(process.cwd(), filePath);

    // Check if file exists
    if (!fs.existsSync(resolvedPath)) {
      return `File not found: ${filePath}`;
    }

    // Check if it's an image
    if (!context.services.ocr.isOCRableImage(resolvedPath)) {
      const ext = path.extname(resolvedPath);
      return `Not a supported image format (${ext}). Supported: jpg, jpeg, png, gif, webp, bmp, tiff`;
    }

    // Extract text
    const text = await context.services.ocr.extractText(resolvedPath);

    if (!text) {
      return 'Failed to extract text from image. The image may be empty or unreadable.';
    }

    return `**Text from ${path.basename(filePath)}:**\n\n${text}`;
  },
};

export const ocrTools: Tool[] = [ocrImage];
