import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { JSONRPCMessage, JSONRPCRequest } from '@modelcontextprotocol/sdk/types.js';

/**
 * Modern Stateless Streamable HTTP Transport for Model Context Protocol (MCP).
 * Supports header-based routing (Mcp-Method, Mcp-Name) and chunked response streaming.
 */
export class StreamableHttpClientTransport implements Transport {
  private url: string;
  private headers: Record<string, string>;
  public onclose?: () => void;
  public onerror?: (error: Error) => void;
  public onmessage?: (message: JSONRPCMessage) => void;

  constructor(url: string, headers: Record<string, string> = {}) {
    this.url = url;
    this.headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream, application/x-ndjson, */*',
      'User-Agent': 'Liate-Engine/1.0',
      ...headers
    };
  }

  async start(): Promise<void> {
    // Stateless transport does not require persistent TCP handshake
    return Promise.resolve();
  }

  async send(message: JSONRPCMessage): Promise<void> {
    try {
      const req = message as JSONRPCRequest;
      const method = req.method || 'unknown';
      let toolName = '';
      
      if (method === 'tools/call' && req.params && (req.params as any).name) {
        toolName = (req.params as any).name;
      }

      const requestHeaders: Record<string, string> = {
        ...this.headers,
        'Mcp-Method': method,
      };

      if (toolName) {
        requestHeaders['Mcp-Name'] = toolName;
      }

      const res = await fetch(this.url, {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify(message)
      });

      if (!res.ok && res.status !== 405) {
        throw new Error(`Streamable HTTP MCP request failed with HTTP ${res.status}: ${await res.text()}`);
      }

      const contentType = res.headers.get('content-type') || '';
      const text = await res.text();

      if (contentType.includes('application/x-ndjson') || contentType.includes('text/event-stream') || text.includes('data:')) {
        const lines = text.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue;
          const jsonStr = trimmed.startsWith('data:') ? trimmed.slice(5).trim() : trimmed;
          try {
            const parsed = JSON.parse(jsonStr) as JSONRPCMessage;
            queueMicrotask(() => {
              if (this.onmessage) this.onmessage(parsed);
            });
          } catch {}
        }
      } else if (text && text.trim()) {
        try {
          const json = JSON.parse(text) as JSONRPCMessage;
          queueMicrotask(() => {
            if (this.onmessage) this.onmessage(json);
          });
        } catch {}
      }
    } catch (err: any) {
      if (this.onerror) {
        this.onerror(err instanceof Error ? err : new Error(String(err)));
      }
    }
  }

  async close(): Promise<void> {
    if (this.onclose) this.onclose();
    return Promise.resolve();
  }
}
