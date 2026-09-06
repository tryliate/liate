/**
 * [L] - LiateModel (LLM Engine & Routing)
 */

export interface LiateModelConfig {
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

  constructor(config: string | LiateModelConfig) {
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

  toJSON() {
    return this.model;
  }
}
