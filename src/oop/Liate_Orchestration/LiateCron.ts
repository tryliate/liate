import { LiateAgent } from '../Liate_Pillars/LiateAgent';
import { LiateLoop } from '../Liate_Pillars/LiateLoop';

export interface LiateCronOptions {
  schedule?: string; // e.g. '*/5 * * * *' or '@hourly' or 'every 10s'
  intervalMs?: number;
  agent: LiateAgent;
  prompt: string;
  onSuccess?: (result: string) => void;
  onError?: (err: Error) => void;
  maxRuns?: number;
  autoStart?: boolean;
}

export type CronStatus = 'idle' | 'running' | 'stopped' | 'error';

/**
 * LiateCron — Background Autonomous Scheduler & Heartbeat Runner
 */
export class LiateCron {
  private static activeJobs: Set<LiateCron> = new Set();

  public id: string;
  public options: LiateCronOptions;
  public loop: LiateLoop;
  private timer: any = null;
  private _status: CronStatus = 'idle';
  private runCount: number = 0;
  private isExecuting: boolean = false;

  constructor(options: Partial<LiateCronOptions> = {}) {
    this.id = `cron_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const defaultAgent = options.agent || new LiateAgent('cron-agent');
    this.options = {
      agent: defaultAgent,
      prompt: options.prompt || 'Autonomous heartbeat check',
      ...options
    };
    this.loop = new LiateLoop(this.options.agent);

    if (options.autoStart) {
      this.start();
    }
  }


  private parseScheduleToMs(schedule?: string, intervalMs?: number): number {
    if (intervalMs && intervalMs > 0) return intervalMs;
    if (!schedule) return 60000; // default 1 minute

    const s = schedule.trim().toLowerCase();
    if (s.startsWith('every ')) {
      const parts = s.replace('every ', '').split(' ');
      const val = parseInt(parts[0], 10) || 1;
      const unit = parts[1] || 'm';
      if (unit.startsWith('s')) return val * 1000;
      if (unit.startsWith('m')) return val * 60 * 1000;
      if (unit.startsWith('h')) return val * 60 * 60 * 1000;
      if (unit.startsWith('d')) return val * 24 * 60 * 60 * 1000;
    }

    if (s.startsWith('*/')) {
      const mins = parseInt(s.split('/')[1]?.split(' ')[0] || '5', 10);
      return mins * 60 * 1000;
    }

    if (s === '@hourly') return 60 * 60 * 1000;
    if (s === '@daily') return 24 * 60 * 60 * 1000;

    return 60000;
  }

  /**
   * Start the recurring cron execution
   */
  start(): this {
    if (this._status === 'running') return this;

    const interval = this.parseScheduleToMs(this.options.schedule, this.options.intervalMs);
    this._status = 'running';
    LiateCron.activeJobs.add(this);

    this.timer = setInterval(async () => {
      if (this.isExecuting) return; // Prevent overlapping runs
      await this.triggerNow();
    }, interval);

    return this;
  }

  /**
   * Trigger an immediate cycle of the cron job
   */
  async triggerNow(): Promise<string | null> {
    if (this.isExecuting) return null;
    this.isExecuting = true;

    try {
      this.runCount++;
      const result = await this.loop.run(this.options.prompt);
      this.options.onSuccess?.(result);

      if (this.options.maxRuns && this.runCount >= this.options.maxRuns) {
        this.stop();
      }

      return result;
    } catch (err: any) {
      this._status = 'error';
      this.options.onError?.(err);
      return null;
    } finally {
      this.isExecuting = false;
    }
  }

  /**
   * Stop the recurring cron schedule
   */
  stop(): this {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this._status = 'stopped';
    LiateCron.activeJobs.delete(this);
    return this;
  }

  status(): CronStatus {
    return this._status;
  }

  get executionCount(): number {
    return this.runCount;
  }

  // ── Static Registry Helpers ──────────────────────────────────────────────
  static list(): LiateCron[] {
    return Array.from(LiateCron.activeJobs);
  }

  static stopAll(): void {
    for (const job of LiateCron.activeJobs) {
      job.stop();
    }
    LiateCron.activeJobs.clear();
  }
}
