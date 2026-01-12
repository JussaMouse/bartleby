// src/router/semantic.ts
import { EmbeddingService } from '../services/embeddings.js';
import { Tool } from '../tools/types.js';
import { cosineSimilarity, topK } from '../utils/math.js';
import { debug } from '../utils/logger.js';

interface ToolExample {
  tool: Tool;
  example: string;
  embedding?: number[];
}

export class SemanticMatcher {
  private embeddings: EmbeddingService;
  private examples: ToolExample[] = [];
  private initialized = false;

  constructor(embeddings: EmbeddingService) {
    this.embeddings = embeddings;
  }

  async initialize(tools: Tool[]): Promise<void> {
    if (!this.embeddings.isAvailable()) {
      debug('SemanticMatcher: embeddings not available, skipping');
      return;
    }

    // Collect examples from tools
    for (const tool of tools) {
      if (tool.routing?.examples) {
        for (const example of tool.routing.examples) {
          this.examples.push({ tool, example });
        }
      }
    }

    // Pre-compute embeddings
    try {
      for (const ex of this.examples) {
        ex.embedding = await this.embeddings.embed(ex.example);
      }
      this.initialized = true;
      debug('SemanticMatcher initialized', { examples: this.examples.length });
    } catch (err) {
      debug('SemanticMatcher initialization failed', { error: String(err) });
    }
  }

  async match(input: string, threshold = 0.75): Promise<{ tool: Tool; confidence: number } | null> {
    if (!this.initialized || this.examples.length === 0) {
      return null;
    }

    try {
      const inputEmbedding = await this.embeddings.embed(input);

      const scores = this.examples.map(ex => {
        if (!ex.embedding) return 0;
        return cosineSimilarity(inputEmbedding, ex.embedding);
      });

      const best = topK(this.examples, scores, 1)[0];

      if (best && best.score >= threshold) {
        debug('Semantic match', { tool: best.item.tool.name, score: best.score.toFixed(3) });
        return { tool: best.item.tool, confidence: best.score };
      }
    } catch (err) {
      debug('Semantic match failed', { error: String(err) });
    }

    return null;
  }
}
