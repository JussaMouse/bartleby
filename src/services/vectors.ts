// src/services/vectors.ts
import pkg from 'hnswlib-node';
const { HierarchicalNSW } = pkg;
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { Config, getDbPath, ensureDir } from '../config.js';
import { info, warn, debug } from '../utils/logger.js';

export interface VectorMetadata {
  id: string;
  type: string;      // 'shed_chunk', 'episode', etc.
  recordId: string;  // Reference to source record
  [key: string]: unknown;
}

export class VectorService {
  private index!: InstanceType<typeof HierarchicalNSW>;
  private metadata: Map<number, VectorMetadata> = new Map();
  private idToLabel: Map<string, number> = new Map();
  private nextLabel = 0;
  private dimensions: number;
  private indexPath: string;
  private metadataPath: string;

  constructor(private config: Config) {
    this.dimensions = config.embeddings.dimensions;
    const dbDir = path.dirname(getDbPath(config, 'vectors.hnsw'));
    ensureDir(dbDir);
    this.indexPath = getDbPath(config, 'vectors.hnsw');
    this.metadataPath = getDbPath(config, 'vectors-meta.json');
  }

  async initialize(): Promise<void> {
    this.index = new HierarchicalNSW('cosine', this.dimensions);

    if (fs.existsSync(this.indexPath) && fs.existsSync(this.metadataPath)) {
      try {
        this.index.readIndexSync(this.indexPath);
        this.loadMetadata();
        info('VectorService loaded', { vectors: this.metadata.size });
      } catch (err) {
        warn('Failed to load vector index, creating new', { error: String(err) });
        this.initializeNewIndex();
      }
    } else {
      this.initializeNewIndex();
      info('VectorService initialized (new index)');
    }
  }

  private initializeNewIndex(): void {
    // M=16, efConstruction=200 are good defaults
    // Can hold 100k vectors, will auto-resize if needed
    this.index.initIndex(100000, 16, 200, 100);
    this.metadata.clear();
    this.idToLabel.clear();
    this.nextLabel = 0;
  }

  async add(embedding: number[], metadata: Omit<VectorMetadata, 'id'>): Promise<string> {
    const id = uuidv4();
    const label = this.nextLabel++;

    this.index.addPoint(embedding, label);

    const fullMetadata: VectorMetadata = { ...metadata, id } as VectorMetadata;
    this.metadata.set(label, fullMetadata);
    this.idToLabel.set(id, label);

    // Save periodically
    if (this.nextLabel % 100 === 0) {
      this.save();
    }

    debug('Vector added', { id, type: metadata.type });
    return id;
  }

  async search(
    queryEmbedding: number[],
    k: number,
    filter?: { type?: string; [key: string]: unknown }
  ): Promise<Array<{ id: string; score: number; metadata: VectorMetadata }>> {
    if (this.metadata.size === 0) return [];

    // Search more candidates if filtering
    const searchK = filter ? Math.min(k * 3, this.metadata.size) : Math.min(k, this.metadata.size);
    const result = this.index.searchKnn(queryEmbedding, searchK);

    const matches: Array<{ id: string; score: number; metadata: VectorMetadata }> = [];

    for (let i = 0; i < result.neighbors.length && matches.length < k; i++) {
      const label = result.neighbors[i];
      const distance = result.distances[i];
      const meta = this.metadata.get(label);

      if (!meta) continue;

      // Apply filter
      if (filter) {
        let pass = true;
        for (const [key, value] of Object.entries(filter)) {
          if (meta[key] !== value) {
            pass = false;
            break;
          }
        }
        if (!pass) continue;
      }

      // HNSW cosine distance = 1 - similarity
      const score = 1 - distance;
      matches.push({ id: meta.id, score, metadata: meta });
    }

    return matches;
  }

  async delete(id: string): Promise<boolean> {
    const label = this.idToLabel.get(id);
    if (label === undefined) return false;

    this.index.markDelete(label);
    this.metadata.delete(label);
    this.idToLabel.delete(id);

    return true;
  }

  save(): void {
    try {
      this.index.writeIndexSync(this.indexPath);
      this.saveMetadata();
      debug('Vector index saved', { vectors: this.metadata.size });
    } catch (err) {
      warn('Failed to save vector index', { error: String(err) });
    }
  }

  private saveMetadata(): void {
    const data = {
      nextLabel: this.nextLabel,
      metadata: Array.from(this.metadata.entries()),
      idToLabel: Array.from(this.idToLabel.entries()),
    };
    fs.writeFileSync(this.metadataPath, JSON.stringify(data));
  }

  private loadMetadata(): void {
    const data = JSON.parse(fs.readFileSync(this.metadataPath, 'utf-8'));
    this.nextLabel = data.nextLabel;
    this.metadata = new Map(data.metadata);
    this.idToLabel = new Map(data.idToLabel);
  }

  getCount(): number {
    return this.metadata.size;
  }

  close(): void {
    this.save();
  }
}
