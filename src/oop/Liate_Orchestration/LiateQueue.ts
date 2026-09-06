import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { LiateError } from '../Liate_Security/LiateError';

/**
 * [45] - LiateQueue (Sovereign Distributed Async Job Queue & Worker Mesh)
 * 
 * Enables high-throughput enterprise batch processing of hundreds of thousands
 * of background agent tasks (e.g. overnight GST filings, bulk KYC verification)
 * with priority weighting, concurrency limits, backoff retries, and metrics.
 */

export interface QueueOptions {
  concurrency?: number;     // Default: 5 concurrent workers
  maxRetries?: number;      // Default: 3 attempts
  retryDelayMs?: number;    // Default: 1000ms
  priorityDefault?: number; // 1 (lowest) to 10 (highest), Default: 5
}

export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'retrying';

export interface QueueJob<T = any> {
  id: string;
  queueName: string;
  agentName: string;
  payload: T;
  priority: number;
  status: JobStatus;
  retries: number;
  maxRetries: number;
  result?: any;
  error?: string;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
}

export interface QueueMetrics {
  queued: number;
  processing: number;
  completed: number;
  failed: number;
  total: number;
}

export class LiateQueue<T = any> extends EventEmitter {
  public name: string;
  public options: Required<QueueOptions>;
  private jobs: Map<string, QueueJob<T>> = new Map();
  private queue: string[] = []; // Ordered job IDs
  private activeWorkers: number = 0;
  private workerHandler?: (job: QueueJob<T>) => Promise<any>;

  constructor(name: string, options: QueueOptions = {}) {
    super();
    this.name = name.toLowerCase().trim();
    this.options = {
      concurrency: options.concurrency || 5,
      maxRetries: options.maxRetries ?? 3,
      retryDelayMs: options.retryDelayMs || 1000,
      priorityDefault: options.priorityDefault || 5
    };
  }

  /**
   * Add a single background task to the queue
   */
  public async enqueue(
    agentName: string, 
    payload: T, 
    options: { priority?: number; maxRetries?: number } = {}
  ): Promise<QueueJob<T>> {
    const id = `job_${this.name}_${crypto.randomBytes(6).toString('hex')}`;
    const job: QueueJob<T> = {
      id,
      queueName: this.name,
      agentName,
      payload,
      priority: options.priority || this.options.priorityDefault,
      status: 'queued',
      retries: 0,
      maxRetries: options.maxRetries ?? this.options.maxRetries,
      createdAt: Date.now()
    };

    this.jobs.set(id, job);
    this.insertIntoQueue(id);
    this.emit('enqueued', job);

    this.processNext();
    return job;
  }

  /**
   * Enqueue a batch of tasks (e.g. 10,000 invoices) in a single operation
   */
  public async enqueueBatch(
    agentName: string, 
    payloads: T[], 
    options: { priority?: number } = {}
  ): Promise<QueueJob<T>[]> {
    const jobs: QueueJob<T>[] = [];
    for (const payload of payloads) {
      const job = await this.enqueue(agentName, payload, options);
      jobs.push(job);
    }
    return jobs;
  }

  /**
   * Register worker processor handler
   */
  public process(handler: (job: QueueJob<T>) => Promise<any>): void {
    this.workerHandler = handler;
    this.processNext();
  }

  /**
   * Fetch a job by its unique ID
   */
  public getJob(jobId: string): QueueJob<T> | null {
    return this.jobs.get(jobId) || null;
  }

  /**
   * Return real-time metrics of the queue
   */
  public getMetrics(): QueueMetrics {
    let queued = 0;
    let processing = 0;
    let completed = 0;
    let failed = 0;

    for (const job of this.jobs.values()) {
      if (job.status === 'queued' || job.status === 'retrying') queued++;
      else if (job.status === 'processing') processing++;
      else if (job.status === 'completed') completed++;
      else if (job.status === 'failed') failed++;
    }

    return {
      queued,
      processing,
      completed,
      failed,
      total: this.jobs.size
    };
  }

  /**
   * Clear all completed and failed jobs
   */
  public clear(): void {
    const toDelete: string[] = [];
    for (const [id, job] of this.jobs.entries()) {
      if (job.status === 'completed' || job.status === 'failed') {
        toDelete.push(id);
      }
    }
    toDelete.forEach(id => this.jobs.delete(id));
  }

  /**
   * Worker dispatch loop
   */
  private processNext(): void {
    if (!this.workerHandler) return;

    while (this.activeWorkers < this.options.concurrency && this.queue.length > 0) {
      const jobId = this.queue.shift();
      if (!jobId) break;

      const job = this.jobs.get(jobId);
      if (!job || job.status === 'completed') continue;

      this.activeWorkers++;
      job.status = 'processing';
      job.startedAt = Date.now();
      this.emit('started', job);

      this.executeJob(job);
    }
  }

  private async executeJob(job: QueueJob<T>): Promise<void> {
    try {
      const result = await this.workerHandler!(job);
      job.status = 'completed';
      job.result = result;
      job.completedAt = Date.now();
      this.emit('completed', job);
    } catch (err: any) {
      job.retries++;
      if (job.retries < job.maxRetries) {
        job.status = 'retrying';
        this.emit('retrying', { job, attempt: job.retries });
        setTimeout(() => {
          this.insertIntoQueue(job.id);
          this.processNext();
        }, this.options.retryDelayMs * Math.pow(2, job.retries - 1));
      } else {
        job.status = 'failed';
        job.error = err.message;
        job.completedAt = Date.now();
        this.emit('failed', job);
      }
    } finally {
      this.activeWorkers--;
      this.processNext();
    }
  }

  private insertIntoQueue(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    // Priority descending insertion (higher priority first)
    const index = this.queue.findIndex(id => {
      const other = this.jobs.get(id);
      return other ? other.priority < job.priority : false;
    });

    if (index === -1) {
      this.queue.push(jobId);
    } else {
      this.queue.splice(index, 0, jobId);
    }
  }

  /**
   * Expose queue dispatcher as an agent tool
   */
  public toTool() {
    return {
      name: `enqueue_${this.name}_task`,
      description: `Dispatches an asynchronous background task to the '${this.name}' distributed queue`,
      parameters: {
        type: 'object',
        properties: {
          payload: { type: 'object', description: 'The task payload data to process' },
          priority: { type: 'number', description: 'Priority from 1 (low) to 10 (urgent)' }
        },
        required: ['payload']
      },
      execute: async (args: { payload: T; priority?: number }) => {
        const job = await this.enqueue('agent-caller', args.payload, { priority: args.priority });
        return {
          status: 'QUEUED',
          jobId: job.id,
          queue: this.name,
          priority: job.priority
        };
      }
    };
  }
}

export const Queue = LiateQueue;
