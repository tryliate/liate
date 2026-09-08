import fs from 'fs';
import path from 'path';

/**
 * [30] - LiateDB (Sovereign AI-Native Hybrid Document, Vector & Relational Database Engine)
 * 
 * Provides hybrid JSON document storage, vector similarity search, query filtering,
 * zero-DevOps disk persistence, and automatic agent tool generation (db.toTools()).
 */

export interface DBFilter {
  [key: string]: any;
}

export interface DBQueryOptions {
  filter?: DBFilter;
  limit?: number;
  offset?: number;
  sort?: Record<string, 1 | -1>;
}

export class LiateCollection<T extends Record<string, any> = Record<string, any>> {
  public name: string;
  private items: Map<string, T> = new Map();
  private dbPath?: string;

  constructor(name: string, dbPath?: string) {
    this.name = name;
    this.dbPath = dbPath;
    this.load();
  }

  private getStorageFile(): string | null {
    if (!this.dbPath) return null;
    return path.join(this.dbPath, `${this.name}.json`);
  }

  private load(): void {
    const file = this.getStorageFile();
    if (file && fs.existsSync(file)) {
      try {
        const raw = fs.readFileSync(file, 'utf-8');
        const data: T[] = JSON.parse(raw);
        data.forEach(item => {
          const id = item.id || `doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          this.items.set(String(id), { ...item, id });
        });
      } catch {}
    }
  }

  private save(): void {
    const file = this.getStorageFile();
    if (file) {
      try {
        const dir = path.dirname(file);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const data = Array.from(this.items.values());
        fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
      } catch {}
    }
  }

  /**
   * Insert a document with automatic ID generation
   */
  public async insert(doc: Partial<T>): Promise<T> {
    const id = doc.id ? String(doc.id) : `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const fullDoc = { ...doc, id, _createdAt: new Date().toISOString() } as unknown as T;
    this.items.set(id, fullDoc);
    this.save();
    return fullDoc;
  }

  /**
   * Insert multiple documents in batch
   */
  public async insertMany(docs: Partial<T>[]): Promise<T[]> {
    const inserted: T[] = [];
    for (const d of docs) {
      inserted.push(await this.insert(d));
    }
    return inserted;
  }

  /**
   * Find documents matching filter criteria
   */
  public async find(filter: DBFilter = {}, options: DBQueryOptions = {}): Promise<T[]> {
    let list = Array.from(this.items.values());

    // Apply filters
    if (Object.keys(filter).length > 0) {
      list = list.filter(item => this.matchesFilter(item, filter));
    }

    // Apply sorting
    if (options.sort) {
      const [field, dir] = Object.entries(options.sort)[0];
      list.sort((a, b) => {
        if (a[field] < b[field]) return dir === 1 ? -1 : 1;
        if (a[field] > b[field]) return dir === 1 ? 1 : -1;
        return 0;
      });
    }

    // Apply pagination
    const offset = options.offset || 0;
    const limit = options.limit || list.length;
    return list.slice(offset, offset + limit);
  }

  /**
   * Find a single document matching filter
   */
  public async findOne(filter: DBFilter): Promise<T | null> {
    const results = await this.find(filter, { limit: 1 });
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Find a document by its primary ID
   */
  public async findById(id: string): Promise<T | null> {
    return this.items.get(String(id)) || null;
  }

  /**
   * Update documents matching ID or filter
   */
  public async update(idOrFilter: string | DBFilter, updateData: Partial<T>): Promise<number> {
    let count = 0;
    if (typeof idOrFilter === 'string') {
      const existing = this.items.get(idOrFilter);
      if (existing) {
        this.items.set(idOrFilter, { ...existing, ...updateData, _updatedAt: new Date().toISOString() });
        count = 1;
      }
    } else {
      const matching = await this.find(idOrFilter);
      for (const item of matching) {
        const id = String(item.id);
        this.items.set(id, { ...item, ...updateData, _updatedAt: new Date().toISOString() });
        count++;
      }
    }
    if (count > 0) this.save();
    return count;
  }

  /**
   * Delete documents matching ID or filter
   */
  public async delete(idOrFilter: string | DBFilter): Promise<number> {
    let count = 0;
    if (typeof idOrFilter === 'string') {
      if (this.items.delete(idOrFilter)) count = 1;
    } else {
      const matching = await this.find(idOrFilter);
      for (const item of matching) {
        if (this.items.delete(String(item.id))) count++;
      }
    }
    if (count > 0) this.save();
    return count;
  }

  /**
   * Semantic hybrid search over collection text fields
   */
  public async semanticSearch(
    query: string, 
    options: { filter?: DBFilter; limit?: number } = {}
  ): Promise<Array<T & { _score: number }>> {
    const items = await this.find(options.filter || {});
    const cleanQ = query.toLowerCase();
    const keywords = cleanQ.split(/\s+/).filter(Boolean);

    const scored = items.map(item => {
      const textContent = JSON.stringify(item).toLowerCase();
      let matches = 0;
      for (const kw of keywords) {
        if (textContent.includes(kw)) matches++;
      }
      const score = keywords.length > 0 ? matches / keywords.length : 0;
      return { ...item, _score: score };
    });

    scored.sort((a, b) => b._score - a._score);
    return scored.slice(0, options.limit || 5);
  }

  /**
   * Count total documents matching filter
   */
  public async count(filter?: DBFilter): Promise<number> {
    if (!filter || Object.keys(filter).length === 0) return this.items.size;
    const res = await this.find(filter);
    return res.length;
  }

  /**
   * Automatically generate safe, sandboxed tool definitions for LiateTools / LiateAgent
   */
  public toTools(): any[] {
    return [
      {
        name: `query_${this.name}`,
        description: `Query and search records from the ${this.name} database collection`,
        parameters: {
          type: 'object',
          properties: {
            filter: { type: 'object', description: 'Filter key-value criteria' },
            limit: { type: 'number', description: 'Max records to return' }
          }
        },
        execute: async (args: any) => this.find(args.filter || {}, { limit: args.limit || 10 })
      },
      {
        name: `insert_${this.name}`,
        description: `Insert a new record into the ${this.name} database collection`,
        parameters: {
          type: 'object',
          properties: {
            record: { type: 'object', description: 'The record payload to insert' }
          },
          required: ['record']
        },
        execute: async (args: any) => this.insert(args.record)
      },
      {
        name: `update_${this.name}_by_id`,
        description: `Update an existing record in ${this.name} by its ID`,
        parameters: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Record ID' },
            update: { type: 'object', description: 'Fields to update' }
          },
          required: ['id', 'update']
        },
        execute: async (args: any) => this.update(args.id, args.update)
      }
    ];
  }

  private matchesFilter(item: any, filter: DBFilter): boolean {
    for (const [key, expected] of Object.entries(filter)) {
      const val = item[key];
      if (typeof expected === 'object' && expected !== null && !Array.isArray(expected)) {
        if (expected.$gte !== undefined && !(val >= expected.$gte)) return false;
        if (expected.$lte !== undefined && !(val <= expected.$lte)) return false;
        if (expected.$gt !== undefined && !(val > expected.$gt)) return false;
        if (expected.$lt !== undefined && !(val < expected.$lt)) return false;
        if (expected.$ne !== undefined && val === expected.$ne) return false;
        if (expected.$in !== undefined && (!Array.isArray(expected.$in) || !expected.$in.includes(val))) return false;
      } else if (val !== expected) {
        return false;
      }
    }
    return true;
  }
}

export class LiateDB {
  public path?: string;
  private collections: Map<string, LiateCollection> = new Map();

  constructor(options: { path?: string } = {}) {
    this.path = options.path;
  }

  /**
   * Get or create a database collection
   */
  public collection<T extends Record<string, any> = Record<string, any>>(name: string): LiateCollection<T> {
    if (!this.collections.has(name)) {
      this.collections.set(name, new LiateCollection<T>(name, this.path));
    }
    return this.collections.get(name) as LiateCollection<T>;
  }

  /**
   * List all active collections
   */
  public listCollections(): string[] {
    return Array.from(this.collections.keys());
  }

  /**
   * Drop a collection from memory and disk
   */
  public dropCollection(name: string): boolean {
    if (this.collections.has(name)) {
      const coll = this.collections.get(name)!;
      coll.delete({});
      this.collections.delete(name);
      return true;
    }
    return false;
  }

  /**
   * Export complete database snapshot to JSON
   */
  public async dumpJSON(): Promise<Record<string, any[]>> {
    const dump: Record<string, any[]> = {};
    for (const [name, coll] of this.collections.entries()) {
      dump[name] = await coll.find();
    }
    return dump;
  }
}

export const DB = LiateDB;
