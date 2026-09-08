import fs from 'fs/promises';
import path from 'path';
import { runLiateAgent, LiateConfig } from '@liate/runtime';
import { LiateAgent } from '../Liate_Pillars/LiateAgent';

export type TaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'paused';

export interface TaskRecord {
  id: string;
  agent: string;
  prompt: string;
  status: TaskStatus;
  progressPercent: number;
  currentTurn: number;
  totalTurns: number;
  output?: string;
  error?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface TaskDispatchOptions {
  agent: string | LiateAgent | LiateConfig;
  prompt: string;
  priority?: 'low' | 'medium' | 'high';
  session?: string;
  cwd?: string;
}

/**
 * LiateTask — Asynchronous Tracked Sovereign Agent Job
 */
export class LiateTask {
  public id: string;
  public record: TaskRecord;
  private agentConfig: LiateConfig;
  private cwd: string;
  private progressListeners: Set<(progress: { percent: number; currentTurn: number; message: string }) => void> = new Set();
  private isCancelled: boolean = false;
  private executionPromise?: Promise<string>;

  constructor(options: Partial<TaskDispatchOptions> = {}, taskId?: string) {
    this.cwd = options.cwd || process.cwd();
    this.id = taskId || `task_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    let agentName = 'agent';
    if (!options.agent) {
      this.agentConfig = {
        L: 'sarvam/sarvam-105b',
        A: { name: 'background-task-agent', intent: 'Background task agent' }
      };
    } else if (typeof options.agent === 'string') {
      agentName = options.agent;
      this.agentConfig = {
        L: 'sarvam/sarvam-105b',
        A: { name: agentName, intent: 'Background task agent' }
      };
    } else if (options.agent instanceof LiateAgent) {
      this.agentConfig = options.agent.toConfig();
      agentName = this.agentConfig.A?.name || 'agent';
    } else {
      this.agentConfig = options.agent;
      agentName = this.agentConfig.A?.name || 'agent';
    }


    if (options.session) {
      this.agentConfig.I = { ...(this.agentConfig.I || {}), memory: options.session };
    }

    this.record = {
      id: this.id,
      agent: agentName,
      prompt: options.prompt || '',
      status: 'queued',
      progressPercent: 0,
      currentTurn: 0,
      totalTurns: 0,
      createdAt: new Date().toISOString()
    };

  }

  get status(): TaskStatus {
    return this.record.status;
  }

  get percent(): number {
    return this.record.progressPercent;
  }

  get output(): string | undefined {
    return this.record.output;
  }

  onProgress(listener: (progress: { percent: number; currentTurn: number; message: string }) => void): this {
    this.progressListeners.add(listener);
    return this;
  }

  private notifyProgress(percent: number, currentTurn: number, message: string) {
    this.record.progressPercent = percent;
    this.record.currentTurn = currentTurn;
    this.progressListeners.forEach(fn => {
      try { fn({ percent, currentTurn, message }); } catch {}
    });
    this.saveState();
  }

  private async saveState(): Promise<void> {
    const taskDir = path.join(this.cwd, '.liate', 'liate_tasks');
    const taskFile = path.join(taskDir, `${this.id}.json`);
    try {
      await fs.mkdir(taskDir, { recursive: true });
      await fs.writeFile(taskFile, JSON.stringify(this.record, null, 2), 'utf-8');
    } catch {}
  }

  /**
   * Start executing the async background task
   */
  start(): Promise<string> {
    if (this.executionPromise) return this.executionPromise;

    this.record.status = 'running';
    this.record.startedAt = new Date().toISOString();
    this.saveState();

    this.executionPromise = (async () => {
      let turn = 0;
      try {
        this.notifyProgress(10, 1, 'Initializing agent context & tools');

        const result = await runLiateAgent(
          this.agentConfig,
          this.record.prompt,
          (type: string, content: string) => {
            if (this.isCancelled) throw new Error('Task was cancelled by user');

            if (type === 'TOOL_CALL') {
              turn++;
              const pct = Math.min(85, 20 + turn * 20);
              this.notifyProgress(pct, turn, `Calling tool: ${content}`);
            } else if (type === 'THOUGHT') {
              this.notifyProgress(this.record.progressPercent, turn, `Reasoning: ${content.substring(0, 60)}...`);
            }
          }
        );

        if (this.isCancelled) {
          this.record.status = 'cancelled';
          this.saveState();
          throw new Error('Task was cancelled');
        }

        this.record.status = 'completed';
        this.record.output = result;
        this.record.progressPercent = 100;
        this.record.completedAt = new Date().toISOString();
        this.notifyProgress(100, turn, 'Task completed successfully');
        await this.saveState();
        return result;
      } catch (err: any) {
        if (this.isCancelled) {
          this.record.status = 'cancelled';
        } else {
          this.record.status = 'failed';
          this.record.error = err.message;
        }
        this.record.completedAt = new Date().toISOString();
        await this.saveState();
        throw err;
      }
    })();

    return this.executionPromise;
  }

  /**
   * Cancel the background task
   */
  cancel(): void {
    this.isCancelled = true;
    this.record.status = 'cancelled';
    this.saveState();
  }

  /**
   * Wait for task completion and get result
   */
  async wait(): Promise<string> {
    if (!this.executionPromise) {
      return this.start();
    }
    return this.executionPromise;
  }
}

/**
 * LiateTaskManager — Persistent Task Registry & Query Engine
 */
export class LiateTaskManager {
  private static tasks: Map<string, LiateTask> = new Map();

  static register(task: LiateTask): void {
    this.tasks.set(task.id, task);
  }

  static get(taskId: string): LiateTask | undefined {
    return this.tasks.get(taskId);
  }

  static async load(taskId: string, cwd: string = process.cwd()): Promise<TaskRecord | null> {
    const taskFile = path.join(cwd, '.liate', 'liate_tasks', `${taskId}.json`);
    try {
      const raw = await fs.readFile(taskFile, 'utf-8');
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  static async list(cwd: string = process.cwd()): Promise<TaskRecord[]> {
    const activeRecords = Array.from(this.tasks.values()).map(t => t.record);
    const taskDir = path.join(cwd, '.liate', 'liate_tasks');

    try {
      const files = await fs.readdir(taskDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const id = file.replace(/\.json$/, '');
          if (!this.tasks.has(id)) {
            const raw = await fs.readFile(path.join(taskDir, file), 'utf-8');
            try {
              activeRecords.push(JSON.parse(raw));
            } catch {}
          }
        }
      }
    } catch {}

    return activeRecords;
  }

  static cancelAll(): void {
    for (const task of this.tasks.values()) {
      task.cancel();
    }
  }
}
