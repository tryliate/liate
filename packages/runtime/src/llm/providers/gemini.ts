import { LlmRequest, LlmResponse, LlmSummaryRequest } from '../types';
import { parseSSE } from '../sse';

export async function generateGemini(req: LlmRequest): Promise<LlmResponse> {
  // Use v1beta for function calling support
  const modelName = req.model.includes('/') ? req.model.split('/')[1] : req.model;
  const isStreaming = !!req.onChunk && (!req.tools || req.tools.length === 0);
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:${isStreaming ? 'streamGenerateContent?alt=sse&' : 'generateContent?'}key=${req.apiKey}`;
  
  const contents: any[] = [];
  
  for (const msg of req.messages) {
    if (msg.role === 'user') {
      contents.push({ role: 'user', parts: [{ text: msg.content }] });
    } else if (msg.role === 'assistant') {
      const parts: any[] = [];
      if (msg.content) {
        parts.push({ text: msg.content });
      }
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        for (const tc of msg.toolCalls) {
          parts.push({
            functionCall: {
              name: tc.name,
              args: tc.args
            }
          });
        }
      }
      contents.push({ role: 'model', parts });
    } else if (msg.role === 'tool' && msg.toolResult) {
      contents.push({
        role: 'function',
        parts: [{
          functionResponse: {
            name: msg.toolResult.name,
            response: { result: typeof msg.toolResult.result === 'object' ? msg.toolResult.result : { value: msg.toolResult.result } }
          }
        }]
      });
    }
  }

  const payload: any = {
    contents
  };

  if (req.systemPrompt) {
    payload.systemInstruction = {
      parts: [{ text: req.systemPrompt }]
    };
  }

  if (req.tools && req.tools.length > 0) {
    const functionDeclarations = req.tools.map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.inputSchema
    }));
    
    payload.tools = [{ functionDeclarations }];
    payload.toolConfig = {
      functionCallingConfig: {
        mode: 'AUTO'
      }
    };
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errText = await response.text();
    return { text: '', error: `[Gemini API Error]: ${errText}` };
  }

  if (isStreaming && req.onChunk) {
    let fullText = '';
    const { toolCalls } = await parseSSE(response, (chunk) => {
      fullText += chunk;
      req.onChunk!(chunk);
    }, {
      text: (data) => data.candidates?.[0]?.content?.parts?.[0]?.text,
      toolCall: (data) => {
        const fc = data.candidates?.[0]?.content?.parts?.[0]?.functionCall;
        if (!fc) return undefined;
        return {
          index: 0,
          id: Math.random().toString(36).substring(7),
          name: fc.name,
          args: JSON.stringify(fc.args)
        };
      }
    });

    if (toolCalls && toolCalls.length > 0) {
      return { text: fullText, toolCalls };
    }
    return { text: fullText };
  }

  const data = await response.json();
  const candidate = data.candidates && data.candidates[0];

  if (!candidate) return { text: '', error: 'No choices returned from API' };

  const parts = candidate.content?.parts;
  
  if (parts && parts.length > 0) {
    const toolCalls = parts
      .filter((p: any) => p.functionCall)
      .map((p: any) => ({
        id: Math.random().toString(36).substring(7),
        name: p.functionCall.name,
        args: p.functionCall.args
      }));
      
    if (toolCalls.length > 0) {
      const textPart = parts.find((p: any) => p.text);
      return { text: textPart ? textPart.text : '', toolCalls };
    }
  }

  return { text: parts?.[0]?.text || '' };
}

export async function summarizeGemini(req: LlmSummaryRequest): Promise<LlmResponse> {
  const modelName = req.model.includes('/') ? req.model.split('/')[1] : req.model;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:${req.onChunk ? 'streamGenerateContent?alt=sse&' : 'generateContent?'}key=${req.apiKey}`;
  
  const resultsString = req.toolResults.map(tr => 
    `Tool [${tr.name}]:\n${typeof tr.result === 'object' ? JSON.stringify(tr.result, null, 2) : tr.result}`
  ).join('\n\n');

  const payload: any = {
    systemInstruction: {
      parts: [{ text: "You are a helpful assistant. Provide a final human-readable response based STRICTLY AND ONLY on the provided tool data. Do not refuse to answer if the tool data contains the answer." }]
    },
    contents: [
      { role: 'user', parts: [{ text: `User asked: ${req.userPrompt}\n\nTool Data:\n${resultsString}` }] }
    ]
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    return { text: `[Tool Data Summary Failed]:\n\n${resultsString}` };
  }

  const data = await response.json();
  const candidate = data.candidates && data.candidates[0];
  
  if (candidate && candidate.content && candidate.content.parts) {
    const text = candidate.content.parts.map((p: any) => p.text).join('');
    return { text };
  }

  return { text: `[Tool Data]:\n\n${resultsString}` };
}
