// src/tools/shed.ts
import { Tool } from './types.js';

export const ingestDocument: Tool = {
  name: 'ingestDocument',
  description: 'Ingest a document into the Shed (reference library)',

  routing: {
    patterns: [
      /^ingest\s+(.+)$/i,
      /^add\s+(to\s+)?shed\s+(.+)$/i,
      /^import\s+(document|file)\s+(.+)$/i,
    ],
    keywords: {
      verbs: ['ingest', 'import', 'add'],
      nouns: ['shed', 'document', 'file', 'library'],
    },
    examples: ['ingest notes.md', 'add to shed article.txt'],
    priority: 80,
  },

  parameters: {
    type: 'object',
    properties: {
      filepath: { type: 'string', description: 'Path to the document file' },
    },
    required: ['filepath'],
  },

  parseArgs: (input, match) => {
    let filepath = '';
    if (match) {
      filepath = match[match.length - 1]?.trim() || '';
    } else {
      filepath = input.replace(/^(ingest|add\s+to\s+shed|import\s+(document|file))\s*/i, '').trim();
    }
    return { filepath };
  },

  execute: async (args, context) => {
    const { filepath } = args as { filepath: string };

    if (!filepath) {
      return 'Please provide a file path. Example: ingest notes.md\nSupported formats: .md, .txt, .pdf';
    }

    try {
      const source = await context.services.shed.ingestDocument(filepath);
      return `✓ Ingested: "${source.title}"\n  File: ${source.filename}\n  Chunks: ${source.chunkCount}`;
    } catch (err) {
      return `Failed to ingest document: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

export const askShed: Tool = {
  name: 'askShed',
  description: 'Ask a question about your ingested documents',

  routing: {
    patterns: [
      /^ask\s+shed\s+(.+)$/i,
      /^shed\s+(.+)$/i,
      /^what\s+do\s+(my\s+)?(documents?|notes?|files?)\s+say\s+about\s+(.+)$/i,
    ],
    keywords: {
      verbs: ['ask', 'query', 'search'],
      nouns: ['shed', 'documents', 'library', 'reference'],
    },
    examples: [
      'ask shed about machine learning',
      'what do my documents say about project management',
      'shed what are the main themes',
    ],
    priority: 75,
  },

  parameters: {
    type: 'object',
    properties: {
      question: { type: 'string', description: 'Question to ask about ingested documents' },
    },
    required: ['question'],
  },

  parseArgs: (input, match) => {
    let question = '';
    if (match) {
      question = match[match.length - 1]?.trim() || '';
    } else {
      question = input
        .replace(/^(ask\s+shed|shed|what\s+do\s+(my\s+)?(documents?|notes?|files?)\s+say\s+about)\s*/i, '')
        .trim();
    }
    return { question };
  },

  execute: async (args, context) => {
    const { question } = args as { question: string };

    if (!question) {
      return 'Please provide a question. Example: ask shed about machine learning';
    }

    try {
      const answer = await context.services.shed.query(question);
      return answer;
    } catch (err) {
      return `Failed to query shed: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

export const listSources: Tool = {
  name: 'listSources',
  description: 'List all documents in the Shed',

  routing: {
    patterns: [
      /^(list|show)\s+(shed|sources|documents)$/i,
      /^what('s| is)\s+in\s+(the\s+)?shed$/i,
    ],
    keywords: {
      verbs: ['list', 'show'],
      nouns: ['shed', 'sources', 'documents', 'library'],
    },
    priority: 70,
  },

  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },

  execute: async (args, context) => {
    const sources = context.services.shed.listSources();

    if (sources.length === 0) {
      return 'No documents in the Shed yet. Use "ingest <filepath>" to add documents.';
    }

    const lines = [`**Shed Library** (${sources.length} documents)\n`];
    for (const source of sources) {
      const date = new Date(source.ingestedAt).toLocaleDateString();
      lines.push(`- **${source.title}** (${source.chunkCount} chunks)`);
      lines.push(`  File: ${source.filename} | Added: ${date}`);
    }

    return lines.join('\n');
  },
};

export const shedTools: Tool[] = [ingestDocument, askShed, listSources];
