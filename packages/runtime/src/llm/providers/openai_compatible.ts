import { LlmRequest, LlmResponse, LlmSummaryRequest } from '../types';
import { parseSSE } from '../sse';

function getEnv(key: string): string | undefined {
  return (globalThis as any).Bun?.env?.[key] || (globalThis as any).process?.env?.[key];
}

function getEndpoint(provider: string): string {
  if (provider === 'groq') return getEnv('GROQ_API_URL') || 'https://api.groq.com/openai/v1/chat/completions';
  if (provider === 'openrouter') return getEnv('OPENROUTER_API_URL') || 'https://openrouter.ai/api/v1/chat/completions';
  if (provider === 'openai') return getEnv('OPENAI_API_URL') || 'https://api.openai.com/v1/chat/completions';
  if (provider === 'sarvam') return getEnv('SARVAM_API_URL') || 'https://api.sarvam.ai/v1/chat/completions';
  if (provider === 'deepseek') return getEnv('DEEPSEEK_API_URL') || 'https://api.deepseek.com/v1/chat/completions';
  if (provider === 'together') return getEnv('TOGETHER_API_URL') || 'https://api.together.xyz/v1/chat/completions';
  if (provider === 'omniroute' || provider === 'omni') {
    let envUrl = getEnv('OMNIROUTE_URL') || getEnv('OMNIROUTE_API_URL') || 'http://localhost:20128/v1';
    if (!envUrl.endsWith('/chat/completions')) {
      envUrl = envUrl.replace(/\/+$/, '') + '/chat/completions';
    }
    return envUrl;
  }
  if (provider === 'ollama') {
    let envUrl = getEnv('OLLAMA_API_URL') || getEnv('OLLAMA_URL') || 'http://localhost:11434/v1';
    if (!envUrl.endsWith('/chat/completions')) {
      envUrl = envUrl.replace(/\/+$/, '') + '/chat/completions';
    }
    return envUrl;
  }
  if (provider === 'vllm') {
    let envUrl = getEnv('VLLM_API_URL') || getEnv('VLLM_URL') || 'http://localhost:8000/v1';
    if (!envUrl.endsWith('/chat/completions')) {
      envUrl = envUrl.replace(/\/+$/, '') + '/chat/completions';
    }
    return envUrl;
  }
  throw new Error(`Unsupported provider for OpenAI compatible engine: ${provider}`);
}

export async function generateOpenAICompatible(req: LlmRequest): Promise<LlmResponse> {
  const endpoint = getEndpoint(req.provider);
  
  const messages: any[] = [];
  if (req.systemPrompt) {
    messages.push({ role: 'system', content: req.systemPrompt });
  }
  
  for (const msg of req.messages) {
    if (msg.role === 'user') {
      messages.push({ role: 'user', content: msg.content });
    } else if (msg.role === 'assistant') {
      const ast: any = { role: 'assistant', content: msg.content || null };
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        ast.tool_calls = msg.toolCalls.map(tc => ({
          id: tc.id,
          type: 'function',
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.args)
          }
        }));
      }
      messages.push(ast);
    } else if (msg.role === 'tool' && msg.toolResult) {
      messages.push({
        role: 'tool',
        tool_call_id: msg.toolResult.toolCallId,
        content: typeof msg.toolResult.result === 'object' ? JSON.stringify(msg.toolResult.result) : String(msg.toolResult.result)
      });
    }
  }

  const isStreaming = !!req.onChunk && (!req.tools || req.tools.length === 0);

  const payload: any = {
    model: req.model,
    messages,
    stream: isStreaming
  };

  const isReasoningModel = req.model.toLowerCase().includes('o1-') || req.model.toLowerCase().includes('o3-') || req.model.toLowerCase().startsWith('o1');
  if (req.effort && isReasoningModel) {
    payload.reasoning_effort = req.effort;
  }

  if (req.tools && req.tools.length > 0) {
    payload.tools = req.tools.map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema
      }
    }));
    payload.tool_choice = 'auto';
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  if (req.provider === 'sarvam') {
    headers['api-subscription-key'] = req.apiKey;
    headers['Authorization'] = `Bearer ${req.apiKey}`;
  } else {
    headers['Authorization'] = `Bearer ${req.apiKey}`;
  }

  if (req.provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://tryliate.com';
    headers['X-Title'] = 'om';
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30000)
  });

  if (!response.ok) {
    const errText = await response.text();
    
    if (req.provider === 'groq' && errText.includes('tool_use_failed')) {
      try {
        const errJson = JSON.parse(errText);
        const failedGen = errJson.error?.failed_generation;
        if (failedGen && typeof failedGen === 'string') {
          const match = failedGen.match(/<function=([^{\s>]+)\s*(\{.*?\})[^<]*<\/function>/s);
          if (match) {
            const toolName = match[1].trim();
            const toolArgs = JSON.parse(match[2]);
            return {
              text: '',
              toolCalls: [{
                id: `call_${Math.random().toString(36).substring(7)}`,
                name: toolName,
                args: toolArgs
              }]
            };
          }
        }
      } catch (e) {
        // ignore and let it throw the standard error below
      }
    }

    return { text: '', error: `[${req.provider} API Error]: ${errText}` };
  }

  if (isStreaming && req.onChunk) {
    let fullText = '';
    let hasThinkOpen = false;

    const { toolCalls } = await parseSSE(response, (chunk) => {
      fullText += chunk;
      req.onChunk!(chunk);
    }, {
      text: (data) => {
        const delta = data.choices?.[0]?.delta;
        if (!delta) return undefined;

        const content = delta.content || '';
        const reasoning = delta.reasoning_content || delta.reasoning || (delta as any).thinking || '';

        if (reasoning) {
          let chunk = '';
          if (!hasThinkOpen) {
            chunk += '<think>\n';
            hasThinkOpen = true;
          }
          chunk += reasoning;
          return chunk;
        } else if (content) {
          let chunk = '';
          if (hasThinkOpen) {
            chunk += '\n</think>\n\n';
            hasThinkOpen = false;
          }
          chunk += content;
          return chunk;
        }
        return undefined;
      },
      toolCall: (data) => {
        const tc = data.choices?.[0]?.delta?.tool_calls?.[0];
        if (!tc) return undefined;
        return {
          index: tc.index,
          id: tc.id,
          name: tc.function?.name,
          args: tc.function?.arguments
        };
      }
    });

    if (hasThinkOpen) {
      req.onChunk!('\n</think>\n\n');
      fullText += '\n</think>\n\n';
    }

    if (toolCalls && toolCalls.length > 0) {
      return { text: fullText, toolCalls };
    }
    return { text: fullText };
  }

  const data = await response.json();
  const choice = data.choices && data.choices[0];
  
  if (!choice) return { text: '', error: 'No choices returned from API' };

  const message = choice.message;
  const content = message.content || '';
  const reasoning = message.reasoning_content || message.reasoning || message.thinking || '';
  
  let text = '';
  if (reasoning) {
    text += `<think>\n${reasoning}\n</think>\n\n`;
  }
  text += content;

  if (message.tool_calls && message.tool_calls.length > 0) {
    const toolCalls = message.tool_calls.map((tc: any) => {
      let args = {};
      try { args = JSON.parse(tc.function.arguments); } catch (e) {}
      return {
        id: tc.id,
        name: tc.function.name,
        args
      };
    });
    return { text, toolCalls, usage: data.usage };
  }

  // Parse Sarvam / XML tool call formats e.g. <tool_call>name\n<arg_key>k</arg_key><arg_value>v</arg_value></tool_call>
  if (content.includes('<tool_call>')) {
    const match = content.match(/<tool_call>\s*([^\s<]+)(.*?)<\/tool_call>/s);
    if (match) {
      const toolName = match[1].trim();
      const body = match[2];
      const args: Record<string, any> = {};
      const argMatches = body.matchAll(/<arg_key>(.*?)<\/arg_key>\s*<arg_value>(.*?)<\/arg_value>/gs);
      for (const m of argMatches) {
        args[m[1].trim()] = m[2].trim();
      }
      return {
        text,
        toolCalls: [{
          id: `call_${Math.random().toString(36).substring(7)}`,
          name: toolName,
          args
        }],
        usage: data.usage
      };
    }
  }

  return { text, usage: data.usage };
}

export async function summarizeOpenAICompatible(req: LlmSummaryRequest): Promise<LlmResponse> {
  const endpoint = getEndpoint(req.provider);
  
  const resultsString = req.toolResults.map(tr => 
    `Tool [${tr.name}]:\n${typeof tr.result === 'object' ? JSON.stringify(tr.result, null, 2) : tr.result}`
  ).join('\n\n');

  const messages = [
    { role: 'system', content: "You are a helpful assistant. Provide a final human-readable response based STRICTLY AND ONLY on the provided tool data. Do not refuse to answer if the tool data contains the answer." },
    { role: 'user', content: `User asked: ${req.userPrompt}\n\nTool Data:\n${resultsString}` }
  ];

  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  if (req.provider === 'sarvam') {
    headers['api-subscription-key'] = req.apiKey;
  } else {
    headers['Authorization'] = `Bearer ${req.apiKey}`;
  }

  if (req.provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://tryliate.com';
    headers['X-Title'] = 'om';
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model: req.model, messages, stream: !!req.onChunk })
  });

  if (!response.ok) {
    return { text: `[Tool Data Summary Failed]:\n\n${resultsString}` };
  }

  if (req.onChunk) {
    let fullText = '';
    await parseSSE(response, (chunk) => {
      fullText += chunk;
      req.onChunk!(chunk);
    }, { text: (data: any) => data.choices?.[0]?.delta?.content });
    return { text: fullText };
  }

  const data = await response.json();
  const choice = data.choices && data.choices[0];
  
  return { text: choice ? choice.message.content : `[Tool Data]:\n\n${resultsString}` };
}
