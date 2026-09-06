/**
 * Liate ADK for TypeScript / JavaScript
 * Sovereign AI Agent Client & Builder (LAPI/v1)
 */

export interface LiateModelParams {
  model?: string;
  provider?: string;
  fallback?: string;
  temperature?: number;
  maxTokens?: number;
}

export class LiateModel {
  public model: string;
  public provider?: string;
  public fallback?: string;
  public temperature?: number;
  public maxTokens?: number;

  constructor(config: string | LiateModelParams) {
    if (typeof config === 'string') {
      this.model = config;
    } else {
      this.model = config.model || 'sarvam/sarvam-105b';
      this.provider = config.provider;
      this.fallback = config.fallback;
      this.temperature = config.temperature;
      this.maxTokens = config.maxTokens;
    }
  }

  toJSON() { return this.model; }
}

export interface LiateIntegrationParams {
  memory?: string;
  session?: string;
  database?: string;
  webhook?: string;
  channel?: string;
  [key: string]: any;
}

export class LiateIntegration {
  public memory?: string;
  public session?: string;
  public database?: string;
  public webhook?: string;
  public channel?: string;
  public extra: Record<string, any> = {};

  constructor(config: string | LiateIntegrationParams = {}) {
    if (typeof config === 'string') {
      this.memory = config;
      this.session = config;
    } else {
      this.memory = config.memory || config.session;
      this.session = config.session || config.memory;
      this.database = config.database;
      this.webhook = config.webhook;
      this.channel = config.channel;
      for (const [k, v] of Object.entries(config)) {
        if (!['memory', 'session', 'database', 'webhook', 'channel'].includes(k)) {
          this.extra[k] = v;
        }
      }
    }
  }

  toJSON() {
    return {
      memory: this.memory,
      session: this.session,
      ...(this.database ? { database: this.database } : {}),
      ...(this.webhook ? { webhook: this.webhook } : {}),
      ...(this.channel ? { channel: this.channel } : {}),
      ...this.extra
    };
  }
}

export class LiateTools {
  public tools: any[];
  public rawConfig?: Record<string, any>;

  constructor(tools: any[] | Record<string, any> = []) {
    if (Array.isArray(tools)) {
      this.tools = tools;
    } else if (typeof tools === 'object' && tools !== null) {
      this.rawConfig = tools;
      this.tools = Object.keys(tools);
    } else {
      this.tools = [];
    }
  }

  add(tool: string | any): this {
    this.tools.push(tool);
    return this;
  }

  toJSON() {
    if (this.rawConfig) return this.rawConfig;
    return this.tools.map(t => typeof t === 'string' ? t : (t.name || String(t)));
  }
}

export interface LiateEnvParams {
  MAX_TURNS?: number;
  REASONING_EFFORT?: 'low' | 'medium' | 'high';
  TEMPERATURE?: number;
  MAX_TOKENS?: number;
  TIMEOUT_MS?: number;
  REQUIRE_APPROVAL?: boolean;
  [key: string]: any;
}

export class LiateEnv {
  public MAX_TURNS: number;
  public REASONING_EFFORT: 'low' | 'medium' | 'high';
  public TEMPERATURE?: number;
  public MAX_TOKENS?: number;
  public TIMEOUT_MS?: number;
  public REQUIRE_APPROVAL?: boolean;
  public vars: Record<string, any> = {};

  constructor(config: LiateEnvParams = {}) {
    this.MAX_TURNS = config.MAX_TURNS || 5;
    this.REASONING_EFFORT = config.REASONING_EFFORT || 'medium';
    this.TEMPERATURE = config.TEMPERATURE;
    this.MAX_TOKENS = config.MAX_TOKENS;
    this.TIMEOUT_MS = config.TIMEOUT_MS;
    this.REQUIRE_APPROVAL = config.REQUIRE_APPROVAL;

    for (const [k, v] of Object.entries(config)) {
      if (!['MAX_TURNS', 'REASONING_EFFORT', 'TEMPERATURE', 'MAX_TOKENS', 'TIMEOUT_MS', 'REQUIRE_APPROVAL'].includes(k)) {
        this.vars[k] = v;
      }
    }
  }

  toJSON() {
    return {
      MAX_TURNS: String(this.MAX_TURNS),
      REASONING_EFFORT: this.REASONING_EFFORT,
      ...(this.TEMPERATURE !== undefined ? { TEMPERATURE: String(this.TEMPERATURE) } : {}),
      ...(this.MAX_TOKENS !== undefined ? { MAX_TOKENS: String(this.MAX_TOKENS) } : {}),
      ...(this.TIMEOUT_MS !== undefined ? { TIMEOUT_MS: String(this.TIMEOUT_MS) } : {}),
      ...(this.REQUIRE_APPROVAL !== undefined ? { REQUIRE_APPROVAL: String(this.REQUIRE_APPROVAL) } : {}),
      ...this.vars
    };
  }
}

export interface LiatePillars {
  L: string | LiateModel;
  I?: Record<string, any> | LiateIntegration;
  A?: Record<string, any> | { name?: string; intent?: string; skills?: string | string[] };
  T?: string[] | LiateTools | Record<string, any>;
  E?: Record<string, any> | LiateEnv;
}

export interface AgentRunOptions {
  endpoint?: string;
  apiKey?: string;
  session?: string;
  stream?: boolean;
}

export interface ClientOptions {
  baseUrl?: string;
  apiKey?: string;
}

declare const process: any;

export class LiateAgent {
  public config: LiatePillars;
  public options: AgentRunOptions;

  constructor(config: LiatePillars | { name?: string; intent?: string } = { L: 'sarvam/sarvam-105b' }, options: AgentRunOptions = {}) {
    const envEndpoint = typeof process !== 'undefined' && process.env ? process.env.LIATE_ENDPOINT : undefined;
    this.options = { ...options, endpoint: options.endpoint || envEndpoint || 'http://localhost:7071' };
    
    // Normalize config
    if (!('L' in config)) {
      this.config = {
        L: 'sarvam/sarvam-105b',
        A: config as any
      };
    } else {
      this.config = config as LiatePillars;
    }
  }

  setModel(model: string | LiateModel): this {
    this.config.L = model;
    return this;
  }

  setIntegration(integration: LiateIntegration | Record<string, any>): this {
    this.config.I = integration;
    return this;
  }

  setIntent(intent: string): this {
    this.config.A = { ...(this.config.A || {}), intent };
    return this;
  }

  setTools(tools: LiateTools | string[]): this {
    this.config.T = tools;
    return this;
  }

  setEnv(env: LiateEnv | Record<string, any>): this {
    this.config.E = env;
    return this;
  }

  async run(prompt: string, runOpts: AgentRunOptions = {}): Promise<string> {
    const endpoint = runOpts.endpoint || this.options.endpoint || 'http://localhost:7071';
    const agentName = this.config.A?.name || 'default';
    const url = `${endpoint.replace(/\/$/, '')}/lapi/v1/${encodeURIComponent(agentName)}/run`;

    const spec = {
      L: this.config.L instanceof LiateModel ? this.config.L.toJSON() : this.config.L,
      I: this.config.I instanceof LiateIntegration ? this.config.I.toJSON() : this.config.I,
      A: this.config.A,
      T: this.config.T instanceof LiateTools ? this.config.T.toJSON() : this.config.T,
      E: this.config.E instanceof LiateEnv ? this.config.E.toJSON() : this.config.E
    };

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(this.options.apiKey ? { 'Authorization': `Bearer ${this.options.apiKey}` } : {})
        },
        body: JSON.stringify({
          spec,
          prompt,
          session: runOpts.session || this.options.session
        }),
      });

      if (res.ok) {
        const data = (await res.json()) as any;
        return data.response || data.output || data.result || JSON.stringify(data);
      }
    } catch {
      // If no local HTTP server is running, fall back to direct runtime
    }

    // Direct in-process execution fallback
    try {
      const { runLiateAgent } = await import('../../src/aum');
      return await runLiateAgent(spec as any, prompt, undefined, undefined, process.cwd());
    } catch (err: any) {
      throw new Error(`[Liate Execution Error]: ${err.message || err}`);
    }
  }
}

export class AgentHandle {
  constructor(private agentId: string, private client: LiateClient) {}

  async run(params: string | { prompt: string; session?: string; stream?: boolean }): Promise<string> {
    const prompt = typeof params === 'string' ? params : params.prompt;
    const session = typeof params === 'object' ? params.session : undefined;
    const stream = typeof params === 'object' ? params.stream : false;

    const url = `${this.client.baseUrl.replace(/\/$/, '')}/lapi/v1/${encodeURIComponent(this.agentId)}/run`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.client.apiKey ? { 'Authorization': `Bearer ${this.client.apiKey}` } : {})
      },
      body: JSON.stringify({ prompt, session, stream })
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`[Liate ADK Error ${res.status}]: ${err}`);
    }

    const data = (await res.json()) as any;
    return data.response || data.output || data.result || JSON.stringify(data);
  }

  async get(): Promise<any> {
    const url = `${this.client.baseUrl.replace(/\/$/, '')}/lapi/v1/${encodeURIComponent(this.agentId)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Agent ${this.agentId} not found`);
    return (await res.json()) as any;
  }
}

export class LiateClient {
  public baseUrl: string;
  public apiKey?: string;

  constructor(options: ClientOptions = {}) {
    const envUrl = typeof process !== 'undefined' && process.env ? process.env.LIATE_BASE_URL || process.env.LIATE_ENDPOINT : undefined;
    this.baseUrl = options.baseUrl || envUrl || 'http://localhost:7071';
    this.apiKey = options.apiKey || (typeof process !== 'undefined' && process.env ? process.env.LIATE_API_KEY : undefined);
  }

  agent(agentId: string): AgentHandle {
    return new AgentHandle(agentId, this);
  }

  async listAgents(): Promise<any[]> {
    const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/lapi/v1/agents`);
    if (!res.ok) return [];
    return (await res.json()) as any[];
  }
}

export class LiateLoop {
  constructor(private agent: LiateAgent) {}

  async *iterate(prompt: string): AsyncGenerator<any, string, void> {
    yield { turn: 1, type: 'STATUS', content: `Starting agent loop: ${this.agent.config.A?.name || 'agent'}` };
    yield { turn: 1, type: 'THOUGHT', content: `Executing prompt with 5-pillar context...` };
    const result = await this.agent.run(prompt);
    yield { turn: 1, type: 'RESULT', content: result };
    return result;
  }

  async run(prompt: string): Promise<string> {
    return await this.agent.run(prompt);
  }
}

export interface CronOptions {
  schedule?: string;
  intervalMs?: number;
  agent: LiateAgent | AgentHandle;
  prompt: string;
  onSuccess?: (result: string) => void;
  onError?: (err: Error) => void;
}

export class LiateCron {
  private timer: any = null;
  public isRunning: boolean = false;

  constructor(public options: CronOptions) {}

  start(): this {
    if (this.isRunning) return this;
    this.isRunning = true;
    const interval = this.options.intervalMs || 60000;
    this.timer = setInterval(async () => {
      try {
        const res = await this.options.agent.run(this.options.prompt);
        this.options.onSuccess?.(res);
      } catch (err: any) {
        this.options.onError?.(err);
      }
    }, interval);
    return this;
  }

  stop(): this {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
    return this;
  }

  status(): string {
    return this.isRunning ? 'running' : 'stopped';
  }
}

export interface AppOptions extends LiatePillars {
  name?: string;
  version?: string;
  description?: string;
}

export class LiateApp extends LiateAgent {
  public appName: string;
  constructor(config: AppOptions, options?: AgentRunOptions) {
    super(config, options);
    this.appName = config.name || config.A?.name || 'LiateApp';
  }
}

import { 
  LiateMcp, 
  type LiateMcpOptions, 
  type McpToolConfig, 
  type McpResourceConfig, 
  type McpPromptConfig,
  LiateEval, 
  type LiateEvalOptions, 
  type EvalTestCase, 
  type LiateEvalReport,
  LiateToken, 
  type LiateTokenOptions, 
  type TokenCostResult
} from '../../src/oop';

export { LiateMcp, type LiateMcpOptions, type McpToolConfig, type McpResourceConfig, type McpPromptConfig };
export { LiateEval, type LiateEvalOptions, type EvalTestCase, type LiateEvalReport };
export { LiateToken, type LiateTokenOptions, type TokenCostResult };

export function liate(config: LiatePillars, options?: AgentRunOptions) {
  return new LiateAgent(config, options);
}

export const Agent = LiateAgent;
export const App = LiateApp;
export const Mcp = LiateMcp;
export const Eval = LiateEval;
export const Token = LiateToken;
export const Integration = LiateIntegration;
export const Env = LiateEnv;

