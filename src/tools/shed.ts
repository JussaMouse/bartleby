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
    examples: [
      'ingest notes.md',
      'ingest https://example.com/article +visa-project #immigration #legal',
      'add to shed article.txt #research'
    ],
    priority: 80,
  },

  parameters: {
    type: 'object',
    properties: {
      filepath: { type: 'string', description: 'Path to the document file or URL' },
      projects: { type: 'array', items: { type: 'string' }, description: 'Project names (prefixed with +)' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Tags (prefixed with #)' },
    },
    required: ['filepath'],
  },

  parseArgs: (input, match) => {
    let rawInput = '';
    if (match) {
      rawInput = match[match.length - 1]?.trim() || '';
    } else {
      rawInput = input.replace(/^(ingest|add\s+to\s+shed|import\s+(document|file))\s*/i, '').trim();
    }

    // Extract projects (+project-name) and tags (#tag-name)
    const projects: string[] = [];
    const tags: string[] = [];

    // Match all +word patterns
    const projectMatches = rawInput.matchAll(/\+([a-zA-Z0-9_-]+)/g);
    for (const match of projectMatches) {
      projects.push(match[1]);
    }

    // Match all #word patterns
    const tagMatches = rawInput.matchAll(/#([a-zA-Z0-9_-]+)/g);
    for (const match of tagMatches) {
      tags.push(match[1]);
    }

    // Remove projects and tags from filepath
    const filepath = rawInput
      .replace(/\+[a-zA-Z0-9_-]+/g, '')
      .replace(/#[a-zA-Z0-9_-]+/g, '')
      .trim();

    return { filepath, projects, tags };
  },

  execute: async (args, context) => {
    const { filepath, projects = [], tags = [] } = args as {
      filepath: string;
      projects?: string[];
      tags?: string[];
    };

    if (!filepath) {
      return 'Please provide a file path or URL. Examples:\n  ingest notes.md\n  ingest https://example.com/article +project #tag\nSupported: .md, .txt, .pdf, or URLs';
    }

    try {
      const source = await context.services.shed.ingestDocument(filepath);

      // Create a Garden page for this media
      const title = source.title || source.filename.replace(/\.[^.]+$/, '');
      const sourceInfo = source.sourceUrl
        ? `URL: ${source.sourceUrl}\nSaved as: ${source.filename}`
        : `File: ${source.filename}`;

      // Build tags array: always include 'media', plus user-specified tags
      const allTags = ['media', ...tags];

      const mediaPage = context.services.garden.create({
        type: 'media',
        title,
        status: 'active',
        tags: allTags,
        content: `${sourceInfo}\nIngested: ${new Date(source.ingestedAt).toLocaleDateString()}\nChunks: ${source.chunkCount}\n\nUse \`ask shed <question>\` to query this document.`,
        metadata: {
          shed_source_id: source.id,
          filename: source.filename,
          source_url: source.sourceUrl,
          chunk_count: source.chunkCount,
          projects: projects.length > 0 ? projects : undefined,
        },
      });

      // Link to projects if specified
      for (const projectSlug of projects) {
        // Find project by slug (case-insensitive match)
        const projectPages = context.services.garden.getByType('project');
        const project = projectPages.find(p =>
          p.title.toLowerCase().replace(/\s+/g, '-') === projectSlug.toLowerCase()
        );

        if (project) {
          // Link the media page to the project
          context.services.garden.update(mediaPage.id, {
            content: mediaPage.content + `\n\nProject: [[${project.title}]]`,
          });
        }
      }

      const sourceDisplay = source.sourceUrl ? `\n  URL: ${source.sourceUrl}` : '';
      const metadataDisplay =
        (projects.length > 0 ? `\n  Projects: ${projects.map(p => '+' + p).join(' ')}` : '') +
        (tags.length > 0 ? `\n  Tags: ${tags.map(t => '#' + t).join(' ')}` : '');

      return `✓ Ingested: "${source.title}"${sourceDisplay}\n  Chunks: ${source.chunkCount}\n  Saved as: ${source.filename}${metadataDisplay}\n  Page created: open "${mediaPage.title}"`;
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
