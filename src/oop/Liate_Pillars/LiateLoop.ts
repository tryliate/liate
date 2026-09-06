import { runLiateAgent, LiateConfig } from '../../aum';
import { LiateAgent } from './LiateAgent';

export interface LiateLoopStep {
  turn: number;
  type: 'STATUS' | 'THOUGHT' | 'TOOL_CALL' | 'TOOL_RESULT' | 'CHUNK' | 'RESULT' | 'ERROR';
  content: string;
  toolName?: string;
  toolArgs?: any;
  toolResult?: any;
}

export interface LiateLoopOptions {
  maxTurns?: number;
  strategy?: 'react' | 'reflection' | 'plan-execute';
  onStep?: (step: LiateLoopStep) => void;
  approvalHandler?: (tool: string, args: any) => Promise<boolean>;
}

type LoopEventHandler = (...args: any[]) => void;

/**
 * LiateLoop — Sovereign Reasoning Loop & Execution Iterator
 */
export class LiateLoop {
  private agent: LiateAgent;
  private options: LiateLoopOptions;
  private listeners: Map<string, Set<LoopEventHandler>> = new Map();

  constructor(agent: LiateAgent | LiateConfig = new LiateAgent('loop-agent'), options: LiateLoopOptions = {}) {
    this.agent = agent instanceof LiateAgent ? agent : new LiateAgent(agent);
    this.options = options;
  }


  on(event: 'turn_start' | 'thought' | 'tool_call' | 'tool_result' | 'finish' | 'error' | 'step', handler: LoopEventHandler): this {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
    return this;
  }

  off(event: string, handler: LoopEventHandler): this {
    this.listeners.get(event)?.delete(handler);
    return this;
  }

  private emit(event: string, ...args: any[]): void {
    this.listeners.get(event)?.forEach(fn => {
      try { fn(...args); } catch (err) { console.error(`[LiateLoop Event Error (${event})]:`, err); }
    });
    if (event !== 'step') {
      this.listeners.get('step')?.forEach(fn => {
        try { fn(event, ...args); } catch {}
      });
    }
  }

  /**
   * Run the full reasoning loop to completion
   */
  async run(prompt: string): Promise<string> {
    const config = this.agent.toConfig();
    let currentTurn = 1;

    try {
      this.emit('turn_start', { turn: currentTurn, prompt });

      const result = await runLiateAgent(
        config,
        prompt,
        (type, content) => {
          const step: LiateLoopStep = {
            turn: currentTurn,
            type: type as any,
            content
          };

          if (type === 'TOOL_CALL') {
            this.emit('tool_call', { turn: currentTurn, content, tool: content });
          } else if (type === 'TOOL_RESULT') {
            this.emit('tool_result', { turn: currentTurn, content });
            currentTurn++;
            this.emit('turn_start', { turn: currentTurn });
          } else if (type === 'THOUGHT') {
            this.emit('thought', { turn: currentTurn, content });
          }

          this.options.onStep?.(step);
        },
        this.options.approvalHandler
      );

      this.emit('finish', { result, totalTurns: currentTurn });
      return result;
    } catch (err: any) {
      this.emit('error', err);
      throw err;
    }
  }

  /**
   * Async Generator: iterate through reasoning steps one by one
   */
  async *iterate(prompt: string): AsyncGenerator<LiateLoopStep, string, void> {
    const steps: LiateLoopStep[] = [];
    let isComplete = false;
    let finalResult = '';
    let runError: any = null;

    let resolveNext: (() => void) | null = null;

    const promise = this.run(prompt)
      .then(res => {
        finalResult = res;
        isComplete = true;
        resolveNext?.();
      })
      .catch(err => {
        runError = err;
        isComplete = true;
        resolveNext?.();
      });

    this.options.onStep = (step) => {
      steps.push(step);
      resolveNext?.();
    };

    while (!isComplete || steps.length > 0) {
      if (steps.length > 0) {
        yield steps.shift()!;
      } else if (!isComplete) {
        await new Promise<void>(resolve => {
          resolveNext = resolve;
        });
      }
    }

    await promise;
    if (runError) throw runError;
    return finalResult;
  }
}
