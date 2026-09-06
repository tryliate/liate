import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { LiateContext } from '../Liate_AI/LiateContext';

/**
 * [36] - LiateKey (Sovereign API Key Vault, Multi-Key Pool & BYOK Manager)
 * 
 * Provides AES-256-GCM encrypted local vault, multi-key round-robin rotation,
 * 429 rate-limit cooldowns, multi-tenant Bring-Your-Own-Key (BYOK) resolution,
 * and automatic leak masking.
 */

export interface KeyPoolOptions {
  strategy?: 'round-robin' | 'random' | 'least-used';
  cooldownMsOn429?: number; // Default 60000ms (1 min)
}

export interface KeyRecord {
  key: string;
  usageCount: number;
  lastUsed: number;
  cooledDownUntil: number;
}

export interface VaultHeader {
  version: number;
  algorithm: 'aes-256-gcm';
  salt: string;
  iv: string;
  authTag: string;
  data: string;
}

export class LiateKey {
  private static pools: Map<string, KeyRecord[]> = new Map();
  private static poolIndices: Map<string, number> = new Map();
  private static poolOptions: Map<string, KeyPoolOptions> = new Map();
  private vaultPath: string;

  constructor(vaultPath: string = '.liate/keys.vault') {
    this.vaultPath = vaultPath;
  }

  /**
   * Add a pool of multiple API keys for a provider (e.g. 'sarvam', 'omniroute', 'openai')
   */
  public addPool(
    provider: string, 
    keys: string | string[], 
    options: KeyPoolOptions = {}
  ): this {
    const canonical = provider.toLowerCase().trim();
    const keyList = Array.isArray(keys) ? keys : [keys];
    
    const records: KeyRecord[] = keyList.map(k => ({
      key: k.trim(),
      usageCount: 0,
      lastUsed: 0,
      cooledDownUntil: 0
    }));

    LiateKey.pools.set(canonical, records);
    LiateKey.poolIndices.set(canonical, 0);
    LiateKey.poolOptions.set(canonical, {
      strategy: options.strategy || 'round-robin',
      cooldownMsOn429: options.cooldownMsOn429 || 60000
    });

    return this;
  }

  /**
   * Get an active, non-rate-limited API key for a provider
   */
  public getKey(provider: string): string {
    const canonical = provider.toLowerCase().trim();

    // 1. Check for Tenant-Scoped BYOK in active LiateContext
    const ctx = LiateContext.current();
    const tenantKey = ctx.get<string>(`apiKey_${canonical}`) || ctx.get<string>('tenantKey');
    if (tenantKey) {
      return tenantKey;
    }

    // 2. Resolve from Key Pool
    const pool = LiateKey.pools.get(canonical);
    if (!pool || pool.length === 0) {
      // Fallback to environment variable
      const envKey = process.env[`${canonical.toUpperCase()}_API_KEY`];
      return envKey || '';
    }

    const now = Date.now();
    const available = pool.filter(r => r.cooledDownUntil <= now);
    const candidatePool = available.length > 0 ? available : pool;

    const currentIdx = LiateKey.poolIndices.get(canonical) || 0;
    const selected = candidatePool[currentIdx % candidatePool.length];
    
    selected.usageCount++;
    selected.lastUsed = now;
    LiateKey.poolIndices.set(canonical, (currentIdx + 1) % candidatePool.length);

    return selected.key;
  }

  /**
   * Mark a key as rate-limited (429) to put it into automatic cooldown
   */
  public markRateLimited(provider: string, key: string, cooldownMs?: number): void {
    const canonical = provider.toLowerCase().trim();
    const pool = LiateKey.pools.get(canonical);
    if (!pool) return;

    const opts = LiateKey.poolOptions.get(canonical);
    const duration = cooldownMs || opts?.cooldownMsOn429 || 60000;
    const now = Date.now();

    const record = pool.find(r => r.key === key);
    if (record) {
      record.cooledDownUntil = now + duration;
    }
  }

  /**
   * Static helper: Get current active key for provider (with BYOK context awareness)
   */
  public static current(provider: string): string {
    const instance = new LiateKey();
    return instance.getKey(provider);
  }

  /**
   * Save encrypted keys securely to disk using AES-256-GCM
   */
  public async saveSecure(
    keysMap: Record<string, string | string[]>, 
    masterSecret: string
  ): Promise<void> {
    const salt = crypto.randomBytes(16);
    const key = crypto.scryptSync(masterSecret, salt, 32);
    const iv = crypto.randomBytes(12);

    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const plaintext = JSON.stringify(keysMap);
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    const payload: VaultHeader = {
      version: 1,
      algorithm: 'aes-256-gcm',
      salt: salt.toString('hex'),
      iv: iv.toString('hex'),
      authTag,
      data: encrypted
    };

    await fs.mkdir(path.dirname(this.vaultPath), { recursive: true });
    await fs.writeFile(this.vaultPath, JSON.stringify(payload, null, 2), 'utf-8');
  }

  /**
   * Unlock and load keys from encrypted vault on disk
   */
  public async unlock(masterSecret: string): Promise<Record<string, string | string[]>> {
    const raw = await fs.readFile(this.vaultPath, 'utf-8');
    const header: VaultHeader = JSON.parse(raw);

    const salt = Buffer.from(header.salt, 'hex');
    const iv = Buffer.from(header.iv, 'hex');
    const authTag = Buffer.from(header.authTag, 'hex');
    const key = crypto.scryptSync(masterSecret, salt, 32);

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(header.data, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    const keysMap: Record<string, string | string[]> = JSON.parse(decrypted);

    for (const [provider, keys] of Object.entries(keysMap)) {
      this.addPool(provider, keys);
    }

    return keysMap;
  }

  /**
   * Automatically mask sensitive API keys for safe console logs
   */
  public static mask(key?: string): string {
    if (!key || typeof key !== 'string') return '';
    if (key.length <= 8) return '••••••••';
    const prefix = key.slice(0, Math.min(8, Math.floor(key.length / 4)));
    const suffix = key.slice(-4);
    return `${prefix}••••••••${suffix}`;
  }

  /**
   * Probe health and active status of keys in the pool
   */
  public probe(provider: string) {
    const canonical = provider.toLowerCase().trim();
    const pool = LiateKey.pools.get(canonical) || [];
    const now = Date.now();

    const active = pool.filter(r => r.cooledDownUntil <= now);
    const cooledDown = pool.filter(r => r.cooledDownUntil > now);

    return {
      provider: canonical,
      totalKeys: pool.length,
      activeKeys: active.length,
      rateLimitedKeys: cooledDown.length,
      healthStatus: active.length > 0 ? 'HEALTHY' : (pool.length === 0 ? 'EMPTY' : 'THROTTLED')
    };
  }
}

export const Key = LiateKey;
