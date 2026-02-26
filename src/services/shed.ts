// src/services/shed.ts
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import pdf from 'pdf-parse';
import { convert as htmlToText } from 'html-to-text';
import { Config, resolvePath, getDbPath, ensureDir } from '../config.js';
import { info, warn, debug, error } from '../utils/logger.js';
import { EmbeddingService } from './embeddings.js';
import { VectorService } from './vectors.js';
import { LLMService } from './llm.js';

export interface ShedSource {
  id: string;
  filename: string;
  filepath: string;
  title: string;
  author?: string;
  sourceType?: string;
  sourceUrl?: string;
  ingestedAt: string;
  chunkCount?: number;
}

export interface ShedChunk {
  id: string;
  sourceId: string;
  chunkIndex: number;
  content: string;
  tokenCount?: number;
  embeddingId?: string;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  filepath TEXT NOT NULL,
  title TEXT,
  author TEXT,
  source_type TEXT,
  source_url TEXT,
  ingested_at TEXT DEFAULT (datetime('now')),
  metadata TEXT
);

CREATE TABLE IF NOT EXISTS chunks (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  token_count INTEGER,
  embedding_id TEXT,
  metadata TEXT,
  UNIQUE(source_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_chunks_source ON chunks(source_id);
`;

export class ShedService {
  private db: Database.Database;
  private shedPath: string;
  private sourcesPath: string;

  constructor(
    private config: Config,
    private embeddings: EmbeddingService,
    private vectors: VectorService,
    private llm: LLMService
  ) {
    const dbPath = getDbPath(config, 'shed.sqlite3');
    ensureDir(path.dirname(dbPath));

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    this.shedPath = resolvePath(config, 'shed');
    this.sourcesPath = path.join(this.shedPath, 'sources');
  }

  async initialize(): Promise<void> {
    this.db.exec(SCHEMA);
    ensureDir(this.sourcesPath);
    info('ShedService initialized', { path: this.shedPath });

  }

  // === Document Ingestion ===

  /**
   * Extract title and author from document content using LLM
   */
  private async extractMetadata(content: string, filename: string): Promise<{ title: string; author?: string }> {
    try {
      // Try to extract from first 2000 chars
      const excerpt = content.slice(0, 2000);

      const prompt = `Extract the title and author from this document excerpt. Return ONLY a JSON object with "title" and "author" fields (author optional).

Excerpt:
${excerpt}

Example response: {"title": "Deep Work", "author": "Cal Newport"}`;

      const response = await this.llm.chat([
        { role: 'user', content: prompt }
      ], { tier: 'fast' });

      // Try to parse JSON from response
      const jsonMatch = response.match(/\{[^}]+\}/);
      if (jsonMatch) {
        const metadata = JSON.parse(jsonMatch[0]);
        if (metadata.title) {
          return {
            title: metadata.title,
            author: metadata.author || undefined
          };
        }
      }
    } catch (err) {
      warn('Failed to extract metadata with LLM', { error: String(err) });
    }

    // Fallback to filename
    return { title: filename.replace(/\.[^.]+$/, '') };
  }

  async ingestDocument(filepath: string): Promise<ShedSource> {
    let content: string;
    let filename: string;
    let absolutePath: string;
    let sourceUrl: string | undefined;
    let ext: string;
    let title: string;
    let author: string | undefined;
    let originalPath: string | undefined; // Track original file to delete later

    // Check if URL
    if (filepath.startsWith('http://') || filepath.startsWith('https://')) {
      info('Fetching URL', { url: filepath });

      try {
        // Fetch web page with timeout
        const response = await fetch(filepath, {
          signal: AbortSignal.timeout(30000) // 30s timeout
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const html = await response.text();

        if (!html || html.trim().length === 0) {
          throw new Error('Retrieved empty content from URL');
        }

        info('URL fetched', { url: filepath, size: html.length });

        // Convert HTML to text
        try {
          content = htmlToText(html, {
            wordwrap: false,
            selectors: [
              { selector: 'a', options: { ignoreHref: true } },
              { selector: 'img', format: 'skip' },
              { selector: 'script', format: 'skip' },
              { selector: 'style', format: 'skip' },
              { selector: 'nav', format: 'skip' },
              { selector: 'footer', format: 'skip' },
            ]
          });

          if (!content || content.trim().length === 0) {
            throw new Error('HTML conversion resulted in empty content');
          }

          info('HTML converted to text', { chars: content.length });

        } catch (conversionError) {
          error('Failed to convert HTML to text', { error: String(conversionError) });
          throw new Error(`Failed to convert HTML to text: ${conversionError instanceof Error ? conversionError.message : String(conversionError)}`);
        }

        // Generate filename from URL
        const urlObj = new URL(filepath);
        const hostname = urlObj.hostname.replace(/^www\./, '');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        filename = `${hostname}-${timestamp}.md`;
        absolutePath = path.join(this.sourcesPath, filename);
        sourceUrl = filepath;
        ext = '.md';

        // Extract title from HTML title tag or use URL
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        title = titleMatch ? titleMatch[1].trim() : urlObj.hostname;

        // Save content as markdown file for reference
        try {
          const markdownContent = `# ${title}\n\nSource: ${filepath}\nFetched: ${new Date().toLocaleString()}\n\n---\n\n${content}`;
          fs.writeFileSync(absolutePath, markdownContent, 'utf-8');
          info('Saved web content to file', { path: absolutePath });
        } catch (saveError) {
          warn('Failed to save web content to file', { error: String(saveError) });
          // Continue anyway - we have the content in memory
        }

      } catch (fetchError) {
        error('Failed to fetch URL', { url: filepath, error: String(fetchError) });

        if (fetchError instanceof Error) {
          if (fetchError.name === 'AbortError') {
            throw new Error(`Request timed out after 30 seconds: ${filepath}`);
          } else if (fetchError.message.includes('fetch failed')) {
            throw new Error(`Network error: Cannot reach ${filepath}. Check your internet connection.`);
          }
        }

        throw new Error(`Failed to fetch URL: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`);
      }

    } else {
      // Handle local file
      absolutePath = path.isAbsolute(filepath)
        ? filepath
        : path.join(this.sourcesPath, filepath);

      if (!fs.existsSync(absolutePath)) {
        throw new Error(`File not found: ${absolutePath}`);
      }

      filename = path.basename(absolutePath);
      ext = path.extname(filename).toLowerCase();

      // Read content based on file type
      if (ext === '.md' || ext === '.txt') {
        content = fs.readFileSync(absolutePath, 'utf-8');

        // Extract title from markdown heading or use filename
        const titleMatch = content.match(/^#\s+(.+)$/m);
        title = titleMatch ? titleMatch[1].trim() : filename.replace(/\.[^.]+$/, '');

      } else if (ext === '.pdf') {
        try {
          const dataBuffer = fs.readFileSync(absolutePath);
          const pdfData = await pdf(dataBuffer);
          content = pdfData.text;
          info('PDF parsed', { pages: pdfData.numpages, chars: content.length });

          // Extract metadata using LLM
          const metadata = await this.extractMetadata(content, filename);
          title = metadata.title;
          author = metadata.author;

          // Generate better filename: "Title - Author.md" or "Title.md"
          const sanitize = (str: string) => str.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, ' ').trim();
          const newFilename = author
            ? `${sanitize(title)} - ${sanitize(author)}.md`
            : `${sanitize(title)}.md`;

          // Save as markdown in sources directory
          const mdPath = path.join(this.sourcesPath, newFilename);
          const markdownContent = `# ${title}${author ? `\n**Author:** ${author}` : ''}\n\n---\n\n${content}`;
          fs.writeFileSync(mdPath, markdownContent, 'utf-8');

          // Update paths to use the markdown file
          originalPath = absolutePath; // Save original to delete later
          absolutePath = mdPath;
          filename = newFilename;
          ext = '.md';

          info('PDF converted to markdown', { originalFile: path.basename(originalPath), newFile: filename });

        } catch (pdfError) {
          error('Failed to parse PDF', { file: filename, error: String(pdfError) });
          throw new Error(`Failed to parse PDF: ${pdfError instanceof Error ? pdfError.message : String(pdfError)}`);
        }
      } else {
        throw new Error(`Unsupported file type: ${ext}. Supported: .md, .txt, .pdf, or URLs`);
      }
    }

    // Check if already ingested (by filepath or URL)
    const checkPath = sourceUrl || absolutePath;
    const existing = this.db.prepare(
      'SELECT * FROM sources WHERE filepath = ? OR source_url = ?'
    ).get(checkPath, checkPath) as any;

    if (existing) {
      info('Document already ingested, updating', { filename });
      await this.deleteSource(existing.id);
    }

    // Validate content before proceeding
    if (!content || content.trim().length === 0) {
      throw new Error('Cannot ingest document: content is empty');
    }

    // Create source record
    const sourceId = uuidv4();
    this.db.prepare(`
      INSERT INTO sources (id, filename, filepath, title, source_type, source_url)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(sourceId, filename, absolutePath, title, ext.slice(1), sourceUrl || null);

    // Chunk the document
    const chunks = this.chunkDocument(content);
    info('Document chunked', { filename, chunks: chunks.length });

    // Embed and store chunks
    for (let i = 0; i < chunks.length; i++) {
      const chunkId = uuidv4();
      const chunkContent = chunks[i];

      // Get embedding
      const embedding = await this.embeddings.embed(chunkContent);

      // Store in vector index
      const embeddingId = await this.vectors.add(embedding, {
        type: 'shed_chunk',
        recordId: chunkId,
        sourceId,
        chunkIndex: i,
      });

      // Store chunk
      this.db.prepare(`
        INSERT INTO chunks (id, source_id, chunk_index, content, token_count, embedding_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(chunkId, sourceId, i, chunkContent, this.estimateTokens(chunkContent), embeddingId);
    }

    info('Document ingested', { filename, title, chunks: chunks.length, sourceUrl });

    // Delete original PDF/EPUB after successful ingestion
    if (originalPath && fs.existsSync(originalPath)) {
      try {
        fs.unlinkSync(originalPath);
        info('Deleted original file after conversion', { file: path.basename(originalPath) });
      } catch (deleteError) {
        warn('Failed to delete original file', { file: originalPath, error: String(deleteError) });
        // Non-fatal - continue
      }
    }

    return {
      id: sourceId,
      filename,
      filepath: absolutePath,
      title,
      author,
      sourceType: ext.slice(1),
      sourceUrl,
      ingestedAt: new Date().toISOString(),
      chunkCount: chunks.length,
    };
  }

  // === Chunking ===

  private chunkDocument(content: string, maxTokens = 512, overlap = 50): string[] {
    const paragraphs = content.split(/\n\n+/);
    const chunks: string[] = [];

    let currentChunk = '';
    let currentTokens = 0;

    for (const para of paragraphs) {
      const paraTokens = this.estimateTokens(para);

      if (currentTokens + paraTokens > maxTokens && currentChunk) {
        chunks.push(currentChunk.trim());

        // Start new chunk with overlap
        const words = currentChunk.split(/\s+/);
        const overlapWords = words.slice(-overlap);
        currentChunk = overlapWords.join(' ') + '\n\n' + para;
        currentTokens = this.estimateTokens(currentChunk);
      } else {
        currentChunk += (currentChunk ? '\n\n' : '') + para;
        currentTokens += paraTokens;
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  private estimateTokens(text: string): number {
    // Rough estimate: ~4 chars per token for English
    return Math.ceil(text.length / 4);
  }

  // === RAG Query ===

  async query(question: string, topK = 3): Promise<string> {
    // Get query embedding
    const queryEmbedding = await this.embeddings.embed(question);

    // Find similar chunks (reduced to 3 for faster responses)
    const results = await this.vectors.search(queryEmbedding, topK, {
      type: 'shed_chunk',
    });

    if (results.length === 0) {
      return "I don't have any documents that seem relevant to that question. Try ingesting some documents first with 'ingest <filepath>'.";
    }

    // Build context from chunks
    const contextParts: string[] = [];
    for (const result of results) {
      const chunk = this.getChunk(result.metadata.recordId as string);
      if (chunk) {
        const source = this.getSource(chunk.sourceId);
        contextParts.push(`[Source: ${source?.title || 'Unknown'}]\n${chunk.content}`);
      }
    }

    const context = contextParts.join('\n\n---\n\n');

    info('Shed query', {
      question: question.substring(0, 50),
      chunks: results.length,
      contextLength: context.length,
    });

    // Generate answer with timeout using streaming (fixes connection termination bug)
    const startTime = Date.now();
    info('Starting LLM streaming call for shed query');
    try {
      const streamPromise = (async () => {
        const stream = this.llm.chatStream([
          {
            role: 'system',
            content: `You are a helpful assistant. Answer the question based ONLY on the provided context. If the context doesn't contain enough information to answer, say so. Always cite your sources using [Source: title] format.`,
          },
          {
            role: 'user',
            content: `Context:\n${context}\n\n---\n\nQuestion: ${question}`,
          },
        ], { tier: 'fast' });

        let fullResponse = '';
        for await (const chunk of stream) {
          fullResponse += chunk; // chatStream yields delta chunks
        }
        return fullResponse;
      })();

      const response = await Promise.race([
        streamPromise,
        new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error('LLM query timeout after 60s')), 60000)
        ),
      ]);

      const duration = Date.now() - startTime;
      info('LLM streaming call completed', { duration: `${duration}ms`, responseLength: response.length });
      return response;
    } catch (err) {
      const duration = Date.now() - startTime;
      if (err instanceof Error && err.message.includes('timeout')) {
        warn('Shed query timeout', { question: question.substring(0, 50), duration: `${duration}ms` });
        return 'The query took too long to process. Try asking a more specific question.';
      }
      error('Shed query failed', {
        question: question.substring(0, 50),
        duration: `${duration}ms`,
        error: String(err),
        errorType: err instanceof Error ? err.constructor.name : typeof err
      });
      throw err;
    }
  }

  // === CRUD ===

  getSource(id: string): ShedSource | null {
    const row = this.db.prepare('SELECT * FROM sources WHERE id = ?').get(id) as any;
    return row ? this.rowToSource(row) : null;
  }

  getChunk(id: string): ShedChunk | null {
    const row = this.db.prepare('SELECT * FROM chunks WHERE id = ?').get(id) as any;
    return row ? this.rowToChunk(row) : null;
  }

  listSources(): ShedSource[] {
    const rows = this.db.prepare('SELECT * FROM sources ORDER BY ingested_at DESC').all() as any[];
    return rows.map(r => this.rowToSource(r));
  }

  async deleteSource(id: string): Promise<boolean> {
    // Delete vectors for all chunks
    const chunks = this.db.prepare('SELECT embedding_id FROM chunks WHERE source_id = ?').all(id) as any[];
    for (const chunk of chunks) {
      if (chunk.embedding_id) {
        await this.vectors.delete(chunk.embedding_id);
      }
    }

    // Delete from database (cascades to chunks)
    const result = this.db.prepare('DELETE FROM sources WHERE id = ?').run(id);
    return result.changes > 0;
  }

  // === Helpers ===

  private rowToSource(row: any): ShedSource {
    const chunkCount = this.db.prepare(
      'SELECT COUNT(*) as count FROM chunks WHERE source_id = ?'
    ).get(row.id) as { count: number };

    return {
      id: row.id,
      filename: row.filename,
      filepath: row.filepath,
      title: row.title,
      author: row.author,
      sourceType: row.source_type,
      sourceUrl: row.source_url,
      ingestedAt: row.ingested_at,
      chunkCount: chunkCount.count,
    };
  }

  private rowToChunk(row: any): ShedChunk {
    return {
      id: row.id,
      sourceId: row.source_id,
      chunkIndex: row.chunk_index,
      content: row.content,
      tokenCount: row.token_count,
      embeddingId: row.embedding_id,
    };
  }

  close(): void {
    this.db.close();
  }
}
