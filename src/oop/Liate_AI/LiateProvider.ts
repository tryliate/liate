/**
 * [22] - LiateProvider (Universal Multi-Provider Model Infrastructure & Router)
 * 
 * Manages model providers (Sarvam, Bedrock, Ollama, vLLM, Anthropic, OpenAI, Groq),
 * multi-tier fallback cascades, custom enterprise VPC endpoints, API key rotation,
 * and native INR rate card accounting.
 */

export interface RateCard {
  promptInr: number;
  completionInr: number;
  cachedInr?: number;
  currency: 'INR' | 'USD';
}

export interface ProviderConfig {
  name: string;
  baseUrl: string;
  apiKey?: string;
  apiKeys?: string[];
  headers?: Record<string, string>;
  rateCard?: RateCard;
  timeoutMs?: number;
  isLocal?: boolean;
}

export interface ProviderProbeResult {
  provider: string;
  model: string;
  status: 'online' | 'offline' | 'degraded';
  latencyMs: number;
  endpoint: string;
  rateCard?: RateCard;
}

export interface FallbackOptions {
  primary: string;
  fallbacks?: string[];
  maxRetries?: number;
  retryOnRateLimit?: boolean;
}

export class LiateProvider {
  private static registry: Map<string, ProviderConfig> = new Map();
  private static keyIndices: Map<string, number> = new Map();

  static {
    // 1. Indic Sovereign Default
    LiateProvider.register('sarvam', {
      name: 'sarvam',
      baseUrl: 'https://api.sarvam.ai/v1',
      rateCard: { promptInr: 29.28, completionInr: 73.20, cachedInr: 10.98, currency: 'INR' }
    });

    // 2. Local & On-Premise (Zero Cloud)
    LiateProvider.register('ollama', {
      name: 'ollama',
      baseUrl: 'http://localhost:11434/v1',
      isLocal: true,
      rateCard: { promptInr: 0.0, completionInr: 0.0, currency: 'INR' }
    });

    LiateProvider.register('vllm', {
      name: 'vllm',
      baseUrl: 'http://localhost:8000/v1',
      isLocal: true,
      rateCard: { promptInr: 0.0, completionInr: 0.0, currency: 'INR' }
    });

    // 3. Cloud Sovereign (AWS Bedrock India — region from AWS_REGION env, default ap-south-1 Mumbai)
    const bedrockRegion = (globalThis as any).Bun?.env?.AWS_REGION
      || (globalThis as any).process?.env?.AWS_REGION
      || 'ap-south-1';
    LiateProvider.register('bedrock', {
      name: 'bedrock',
      baseUrl: `https://bedrock-runtime.${bedrockRegion}.amazonaws.com`,
      rateCard: { promptInr: 25.0, completionInr: 75.0, currency: 'INR' }
    });

    // 4. Global High-Speed Providers (URLs configurable via env for enterprise proxies)
    LiateProvider.register('groq', {
      name: 'groq',
      baseUrl: (globalThis as any).Bun?.env?.GROQ_API_URL || (globalThis as any).process?.env?.GROQ_API_URL || 'https://api.groq.com/openai/v1',
      rateCard: { promptInr: 5.0, completionInr: 15.0, currency: 'INR' }
    });

    LiateProvider.register('openai', {
      name: 'openai',
      baseUrl: (globalThis as any).Bun?.env?.OPENAI_API_URL || (globalThis as any).process?.env?.OPENAI_API_URL || 'https://api.openai.com/v1',
      rateCard: { promptInr: 210.0, completionInr: 840.0, currency: 'INR' }
    });

    LiateProvider.register('anthropic', {
      name: 'anthropic',
      baseUrl: (globalThis as any).Bun?.env?.ANTHROPIC_API_URL?.replace('/v1/messages', '/v1') || (globalThis as any).process?.env?.ANTHROPIC_API_URL?.replace('/v1/messages', '/v1') || 'https://api.anthropic.com/v1',
      rateCard: { promptInr: 250.0, completionInr: 1250.0, currency: 'INR' }
    });

    // 5. OmniRoute — Free Local Multi-Provider AI Gateway (339+ providers on :20128)
    LiateProvider.register('omniroute', {
      name: 'omniroute',
      baseUrl: process.env.OMNIROUTE_URL || 'http://localhost:20128/v1',
      apiKey: 'sk-omniroute-local',
      isLocal: true,
      rateCard: { promptInr: 0.0, completionInr: 0.0, currency: 'INR' }
    });

    LiateProvider.register('omni', {
      name: 'omni',
      baseUrl: process.env.OMNIROUTE_URL || 'http://localhost:20128/v1',
      apiKey: 'sk-omniroute-local',
      isLocal: true,
      rateCard: { promptInr: 0.0, completionInr: 0.0, currency: 'INR' }
    });
  }



  public options: FallbackOptions;

  constructor(options: string | FallbackOptions = 'sarvam/sarvam-105b') {
    if (typeof options === 'string') {
      this.options = { primary: options, fallbacks: [] };
    } else {
      this.options = {
        primary: options.primary || 'sarvam/sarvam-105b',
        fallbacks: options.fallbacks || [],
        maxRetries: options.maxRetries ?? 3,
        retryOnRateLimit: options.retryOnRateLimit ?? true
      };
    }
  }


  /**
   * Register a custom enterprise model provider (e.g. private VPC or fine-tuned cluster)
   */
  public static register(name: string, config: Partial<ProviderConfig> & { baseUrl: string }): void {
    const canonical = name.toLowerCase().trim();
    this.registry.set(canonical, {
      name: canonical,
      baseUrl: config.baseUrl.replace(/\/$/, ''),
      apiKey: config.apiKey,
      apiKeys: config.apiKeys,
      headers: config.headers,
      rateCard: config.rateCard,
      timeoutMs: config.timeoutMs || 30000,
      isLocal: !!config.isLocal
    });
  }

  /**
   * Configure an existing provider (e.g. add multiple API keys for rotation)
   */
  public static configure(name: string, config: Partial<ProviderConfig>): void {
    const canonical = name.toLowerCase().trim();
    const existing = this.registry.get(canonical);
    if (existing) {
      this.registry.set(canonical, { ...existing, ...config });
    } else {
      this.register(canonical, config as any);
    }
  }

  /**
   * Get provider configuration
   */
  public static get(name: string): ProviderConfig | undefined {
    return this.registry.get(name.toLowerCase().trim());
  }

  /**
   * List all registered providers
   */
  public static list(): string[] {
    return Array.from(this.registry.keys());
  }

  /**
   * Resolve provider and model from model identifier string (e.g. 'sarvam/sarvam-105b' or 'sarvam-2b')
   */
  public static resolveModel(modelStr: string): { provider: string; model: string; config?: ProviderConfig } {
    const parts = modelStr.split('/');
    let providerName = parts.length > 1 ? parts[0] : (modelStr.startsWith('sarvam') ? 'sarvam' : 'omniroute');
    let model = parts.length > 1 ? parts.slice(1).join('/') : modelStr;
    const config = this.get(providerName);
    return { provider: providerName, model, config };
  }

  public resolveModel(modelStr: string): { provider: string; model: string; config?: ProviderConfig } {
    return LiateProvider.resolveModel(modelStr);
  }


  /**
   * Resolve active API key with round-robin multi-key rotation
   */
  public static resolveApiKey(providerName: string): string {
    const canonical = providerName.toLowerCase().trim();
    const p = this.registry.get(canonical);
    if (!p) return '';

    if (p.apiKeys && p.apiKeys.length > 0) {
      const currentIdx = this.keyIndices.get(canonical) || 0;
      const nextIdx = (currentIdx + 1) % p.apiKeys.length;
      this.keyIndices.set(canonical, nextIdx);
      return p.apiKeys[currentIdx];
    }

    return p.apiKey || '';
  }

  /**
   * Get accurate INR rate card for a provider
   */
  public static getRateCard(providerName: string): RateCard {
    const canonical = providerName.toLowerCase().trim();
    const p = this.registry.get(canonical);
    return p?.rateCard || { promptInr: 29.28, completionInr: 73.20, currency: 'INR' };
  }

  /**
   * Probe provider latency and health
   */
  public static async probe(modelStr: string): Promise<ProviderProbeResult> {
    const [rawProvider, ...rest] = modelStr.split('/');
    const provider = rawProvider.toLowerCase();
    const model = rest.join('/') || modelStr;
    const config = this.get(provider);
    const start = Date.now();

    if (!config) {
      return {
        provider,
        model,
        status: 'offline',
        latencyMs: 0,
        endpoint: 'unknown'
      };
    }

    try {
      const res = await fetch(`${config.baseUrl}/models`, {
        method: 'GET',
        headers: {
          ...(config.apiKey ? { 'Authorization': `Bearer ${config.apiKey}` } : {}),
          ...config.headers
        },
        signal: AbortSignal.timeout(5000)
      });

      const latencyMs = Date.now() - start;
      return {
        provider,
        model,
        status: res.ok || res.status === 401 ? 'online' : 'degraded',
        latencyMs,
        endpoint: config.baseUrl,
        rateCard: config.rateCard
      };
    } catch {
      return {
        provider,
        model,
        status: config.isLocal ? 'offline' : 'online',
        latencyMs: Date.now() - start,
        endpoint: config.baseUrl,
        rateCard: config.rateCard
      };
    }
  }

  /**
   * Execute inference with multi-tier fallback cascade
   */
  public async executeWithFallback<T>(
    callFn: (model: string, provider: ProviderConfig) => Promise<T>
  ): Promise<{ result: T; activeModel: string }> {
    const candidates = [this.options.primary, ...(this.options.fallbacks || [])];
    let lastError: any = null;

    for (const modelCandidate of candidates) {
      const [pName] = modelCandidate.split('/');
      const providerConfig = LiateProvider.get(pName) || {
        name: pName,
        baseUrl: 'https://api.sarvam.ai/v1'
      };

      try {
        const result = await callFn(modelCandidate, providerConfig);
        return { result, activeModel: modelCandidate };
      } catch (err: any) {
        lastError = err;
        console.warn(`[LiateProvider] Model candidate "${modelCandidate}" failed: ${err.message || err}. Cascading to next fallback...`);
      }
    }

    throw new Error(`[LiateProvider] All model candidates failed in fallback cascade: ${lastError?.message || lastError}`);
  }
}

export const Provider = LiateProvider;
