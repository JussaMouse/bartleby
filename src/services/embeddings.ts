// src/services/embeddings.ts
import { Config } from '../config.js';
import { info, warn, debug } from '../utils/logger.js';

export class EmbeddingService {
  private config: Config;
  private cache = new Map<string, number[]>();
  private available = false;

  constructor(config: Config) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    try {
      await this.embed('test');
      this.available = true;
      info('EmbeddingService initialized');
    } catch (err) {
      warn('EmbeddingService: embeddings unavailable', { error: String(err) });
      this.available = false;
    }
  }

  isAvailable(): boolean {
    return this.available;
  }

  async embed(text: string): Promise<number[]> {
    const cached = this.cache.get(text);
    if (cached) return cached;

    // Build headers with optional API key
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.config.embeddings.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.embeddings.apiKey}`;
    }

    // Create AbortController for timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    try {
      const response = await fetch(`${this.config.embeddings.url}/embeddings`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: this.config.embeddings.model,
          input: text,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Embedding failed: ${response.status}`);
      }

      const data = await response.json() as { data: Array<{ embedding: number[] }> };
      const embedding = data.data[0].embedding;

      // Cache with simple LRU
      this.cache.set(text, embedding);
      if (this.cache.size > 1000) {
        const keys = Array.from(this.cache.keys());
        for (let i = 0; i < 100; i++) {
          this.cache.delete(keys[i]);
        }
      }

      return embedding;
    } catch (err) {
      clearTimeout(timeout);
      if ((err as Error).name === 'AbortError') {
        throw new Error('Embedding request timeout after 30s');
      }
      throw err;
    }
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map(t => this.embed(t)));
  }

  close(): void {
    this.cache.clear();
  }
}
