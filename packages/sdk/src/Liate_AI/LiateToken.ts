/**
 * [T] - LiateToken (Sovereign Token Economics, Real-World Rate Cards & Context Optimizer)
 * 
 * Official 2026 Sarvam AI Sovereign Rate Cards + Multi-Provider Accounting,
 * Prompt Caching Support, Speech/DocAI Trackers, and Real-Time Budget Triggers.
 */

import { minifyToolSchemas, sanitizeToolOutput, pruneTrajectoryMessages } from '@liate/optimizer';

export interface ModelPricing {
  promptCostPer1M: number;      // Standard input per 1M tokens
  cachedCostPer1M?: number;     // Prompt cached input per 1M tokens
  completionCostPer1M: number;  // Completion output per 1M tokens
  currency: 'INR' | 'USD';
  exchangeRateINR?: number;     // USD to INR conversion rate
  provider?: string;
}

/**
 * Verified 2026 Model Pricing Registry
 * Includes official Sarvam AI Sovereign Platform rate cards
 */
export const MODEL_PRICING_REGISTRY: Record<string, ModelPricing> = {
  // --- 🇮🇳 Sarvam AI Official Sovereign Platform Rate Cards ---
  'sarvam/sarvam-105b': {
    promptCostPer1M: 29.28,
    cachedCostPer1M: 10.98,
    completionCostPer1M: 73.20,
    currency: 'INR',
    provider: 'Sarvam AI'
  },
  'sarvam/sarvam-105b-chat': {
    promptCostPer1M: 29.28,
    cachedCostPer1M: 10.98,
    completionCostPer1M: 73.20,
    currency: 'INR',
    provider: 'Sarvam AI'
  },
  'sarvam/sarvam-105b-conversations': {
    promptCostPer1M: 29.28,
    cachedCostPer1M: 10.98,
    completionCostPer1M: 73.20,
    currency: 'INR',
    provider: 'Sarvam AI'
  },
  'sarvam/gemma-4-31b': {
    promptCostPer1M: 36.60,
    cachedCostPer1M: 13.73,
    completionCostPer1M: 91.50,
    currency: 'INR',
    provider: 'Sarvam AI'
  },
  'sarvam/glm-5.2': {
    promptCostPer1M: 128.10,
    cachedCostPer1M: 23.79,
    completionCostPer1M: 402.60,
    currency: 'INR',
    provider: 'Sarvam AI'
  },
  'sarvam': {
    promptCostPer1M: 29.28,
    cachedCostPer1M: 10.98,
    completionCostPer1M: 73.20,
    currency: 'INR',
    provider: 'Sarvam AI'
  },

  // --- ⚡ Groq Cloud (USD Rates) ---
  'groq/llama-3.3-70b-versatile': {
    promptCostPer1M: 0.59,
    completionCostPer1M: 0.79,
    currency: 'USD',
    exchangeRateINR: 95.39,
    provider: 'Groq'
  },
  'groq/llama-3.1-8b-instant': {
    promptCostPer1M: 0.05,
    completionCostPer1M: 0.08,
    currency: 'USD',
    exchangeRateINR: 95.39,
    provider: 'Groq'
  },

  // --- 🧠 Anthropic ---
  'anthropic/claude-3-5-sonnet': {
    promptCostPer1M: 3.00,
    cachedCostPer1M: 0.30,
    completionCostPer1M: 15.00,
    currency: 'USD',
    exchangeRateINR: 95.39,
    provider: 'Anthropic'
  },
  'anthropic/claude-3-5-haiku': {
    promptCostPer1M: 0.80,
    cachedCostPer1M: 0.08,
    completionCostPer1M: 4.00,
    currency: 'USD',
    exchangeRateINR: 95.39,
    provider: 'Anthropic'
  },

  // --- 🌐 Google Gemini ---
  'google/gemini-2.5-flash': {
    promptCostPer1M: 0.075,
    completionCostPer1M: 0.30,
    currency: 'USD',
    exchangeRateINR: 95.39,
    provider: 'Google'
  },

  // --- 🤖 OpenAI ---
  'openai/gpt-4o-mini': {
    promptCostPer1M: 0.15,
    completionCostPer1M: 0.60,
    currency: 'USD',
    exchangeRateINR: 95.39,
    provider: 'OpenAI'
  },
};

export interface TokenCostResult {
  model: string;
  promptTokens: number;
  cachedTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUSD: number;
  costINR: number;
  totalInr: number;
  totalCostInr: number;
  formattedUSD: string;
  formattedINR: string;
  provider: string;
}


export type CostTriggerCallback = (cost: TokenCostResult) => void;

export interface CostTrigger {
  operator: '>=' | '<=' | '>';
  thresholdINR: number;
  callback: CostTriggerCallback;
}

export interface LiateTokenOptions {
  maxTokensPerTurn?: number;
  maxSessionTokens?: number;
  maxCostINR?: number;
  maxCostUSD?: number;
  budgetInr?: number;
  initialCredits?: number;
  model?: string;
  onBudgetExceeded?: 'truncate' | 'throw' | 'warn';
  onCost?: CostTriggerCallback;
  /**
   * Override the global USD → INR exchange rate.
   * Defaults to 87. Set this to keep costs accurate as forex rates change.
   * You can also call `LiateToken.setExchangeRate(rate)` globally at startup.
   */
  exchangeRateINR?: number;
}

export class LiateToken {
  public maxTokensPerTurn: number;
  public maxSessionTokens: number;
  public maxCostINR?: number;
  public maxCostUSD?: number;
  public creditBalance: number;
  public model: string;
  public onBudgetExceeded: 'truncate' | 'throw' | 'warn';
  public exchangeRateINR: number;

  /** Global fallback USD → INR exchange rate. Override with LiateToken.setExchangeRate(). */
  private static globalExchangeRateINR: number = 95.39;

  private accumulatedPromptTokens: number = 0;
  private accumulatedCachedTokens: number = 0;
  private accumulatedCompletionTokens: number = 0;
  private triggers: CostTrigger[] = [];

  constructor(options: LiateTokenOptions = {}) {
    this.maxTokensPerTurn = options.maxTokensPerTurn || 4000;
    this.maxSessionTokens = options.maxSessionTokens || 32000;
    this.maxCostINR = options.maxCostINR ?? options.budgetInr;
    this.maxCostUSD = options.maxCostUSD;
    this.creditBalance = options.initialCredits ?? 0;
    this.model = options.model || 'sarvam/sarvam-105b';
    this.onBudgetExceeded = options.onBudgetExceeded || 'warn';
    this.exchangeRateINR = options.exchangeRateINR ?? LiateToken.globalExchangeRateINR;

    if (options.onCost) {
      this.triggers.push({
        operator: '>=',
        thresholdINR: 0,
        callback: options.onCost
      });
    }
  }


  /**
   * Register or override pricing for any model / custom enterprise endpoint
   */
  static setPrice(modelId: string, pricing: ModelPricing): void {
    MODEL_PRICING_REGISTRY[modelId] = pricing;
  }

  /**
   * Update the global USD → INR exchange rate used by all LiateToken instances.
   * Call this at application startup to keep costs accurate.
   * @example LiateToken.setExchangeRate(89.50);
   */
  static setExchangeRate(rateINR: number): void {
    if (rateINR <= 0) throw new Error('[LiateToken] Exchange rate must be a positive number.');
    LiateToken.globalExchangeRateINR = rateINR;
  }

  /**
   * Get the current global USD → INR exchange rate.
   */
  static getExchangeRate(): number {
    return LiateToken.globalExchangeRateINR;
  }

  /**
   * Fast Heuristic Token Counter (English & Indic Multilingual aware)
   */
  static count(text: string): number {
    if (!text || typeof text !== 'string') return 0;
    const hasIndic = /[\u0900-\u0DFF]/.test(text);
    const charsPerToken = hasIndic ? 2.2 : 3.8;
    return Math.max(1, Math.ceil(text.length / charsPerToken));
  }

  /**
   * Calculate precise monetary cost in USD ($) and INR (₹)
   */
  static calculateCost(params: {
    model?: string;
    promptTokens?: number;
    cachedTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  }): TokenCostResult {
    const model = params.model || 'sarvam/sarvam-105b';
    const pricing = MODEL_PRICING_REGISTRY[model] || MODEL_PRICING_REGISTRY['sarvam/sarvam-105b'];

    const cachedTokens = params.cachedTokens || 0;
    const promptTokens = params.promptTokens !== undefined 
      ? params.promptTokens 
      : Math.max(0, Math.floor((params.totalTokens || 0) * 0.75) - cachedTokens);
    const completionTokens = params.completionTokens !== undefined 
      ? params.completionTokens 
      : Math.ceil((params.totalTokens || 0) * 0.25);
    
    const totalTokens = promptTokens + cachedTokens + completionTokens;

    let costUSD = 0;
    let costINR = 0;
    const exchangeRate = pricing.exchangeRateINR || LiateToken.globalExchangeRateINR || 95.39;

    const cachedRate = pricing.cachedCostPer1M ?? pricing.promptCostPer1M;

    if (pricing.currency === 'INR') {
      // Exact INR Calculation (Sarvam)
      costINR = (promptTokens * (pricing.promptCostPer1M / 1_000_000)) + 
                (cachedTokens * (cachedRate / 1_000_000)) +
                (completionTokens * (pricing.completionCostPer1M / 1_000_000));
      costUSD = costINR / exchangeRate;
    } else {
      // Exact USD Calculation (Groq, Anthropic, OpenAI)
      costUSD = (promptTokens * (pricing.promptCostPer1M / 1_000_000)) + 
                (cachedTokens * (cachedRate / 1_000_000)) +
                (completionTokens * (pricing.completionCostPer1M / 1_000_000));
      costINR = costUSD * exchangeRate;
    }

    return {
      model,
      promptTokens,
      cachedTokens,
      completionTokens,
      totalTokens,
      costUSD,
      costINR,
      totalInr: costINR,
      totalCostInr: costINR,
      formattedUSD: `$${costUSD.toFixed(5)}`,
      formattedINR: `₹${costINR.toFixed(4)}`,
      provider: pricing.provider || 'AI Provider'
    };

  }

  /**
   * Estimate token cost directly from prompt and completion strings
   */
  public estimateCost(prompt: string, completion: string = ''): TokenCostResult {
    const promptTokens = LiateToken.count(prompt);
    const completionTokens = LiateToken.count(completion);
    return LiateToken.calculateCost({
      model: this.model,
      promptTokens,
      completionTokens
    });
  }


  /**
   * Cost calculator for Sarvam Speech-to-Text (STT)
   * ₹30.00 / hour standard, ₹45.00 / hour with diarization
   */
  static calculateSpeechToTextCost(durationSeconds: number, diarization: boolean = false): { costINR: number; formattedINR: string } {
    const ratePerHour = diarization ? 45.00 : 30.00;
    const costINR = (durationSeconds / 3600) * ratePerHour;
    return { costINR, formattedINR: `₹${costINR.toFixed(2)}` };
  }

  /**
   * Cost calculator for Sarvam Text-to-Speech (TTS)
   * ₹3.00 / 1,000 characters
   */
  static calculateTextToSpeechCost(charCount: number): { costINR: number; formattedINR: string } {
    const costINR = (charCount / 1000) * 3.00;
    return { costINR, formattedINR: `₹${costINR.toFixed(2)}` };
  }

  /**
   * Cost calculator for Sarvam Doc AI
   * ₹0.50 / page digitisation, ₹1.00 / page extraction
   */
  static calculateDocAiCost(pages: number, mode: 'digitisation' | 'extraction' = 'digitisation'): { costINR: number; formattedINR: string } {
    const rate = mode === 'extraction' ? 1.00 : 0.50;
    const costINR = pages * rate;
    return { costINR, formattedINR: `₹${costINR.toFixed(2)}` };
  }

  // --- Static Context Optimizer Utilities ---

  static sanitize(rawOutput: any, maxChars: number = 3000): string {
    return sanitizeToolOutput(rawOutput, maxChars);
  }

  static minifySchemas(tools: any[]): any[] {
    return minifyToolSchemas(tools);
  }

  static pruneTrajectory(messages: any[], keepRecentTurns: number = 2): any[] {
    return pruneTrajectoryMessages(messages, keepRecentTurns);
  }

  // --- Triggers & Event Monitoring ---

  /**
   * Attach a trigger that fires when turn/session cost crosses a specific INR threshold
   */
  onCost(operator: '>=' | '<=' | '>', thresholdINR: number, callback: CostTriggerCallback): this {
    this.triggers.push({ operator, thresholdINR, callback });
    return this;
  }

  /**
   * Record exact usage reported from LLM response headers
   */
  recordUsage(promptTokens: number, completionTokens: number, cachedTokens: number = 0): TokenCostResult {
    this.accumulatedPromptTokens += promptTokens;
    this.accumulatedCachedTokens += cachedTokens;
    this.accumulatedCompletionTokens += completionTokens;

    const cost = LiateToken.calculateCost({
      model: this.model,
      promptTokens: this.accumulatedPromptTokens,
      cachedTokens: this.accumulatedCachedTokens,
      completionTokens: this.accumulatedCompletionTokens,
    });

    // Deduct from credits if available
    this.creditBalance = Math.max(0, this.creditBalance - cost.costINR);

    // Evaluate triggers
    for (const trigger of this.triggers) {
      if (
        (trigger.operator === '>=' && cost.costINR >= trigger.thresholdINR) ||
        (trigger.operator === '>' && cost.costINR > trigger.thresholdINR) ||
        (trigger.operator === '<=' && cost.costINR <= trigger.thresholdINR)
      ) {
        try {
          trigger.callback(cost);
        } catch (err) {
          console.error('[LiateToken Trigger Error]:', err);
        }
      }
    }

    if (this.isBudgetExceeded(cost)) {
      const msg = `[LiateToken Budget Guard] Token budget exceeded! Accumulated: ${cost.totalTokens} tokens (${cost.formattedINR}).`;
      if (this.onBudgetExceeded === 'throw') {
        throw new Error(msg);
      } else {
        console.warn(`\x1b[33m⚠️  ${msg}\x1b[0m`);
      }
    }

    return cost;
  }

  isBudgetExceeded(currentCost?: TokenCostResult): boolean {
    const cost = currentCost || LiateToken.calculateCost({
      model: this.model,
      promptTokens: this.accumulatedPromptTokens,
      cachedTokens: this.accumulatedCachedTokens,
      completionTokens: this.accumulatedCompletionTokens,
    });

    if (cost.totalTokens > this.maxSessionTokens) return true;
    if (this.maxCostINR && cost.costINR > this.maxCostINR) return true;
    if (this.maxCostUSD && cost.costUSD > this.maxCostUSD) return true;
    return false;
  }

  getUsage(): TokenCostResult {
    return LiateToken.calculateCost({
      model: this.model,
      promptTokens: this.accumulatedPromptTokens,
      cachedTokens: this.accumulatedCachedTokens,
      completionTokens: this.accumulatedCompletionTokens,
    });
  }

  reset(): void {
    this.accumulatedPromptTokens = 0;
    this.accumulatedCachedTokens = 0;
    this.accumulatedCompletionTokens = 0;
  }

  toJSON() {
    return {
      model: this.model,
      creditBalance: this.creditBalance,
      maxSessionTokens: this.maxSessionTokens,
      usage: this.getUsage(),
    };
  }
}
