import { Tool } from './types.js';

export const ingestDocument: Tool = {
  name: 'ingestDocument',
  description: 'Ingest a local markdown, text, or PDF document into the Shed',
  routing: {
    patterns: [
      /^ingest\s+(.+)$/i,
    ],
    keywords: {
      verbs: ['ingest', 'import', 'load'],
      nouns: ['document', 'file', 'source'],
    },
    examples: ['ingest ~/Documents/notes.md', 'ingest ./reference.txt'],
    priority: 76,
  },
  parseArgs: (input) => {
    const filepath = input.replace(/^ingest\s+/i, '').trim();
    return { filepath };
  },
  execute: async (args, context) => {
    const filepath = String(args.filepath ?? '').trim();
    if (!filepath) {
      return 'Usage: ingest <filepath>';
    }

    const source = await context.services.shed.ingestDocument(filepath);
    return [
      `Ingested source: **${source.title}**`,
      `  file: ${source.filename}`,
      `  type: ${source.sourceType ?? 'unknown'}`,
      `  chunks: ${source.chunkCount ?? 0}`,
    ].join('\n');
  },
};

export const listSources: Tool = {
  name: 'listSources',
  description: 'List ingested Shed sources',
  routing: {
    patterns: [
      /^list\s+sources$/i,
      /^show\s+sources$/i,
    ],
    keywords: {
      verbs: ['list', 'show', 'view'],
      nouns: ['sources', 'documents', 'shed'],
    },
    examples: ['list sources', 'show sources'],
    priority: 74,
  },
  parseArgs: () => ({}),
  execute: async (_args, context) => {
    const sources = context.services.shed.listSources();
    if (sources.length === 0) {
      return 'No Shed sources ingested yet.';
    }

    const lines = ['# Shed Sources', ''];
    for (const source of sources) {
      lines.push(`- ${source.title} (${source.sourceType ?? 'unknown'}, ${source.chunkCount ?? 0} chunks)`);
    }
    return lines.join('\n');
  },
};

export const askShed: Tool = {
  name: 'askShed',
  description: 'Ask a question against ingested Shed sources',
  routing: {
    patterns: [
      /^ask\s+shed\s+(.+)$/i,
    ],
    keywords: {
      verbs: ['ask', 'query'],
      nouns: ['shed', 'documents', 'sources'],
    },
    examples: ['ask shed what does this document say about refunds'],
    priority: 75,
  },
  parseArgs: (input) => {
    const question = input.replace(/^ask\s+shed\s+/i, '').trim();
    return { question };
  },
  execute: async (args, context) => {
    const question = String(args.question ?? '').trim();
    if (!question) {
      return 'Usage: ask shed <question>';
    }
    return context.services.shed.query(question);
  },
};

export const shedTools: Tool[] = [ingestDocument, listSources, askShed];
