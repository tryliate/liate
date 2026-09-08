import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * [27] - LiateContext (Scoped Async Execution Context, Security Isolation & Budget Engine)
 * 
 * Provides zero-leak tenant isolation, secure tool credentials propagation,
 * request trace ID tracking, and context window budget allocation across agent executions.
 */

export interface BudgetDistribution {
  systemPrompt?: number; // Default 0.15 (15%)
  memoryFacts?: number;  // Default 0.20 (20%)
  toolSchemas?: number;  // Default 0.15 (15%)
  chatTurns?: number;    // Default 0.50 (50%)
}

export interface ContextData {
  userId?: string;
  tenantId?: string;
  traceId?: string;
  requestId?: string;
  role?: string;
  budgetCapInr?: number;
  maxContextTokens?: number;
  metadata?: Record<string, any>;
  [key: string]: any;
}

export class LiateContext {
  private static storage = new AsyncLocalStorage<LiateContext>();
  private store: Map<string, any> = new Map();

  public traceId: string;
  public startTime: number;
  public userId?: string;
  public tenantId?: string;
  public maxContextTokens: number;

  constructor(data: ContextData = {}) {
    this.startTime = Date.now();
    this.traceId = data.traceId || `trace-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.userId = data.userId;
    this.tenantId = data.tenantId;
    this.maxContextTokens = data.maxContextTokens || 128000;

    for (const [k, v] of Object.entries(data)) {
      this.store.set(k, v);
    }
  }

  /**
   * Get the active LiateContext for the current asynchronous execution thread
   */
  public static current(): LiateContext {
    const ctx = this.storage.getStore();
    if (!ctx) {
      // Return a standalone default context if called outside of LiateContext.run()
      return new LiateContext();
    }
    return ctx;
  }

  /**
   * Execute an asynchronous function within an isolated scoped context
   */
  public static async run<T>(
    data: ContextData | LiateContext, 
    fn: () => Promise<T> | T
  ): Promise<T> {
    const ctx = data instanceof LiateContext ? data : new LiateContext(data);
    return this.storage.run(ctx, fn);
  }

  /**
   * Execute an asynchronous function within this specific context instance
   */
  public async run<T>(fn: () => Promise<T> | T): Promise<T> {
    return LiateContext.storage.run(this, fn);
  }


  /**
   * Read a variable from the current scoped context
   */
  public get<T = any>(key: string): T | undefined {
    return this.store.get(key);
  }

  /**
   * Set a variable in the current scoped context
   */
  public set(key: string, value: any): this {
    this.store.set(key, value);
    return this;
  }

  /**
   * Check if a key exists in context
   */
  public has(key: string): boolean {
    return this.store.has(key);
  }

  /**
   * Get elapsed execution time in milliseconds
   */
  public get elapsedMs(): number {
    return Date.now() - this.startTime;
  }

  /**
   * Dynamically allocate token budget across system, tools, facts, and conversation history
   */
  public allocateBudget(
    totalTokens: number = this.maxContextTokens, 
    distribution: BudgetDistribution = {}
  ): Record<string, number> {
    const dist = {
      systemPrompt: distribution.systemPrompt ?? 0.15,
      memoryFacts: distribution.memoryFacts ?? 0.20,
      toolSchemas: distribution.toolSchemas ?? 0.15,
      chatTurns: distribution.chatTurns ?? 0.50
    };

    return {
      systemPromptTokens: Math.floor(totalTokens * dist.systemPrompt),
      memoryFactsTokens: Math.floor(totalTokens * dist.memoryFacts),
      toolSchemasTokens: Math.floor(totalTokens * dist.toolSchemas),
      chatTurnsTokens: Math.floor(totalTokens * dist.chatTurns)
    };
  }

  toJSON() {
    return {
      traceId: this.traceId,
      userId: this.userId,
      tenantId: this.tenantId,
      elapsedMs: this.elapsedMs,
      data: Object.fromEntries(this.store.entries())
    };
  }
}

export const Context = LiateContext;
