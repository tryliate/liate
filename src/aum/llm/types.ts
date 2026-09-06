export interface LlmTool {
  name: string;
  description: string;
  inputSchema: any; // The raw MCP input schema
}

export interface LlmRequest {
  provider: string; // 'groq', 'openai', 'anthropic', 'google', 'openrouter'
  model: string;
  systemPrompt: string;
  messages: LlmMessage[];
  tools: LlmTool[];
  apiKey: string;
  effort?: string; // 'low', 'medium', 'high'
  maxSteps?: number;
  onChunk?: (chunk: string) => void;
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, any>;
}

export interface ToolResult {
  toolCallId: string;
  name: string;
  result: any;
}

export interface LlmMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  toolResult?: ToolResult;
}

export interface LlmResponse {
  text: string;
  toolCalls?: ToolCall[];
  error?: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// In the second step, when we have tool results, we need to pass them to summarize.
export interface LlmSummaryRequest {
  provider: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  toolResults: { name: string; result: any }[];
  apiKey: string;
  onChunk?: (chunk: string) => void;
}
