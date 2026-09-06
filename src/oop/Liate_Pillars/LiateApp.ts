import { LiateAgent } from './LiateAgent';
import { LiateServer } from '../Liate_Core/LiateServer';
import { LiateTask, LiateTaskManager, TaskDispatchOptions } from '../Liate_Orchestration/LiateTask';
import { LiateConfig } from '../../aum';

export interface LiateAppConfig {
  name?: string;
  version?: string;
  description?: string;
  cwd?: string;
}

/**
 * LiateApp — Sovereign Multi-Agent Application Container & Orchestrator
 */
export class LiateApp {
  public name: string;
  public version: string;
  public description: string;
  public cwd: string;
  private agents: Map<string, LiateAgent> = new Map();
  private server?: LiateServer;

  constructor(config: LiateAppConfig = {}) {
    this.name = config.name || 'LiateApp';
    this.version = config.version || '1.0.0';
    this.description = config.description || 'Sovereign Multi-Agent Application';
    this.cwd = config.cwd || process.cwd();
  }

  /**
   * Register a sovereign agent into the application
   */
  register(agent: LiateAgent | LiateConfig): this {
    const instance = agent instanceof LiateAgent ? agent : new LiateAgent(agent);
    const agentName = instance.A.name || `agent_${this.agents.size + 1}`;
    this.agents.set(agentName, instance);
    return this;
  }

  addAgent(agent: LiateAgent | LiateConfig): this {
    return this.register(agent);
  }

  /**
   * Get an agent by name
   */
  getAgent(name: string): LiateAgent | undefined {
    return this.agents.get(name);
  }

  /**
   * List all registered agents
   */
  listAgents(): LiateAgent[] {
    return Array.from(this.agents.values());
  }

  /**
   * Dispatch an asynchronous long-running task
   */
  dispatchTask(options: { agent: string | LiateAgent; prompt: string; priority?: 'low' | 'medium' | 'high'; session?: string }): LiateTask {
    let targetAgent: string | LiateAgent = options.agent;
    if (typeof options.agent === 'string' && this.agents.has(options.agent)) {
      targetAgent = this.agents.get(options.agent)!;
    }

    const task = new LiateTask({
      agent: targetAgent,
      prompt: options.prompt,
      priority: options.priority,
      session: options.session,
      cwd: this.cwd
    });

    LiateTaskManager.register(task);
    // Start task in background
    task.start().catch(() => {});
    return task;
  }

  /**
   * Execute an agent synchronously in-memory
   */
  async run(options: { agent?: string; prompt: string }): Promise<string> {
    let agent = options.agent ? this.agents.get(options.agent) : this.agents.values().next().value;
    if (!agent) {
      agent = new LiateAgent({ A: { name: options.agent || 'default' } });
    }
    return await agent.run(options.prompt);
  }

  /**
   * Start the embedded LAPI/v1 HTTP & WebSocket server
   */
  async listen(port: number = 7071): Promise<LiateServer> {
    this.server = new LiateServer({ port, cwd: this.cwd });
    await this.server.start();
    return this.server;
  }

  /**
   * Stop the server
   */
  async close(): Promise<void> {
    if (this.server) {
      await this.server.stop();
      this.server = undefined;
    }
    LiateTaskManager.cancelAll();
  }
}
