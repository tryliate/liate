import { LiateAgent } from '../Liate_Pillars/LiateAgent';
import { LiateStream } from '../Liate_AI/LiateStream';

/**
 * [34] - LiateWorkflow (Fluent Step-by-Step, Parallel & Resilient Pipeline Engine)
 * 
 * Provides deterministic sequential pipelines, parallel branches (.parallel()),
 * automatic exponential backoff retries, and execution telemetry.
 */

export interface WorkflowStepOptions {
  retries?: number;
  backoffMs?: number;
  timeoutMs?: number;
}

export interface WorkflowContext<TState = Record<string, any>> {
  state: TState;
  stepName: string;
  prevStep?: string;
  set: (key: string, value: any) => void;
  emit: (type: string, data: any) => void;
}

export type WorkflowStepHandler<TState = Record<string, any>> = 
  | ((ctx: WorkflowContext<TState>) => Promise<Partial<TState> | void> | Partial<TState> | void)
  | LiateAgent;

interface StepRecord<TState> {
  name: string;
  type: 'single' | 'parallel' | 'sleep';
  handler?: WorkflowStepHandler<TState>;
  parallelHandlers?: Array<WorkflowStepHandler<TState>>;
  sleepMs?: number;
  options?: WorkflowStepOptions;
}

export class LiateWorkflow<TState extends Record<string, any> = Record<string, any>> {
  public name: string;
  private steps: Array<StepRecord<TState>> = [];

  constructor(name: string = 'liate-workflow') {
    this.name = name;
  }

  /**
   * Add a sequential step to the workflow pipeline
   */
  public step(
    name: string, 
    handler: WorkflowStepHandler<TState>, 
    options: WorkflowStepOptions = {}
  ): this {
    this.steps.push({
      name,
      type: 'single',
      handler,
      options
    });
    return this;
  }

  /**
   * Add a parallel execution step running multiple sub-steps concurrently
   */
  public parallel(
    name: string, 
    handlers: Array<WorkflowStepHandler<TState>>, 
    options: WorkflowStepOptions = {}
  ): this {
    this.steps.push({
      name,
      type: 'parallel',
      parallelHandlers: handlers,
      options
    });
    return this;
  }

  /**
   * Add a delay/sleep pause step in the pipeline
   */
  public sleep(name: string, durationMs: number): this {
    this.steps.push({
      name,
      type: 'sleep',
      sleepMs: durationMs
    });
    return this;
  }

  /**
   * Execute the entire workflow pipeline and return final accumulated state
   */
  public async run(initialState: Partial<TState> = {}): Promise<TState> {
    let state = { ...initialState } as TState;
    let prevStep: string | undefined;

    for (const s of this.steps) {
      if (s.type === 'sleep' && s.sleepMs) {
        await new Promise(r => setTimeout(r, s.sleepMs));
        prevStep = s.name;
        continue;
      }

      if (s.type === 'single' && s.handler) {
        const delta = await this.executeWithRetry(s.name, s.handler, state, prevStep, s.options);
        if (delta && typeof delta === 'object') {
          state = { ...state, ...delta };
        }
        prevStep = s.name;
      } else if (s.type === 'parallel' && s.parallelHandlers) {
        const results = await Promise.all(
          s.parallelHandlers.map((h, i) => 
            this.executeWithRetry(`${s.name}_${i}`, h, state, prevStep, s.options)
          )
        );
        for (const delta of results) {
          if (delta && typeof delta === 'object') {
            state = { ...state, ...delta };
          }
        }
        prevStep = s.name;
      }
    }

    return state;
  }

  /**
   * Execute workflow and return a real-time LiateStream instance
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

  private async executeWithRetry(
    stepName: string,
    handler: WorkflowStepHandler<TState>,
    state: TState,
    prevStep?: string,
    options: WorkflowStepOptions = {}
  ): Promise<Partial<TState> | void> {
    const maxRetries = options.retries || 1;
    const backoff = options.backoffMs || 500;

    let lastError: any;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (handler instanceof LiateAgent) {
          const prompt = typeof state === 'string' ? state : JSON.stringify(state);
          const res: any = await handler.run(prompt);
          const text = typeof res === 'string' ? res : res?.response || JSON.stringify(res);
          return { [stepName]: text } as unknown as Partial<TState>;
        } else {

          const ctx: WorkflowContext<TState> = {
            state,
            stepName,
            prevStep,
            set: (k, v) => { (state as any)[k] = v; },
            emit: () => {}
          };
          return await handler(ctx);
        }
      } catch (err: any) {
        lastError = err;
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, backoff * Math.pow(2, attempt - 1)));
        }
      }
    }

    throw lastError || new Error(`Step [${stepName}] failed after ${maxRetries} attempts`);
  }
}

export const Workflow = LiateWorkflow;
