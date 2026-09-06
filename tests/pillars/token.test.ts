/**
 * Tests for pillars/token.ts — LiateToken
 * Run with: bun test
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { LiateToken, MODEL_PRICING_REGISTRY, type ModelPricing } from '../../src/oop/Liate_AI/LiateToken';

// ─── Static helpers ──────────────────────────────────────────────────────────

describe('LiateToken.count', () => {
  it('returns 0 for empty string', () => {
    expect(LiateToken.count('')).toBe(0);
  });

  it('returns at least 1 for non-empty string', () => {
    expect(LiateToken.count('Hello')).toBeGreaterThanOrEqual(1);
  });

  it('uses lower chars-per-token for Indic text', () => {
    const english = 'a'.repeat(100);
    const hindi = 'क'.repeat(100); // Devanagari
    const enTokens = LiateToken.count(english);
    const hiTokens = LiateToken.count(hindi);
    // Indic text should yield more tokens per char
    expect(hiTokens).toBeGreaterThan(enTokens);
  });
});

describe('LiateToken.calculateCost', () => {
  it('calculates INR cost for Sarvam model', () => {
    const result = LiateToken.calculateCost({
      model: 'sarvam/sarvam-105b',
      promptTokens: 1_000_000,
      completionTokens: 0
    });
    expect(result.costINR).toBeCloseTo(29.28, 2);
    expect(result.formattedINR.startsWith('₹')).toBe(true);
  });

  it('calculates USD cost for Groq model and converts to INR', () => {
    const result = LiateToken.calculateCost({
      model: 'groq/llama-3.3-70b-versatile',
      promptTokens: 1_000_000,
      completionTokens: 0
    });
    expect(result.costUSD).toBeCloseTo(0.59, 2);
    expect(result.costINR).toBeGreaterThan(0);
  });

  it('returns formatted strings for USD and INR', () => {
    const result = LiateToken.calculateCost({ promptTokens: 100, completionTokens: 50 });
    expect(result.formattedINR).toMatch(/^₹/);
    expect(result.formattedUSD).toMatch(/^\$/);
  });

  it('falls back to sarvam pricing for unknown model', () => {
    const result = LiateToken.calculateCost({ model: 'unknown/model', promptTokens: 1000, completionTokens: 200 });
    expect(result.model).toBe('unknown/model');
    expect(result.costINR).toBeGreaterThan(0);
  });

  it('handles cached tokens with lower rate', () => {
    const withCache = LiateToken.calculateCost({
      model: 'sarvam/sarvam-105b',
      promptTokens: 0,
      cachedTokens: 1_000_000,
      completionTokens: 0
    });
    const withoutCache = LiateToken.calculateCost({
      model: 'sarvam/sarvam-105b',
      promptTokens: 1_000_000,
      cachedTokens: 0,
      completionTokens: 0
    });
    expect(withCache.costINR).toBeLessThan(withoutCache.costINR);
  });
});

// ─── Speech / Doc AI cost calculators ───────────────────────────────────────

describe('LiateToken.calculateSpeechToTextCost', () => {
  it('calculates STT cost at ₹30/hr for 1 hour', () => {
    const result = LiateToken.calculateSpeechToTextCost(3600);
    expect(result.costINR).toBeCloseTo(30.00, 2);
  });

  it('calculates diarization STT cost at ₹45/hr', () => {
    const result = LiateToken.calculateSpeechToTextCost(3600, true);
    expect(result.costINR).toBeCloseTo(45.00, 2);
  });

  it('calculates proportional cost for partial duration', () => {
    const result = LiateToken.calculateSpeechToTextCost(1800); // 30 min
    expect(result.costINR).toBeCloseTo(15.00, 2);
  });
});

describe('LiateToken.calculateTextToSpeechCost', () => {
  it('calculates TTS cost at ₹3/1000 chars', () => {
    const result = LiateToken.calculateTextToSpeechCost(1000);
    expect(result.costINR).toBeCloseTo(3.00, 2);
  });

  it('calculates proportional TTS cost', () => {
    const result = LiateToken.calculateTextToSpeechCost(500);
    expect(result.costINR).toBeCloseTo(1.50, 2);
  });
});

describe('LiateToken.calculateDocAiCost', () => {
  it('calculates digitisation at ₹0.50/page', () => {
    const result = LiateToken.calculateDocAiCost(10, 'digitisation');
    expect(result.costINR).toBeCloseTo(5.00, 2);
  });

  it('calculates extraction at ₹1.00/page', () => {
    const result = LiateToken.calculateDocAiCost(10, 'extraction');
    expect(result.costINR).toBeCloseTo(10.00, 2);
  });
});

// ─── Instance: recordUsage + budget ─────────────────────────────────────────

describe('LiateToken instance', () => {
  let token: LiateToken;

  beforeEach(() => {
    token = new LiateToken({
      model: 'sarvam/sarvam-105b',
      maxCostINR: 1.00,
      onBudgetExceeded: 'warn'
    });
  });

  it('starts with zero accumulated tokens', () => {
    const usage = token.getUsage();
    expect(usage.totalTokens).toBe(0);
    expect(usage.costINR).toBe(0);
  });

  it('accumulates usage across multiple recordUsage calls', () => {
    token.recordUsage(100, 50);
    token.recordUsage(200, 100);
    const usage = token.getUsage();
    expect(usage.promptTokens).toBe(300);
    expect(usage.completionTokens).toBe(150);
  });

  it('resets accumulated usage on reset()', () => {
    token.recordUsage(1000, 500);
    token.reset();
    const usage = token.getUsage();
    expect(usage.totalTokens).toBe(0);
  });

  it('detects budget exceeded when cost > maxCostINR', () => {
    // Record enough tokens to exceed ₹1 budget
    // Sarvam 105B: ₹29.28/1M prompt → need ~34K tokens to hit ₹1
    token.recordUsage(50_000, 0); // Should exceed ₹1 at ₹29.28/1M rate * 50K
    expect(token.isBudgetExceeded()).toBe(true);
  });

  it('fires onCost callback on recordUsage', () => {
    let fired = false;
    const t = new LiateToken({
      model: 'sarvam/sarvam-105b',
      onCost: () => { fired = true; }
    });
    t.recordUsage(100, 50);
    expect(fired).toBe(true);
  });
});

// ─── Static setPrice / setExchangeRate ──────────────────────────────────────

describe('LiateToken.setPrice', () => {
  it('registers a custom model pricing entry', () => {
    const customPricing: ModelPricing = {
      promptCostPer1M: 10.00,
      completionCostPer1M: 20.00,
      currency: 'INR',
      provider: 'TestProvider'
    };
    LiateToken.setPrice('test/my-model', customPricing);
    const result = LiateToken.calculateCost({
      model: 'test/my-model',
      promptTokens: 1_000_000,
      completionTokens: 0
    });
    expect(result.costINR).toBeCloseTo(10.00, 2);
    expect(result.provider).toBe('TestProvider');
  });
});

describe('LiateToken.setExchangeRate', () => {
  it('updates the global exchange rate', () => {
    LiateToken.setExchangeRate(90);
    expect(LiateToken.getExchangeRate()).toBe(90);
    // Reset to default for other tests
    LiateToken.setExchangeRate(87);
  });

  it('throws for non-positive exchange rate', () => {
    expect(() => LiateToken.setExchangeRate(0)).toThrow();
    expect(() => LiateToken.setExchangeRate(-5)).toThrow();
  });
});

// ─── estimateCost ────────────────────────────────────────────────────────────

describe('LiateToken estimateCost', () => {
  it('estimates cost from string content', () => {
    const t = new LiateToken({ model: 'sarvam/sarvam-105b' });
    const prompt = 'What is the capital of India?';
    const completion = 'The capital of India is New Delhi.';
    const result = t.estimateCost(prompt, completion);
    expect(result.totalTokens).toBeGreaterThan(0);
    expect(result.costINR).toBeGreaterThan(0);
  });
});
