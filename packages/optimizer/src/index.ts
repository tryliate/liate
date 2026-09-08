import type { LlmMessage } from '@liate/runtime';

/**
 * @liate/optimizer
 * Sovereign Token & Context Optimizer
 */

export interface MinifiedTool {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
}

const STRIP_SCHEMA_KEYS = ['$schema', 'title', 'additionalProperties', 'default'];
const CURSOR_KEYS = ['nextPageToken', 'next_page_token', 'cursor', 'next_cursor', 'page_token', 'pageToken', 'requestId', 'request_id'];

/**
 * Minifies tool JSON schemas to remove unnecessary tokens prior to LLM submission.
 */
export function minifyToolSchemas(tools: any[]): MinifiedTool[] {
  if (!tools || !Array.isArray(tools)) return [];

  return tools.map((tool) => {
    let description = typeof tool.description === 'string'
      ? (tool.description.length > 150 ? tool.description.slice(0, 147) + '...' : tool.description)
      : `Tool ${tool.name}`;

    const cleanSchema: Record<string, any> = { type: 'object', properties: {} };
    if (tool.inputSchema && typeof tool.inputSchema === 'object') {
      for (const [k, v] of Object.entries(tool.inputSchema)) {
        if (!STRIP_SCHEMA_KEYS.includes(k)) {
          cleanSchema[k] = v;
        }
      }
    }

    return {
      name: tool.name,
      description,
      inputSchema: cleanSchema
    };
  });
}

function cleanObjectForTokens(obj: any): any {
  if (obj === null || obj === undefined) return obj;

  if (typeof obj === 'string') {
    // Strip long base64-like blobs (>100 consecutive base64 chars without spaces)
    return obj.replace(/[A-Za-z0-9+/=]{100,}/g, '[token_pruned]');
  }

  if (Array.isArray(obj)) {
    if (obj.length > 10) {
      const sliced = obj.slice(0, 10).map(cleanObjectForTokens);
      sliced.push({ _summary: `[${obj.length - 10} additional items omitted for token optimization]` });
      return sliced;
    }
    return obj.map(cleanObjectForTokens);
  }

  if (typeof obj === 'object') {
    const cleaned: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (CURSOR_KEYS.includes(k)) continue;
      cleaned[k] = cleanObjectForTokens(v);
    }
    return cleaned;
  }

  return obj;
}

/**
 * Truncates and sanitizes tool execution output to keep prompt tokens within safe limits.
 */
export function sanitizeToolOutput(output: any, maxChars: number = 2000): string {
  if (output === null || output === undefined) return '';

  let processed: string;
  if (typeof output === 'object') {
    try {
      const cleaned = cleanObjectForTokens(output);
      processed = JSON.stringify(cleaned);
    } catch {
      processed = String(output);
    }
  } else {
    processed = String(output);
  }

  if (processed.length > maxChars) {
    const half = Math.floor(maxChars / 2);
    processed =
      processed.slice(0, half) +
      '\n[Truncated for token optimization]\n' +
      processed.slice(processed.length - half);
  }

  return processed;
}

/**
 * Compacts trajectory message history in multi-turn conversations.
 */
export function pruneTrajectoryMessages(
  messages: LlmMessage[],
  keepRecentTurns: number = 2
): LlmMessage[] {
  if (!messages || messages.length <= 4) return messages;

  const keepCount = keepRecentTurns * 2;
  const cutoffIndex = Math.max(0, messages.length - keepCount);

  return messages.map((msg, index) => {
    if (msg.role !== 'tool' || index >= cutoffIndex) {
      return msg;
    }

    let compactContent = '[Historical output compacted]';
    if (typeof msg.content === 'string' && msg.content.length > 80) {
      compactContent = `${msg.content.slice(0, 60)}... [Historical output compacted]`;
    }

    return {
      ...msg,
      content: compactContent,
      toolResult: msg.toolResult ? { ...msg.toolResult, result: compactContent } : undefined
    };
  });
}
