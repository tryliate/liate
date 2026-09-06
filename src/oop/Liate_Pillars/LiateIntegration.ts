import fs from 'fs/promises';
import path from 'path';
import { loadSession, saveSession } from '../../store/sessions';
import { getProjectSessionsDir, getProjectSessionsFile } from '../../store/paths';

/**
 * [I] - LiateIntegration (Memory, Storage, Sessions, DBs & Webhooks)
 */

import { LiateVectorStore, globalVectorStore, type VectorSearchResult, type IndexResult } from '../../store/vectors';

export interface LiateIntegrationConfig {
  memory?: string;
  session?: string;
  database?: string;
  webhook?: string;
  channel?: string;
  knowledge?: string;
  embedModel?: string;
  [key: string]: any;
}

export class LiateIntegration {
  public memory?: string;
  public session?: string;
  public database?: string;
  public webhook?: string;
  public channel?: string;
  public knowledge?: string;
  public embedModel?: string;
  public vectorStore: LiateVectorStore;
  public extra: Record<string, any> = {};

  constructor(config: string | LiateIntegrationConfig = {}) {
    this.vectorStore = globalVectorStore;
    if (typeof config === 'string') {
      this.memory = config;
      this.session = config;
    } else {
      this.memory = config.memory || config.session;
      this.session = config.session || config.memory;
      this.database = config.database;
      this.webhook = config.webhook;
      this.channel = config.channel;
      this.knowledge = config.knowledge;
      this.embedModel = config.embedModel || 'sarvam/embed-v1';
      for (const [k, v] of Object.entries(config)) {
        if (!['memory', 'session', 'database', 'webhook', 'channel', 'knowledge', 'embedModel'].includes(k)) {
          this.extra[k] = v;
        }
      }
    }
  }

  /**
   * Auto-index knowledge folder if specified in I.knowledge
   */
  async indexKnowledge(targetDir?: string): Promise<IndexResult | null> {
    const dir = targetDir || this.knowledge;
    if (!dir) return null;
    return await this.vectorStore.indexDirectory(dir);
  }

  /**
   * Search sovereign knowledge base for top semantic chunks
   */
  async searchKnowledge(query: string, topK: number = 3): Promise<VectorSearchResult> {
    return await this.vectorStore.search(query, topK);
  }

  toJSON() {
    return {
      memory: this.memory,
      session: this.session,
      ...(this.database ? { database: this.database } : {}),
      ...(this.webhook ? { webhook: this.webhook } : {}),
      ...(this.channel ? { channel: this.channel } : {}),
      ...(this.knowledge ? { knowledge: this.knowledge } : {}),
      ...(this.embedModel ? { embedModel: this.embedModel } : {}),
      ...this.extra
    };
  }
}


/**
 * Supporting Utility: LiateSessions (Multi-Turn Chat History Manager)
 */
export class LiateSessionHandle {
  constructor(public scope: string, public cwd: string = process.cwd()) {}

  async getMessages(): Promise<any[]> {
    return await loadSession(this.scope, this.cwd);
  }

  async appendMessage(role: 'user' | 'assistant' | 'system' | 'tool', content: string): Promise<void> {
    const history = await this.getMessages();
    history.push({ role, content });
    await saveSession(this.scope, history, this.cwd);
  }

  async clear(): Promise<void> {
    await saveSession(this.scope, [], this.cwd);
  }
}

export class LiateSessions {
  static get(scope: string, cwd: string = process.cwd()): LiateSessionHandle {
    return new LiateSessionHandle(scope, cwd);
  }

  static async list(cwd: string = process.cwd()): Promise<string[]> {
    const dir = getProjectSessionsDir(cwd);
    try {
      const files = await fs.readdir(dir);
      return files.filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, ''));
    } catch {
      return [];
    }
  }

  static async clearAll(cwd: string = process.cwd()): Promise<void> {
    const dir = getProjectSessionsDir(cwd);
    try {
      const files = await fs.readdir(dir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          await fs.unlink(path.join(dir, file));
        }
      }
    } catch {}
  }
}

/**
 * Supporting Utility: LiateMemory (Persistent Key-Value & Facts Retention)
 */
export class LiateMemory {
  private scope: string;
  private cwd: string;

  constructor(scope: string = 'default', cwd: string = process.cwd()) {
    this.scope = scope;
    this.cwd = cwd;
  }

  private getMemoryFilePath(): string {
    return path.join(this.cwd, '.liate', 'liate_memory', `${this.scope}.json`);
  }

  async getAll(): Promise<Record<string, any>> {
    try {
      const raw = await fs.readFile(this.getMemoryFilePath(), 'utf-8');
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  async get(key: string): Promise<any> {
    const all = await this.getAll();
    return all[key];
  }

  async set(key: string, value: any): Promise<void> {
    const all = await this.getAll();
    all[key] = value;
    const filePath = this.getMemoryFilePath();
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(all, null, 2), 'utf-8');
  }

  async delete(key: string): Promise<void> {
    const all = await this.getAll();
    delete all[key];
    const filePath = this.getMemoryFilePath();
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(all, null, 2), 'utf-8');
  }

  async clear(): Promise<void> {
    try {
      await fs.unlink(this.getMemoryFilePath());
    } catch {}
  }
}
