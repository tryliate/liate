import { LlmRequest, LlmResponse, LlmSummaryRequest } from './types';
import { generateOpenAICompatible, summarizeOpenAICompatible } from './providers/openai_compatible';
import { generateAnthropic, summarizeAnthropic } from './providers/anthropic';
import { generateGemini, summarizeGemini } from './providers/gemini';

export * from './types';

export async function generateNativeText(req: LlmRequest): Promise<LlmResponse> {
  const p = req.provider.toLowerCase();
  
  if (p === 'groq' || p === 'openai' || p === 'openrouter' || p === 'sarvam' || p === 'deepseek' || p === 'together' || p === 'omniroute' || p === 'omni' || p === 'ollama' || p === 'vllm') {
    return generateOpenAICompatible(req);
  }
  
  if (p === 'anthropic') {
    return generateAnthropic(req);
  }
  
  if (p === 'google' || p === 'gemini') {
    return generateGemini(req);
  }

  throw new Error(`Unsupported LLM Provider: ${req.provider}`);
}

export async function summarizeNativeText(req: LlmSummaryRequest): Promise<LlmResponse> {
  const p = req.provider.toLowerCase();
  
  if (p === 'groq' || p === 'openai' || p === 'openrouter' || p === 'sarvam' || p === 'deepseek' || p === 'together' || p === 'omniroute' || p === 'omni' || p === 'ollama' || p === 'vllm') {
    return summarizeOpenAICompatible(req);
  }
  
  if (p === 'anthropic') {
    return summarizeAnthropic(req);
  }
  
  if (p === 'google' || p === 'gemini') {
    return summarizeGemini(req);
  }

  throw new Error(`Unsupported LLM Provider: ${req.provider}`);
}
