import { LiateModel } from './LiateModel';
import { LiateIntegration } from './LiateIntegration';
import { LiateTools } from './LiateTools';
import { LiateEnv } from './LiateEnv';
import { LiateToken } from '../Liate_AI/LiateToken';
import { runLiateAgent, LiateConfig } from '@liate/runtime';

/**
 * [A] - LiateAgent (Sovereign Agent Orchestrator & Pillar Integrator)
 */

export interface LiateAgentParams {
  L?: string | LiateModel;
  I?: string | Record<string, any> | LiateIntegration;
  A?: { name?: string; intent?: string; skills?: string | string[] } | Record<string, any>;
  T?: string[] | Record<string, any> | LiateTools;
  E?: Record<string, any> | LiateEnv;
}

export class LiateAgent {
  public L: LiateModel;
  public I: LiateIntegration;
  public A: { name: string; intent?: string; skills?: string | string[]; [key: string]: any };
  public T: LiateTools;
  public E: LiateEnv;

  constructor(nameOrConfig: string | LiateAgentParams = {}, intentOrOptions?: string | Record<string, any>) {
    if (typeof nameOrConfig === 'string') {
      const intent = typeof intentOrOptions === 'string' ? intentOrOptions : intentOrOptions?.intent;
      const skills = typeof intentOrOptions === 'object' ? intentOrOptions.skills : undefined;
      const extra = typeof intentOrOptions === 'object' ? intentOrOptions : {};
      this.L = new LiateModel('sarvam/sarvam-105b');
      this.I = new LiateIntegration({});
      this.A = {
        name: nameOrConfig,
        intent,
        skills,
        ...extra
      };
      this.T = new LiateTools([]);
      this.E = new LiateEnv({});
    } else {
      const config = nameOrConfig;
      this.L = config.L instanceof LiateModel ? config.L : new LiateModel(config.L || 'sarvam/sarvam-105b');
      this.I = config.I instanceof LiateIntegration ? config.I : new LiateIntegration(config.I || {});
      const aData = config.A instanceof LiateAgent 
        ? config.A.A 
        : (typeof config.A === 'object' && config.A !== null ? config.A : { name: typeof config.A === 'string' ? config.A : 'default' });
      this.A = {
        name: aData.name || 'default',
        intent: aData.intent,
        skills: aData.skills,
        ...aData
      };
      this.T = config.T instanceof LiateTools ? config.T : new LiateTools(config.T || []);
      this.E = config.E instanceof LiateEnv ? config.E : new LiateEnv(config.E || {});
    }
  }

  public get name(): string {
    return this.A.name || 'agent';
  }

  public get intent(): string | undefined {
    return this.A.intent;
  }

  public get tools(): LiateTools {
    return this.T;
  }

  public get memory(): LiateIntegration {
    return this.I;
  }

  public get env(): LiateEnv {
    return this.E;
  }

  public get token(): LiateToken {
    return new LiateToken({ model: this.L?.model || 'sarvam/sarvam-105b' });
  }


  setModel(model: string | LiateModel): this {
    this.L = model instanceof LiateModel ? model : new LiateModel(model);
    return this;
  }

  setIntegration(integration: LiateIntegration | Record<string, any>): this {
    this.I = integration instanceof LiateIntegration ? integration : new LiateIntegration(integration);
    return this;
  }

  setIntent(intent: string): this {
    this.A.intent = intent;
    return this;
  }

  setName(name: string): this {
    this.A.name = name;
    return this;
  }

  setSkills(skills: string | string[]): this {
    this.A.skills = skills;
    return this;
  }

  setTools(tools: LiateTools | string[]): this {
    this.T = tools instanceof LiateTools ? tools : new LiateTools(tools);
    return this;
  }

  setEnv(env: LiateEnv | Record<string, any>): this {
    this.E = env instanceof LiateEnv ? env : new LiateEnv(env);
    return this;
  }

  /**
   * Set maximum execution duration limit (e.g. 60, "30s", "2m")
   */
  setMaxTime(timeLimit: string | number): this {
    this.E.setMaxTime(timeLimit);
    return this;
  }

  /**
   * Set maximum spend budget in INR Rupees (e.g. 10, "5.00")
   */
  setMaxSpend(spendLimit: string | number): this {
    this.E.setMaxSpend(spendLimit);
    return this;
  }

  /**
   * Set maximum ReAct tool calling turns
   */
  setMaxTurns(turns: number): this {
    this.E.setMaxTurns(turns);
    return this;
  }

  toConfig(): LiateConfig {
    return {
      L: this.L.toJSON(),
      I: this.I.toJSON(),
      A: this.A,
      T: this.T.toJSON(),
      E: this.E.toJSON()
    };
  }

  toJSON(): LiateConfig {
    return this.toConfig();
  }

  async run(prompt: string, onStep?: (type: string, content: string) => void): Promise<string> {
    return await runLiateAgent(this.toConfig(), prompt, onStep);
  }
}
