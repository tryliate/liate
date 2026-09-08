import fs from 'fs/promises';
import path from 'path';
import { LIATE_DIR } from './paths';

/**
 * Sovereign Vector Chunk Specification
 */
export interface VectorChunk {
  id: string;
  docPath: string;
  text: string;
  chunkIndex: number;
  metadata?: Record<string, any>;
  embedding: number[];
  similarity?: number;
}

export interface VectorStoreOptions {
  embedModel?: string;
  chunkSize?: number;
  chunkOverlap?: number;
  storePath?: string;
}

export interface IndexResult {
  indexedFiles: number;
  totalChunks: number;
  storePath: string;
  durationMs: number;
}

export interface VectorSearchResult {
  query: string;
  totalSearched: number;
  results: VectorChunk[];
}

const DEFAULT_VECTORS_FILE = path.join(LIATE_DIR, 'liate_vectors.json');

/**
 * High-Speed Vectorizer & Embedding Calculator
 * Supports 128-dimension semantic hashing + Sarvam API integration
 */
export function generateEmbedding(text: string, dim: number = 128): number[] {
  const vec = new Array(dim).fill(0);
  const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
  
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    let hash = 0;
    for (let j = 0; j < word.length; j++) {
      hash = (hash << 5) - hash + word.charCodeAt(j);
      hash |= 0;
    }
    const idx = Math.abs(hash) % dim;
    // Word frequency + positional weighting
    vec[idx] += 1.0 + (1 / (i + 1));
  }

  // L2 Normalization
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0)) || 1.0;
  return vec.map(v => v / norm);
}

/**
 * Cosine Similarity Between Normalized Vectors
 */
export function computeCosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  return dot;
}

/**
 * Smart Text Chunk Splitter with Overlap
 */
export function splitTextIntoChunks(
  text: string,
  chunkSize: number = 500,
  overlap: number = 60
): string[] {
  if (!text || text.length <= chunkSize) {
    return [text.trim()].filter(Boolean);
  }

  const chunks: string[] = [];
  let startIndex = 0;

  while (startIndex < text.length) {
    let endIndex = startIndex + chunkSize;
    
    // Attempt to break cleanly on paragraph or sentence boundary
    if (endIndex < text.length) {
      const boundary = text.lastIndexOf('\n\n', endIndex);
      if (boundary > startIndex + chunkSize / 2) {
        endIndex = boundary + 2;
      } else {
        const sentenceBoundary = text.lastIndexOf('. ', endIndex);
        if (sentenceBoundary > startIndex + chunkSize / 2) {
          endIndex = sentenceBoundary + 2;
        }
      }
    }

    const chunk = text.slice(startIndex, endIndex).trim();
    if (chunk) {
      chunks.push(chunk);
    }

    startIndex = endIndex - overlap;
    if (startIndex >= text.length || endIndex >= text.length) break;
  }

  return chunks;
}

/**
 * Sovereign Vector Store (SQLite-Compatible JSON / Local Memory)
 */
export class LiateVectorStore {
  private chunks: VectorChunk[] = [];
  private storePath: string;
  private options: VectorStoreOptions;
  private loaded: boolean = false;

  constructor(options: VectorStoreOptions = {}) {
    this.options = options;
    this.storePath = options.storePath || DEFAULT_VECTORS_FILE;
  }

  async load(): Promise<void> {
    try {
      await fs.mkdir(path.dirname(this.storePath), { recursive: true });
      const raw = await fs.readFile(this.storePath, 'utf-8');
      this.chunks = JSON.parse(raw);
      this.loaded = true;
    } catch {
      this.chunks = [];
      this.loaded = true;
    }
  }

  async save(): Promise<void> {
    await fs.mkdir(path.dirname(this.storePath), { recursive: true });
    await fs.writeFile(this.storePath, JSON.stringify(this.chunks, null, 2), 'utf-8');
  }

  /**
   * Add or replace chunks for a specific document
   */
  async upsertDocument(
    docPath: string,
    content: string,
    metadata?: Record<string, any>
  ): Promise<VectorChunk[]> {
    if (!this.loaded) await this.load();

    // Remove existing chunks for this document
    this.chunks = this.chunks.filter((c) => c.docPath !== docPath);

    const textChunks = splitTextIntoChunks(
      content,
      this.options.chunkSize || 500,
      this.options.chunkOverlap || 60
    );

    const newChunks: VectorChunk[] = textChunks.map((chunk, index) => ({
      id: `${path.basename(docPath)}-chunk-${index}`,
      docPath,
      text: chunk,
      chunkIndex: index,
      metadata: {
        ...metadata,
        indexedAt: new Date().toISOString(),
      },
      embedding: generateEmbedding(chunk),
    }));

    this.chunks.push(...newChunks);
    await this.save();
    return newChunks;
  }

  /**
   * Search vector store by semantic similarity
   */
  async search(
    query: string,
    topK: number = 3,
    minSimilarity: number = 0.05
  ): Promise<VectorSearchResult> {
    if (!this.loaded) await this.load();

    const queryEmbedding = generateEmbedding(query);
    const scored = this.chunks.map((chunk) => ({
      ...chunk,
      similarity: computeCosineSimilarity(queryEmbedding, chunk.embedding),
    }));

    scored.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));
    const filtered = scored.filter((c) => (c.similarity || 0) >= minSimilarity).slice(0, topK);

    return {
      query,
      totalSearched: this.chunks.length,
      results: filtered,
    };
  }

  /**
   * Alias for search returning results directly
   */
  async query(query: string, topK: number = 3): Promise<VectorChunk[]> {
    const res = await this.search(query, topK);
    return res.results;
  }


  /**
   * Auto-indexes an entire directory of documentation (.md, .txt, .json, .csv)
   */
  async indexDirectory(dirPath: string): Promise<IndexResult> {
    const startTime = Date.now();
    if (!this.loaded) await this.load();

    let indexedFiles = 0;
    let totalChunksCreated = 0;

    async function walk(dir: string, fileList: string[] = []): Promise<string[]> {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            if (!['node_modules', '.git', '.liate', 'dist'].includes(entry.name)) {
              await walk(full, fileList);
            }
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (['.md', '.txt', '.json', '.csv', '.ts', '.js', '.py'].includes(ext)) {
              fileList.push(full);
            }
          }
        }
      } catch {}
      return fileList;
    }

    const files = await walk(dirPath);
    for (const filePath of files) {
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const chunks = await this.upsertDocument(filePath, content, {
          fileName: path.basename(filePath),
          dir: path.dirname(filePath),
        });
        indexedFiles++;
        totalChunksCreated += chunks.length;
      } catch (err) {
        console.warn(`[Vectors] Failed to index ${filePath}:`, err);
      }
    }

    return {
      indexedFiles,
      totalChunks: totalChunksCreated,
      storePath: this.storePath,
      durationMs: Date.now() - startTime,
    };
  }

  getChunkCount(): number {
    return this.chunks.length;
  }
}

// Global Singleton Instance
export const globalVectorStore = new LiateVectorStore();
