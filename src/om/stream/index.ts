export interface StreamEvent {
  nodeId: string;
  type: 'STATUS' | 'THOUGHT' | 'RESULT' | 'ERROR' | 'SYSTEM_LOG';
  content: any;
  timestamp: string;
}

export type StreamFn = (event: StreamEvent) => void;

// Stream dispatcher for broadcasting live execution events over WebSocket / UI
export const createStreamDispatcher = (broadcastFn: (msg: any) => void): StreamFn => {
  return (event: StreamEvent) => {
    event.timestamp = new Date().toISOString();
    
    let uiType = event.type.toLowerCase();
    if (event.nodeId === 'system' && (event.content?.includes?.('completed successfully') || event.content?.includes?.('Execution aborted'))) {
      uiType = 'results';
    }

    const traceEntry = {
      timestamp: event.timestamp,
      source: 'om-engine',
      target: event.nodeId,
      hops: 1,
      type: uiType,
      message: typeof event.content === 'object' ? JSON.stringify(event.content) : String(event.content)
    };

    broadcastFn(traceEntry);
  };
};

export * from './streamable_http';
