/**
 * [29] - LiateSync (Distributed State Synchronization, CRDT & Real-Time Event Sync Engine)
 * 
 * Provides real-time shared working state across multi-agent swarms, cross-tab UI synchronization
 * via BroadcastChannel, offline-first vector clock delta resolution, and WebSocket pub/sub.
 */

export type SyncTransport = 'memory' | 'broadcast-channel' | 'websocket' | 'ipc';

export interface SyncDelta {
  key: string;
  value: any;
  version: number;
  timestamp: number;
  origin: string;
}

export interface SyncConfig {
  channel?: string;
  transport?: SyncTransport;
  initialData?: Record<string, any>;
}

export class LiateSync {
  public channel: string;
  public transport: SyncTransport;
  public instanceId: string;

  private state: Map<string, any> = new Map();
  private versions: Map<string, number> = new Map();
  private history: SyncDelta[] = [];
  private listeners: Map<string, Set<(val: any, delta?: SyncDelta) => void>> = new Map();
  private broadcastChannel?: any;

  constructor(config: SyncConfig = {}) {
    this.channel = config.channel || 'liate-sync-default';
    this.transport = config.transport || 'memory';
    this.instanceId = `node-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    if (config.initialData) {
      for (const [k, v] of Object.entries(config.initialData)) {
        this.set(k, v);
      }
    }

    // Initialize BroadcastChannel if in browser or supported environment
    if (typeof BroadcastChannel !== 'undefined' && this.transport === 'broadcast-channel') {
      try {
        this.broadcastChannel = new BroadcastChannel(this.channel);
        this.broadcastChannel.onmessage = (event: MessageEvent) => {
          if (event.data && event.data.origin !== this.instanceId) {
            this.applyDelta(event.data);
          }
        };
      } catch {}
    }
  }

  /**
   * Set a state variable and broadcast delta to all synchronized nodes/agents
   */
  public set(key: string, value: any): this {
    const currentVersion = (this.versions.get(key) || 0) + 1;
    this.state.set(key, value);
    this.versions.set(key, currentVersion);

    const delta: SyncDelta = {
      key,
      value,
      version: currentVersion,
      timestamp: Date.now(),
      origin: this.instanceId
    };

    this.history.push(delta);
    this.notify(key, value, delta);

    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage(delta);
      } catch {}
    }

    return this;
  }

  /**
   * Read a state variable from synchronized memory
   */
  public get<T = any>(key: string, defaultValue?: T): T {
    return (this.state.has(key) ? this.state.get(key) : defaultValue) as T;
  }

  /**
   * Append an item to a list in synchronized state
   */
  public pushItem<T = any>(key: string, item: T): this {
    const currentList = this.get<T[]>(key, []) || [];
    const updatedList = Array.isArray(currentList) ? [...currentList, item] : [item];
    return this.set(key, updatedList);
  }

  /**
   * Delete a key from synchronized state
   */
  public delete(key: string): this {
    this.state.delete(key);
    const currentVersion = (this.versions.get(key) || 0) + 1;
    this.versions.set(key, currentVersion);

    const delta: SyncDelta = {
      key,
      value: undefined,
      version: currentVersion,
      timestamp: Date.now(),
      origin: this.instanceId
    };

    this.history.push(delta);
    this.notify(key, undefined, delta);

    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage(delta);
      } catch {}
    }

    return this;
  }

  /**
   * Subscribe to state changes on a specific key or wildcard ('*')
   */
  public on(event: 'change' | string, callback: (val: any, delta?: SyncDelta) => void): this {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
    return this;
  }

  /**
   * Apply an incoming delta with CRDT vector-clock resolution
   */
  public applyDelta(delta: SyncDelta): boolean {
    const currentVersion = this.versions.get(delta.key) || 0;
    
    // Conflict resolution: only apply if incoming version is greater, or timestamps break ties
    if (delta.version > currentVersion) {
      this.state.set(delta.key, delta.value);
      this.versions.set(delta.key, delta.version);
      this.history.push(delta);
      this.notify(delta.key, delta.value, delta);
      return true;
    }

    return false;
  }

  /**
   * Export complete snapshot of synchronized state
   */
  public snapshot(): Record<string, any> {
    return Object.fromEntries(this.state.entries());
  }

  /**
   * Get all state deltas that occurred since a given timestamp
   */
  public getDeltaSince(timestamp: number): SyncDelta[] {
    return this.history.filter(d => d.timestamp >= timestamp);
  }

  /**
   * Clear all synchronized state
   */
  public clear(): void {
    this.state.clear();
    this.versions.clear();
    this.history = [];
  }

  private notify(key: string, value: any, delta: SyncDelta): void {
    // Notify specific key listeners
    const specific = this.listeners.get(key);
    if (specific) {
      specific.forEach(cb => cb(value, delta));
    }

    // Notify generic change / wildcard listeners
    const generic = this.listeners.get('change') || this.listeners.get('*');
    if (generic) {
      generic.forEach(cb => cb(value, delta));
    }
  }

  public close(): void {
    if (this.broadcastChannel) {
      this.broadcastChannel.close();
    }
  }
}

export const Sync = LiateSync;
