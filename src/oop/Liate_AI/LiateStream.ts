/**
 * [21] - LiateStream (Universal Multi-Channel Agent Telemetry Engine)
 * 
 * Bridges LiateServer (Hono SSE / WebSockets) and LiateWeb (Browser / React / Vite / AsyncIterators).
 * Unifies 6 real-time channels: thoughts, tokens, tools, costs, HITL approvals, and status events.
 */

export type StreamEventType = 
  | 'THOUGHT' 
  | 'TOKEN' 
  | 'CHUNK'
  | 'TOOL_CALL' 
  | 'TOOL_RESULT' 
  | 'COST' 
  | 'STATUS' 
  | 'APPROVAL_REQUEST' 
  | 'APPROVAL_RESPONSE'
  | 'RESULT' 
  | 'ERROR' 
  | 'DONE';

export interface StreamEvent {
  id?: string;
  type: StreamEventType;
  content?: any;
  payload?: any;
  timestamp: string;
  metadata?: Record<string, any>;
}

export type StreamListener = (event: StreamEvent) => void;

export class LiateStream implements AsyncIterable<StreamEvent> {
  private listeners: Map<string, Set<StreamListener>> = new Map();
  private queue: StreamEvent[] = [];
  private waiters: Array<(result: IteratorResult<StreamEvent>) => void> = [];
  private isClosed: boolean = false;
  public totalTokens: number = 0;
  public totalCostInr: number = 0;
  public accumulatedText: string = '';

  constructor() {}

  /**
   * Publish an event into the multi-channel stream
   */
  public emit(type: StreamEventType, content: any, metadata?: Record<string, any>): void {
    if (this.isClosed && type !== 'DONE') return;

    const event: StreamEvent = {
      id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type,
      content,
      timestamp: new Date().toISOString(),
      metadata
    };

    // Track text accumulation & tokens
    if (type === 'TOKEN' || type === 'CHUNK' || type === 'RESULT') {
      const text = typeof content === 'string' ? content : JSON.stringify(content);
      const clean = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
      if (clean) this.accumulatedText = clean;
    }

    if (type === 'COST' && content?.totalInr) {
      this.totalCostInr = content.totalInr;
    }

    // Notify registered event listeners
    const specific = this.listeners.get(type);
    if (specific) {
      specific.forEach(fn => fn(event));
    }

    const wildcard = this.listeners.get('*');
    if (wildcard) {
      wildcard.forEach(fn => fn(event));
    }

    // Deliver to pending async iterator waiters
    if (this.waiters.length > 0) {
      const waiter = this.waiters.shift()!;
      waiter({ value: event, done: false });
    } else {
      this.queue.push(event);
    }

    if (type === 'DONE' || type === 'ERROR') {
      this.close();
    }
  }

  /**
   * Subscribe to specific event types: 'thought', 'token', 'tool', 'cost', 'approval', 'status', 'error', 'done'
   */
  public on(event: string, callback: (data: any) => void): this {
    const canonical = this.normalizeEventType(event);
    if (!this.listeners.has(canonical)) {
      this.listeners.set(canonical, new Set());
    }

    const listenerWrapper: StreamListener = (evt) => {
      callback(evt.content ?? evt);
    };

    this.listeners.get(canonical)!.add(listenerWrapper);
    return this;
  }

  /**
   * Subscribe alias for on()
   */
  public subscribe(event: string, callback: (data: any) => void): this {
    return this.on(event, callback);
  }


  /**
   * Closes the stream
   */
  public close(): void {
    if (this.isClosed) return;
    this.isClosed = true;

    while (this.waiters.length > 0) {
      const waiter = this.waiters.shift()!;
      waiter({ value: undefined as any, done: true });
    }
  }

  /**
   * Async Iterable Implementation (for await...of)
   */
  public [Symbol.asyncIterator](): AsyncIterator<StreamEvent> {
    return {
      next: (): Promise<IteratorResult<StreamEvent>> => {
        if (this.queue.length > 0) {
          const value = this.queue.shift()!;
          return Promise.resolve({ value, done: false });
        }

        if (this.isClosed) {
          return Promise.resolve({ value: undefined as any, done: true });
        }

        return new Promise<IteratorResult<StreamEvent>>((resolve) => {
          this.waiters.push(resolve);
        });
      }
    };
  }

  /**
   * Formats event for Server-Sent Events (SSE) wire protocol
   */
  public static formatSSE(type: StreamEventType, content: any): string {
    const payload = JSON.stringify({ type, content, timestamp: new Date().toISOString() });
    return `event: ${type.toLowerCase()}\ndata: ${payload}\n\n`;
  }

  /**
   * Creates a standard Web Response with text/event-stream headers
   */
  public toDataStreamResponse(): Response {
    const encoder = new TextEncoder();
    const stream = this;

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            const raw = LiateStream.formatSSE(event.type, event.content);
            controller.enqueue(encoder.encode(raw));
            if (event.type === 'DONE' || event.type === 'ERROR') break;
          }
        } finally {
          controller.close();
        }
      }
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
      }
    });
  }

  private normalizeEventType(type: string): string {
    const upper = type.toUpperCase();
    if (['THOUGHT', 'THOUGHTS'].includes(upper)) return 'THOUGHT';
    if (['TOKEN', 'TOKENS', 'CHUNK'].includes(upper)) return 'TOKEN';
    if (['TOOL', 'TOOL_CALL', 'TOOL_RESULT'].includes(upper)) return 'TOOL_CALL';
    if (['COST', 'PRICE', 'INR'].includes(upper)) return 'COST';
    if (['STATUS'].includes(upper)) return 'STATUS';
    if (['APPROVAL', 'APPROVAL_REQUEST'].includes(upper)) return 'APPROVAL_REQUEST';
    if (['RESULT', 'FINAL', 'ANSWER'].includes(upper)) return 'RESULT';
    if (['ERROR'].includes(upper)) return 'ERROR';
    if (['DONE', 'CLOSE'].includes(upper)) return 'DONE';
    return upper;
  }
}

export const Stream = LiateStream;
