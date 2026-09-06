import { LiateAgent } from '../Liate_Pillars/LiateAgent';
import { LiateStream } from '../Liate_AI/LiateStream';

/**
 * [35] - LiateGraph (Sovereign Multi-Agent State Graph, Cyclic & Acyclic Engine)
 * 
 * Provides state graphs with nodes, deterministic edges, conditional routing,
 * cyclic loops with max-cycle guards, and visual Mermaid.js diagram generation.
 */

export type GraphNodeHandler<TState = Record<string, any>> = 
  | ((state: TState) => Promise<Partial<TState> | void> | Partial<TState> | void)
  | LiateAgent;

export type ConditionalEdgeRouter<TState = Record<string, any>> = 
  | ((state: TState) => string | Promise<string>);

export interface GraphOptions {
  name?: string;
  maxCycles?: number;
  timeoutMs?: number;
}

export class LiateGraph<TState extends Record<string, any> = Record<string, any>> {
  public name: string;
  public maxCycles: number;
  public nodes: Map<string, GraphNodeHandler<TState>> = new Map();
  public edges: Map<string, string> = new Map();
  public conditionalEdges: Map<string, ConditionalEdgeRouter<TState>> = new Map();

  constructor(options: string | GraphOptions = 'liate-graph') {
    if (typeof options === 'string') {
      this.name = options;
      this.maxCycles = 10;
    } else {
      this.name = options.name || 'liate-graph';
      this.maxCycles = options.maxCycles || 10;
    }
  }

  /**
   * Add a node (function or autonomous agent) to the graph
   */
  public addNode(name: string, handler: GraphNodeHandler<TState>): this {
    this.nodes.set(name, handler);
    return this;
  }

  /**
   * Add a deterministic one-way directed edge from one node to another
   */
  public addEdge(from: string, to: string): this {
    this.edges.set(from, to);
    return this;
  }

  /**
   * Add a conditional edge branching dynamically based on state
   */
  public addConditionalEdge(from: string, router: ConditionalEdgeRouter<TState>): this {
    this.conditionalEdges.set(from, router);
    return this;
  }

  /**
   * Execute the graph starting from START or first node until reaching END
   */
  public async run(initialState: Partial<TState> = {}): Promise<TState> {
    let state = { ...initialState } as TState;
    let currentNode = this.edges.get('START') || Array.from(this.nodes.keys())[0];
    let cycles = 0;

    while (currentNode && currentNode !== 'END' && cycles < this.maxCycles) {
      cycles++;

      const handler = this.nodes.get(currentNode);
      if (handler) {
        if (handler instanceof LiateAgent) {
          const prompt = typeof state === 'string' ? state : JSON.stringify(state);
          const res: any = await handler.run(prompt);
          const text = typeof res === 'string' ? res : res?.response || JSON.stringify(res);
          state = { ...state, [currentNode]: text } as TState;

        } else {
          const delta = await handler(state);
          if (delta && typeof delta === 'object') {
            state = { ...state, ...delta };
          }
        }
      }

      // Determine next node
      if (this.conditionalEdges.has(currentNode)) {
        const router = this.conditionalEdges.get(currentNode)!;
        currentNode = await router(state);
      } else if (this.edges.has(currentNode)) {
        currentNode = this.edges.get(currentNode)!;
      } else {
        break; // Reached leaf node
      }
    }

    return state;
  }

  /**
   * Execute graph and stream node state transitions in real time
   */
  public stream(initialState: Partial<TState> = {}): LiateStream {
    const stream = new LiateStream();

    this.run(initialState).then((finalState) => {
      stream.emit('RESULT', finalState);
      stream.emit('DONE', finalState);
    }).catch((err) => {
      stream.emit('ERROR', err.message || String(err));
    });

    return stream;
  }

  /**
   * Automatically generate a Mermaid.js diagram representing the graph
   */
  public toMermaid(): string {
    const lines: string[] = ['graph TD'];

    for (const [from, to] of this.edges.entries()) {
      lines.push(`    ${from} --> ${to}`);
    }

    for (const from of this.conditionalEdges.keys()) {
      lines.push(`    ${from} -.->|conditional| Branch_${from}`);
    }


    return lines.join('\n');
  }
}

export const Graph = LiateGraph;
