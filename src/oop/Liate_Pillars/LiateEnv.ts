import fs from 'fs/promises';
import { readRecentLogs, clearLogs } from '../../store/logs';
import { getProjectLogsFile } from '../../store/paths';

/**
 * [E] - LiateEnv (Environment, Constraints, Timeouts & Guardrails)
 */

export interface LiateEnvConfig {
  MAX_TURNS?: number;
  MAX_TIME?: string | number;
  MAX_SPEND?: string | number;
  REASONING_EFFORT?: 'low' | 'medium' | 'high';
  TEMPERATURE?: number;
  MAX_TOKENS?: number;
  TIMEOUT_MS?: number;
  REQUIRE_APPROVAL?: boolean;
  [key: string]: any;
}

export class LiateEnv {
  public MAX_TURNS: number;
  public MAX_TIME?: string | number;
  public MAX_SPEND?: string | number;
  public REASONING_EFFORT: 'low' | 'medium' | 'high';
  public TEMPERATURE?: number;
  public MAX_TOKENS?: number;
  public TIMEOUT_MS?: number;
  public REQUIRE_APPROVAL?: boolean;
  public vars: Record<string, any> = {};

  constructor(config: LiateEnvConfig = {}) {
    this.MAX_TURNS = config.MAX_TURNS || 5;
    this.MAX_TIME = config.MAX_TIME;
    this.MAX_SPEND = config.MAX_SPEND;
    this.REASONING_EFFORT = config.REASONING_EFFORT || 'medium';
    this.TEMPERATURE = config.TEMPERATURE;
    this.MAX_TOKENS = config.MAX_TOKENS;
    this.TIMEOUT_MS = config.TIMEOUT_MS;
    this.REQUIRE_APPROVAL = config.REQUIRE_APPROVAL;

    for (const [k, v] of Object.entries(config)) {
      if (!['MAX_TURNS', 'MAX_TIME', 'MAX_SPEND', 'REASONING_EFFORT', 'TEMPERATURE', 'MAX_TOKENS', 'TIMEOUT_MS', 'REQUIRE_APPROVAL'].includes(k)) {
        this.vars[k] = v;
      }
    }
  }

  /**
   * Set maximum execution duration limit (e.g. 60, "30s", "2m")
   */
  setMaxTime(timeLimit: string | number): this {
    this.MAX_TIME = timeLimit;
    return this;
  }

  /**
   * Set maximum spend budget in INR Rupees (e.g. 10, "5.00")
   */
  setMaxSpend(spendLimit: string | number): this {
    this.MAX_SPEND = spendLimit;
    return this;
  }

  /**
   * Set maximum ReAct tool calling turns
   */
  setMaxTurns(turns: number): this {
    this.MAX_TURNS = turns;
    return this;
  }

  toJSON() {
    return {
      MAX_TURNS: String(this.MAX_TURNS),
      ...(this.MAX_TIME !== undefined ? { MAX_TIME: String(this.MAX_TIME) } : {}),
      ...(this.MAX_SPEND !== undefined ? { MAX_SPEND: String(this.MAX_SPEND) } : {}),
      REASONING_EFFORT: this.REASONING_EFFORT,
      ...(this.TEMPERATURE !== undefined ? { TEMPERATURE: String(this.TEMPERATURE) } : {}),
      ...(this.MAX_TOKENS !== undefined ? { MAX_TOKENS: String(this.MAX_TOKENS) } : {}),
      ...(this.TIMEOUT_MS !== undefined ? { TIMEOUT_MS: String(this.TIMEOUT_MS) } : {}),
      ...(this.REQUIRE_APPROVAL !== undefined ? { REQUIRE_APPROVAL: String(this.REQUIRE_APPROVAL) } : {}),
      ...this.vars
    };
  }
}

/**
 * Supporting Utility: LiateLogs (Structured Observability & Tracing Engine)
 */
export class LiateLogs {
  static async tail(limit: number = 20, cwd: string = process.cwd()): Promise<any[]> {
    return await readRecentLogs(limit, cwd);
  }

  static async search(query: string, cwd: string = process.cwd()): Promise<any[]> {
    const logs = await readRecentLogs(500, cwd);
    const q = query.toLowerCase();
    return logs.filter(l => JSON.stringify(l).toLowerCase().includes(q));
  }

  static async getStats(cwd: string = process.cwd()): Promise<{
    totalEvents: number;
    totalRuns: number;
    totalTurns: number;
    totalTokens: number;
  }> {
    const logs = await readRecentLogs(1000, cwd);
    let totalTurns = 0;
    let totalRuns = 0;
    let totalTokens = 0;

    for (const log of logs) {
      if (log.type === 'STATUS' && log.content.includes('Starting 5-Pillar Agent')) totalRuns++;
      if (log.type === 'THOUGHT') totalTurns++;
      if (log.tokens) {
        totalTokens += (log.tokens.prompt || 0) + (log.tokens.completion || 0);
      }
    }

    return {
      totalEvents: logs.length,
      totalRuns,
      totalTurns,
      totalTokens
    };
  }

  static async clear(cwd: string = process.cwd()): Promise<void> {
    await clearLogs(cwd);
  }
}
