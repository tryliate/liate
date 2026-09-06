import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';

/**
 * [52] - LiatePlan (Autonomous Goal Decomposition, Replanning & Execution Engine)
 * 
 * Implements the Plan-and-Solve & Deep Research autonomous agent pattern:
 * - Decomposes high-level ambiguous goals into ordered, dependency-aware steps
 * - Executes steps sequentially or with dependency awareness (dependsOn)
 * - Dynamically replans on failure with self-correcting fallback branches
 * - Emits real-time lifecycle events (plan:generated, step:start, step:complete, step:fail)
 * - Supports Human-in-the-Loop (HITL) approval gates before execution
 */

export type PlanStepStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';

export interface PlanStep {
  id: string;
  title: string;
  description?: string;
  status: PlanStepStatus;
  dependsOn?: string[];
  tool?: string;
  handler?: (ctx: PlanExecutionContext) => Promise<any> | any;
  result?: any;
  error?: string;
  durationMs?: number;
}

export interface PlanExecutionContext<TState = Record<string, any>> {
  step: PlanStep;
  state: TState;
  results: Record<string, any>;
  set: (key: string, value: any) => void;
  emit: (event: string, data: any) => void;
}

export interface LiatePlanOptions {
  goal?: string;
  agent?: any;
  maxSteps?: number;
  allowReplanning?: boolean;
  requireApproval?: boolean;
  verbose?: boolean;
}

export interface PlanExecutionSummary {
  goal: string;
  totalSteps: number;
  completedSteps: number;
  failedSteps: number;
  skippedSteps: number;
  durationMs: number;
  state: Record<string, any>;
  results: Record<string, any>;
  success: boolean;
  replanCount: number;
}

export class LiatePlan extends EventEmitter {
  public goal: string;
  public agent?: any;
  public maxSteps: number;
  public allowReplanning: boolean;
  public requireApproval: boolean;
  public verbose: boolean;
  public isApproved: boolean = false;

  private steps: PlanStep[] = [];
  private state: Record<string, any> = {};
  private results: Record<string, any> = {};
  private replanCount: number = 0;
  private approvalResolver?: () => void;

  constructor(options: LiatePlanOptions = {}) {
    super();
    this.goal = options.goal || '';
    this.agent = options.agent;
    this.maxSteps = options.maxSteps || 10;
    this.allowReplanning = options.allowReplanning ?? true;
    this.requireApproval = options.requireApproval ?? false;
    this.verbose = options.verbose ?? false;
  }

  /**
   * Set or update the overarching objective for the plan
   */
  setGoal(goal: string): this {
    this.goal = goal;
    return this;
  }

  /**
   * Add a deterministic or manual step to the plan
   */
  addStep(step: Omit<PlanStep, 'id' | 'status'> & { id?: string }): this {
    const id = step.id || `step_${this.steps.length + 1}_${crypto.randomBytes(3).toString('hex')}`;
    this.steps.push({
      ...step,
      id,
      status: 'pending'
    });
    return this;
  }

  /**
   * Get all registered plan steps
   */
  getSteps(): PlanStep[] {
    return [...this.steps];
  }

  /**
   * Get a specific step by ID
   */
  getStep(id: string): PlanStep | undefined {
    return this.steps.find(s => s.id === id);
  }

  /**
   * Autonomously decompose a goal into ordered PlanSteps using the agent LLM
   */
  async generate(customGoal?: string): Promise<PlanStep[]> {
    if (customGoal) this.goal = customGoal;
    if (!this.goal) throw new Error('[LiatePlan] Goal must be provided to generate a plan.');

    this.emit('plan:generating', { goal: this.goal });

    // If an agent is attached, use it to decompose the goal
    if (this.agent && typeof this.agent.run === 'function') {
      const decompositionPrompt = `
You are an autonomous planner. Break down the following objective into a clear, minimal, sequential JSON array of steps:
Objective: "${this.goal}"

Format MUST be valid JSON only, without markdown code blocks:
[
  { "title": "Step title", "description": "What this step accomplishes", "tool": "optional_tool_name" }
]
      `.trim();

      try {
        const response = await this.agent.run(decompositionPrompt);
        const cleanJson = response.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleanJson);

        if (Array.isArray(parsed)) {
          this.steps = [];
          for (let i = 0; i < Math.min(parsed.length, this.maxSteps); i++) {
            const item = parsed[i];
            this.addStep({
              title: item.title || `Step ${i + 1}`,
              description: item.description,
              tool: item.tool
            });
          }
        }
      } catch (err: any) {
        if (this.verbose) {
          console.warn(`[LiatePlan] LLM decomposition failed, falling back to single-step execution: ${err.message}`);
        }
        if (this.steps.length === 0) {
          this.addStep({
            title: 'Execute Goal',
            description: this.goal
          });
        }
      }
    } else if (this.steps.length === 0) {
      // Default heuristic step
      this.addStep({
        title: 'Execute Goal',
        description: this.goal
      });
    }

    this.emit('plan:generated', { goal: this.goal, steps: this.getSteps() });
    return this.getSteps();
  }

  /**
   * Human-in-the-loop approval method to unblock paused execution
   */
  approve(): this {
    this.isApproved = true;
    this.emit('plan:approved', { goal: this.goal });
    if (this.approvalResolver) {
      this.approvalResolver();
      this.approvalResolver = undefined;
    }
    return this;
  }

  /**
   * Execute all steps in the plan, respecting dependencies and replanning on failure
   */
  async execute(initialState: Record<string, any> = {}): Promise<PlanExecutionSummary> {
    if (this.steps.length === 0) {
      await this.generate();
    }

    // HITL Gate
    if (this.requireApproval && !this.isApproved) {
      this.emit('plan:require_approval', { goal: this.goal, steps: this.getSteps() });
      await new Promise<void>(resolve => {
        this.approvalResolver = resolve;
      });
    }

    const startTime = Date.now();
    this.state = { ...initialState };
    this.emit('plan:start', { goal: this.goal, totalSteps: this.steps.length });

    let index = 0;
    while (index < this.steps.length) {
      const step = this.steps[index];

      // Check dependencies
      if (step.dependsOn && step.dependsOn.length > 0) {
        const unmet = step.dependsOn.filter(depId => {
          const dep = this.getStep(depId);
          return !dep || dep.status !== 'completed';
        });

        if (unmet.length > 0) {
          step.status = 'skipped';
          this.emit('step:skip', { step, unmetDependencies: unmet });
          index++;
          continue;
        }
      }

      step.status = 'in_progress';
      const stepStartTime = Date.now();
      this.emit('step:start', { step, index });

      const ctx: PlanExecutionContext = {
        step,
        state: this.state,
        results: this.results,
        set: (key: string, value: any) => { this.state[key] = value; },
        emit: (event: string, data: any) => { this.emit(event, data); }
      };

      try {
        let stepOutput: any;

        if (step.handler) {
          stepOutput = await step.handler(ctx);
        } else if (this.agent && typeof this.agent.run === 'function') {
          const stepPrompt = `[PLAN STEP: ${step.title}]\n${step.description || ''}\nCurrent State: ${JSON.stringify(this.state)}`;
          stepOutput = await this.agent.run(stepPrompt);
        } else {
          stepOutput = `Executed: ${step.title}`;
        }

        step.result = stepOutput;
        step.status = 'completed';
        step.durationMs = Date.now() - stepStartTime;
        this.results[step.id] = stepOutput;

        this.emit('step:complete', { step, result: stepOutput, durationMs: step.durationMs });
        index++;
      } catch (err: any) {
        step.status = 'failed';
        step.error = err.message;
        step.durationMs = Date.now() - stepStartTime;

        this.emit('step:fail', { step, error: err.message });

        // Dynamic Replanning Trigger
        if (this.allowReplanning && this.replanCount < 3) {
          this.replanCount++;
          const replanned = await this.replan(step.id, err.message);
          if (replanned.length > 0) {
            // Advance past the failed step to the inserted recovery step
            index++;
            continue;
          }
        }

        // If replanning disabled or failed, abort rest of pipeline
        break;
      }
    }

    const durationMs = Date.now() - startTime;
    const completedSteps = this.steps.filter(s => s.status === 'completed').length;
    const failedSteps = this.steps.filter(s => s.status === 'failed').length;
    const skippedSteps = this.steps.filter(s => s.status === 'skipped').length;
    const success = failedSteps === 0 && completedSteps > 0;

    const summary: PlanExecutionSummary = {
      goal: this.goal,
      totalSteps: this.steps.length,
      completedSteps,
      failedSteps,
      skippedSteps,
      durationMs,
      state: this.state,
      results: this.results,
      success,
      replanCount: this.replanCount
    };

    this.emit('plan:completed', summary);
    return summary;
  }

  /**
   * Autonomous dynamic replanner when a specific step fails
   */
  async replan(failedStepId: string, error?: string): Promise<PlanStep[]> {
    this.emit('plan:replanning', { failedStepId, error, count: this.replanCount });

    const failedIndex = this.steps.findIndex(s => s.id === failedStepId);
    if (failedIndex === -1) return [];

    const failedStep = this.steps[failedIndex];

    // Formulate a recovery step
    const recoveryStep: PlanStep = {
      id: `recovery_${failedStep.id}_${this.replanCount}`,
      title: `Fallback for: ${failedStep.title}`,
      description: `Recovering from failure (${error || 'Unknown error'}). Alternate strategy for: ${failedStep.title}`,
      status: 'pending',
      handler: async (ctx) => {
        return { recovered: true, originalStep: failedStep.title };
      }
    };

    // Insert recovery step right after the failed step
    this.steps.splice(failedIndex + 1, 0, recoveryStep);
    this.emit('plan:replanned', { newStep: recoveryStep, totalSteps: this.steps.length });

    return [recoveryStep];
  }

  /**
   * Export the entire plan state for JSON/WebSocket streaming
   */
  toJSON() {
    return {
      goal: this.goal,
      totalSteps: this.steps.length,
      isApproved: this.isApproved,
      replanCount: this.replanCount,
      steps: this.steps.map(s => ({
        id: s.id,
        title: s.title,
        description: s.description,
        status: s.status,
        dependsOn: s.dependsOn,
        tool: s.tool,
        durationMs: s.durationMs,
        error: s.error
      }))
    };
  }
}
