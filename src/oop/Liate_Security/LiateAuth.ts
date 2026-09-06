import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

/**
 * [31] - LiateAuth (Sovereign Agent Authentication, API Key Manager, RBAC & Rate Limiter)
 * 
 * Provides cryptographic API key issuance (sha256), balance budget enforcement (INR),
 * role-based access control (RBAC), and request verification middleware.
 */

export interface ApiKeyRecord {
  id: string;
  keyHash: string;
  name: string;
  roles: string[];
  budgetINR: number;
  spentINR: number;
  createdAt: string;
  expiresAt?: string;
  rateLimit?: { max: number; windowMs: number };
}

export interface AuthSession {
  authenticated: boolean;
  apiKeyId?: string;
  name?: string;
  roles: string[];
  budgetRemainingINR?: number;
  hasRole: (role: string) => boolean;
  hasPermission: (perm: string) => boolean;
}

export interface AuthConfig {
  secret?: string;
  storagePath?: string;
  defaultRateLimit?: { max: number; windowMs: number };
}

export class LiateAuth {
  private keys: Map<string, ApiKeyRecord> = new Map();
  private storageFile?: string;
  private secret: string;
  private rateLimits: Map<string, { count: number; resetAt: number }> = new Map();

  constructor(config: AuthConfig = {}) {
    if (config.secret || process.env.LIATE_AUTH_SECRET) {
      this.secret = config.secret || process.env.LIATE_AUTH_SECRET!;
    } else {
      this.secret = crypto.randomBytes(32).toString('hex');
      if (process.env.NODE_ENV !== 'test') {
        console.warn('⚠️ [LiateAuth] LIATE_AUTH_SECRET not set. Using an ephemeral in-memory secret. Persistent key hashes may invalidate across restarts.');
      }
    }
    if (config.storagePath) {
      this.storageFile = path.join(config.storagePath, 'api_keys.json');
      this.loadKeys();
    }
  }

  private loadKeys(): void {
    if (this.storageFile && fs.existsSync(this.storageFile)) {
      try {
        const raw = fs.readFileSync(this.storageFile, 'utf-8');
        const data: ApiKeyRecord[] = JSON.parse(raw);
        data.forEach(k => this.keys.set(k.keyHash, k));
      } catch {}
    }
  }

  private saveKeys(): void {
    if (this.storageFile) {
      try {
        const dir = path.dirname(this.storageFile);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const list = Array.from(this.keys.values());
        fs.writeFileSync(this.storageFile, JSON.stringify(list, null, 2), 'utf-8');
      } catch {}
    }
  }

  private hashKey(token: string): string {
    return crypto.createHmac('sha256', this.secret).update(token).digest('hex');
  }

  /**
   * Create and issue a new sovereign API key
   */
  public async createApiKey(options: {
    name: string;
    roles?: string[];
    budgetINR?: number;
    expiresInDays?: number;
    rateLimit?: { max: number; windowMs: number };
  }): Promise<{ token: string; record: ApiKeyRecord }> {
    const rawSecret = `sk_live_liate_${crypto.randomBytes(24).toString('hex')}`;
    const keyHash = this.hashKey(rawSecret);
    const id = `key-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;

    const record: ApiKeyRecord = {
      id,
      keyHash,
      name: options.name,
      roles: options.roles || ['agent', 'user'],
      budgetINR: options.budgetINR || 100.0, // Default ₹100
      spentINR: 0,
      createdAt: new Date().toISOString(),
      expiresAt: options.expiresInDays 
        ? new Date(Date.now() + options.expiresInDays * 86400000).toISOString() 
        : undefined,
      rateLimit: options.rateLimit
    };

    this.keys.set(keyHash, record);
    this.saveKeys();

    return { token: rawSecret, record };
  }

  /**
   * Verify an Authorization header or raw Bearer API token
   */
  public async verify(authHeaderOrToken?: string): Promise<AuthSession> {
    if (!authHeaderOrToken) {
      return {
        authenticated: false,
        roles: [],
        hasRole: () => false,
        hasPermission: () => false
      };
    }

    const token = authHeaderOrToken.startsWith('Bearer ') 
      ? authHeaderOrToken.slice(7).trim() 
      : authHeaderOrToken.trim();

    const hash = this.hashKey(token);
    const record = this.keys.get(hash);

    if (!record) {
      return {
        authenticated: false,
        roles: [],
        hasRole: () => false,
        hasPermission: () => false
      };
    }

    // Check expiration
    if (record.expiresAt && new Date(record.expiresAt).getTime() < Date.now()) {
      return {
        authenticated: false,
        roles: [],
        hasRole: () => false,
        hasPermission: () => false
      };
    }

    // Check budget
    if (record.budgetINR > 0 && record.spentINR >= record.budgetINR) {
      throw new Error(`402 Payment Required: API key budget exhausted (Spent ₹${record.spentINR} / ₹${record.budgetINR})`);
    }

    // Check rate limit
    if (record.rateLimit) {
      const now = Date.now();
      const tracker = this.rateLimits.get(record.id) || { count: 0, resetAt: now + record.rateLimit.windowMs };
      if (now > tracker.resetAt) {
        tracker.count = 0;
        tracker.resetAt = now + record.rateLimit.windowMs;
      }
      tracker.count++;
      this.rateLimits.set(record.id, tracker);

      if (tracker.count > record.rateLimit.max) {
        throw new Error(`429 Too Many Requests: Rate limit exceeded for API key`);
      }
    }

    const roles = record.roles;
    return {
      authenticated: true,
      apiKeyId: record.id,
      name: record.name,
      roles,
      budgetRemainingINR: Math.max(0, record.budgetINR - record.spentINR),
      hasRole: (r: string) => roles.includes(r) || roles.includes('admin'),
      hasPermission: (p: string) => roles.includes(p) || roles.includes('admin')
    };
  }

  /**
   * Track token expenditure against an API key budget
   */
  public async trackCost(keyId: string, costINR: number): Promise<void> {
    for (const record of this.keys.values()) {
      if (record.id === keyId) {
        record.spentINR += costINR;
        this.saveKeys();
        break;
      }
    }
  }

  /**
   * Revoke an API key by ID
   */
  public revokeApiKey(keyId: string): boolean {
    for (const [hash, record] of this.keys.entries()) {
      if (record.id === keyId) {
        this.keys.delete(hash);
        this.saveKeys();
        return true;
      }
    }
    return false;
  }

  /**
   * List all issued API keys (without hashes)
   */
  public listApiKeys(): Array<Omit<ApiKeyRecord, 'keyHash'>> {
    return Array.from(this.keys.values()).map(({ keyHash, ...rest }) => rest);
  }
}

export const Auth = LiateAuth;
