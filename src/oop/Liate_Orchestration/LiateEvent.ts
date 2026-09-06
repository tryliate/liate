import crypto from 'node:crypto';
import { LiateAgent } from '../Liate_Pillars/LiateAgent';

/**
 * [46] - LiateEvent (Sovereign Distributed Pub/Sub Event Mesh & Event Sourcing Engine)
 * 
 * Enables fully decoupled asynchronous multi-agent orchestration via topic-based
 * event publishing, wildcard pattern matching (e.g. 'invoice.*'), immutable
 * event sourcing replay, and automated event-driven agent triggering.
 */

export interface EventEnvelope<T = any> {
  id: string;
  topic: string;
  payload: T;
  source: string;
  timestamp: number;
}

export interface EventOptions {
  persistEvents?: boolean; // Default: true
  maxHistorySize?: number; // Default: 10,000
}

export interface EventReplayOptions {
  since?: number;
  until?: number;
  limit?: number;
}

export type EventHandler<T = any> = (event: EventEnvelope<T>) => Promise<void> | void;

export class LiateEvent {
  private subscribers: Map<string, Set<EventHandler>> = new Map();
  private eventHistory: EventEnvelope[] = [];
  public options: Required<EventOptions>;

  constructor(options: EventOptions = {}) {
    this.options = {
      persistEvents: options.persistEvents ?? true,
      maxHistorySize: options.maxHistorySize || 10000
    };
  }

  /**
   * Publish an event to a topic
   */
  public async emit<T = any>(
    topic: string, 
    payload: T, 
    source: string = 'system'
  ): Promise<EventEnvelope<T>> {
    const envelope: EventEnvelope<T> = {
      id: `evt_${crypto.randomBytes(6).toString('hex')}`,
      topic: topic.trim(),
      payload,
      source,
      timestamp: Date.now()
    };

    // Store in history for event sourcing & replay
    if (this.options.persistEvents) {
      this.eventHistory.push(envelope);
      if (this.eventHistory.length > this.options.maxHistorySize) {
        this.eventHistory.shift();
      }
    }

    // Match subscribers (exact topic or wildcard pattern)
    const matchingHandlers = this.getMatchingHandlers(envelope.topic);
    const promises: Promise<any>[] = [];

    for (const handler of matchingHandlers) {
      try {
        const res = handler(envelope);
        if (res instanceof Promise) {
          promises.push(res.catch(() => {}));
        }
      } catch {}
    }

    if (promises.length > 0) {
      await Promise.all(promises);
    }

    return envelope;
  }

  /**
   * Subscribe to a topic pattern (supports exact topics or wildcards e.g. 'invoice.*', '*')
   * Returns an unsubscribe function.
   */
  public on<T = any>(topicPattern: string, handler: EventHandler<T>): () => void {
    const pattern = topicPattern.trim();
    if (!this.subscribers.has(pattern)) {
      this.subscribers.set(pattern, new Set());
    }

    this.subscribers.get(pattern)!.add(handler as EventHandler);

    return () => {
      const set = this.subscribers.get(pattern);
      if (set) {
        set.delete(handler as EventHandler);
        if (set.size === 0) this.subscribers.delete(pattern);
      }
    };
  }

  /**
   * Subscribe for a single event occurrence only
   */
  public once<T = any>(topicPattern: string, handler: EventHandler<T>): () => void {
    const unsubscribe = this.on<T>(topicPattern, (event) => {
      unsubscribe();
      handler(event);
    });
    return unsubscribe;
  }

  /**
   * Automatically triggers a LiateAgent when a matching event occurs
   */
  public subscribeAgent(
    topicPattern: string, 
    agent: LiateAgent, 
    promptBuilder?: (event: EventEnvelope) => string
  ): () => void {
    return this.on(topicPattern, async (event) => {
      const prompt = promptBuilder 
        ? promptBuilder(event)
        : `[Event Trigger: ${event.topic}]\nSource: ${event.source}\nPayload: ${JSON.stringify(event.payload)}`;

      await agent.run(prompt);
    });
  }

  /**
   * Replay historical events matching pattern
   */
  public async replay(
    topicPattern: string, 
    options: EventReplayOptions = {}
  ): Promise<EventEnvelope[]> {
    const regex = this.patternToRegex(topicPattern);
    const since = options.since || 0;
    const until = options.until || Infinity;
    const limit = options.limit || 1000;

    const filtered = this.eventHistory.filter(evt => {
      return (
        regex.test(evt.topic) &&
        evt.timestamp >= since &&
        evt.timestamp <= until
      );
    }).slice(-limit);

    return filtered;
  }

  /**
   * Retrieve stored event history
   */
  public getHistory(topicPattern?: string): EventEnvelope[] {
    if (!topicPattern) return [...this.eventHistory];
    const regex = this.patternToRegex(topicPattern);
    return this.eventHistory.filter(evt => regex.test(evt.topic));
  }

  /**
   * Clear all event history and subscribers
   */
  public clear(): void {
    this.eventHistory = [];
    this.subscribers.clear();
  }

  private getMatchingHandlers(topic: string): EventHandler[] {
    const handlers: EventHandler[] = [];

    for (const [pattern, handlerSet] of this.subscribers.entries()) {
      const regex = this.patternToRegex(pattern);
      if (regex.test(topic)) {
        handlerSet.forEach(h => handlers.push(h));
      }
    }

    return handlers;
  }

  private patternToRegex(pattern: string): RegExp {
    if (pattern === '*' || pattern === '#') return /.*/;
    const escaped = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '[^.]+')
      .replace(/#/g, '.*');
    return new RegExp(`^${escaped}$`);
  }

  /**
   * Convert into an agent tool for emitting business events
   */
  public toTool() {
    return {
      name: 'emit_business_event',
      description: 'Publishes an asynchronous business event to the sovereign multi-agent event bus',
      parameters: {
        type: 'object',
        properties: {
          topic: { type: 'string', description: 'Event topic (e.g. invoice.paid, user.registered, kyc.failed)' },
          payload: { type: 'object', description: 'JSON payload describing the event data' }
        },
        required: ['topic', 'payload']
      },
      execute: async (args: { topic: string; payload: any }) => {
        const envelope = await this.emit(args.topic, args.payload, 'agent-tool');
        return {
          status: 'EVENT_EMITTED',
          eventId: envelope.id,
          topic: envelope.topic,
          timestamp: envelope.timestamp
        };
      }
    };
  }
}

export const EventBus = LiateEvent;
export const Event = LiateEvent;
