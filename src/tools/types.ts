// src/tools/types.ts
import { ServiceContainer } from '../services/index.js';
import type { z } from 'zod';

export type IntentClass =
  | 'workflow_reply'
  | 'workflow_start'
  | 'record_open'
  | 'collection_list'
  | 'mutation_create'
  | 'mutation_update'
  | 'mutation_delete'
  | 'system'
  | 'operator'
  | 'fallback';

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

  /** Lightweight routing role for precedence decisions */
  intentClass?: IntentClass;
}

export interface Tool {
  name: string;
  description: string;
  routing?: ToolRouting;
  parameters?: Record<string, unknown>;
  /** Zod schema for parameter validation (preferred over parameters) */
  schema?: z.ZodSchema;
  parseArgs?: (input: string, match: RegExpMatchArray | null) => Record<string, unknown>;
  /** Optional async check for context-dependent matching (e.g., pending state) */
  shouldHandle?: (input: string, context: ToolContext) => Promise<boolean>;
  execute: (args: Record<string, unknown>, context: ToolContext) => Promise<string | null>;
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
