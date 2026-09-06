import { LlmRequest, LlmResponse, LlmSummaryRequest } from '../types';
import { parseSSE } from '../sse';

/** Anthropic API endpoint — override via ANTHROPIC_API_URL env for enterprise proxies */
const ANTHROPIC_ENDPOINT = (globalThis as any).Bun?.env?.ANTHROPIC_API_URL
  || (globalThis as any).process?.env?.ANTHROPIC_API_URL
  || 'https://api.anthropic.com/v1/messages';

export async function generateAnthropic(req: LlmRequest): Promise<LlmResponse> {
  const endpoint = ANTHROPIC_ENDPOINT;
  
  const messages: any[] = [];
  
  for (const msg of req.messages) {
    if (msg.role === 'user') {
      messages.push({ role: 'user', content: msg.content });
    } else if (msg.role === 'assistant') {
      const contentBlocks: any[] = [];
      if (msg.content) {
        contentBlocks.push({ type: 'text', text: msg.content });
      }
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        for (const tc of msg.toolCalls) {
          contentBlocks.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.name,
            input: tc.args
          });
        }
      }
      messages.push({ role: 'assistant', content: contentBlocks });
    } else if (msg.role === 'tool' && msg.toolResult) {
      messages.push({
        role: 'user', // Anthropic requires tool results to come from the user
        content: [{
          type: 'tool_result',
          tool_use_id: msg.toolResult.toolCallId,
          content: typeof msg.toolResult.result === 'object' ? JSON.stringify(msg.toolResult.result) : String(msg.toolResult.result)
        }]
      });
    }
  }

  const isStreaming = !!req.onChunk && (!req.tools || req.tools.length === 0);

  const payload: any = {
    model: req.model,
    max_tokens: req.maxSteps ? req.maxSteps * 1000 : 4096,
    messages,
    stream: isStreaming
  };

  if (req.systemPrompt) {
    payload.system = req.systemPrompt;
  }

  if (req.tools && req.tools.length > 0) {
    payload.tools = req.tools.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema
    }));
    payload.tool_choice = { type: 'auto' };
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': req.apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errText = await response.text();
    return { text: '', error: `[Anthropic API Error]: ${errText}` };
  }

  if (isStreaming && req.onChunk) {
    let fullText = '';
    let hasThinkOpen = false;
    const { toolCalls } = await parseSSE(response, (chunk) => {
      fullText += chunk;
      req.onChunk!(chunk);
    }, {
      text: (data) => {
        if (data.type === 'content_block_delta') {
          if (data.delta?.type === 'thinking_delta') {
            let chunk = '';
            if (!hasThinkOpen) {
              chunk += '<think>\n';
              hasThinkOpen = true;
            }
            chunk += data.delta.thinking;
            return chunk;
          }
          if (data.delta?.type === 'text_delta') {
            let chunk = '';
            if (hasThinkOpen) {
              chunk += '\n</think>\n\n';
              hasThinkOpen = false;
            }
            chunk += data.delta.text;
            return chunk;
          }
        }
        return undefined;
      },
      toolCall: (data) => {
        if (data.type === 'content_block_start' && data.content_block?.type === 'tool_use') {
          return {
            index: data.index,
            id: data.content_block.id,
            name: data.content_block.name,
            args: ''
          };
        } else if (data.type === 'content_block_delta' && data.delta?.type === 'input_json_delta') {
          return {
            index: data.index,
            args: data.delta.partial_json
          };
        }
        return undefined;
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

  if (data.type === 'error') {
    return { text: '', error: data.error?.message || 'Unknown Anthropic error' };
  }

  const thinkingBlocks = data.content?.filter((c: any) => c.type === 'thinking').map((c: any) => c.thinking) || [];
  const textBlocks = data.content?.filter((c: any) => c.type === 'text').map((c: any) => c.text) || [];
  
  let text = '';
  if (thinkingBlocks.length > 0) {
    text += `<think>\n${thinkingBlocks.join('\n')}\n</think>\n\n`;
  }
  text += textBlocks.join('\n');

  const toolUseBlocks = data.content?.filter((c: any) => c.type === 'tool_use') || [];
  if (toolUseBlocks.length > 0) {
    const toolCalls = toolUseBlocks.map((tu: any) => ({
      id: tu.id,
      name: tu.name,
      args: tu.input
    }));
    return { text, toolCalls };
  }

  return { text };
}

export async function summarizeAnthropic(req: LlmSummaryRequest): Promise<LlmResponse> {
  const endpoint = ANTHROPIC_ENDPOINT;
  
  const resultsString = req.toolResults.map(tr => 
    `Tool [${tr.name}]:\n${typeof tr.result === 'object' ? JSON.stringify(tr.result, null, 2) : tr.result}`
  ).join('\n\n');

  const payload: any = {
    model: req.model,
    max_tokens: 4096,
    system: "You are a helpful assistant. Provide a final human-readable response based STRICTLY AND ONLY on the provided tool data. Do not refuse to answer if the tool data contains the answer.",
    messages: [
      { role: 'user', content: `User asked: ${req.userPrompt}\n\nTool Data:\n${resultsString}` }
    ],
    stream: !!req.onChunk
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': req.apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    return { text: `[Tool Data Summary Failed]:\n\n${resultsString}` };
  }

  const data = await response.json();
  const textBlock = data.content.find((c: any) => c.type === 'text');
  return { text: textBlock ? textBlock.text : `[Tool Data]:\n\n${resultsString}` };
}
