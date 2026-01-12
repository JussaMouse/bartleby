// src/tools/types.ts
import { ServiceContainer } from '../services/index.js';

export interface ToolRouting {
  /** Regex patterns for exact matching (Layer 1) */
  patterns?: RegExp[];

  /** Keywords for combinatorial matching (Layer 2) */
  keywords?: {
    verbs?: string[];
    nouns?: string[];
  };

  /** Example phrases for semantic matching (Layer 3) */
  examples?: string[];

  /** Priority hint (higher = checked first) */
  priority?: number;
}

export interface Tool {
  name: string;
  description: string;
  routing?: ToolRouting;
  parameters?: Record<string, unknown>;
  parseArgs?: (input: string, match: RegExpMatchArray | null) => Record<string, unknown>;
  execute: (args: Record<string, unknown>, context: ToolContext) => Promise<string>;
}

export interface ToolContext {
  input: string;
  services: ServiceContainer;
  match?: RegExpMatchArray;
}

export interface RouteResult {
  tool: string;
  args: Record<string, unknown>;
  match?: RegExpMatchArray;
  confidence: number;
  source: 'pattern' | 'keyword' | 'semantic' | 'llm';
}
