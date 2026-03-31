// src/tools/media.ts
// Garden tool for importing media files.

import { Tool } from './types.js';
import path from 'path';
import type { GardenService } from '../garden/GardenService.js';
import type { ViewService } from '../garden/ViewService.js';
import { ReplRenderer } from '../garden/renderers/ReplRenderer.js';

function getServices(context: any) {
  const garden = context.services.garden as GardenService;
  const views  = context.services.views  as ViewService;
  return { garden, views };
}

const renderer = new ReplRenderer();

export const importMedia: Tool = {
  name: 'importMedia',
  description: 'Import a media file (image, PDF, document) into the garden',

  routing: {
    patterns: [
      /^(import|attach|add) (file|media|document|image|pdf)\s+(.+)/i,
    ],
    keywords: {
      verbs: ['import', 'attach', 'add'],
      nouns: ['file', 'media', 'document', 'image', 'pdf'],
    },
    examples: ['import file contract.pdf', 'attach image photo.jpg'],
    priority: 70,
  },

  parseArgs: (input) => {
    const filePath = input.replace(/^(import|attach|add)\s*(file|media|document|image|pdf)?\s+/i, '').trim();
    return { file_path: filePath };
  },

  execute: async (args, context) => {
    const { file_path, project: projectTitle, title: overrideTitle } = args as {
      file_path: string;
      project?: string;
      title?: string;
    };

    if (!file_path) return 'Please specify a file path.';

    const { garden } = getServices(context);

    const fileName = path.basename(file_path);
    const ext = path.extname(fileName).toLowerCase();

    // Infer mime type from extension
    const mimeMap: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.mp4': 'video/mp4',
      '.txt': 'text/plain',
      '.md': 'text/markdown',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };

    const mime_type = mimeMap[ext] ?? 'application/octet-stream';

    const record = garden.create({
      type: 'media',
      title: overrideTitle ?? fileName,
      file_path,
      mime_type,
    });

    return `Imported: **${record.title}** (${mime_type})`;
  },
};

export const showMedia: Tool = {
  name: 'showMedia',
  description: 'Show a media record',

  routing: {
    patterns: [
      /^(show|open|view) (file|media)\s+(.+)/i,
    ],
    keywords: {
      verbs: ['show', 'open', 'view'],
      nouns: ['file', 'media', 'document'],
    },
    examples: ['show file contract.pdf', 'view media photo.jpg'],
    priority: 65,
  },

  parseArgs: (input) => {
    const title = input.replace(/^(show|open|view)\s*(file|media)?\s+/i, '').trim();
    return { title };
  },

  execute: async (args, context) => {
    const { title, id } = args as { title?: string; id?: string };
    const { views } = getServices(context);

    const viewData = id ? views.openRecord(id) : (title ? views.openRecordByTitle(title) : null);
    if (!viewData) return `Media not found: "${title ?? id}"`;
    return renderer.render(viewData);
  },
};
