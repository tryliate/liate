import readline from 'readline';
import { LiateAgent } from '../Liate_Pillars/LiateAgent';
import { LiateToken } from '../Liate_AI/LiateToken';

/**
 * [33] - LiateRun (Sovereign CLI Agent Execution Runner, Interactive REPL & Daemon Supervisor)
 * 
 * Executes autonomous agent tasks, manages interactive terminal REPL conversations,
 * and supervises long-running background agent daemons with auto-recovery.
 */

export interface RunOptions {
  prompt?: string;
  showThoughts?: boolean;
  showCostINR?: boolean;
  maxTurns?: number;
}

export interface ReplOptions {
  promptSymbol?: string;
  showThoughts?: boolean;
  showCostINR?: boolean;
  welcomeMessage?: string;
}

export interface SupervisorOptions {
  agent: LiateAgent;
  restartOnCrash?: boolean;
  maxRestarts?: number;
  healthCheckIntervalMs?: number;
  onCrash?: (err: any) => void;
}

export class LiateRun {
  private activeSupervisors: Map<string, { interval: any; restarts: number; stopped: boolean }> = new Map();

  constructor() {}

  /**
   * Programmatically execute an autonomous agent prompt with optional telemetry
   */
  public async exec(agent: LiateAgent, prompt: string, options: RunOptions = {}): Promise<string> {
    const startTime = Date.now();
    const result = await agent.run(prompt);
    const output = typeof result === 'string' ? result : (result as any)?.response || JSON.stringify(result);

    if (options.showThoughts) {
      const thinkMatch = output.match(/<think>([\s\S]*?)<\/think>/i);
      if (thinkMatch && thinkMatch[1]) {
        console.log('\n💭 [Agent Thought Process]:\n' + thinkMatch[1].trim());
      }
    }

    if (options.showCostINR) {
      const tokenCounter = new LiateToken();
      const inrCost = tokenCounter.estimateCost(prompt, output);
      console.log(`\n💰 [Cost]: ₹${inrCost.totalInr.toFixed(5)} (${Date.now() - startTime}ms)`);
    }

    return output.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  }

  /**
   * Launch an interactive terminal REPL chat session with the agent
   */
  public async repl(agent: LiateAgent, options: ReplOptions = {}): Promise<void> {
    const symbol = options.promptSymbol || '⚡ liate > ';
    const welcome = options.welcomeMessage || `\n🏛️  LiateJS Sovereign Agent REPL [${agent.name}]\nType 'exit' or 'quit' to end session.\n`;
    
    console.log(welcome);

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const ask = () => {
      rl.question(symbol, async (input) => {
        const clean = input.trim();
        if (clean.toLowerCase() === 'exit' || clean.toLowerCase() === 'quit') {
          console.log('Session ended.');
          rl.close();
          return;
        }

        if (clean.length > 0) {
          try {
            console.log('🤖 Agent thinking...');
            const reply = await this.exec(agent, clean, {
              showThoughts: options.showThoughts ?? true,
              showCostINR: options.showCostINR ?? true
            });
            console.log('\n' + reply + '\n');
          } catch (err: any) {
            console.error('❌ Error executing agent:', err.message || err);
          }
        }
        ask();
      });
    };

    ask();
  }

  /**
   * Supervise a long-running autonomous agent daemon with auto-recovery and health monitoring
   */
  public supervise(options: SupervisorOptions): { stop: () => void; status: () => string } {
    const daemonId = `daemon-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const maxRestarts = options.maxRestarts || 10;
    const intervalMs = options.healthCheckIntervalMs || 15000;

    const state = {
      interval: null as any,
      restarts: 0,
      stopped: false
    };

    const healthCheck = async () => {
      if (state.stopped) return;
      try {
        // Ping agent with a lightweight heartbeat
        await options.agent.run('heartbeat');
      } catch (err: any) {
        if (options.restartOnCrash ?? true) {
          state.restarts++;
          if (options.onCrash) options.onCrash(err);
          console.warn(`⚠️ Daemon [${daemonId}] crashed (Restart ${state.restarts}/${maxRestarts}):`, err.message || err);
          
          if (state.restarts >= maxRestarts) {
            console.error(`🚨 Daemon [${daemonId}] exceeded maximum restarts (${maxRestarts}). Stopping supervisor.`);
            stop();
          }
        }
      }
    };

    state.interval = setInterval(healthCheck, intervalMs);
    this.activeSupervisors.set(daemonId, state);

    const stop = () => {
      state.stopped = true;
      if (state.interval) clearInterval(state.interval);
      this.activeSupervisors.delete(daemonId);
      console.log(`🛑 Supervisor for [${daemonId}] stopped.`);
    };

    return {
      stop,
      status: () => (state.stopped ? 'STOPPED' : `RUNNING (Restarts: ${state.restarts}/${maxRestarts})`)
    };
  }
}

export const Run = LiateRun;
