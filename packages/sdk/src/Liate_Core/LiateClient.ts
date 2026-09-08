/**
 * [20] - LiateWeb / LiateClient (Universal Frontend & Client Web Connector)
 * 
 * Connects any Frontend (Vite, React, Next.js, Svelte, Vue, Mobile)
 * to the Sovereign Liate AI Agents Runtime over LAPI/v1 REST + WebSockets.
 */

import { LiateStream } from '../Liate_AI/LiateStream';

export interface LiateWebOptions {

  baseUrl?: string;
  apiKey?: string;
  wsUrl?: string;
}

export interface AgentRunCallbacks {
  prompt: string;
  session?: string;
  stream?: boolean;
  onThought?: (thought: string) => void;
  onToken?: (token: string) => void;
  onStatus?: (status: string) => void;
  onApproval?: (toolCall: { id: string; name: string; args: any }) => Promise<boolean>;
  onCost?: (cost: { totalInr: number; formattedINR: string; promptTokens: number; completionTokens: number }) => void;
}

export interface RunResponse {
  response: string;
  session?: string;
  usage?: any;
  traces?: string[];
}

export class LiateWeb {
  public baseUrl: string;
  public wsUrl: string;
  public apiKey?: string;
  private ws?: WebSocket;

  constructor(options: LiateWebOptions = {}) {
    const defaultHttp = 'http://localhost:7071';
    this.baseUrl = (options.baseUrl || defaultHttp).replace(/\/$/, '');
    this.wsUrl = options.wsUrl || this.baseUrl.replace(/^http/, 'ws');
    this.apiKey = options.apiKey;
  }

  /**
   * Run an agent with real-time streaming, thought trajectory, HITL approvals, and INR cost telemetry
   */
  async run(params: string | AgentRunCallbacks, agentId: string = 'default'): Promise<RunResponse> {
    const prompt = typeof params === 'string' ? params : params.prompt;
    const session = typeof params === 'object' ? params.session : undefined;
    const stream = typeof params === 'object' ? (params.stream ?? true) : false;

    const url = `${this.baseUrl}/lapi/v1/${encodeURIComponent(agentId)}/run`;
    
    // If callbacks provided, listen over WebSocket for thoughts & approvals
    if (typeof params === 'object' && (params.onThought || params.onApproval || params.onCost)) {
      this.setupWebSocket(params);
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {})
      },
      body: JSON.stringify({ prompt, session, stream })
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`[LiateWeb Error ${res.status}]: ${err}`);
    }

    // If streaming response requested in browser
    if (stream && res.body && typeof params === 'object') {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullAnswer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';

        for (const part of parts) {
          if (!part.trim()) continue;
          let eventType = 'message';
          let dataStr = '';

          const lines = part.split('\n');
          for (const line of lines) {
            if (line.startsWith('event:')) {
              eventType = line.replace('event:', '').trim();
            } else if (line.startsWith('data:')) {
              dataStr = line.replace('data:', '').trim();
            }
          }

          if (dataStr) {
            try {
              const payload = JSON.parse(dataStr);
              const content = payload.content ?? payload.msg ?? payload;

              if (eventType === 'thought' || eventType === 'tool_call' || eventType === 'tool_result') {
                params.onThought?.(typeof content === 'string' ? content : JSON.stringify(content));
              } else if (eventType === 'status') {
                params.onStatus?.(typeof content === 'string' ? content : JSON.stringify(content));
              } else if (eventType === 'result' || eventType === 'chunk') {
                const text = typeof content === 'string' ? content : JSON.stringify(content);
                // Clean extract <think> tags if model embeds them
                const thinkMatch = text.match(/<think>([\s\S]*?)<\/think>/i);
                if (thinkMatch && thinkMatch[1]) {
                  params.onThought?.(thinkMatch[1].trim());
                }
                const cleanText = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
                if (cleanText) {
                  fullAnswer = cleanText;
                  params.onToken?.(cleanText);
                }
              }
            } catch {
              if (dataStr && !dataStr.startsWith('{')) {
                params.onToken?.(dataStr);
              }
            }
          }
        }
      }

      return { response: fullAnswer, session };
    }


    const data = await res.json();
    const output = data.response || data.output || data.result || JSON.stringify(data);
    return {
      response: output,
      session: data.session,
      usage: data.usage,
      traces: data.traces
    };
  }

  /**
   * Stream agent execution returning a LiateStream instance
   */
  public async stream(prompt: string, options: { session?: string; agentId?: string } = {}): Promise<LiateStream> {
    const stream = new LiateStream();
    
    // Start execution asynchronously in background and pipe events to stream
    this.run({
      prompt,
      session: options.session,
      stream: true,
      onThought: (t) => stream.emit('THOUGHT', t),
      onToken: (tok) => stream.emit('TOKEN', tok),
      onStatus: (s) => stream.emit('STATUS', s),
      onCost: (c) => stream.emit('COST', c)
    }, options.agentId || 'default').then((res) => {
      stream.emit('RESULT', res.response);
      stream.emit('DONE', res.response);
    }).catch((err) => {
      stream.emit('ERROR', err.message || String(err));
    });

    return stream;
  }


  /**
   * Connect to WebSocket Hub for live thought streaming and HITL approvals
   */
  private setupWebSocket(callbacks: AgentRunCallbacks): void {
    if (typeof WebSocket === 'undefined') return;

    try {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        this.ws = new WebSocket(this.wsUrl);

        this.ws.onmessage = async (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'THOUGHT' && callbacks.onThought) {
              callbacks.onThought(data.content || data.thought);
            }
            if (data.type === 'STATUS' && callbacks.onStatus) {
              callbacks.onStatus(data.content || data.status);
            }
            if (data.type === 'COST' && callbacks.onCost) {
              callbacks.onCost(data.cost);
            }
            if (data.type === 'APPROVAL_REQUEST' && callbacks.onApproval) {
              const allowed = await callbacks.onApproval(data.toolCall);
              this.ws?.send(JSON.stringify({
                type: 'tool_approval_response',
                id: data.id,
                allowed,
                toolName: data.toolCall?.name
              }));
            }
          } catch {}
        };
      }
    } catch {}
  }

  /**
   * List all deployed agents on the Sovereign Liate Runtime
   */
  async listAgents(): Promise<any[]> {
    const res = await fetch(`${this.baseUrl}/lapi/v1/agents`);
    if (!res.ok) return [];
    return await res.json();
  }

  /**
   * Get health status of the Sovereign Liate Runtime
   */
  async health(): Promise<{ status: string; uptime?: number }> {
    const res = await fetch(`${this.baseUrl}/lapi/v1/health`);
    if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
    return await res.json();
  }

  /**
   * Dispatches an asynchronous background task (202 Pattern)
   */
  async dispatchTask(agentId: string, prompt: string): Promise<{ taskId: string; status: string }> {
    const res = await fetch(`${this.baseUrl}/lapi/v1/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId, prompt })
    });
    return await res.json();
  }
}

// Aliases
export const LiateClient = LiateWeb;
export const Web = LiateWeb;
export const Client = LiateClient;
