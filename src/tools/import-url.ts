// src/tools/import-url.ts
import { Tool } from './types.js';
import { htmlToText } from 'html-to-text';

/**
 * Import a web page from URL
 *
 * Fetches the URL, extracts text content, and saves as a note.
 */
export const importUrl: Tool = {
  name: 'importUrl',
  description: 'Import a web page from URL',

  routing: {
    patterns: [
      /^import\s+url\s+(.+)$/i,
      /^import\s+(https?:\/\/.+)$/i,
      /^save\s+(https?:\/\/.+)$/i,
    ],
    keywords: {
      verbs: ['import', 'save', 'fetch'],
      nouns: ['url', 'webpage', 'website', 'link'],
    },
    examples: [
      'import url https://example.com',
      'import https://example.com/article',
      'save https://blog.example.com/post',
    ],
    priority: 75,
  },

  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'URL to import',
      },
      title: {
        type: 'string',
        description: 'Optional title for the note',
      },
    },
    required: ['url'],
  },

  parseArgs: (input, match) => {
    let url = '';
    let title = '';

    if (match) {
      // Extract URL from match
      url = match[1]?.trim() || '';
    } else {
      // Parse from input
      const urlMatch = input.match(/(https?:\/\/[^\s]+)/i);
      if (urlMatch) {
        url = urlMatch[1];
      }
    }

    // Extract optional title after URL
    const titleMatch = input.match(/(?:as|title:?)\s+"([^"]+)"/i);
    if (titleMatch) {
      title = titleMatch[1];
    }

    return { url, title };
  },

  execute: async (args, context) => {
    const { garden } = context.services;
    const { url, title } = args as { url: string; title?: string };

    if (!url) {
      return 'Please provide a URL. Example:\n  import url https://example.com';
    }

    // Validate URL
    try {
      new URL(url);
    } catch (err) {
      return `Invalid URL: ${url}`;
    }

    try {
      // Fetch the URL
      const response = await fetch(url);

      if (!response.ok) {
        return `Failed to fetch URL: ${response.status} ${response.statusText}`;
      }

      const html = await response.text();

      // Extract text content from HTML
      const text = htmlToText(html, {
        wordwrap: 80,
        selectors: [
          // Remove scripts, styles, nav, footer, ads
          { selector: 'script', format: 'skip' },
          { selector: 'style', format: 'skip' },
          { selector: 'nav', format: 'skip' },
          { selector: 'footer', format: 'skip' },
          { selector: '.ad', format: 'skip' },
          { selector: '#ad', format: 'skip' },
          // Prioritize main content
          { selector: 'article', options: { leadingLineBreaks: 2, trailingLineBreaks: 2 } },
          { selector: 'main', options: { leadingLineBreaks: 2, trailingLineBreaks: 2 } },
          { selector: 'h1', options: { uppercase: false, leadingLineBreaks: 2 } },
          { selector: 'h2', options: { uppercase: false, leadingLineBreaks: 2 } },
          { selector: 'h3', options: { uppercase: false, leadingLineBreaks: 2 } },
        ],
      });

      // Extract title from HTML if not provided
      let recordTitle = title;
      if (!recordTitle) {
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (titleMatch) {
          recordTitle = titleMatch[1].trim();
          // Clean up common title suffixes
          recordTitle = recordTitle.replace(/\s*[-|]\s*[^-|]+$/, '');
        } else {
          // Use domain as fallback
          const urlObj = new URL(url);
          recordTitle = urlObj.hostname;
        }
      }

      // Limit content size
      const maxLength = 10000;
      const truncated = text.length > maxLength;
      const content = truncated
        ? text.substring(0, maxLength) + '\n\n[... content truncated, visit URL for full article]'
        : text;

      // Build record content
      const recordContent = `Source: ${url}\nImported: ${new Date().toISOString()}\n\n---\n\n${content}`;

      // Create note record
      const record = garden.create({
        type: 'note',
        title: recordTitle,
        content: recordContent,
        status: 'active',
      });

      // Store source URL in metadata (if Garden supports it)
      const db = garden.getDatabase();
      db.prepare('UPDATE garden_records SET source_file = ? WHERE id = ?').run(url, record.id);

      return `✓ Imported web page: "${recordTitle}"\n\nSource: ${url}\nContent: ${text.length} characters${truncated ? ' (truncated)' : ''}\n\nSaved as note: "${record.title}"`;
    } catch (err) {
      return `Error importing URL: ${String(err)}`;
    }
  },
};

/**
 * Export URL import tools
 */
export const urlImportTools: Tool[] = [importUrl];
