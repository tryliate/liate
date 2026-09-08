import { LiateApp } from '../Liate_Pillars/LiateApp';
import { LiateAgent } from '../Liate_Pillars/LiateAgent';

/**
 * [37] - LiatePlugin (Sovereign Open Source Plugin & Community Extension Engine)
 * 
 * Enables developers and open-source community contributors to build, package,
 * and publish modular extensions (custom tools, channels, memory adapters, middleware).
 */

export interface PluginHooks {
  onInit?: (app: LiateApp) => Promise<void> | void;
  onAgentCreate?: (agent: LiateAgent) => Promise<void> | void;
  onBeforeRun?: (agentName: string, prompt: string) => Promise<string | void> | string | void;
  onAfterRun?: (agentName: string, result: any) => Promise<any | void> | any | void;
  onToolExecute?: (toolName: string, args: any) => Promise<void> | void;
  onError?: (err: Error, context?: Record<string, any>) => Promise<void> | void;
}

export interface PluginMetadata {
  name: string;
  version?: string;
  author?: string;
  description?: string;
  homepage?: string;
  tags?: string[];
}

export class LiatePlugin implements PluginHooks {
  public metadata: PluginMetadata;
  private static registeredPlugins: Map<string, LiatePlugin> = new Map();

  constructor(metadata: string | PluginMetadata) {
    if (typeof metadata === 'string') {
      this.metadata = { name: metadata, version: '1.0.0' };
    } else {
      this.metadata = {
        name: metadata.name,
        version: metadata.version || '1.0.0',
        author: metadata.author,
        description: metadata.description,
        homepage: metadata.homepage,
        tags: metadata.tags || []
      };
    }
  }

  /**
   * Lifecycle hook called when the plugin is mounted to a LiateApp
   */
  public async onInit(app: LiateApp): Promise<void> {}

  /**
   * Lifecycle hook called when a new LiateAgent is instantiated
   */
  public async onAgentCreate(agent: LiateAgent): Promise<void> {}

  /**
   * Interceptor hook called before an agent begins execution
   */
  public async onBeforeRun(agentName: string, prompt: string): Promise<string | void> {
    return prompt;
  }

  /**
   * Interceptor hook called after an agent finishes execution
   */
  public async onAfterRun(agentName: string, result: any): Promise<any | void> {
    return result;
  }

  /**
   * Interceptor hook called when any agent tool is dispatched
   */
  public async onToolExecute(toolName: string, args: any): Promise<void> {}

  /**
   * Global error interceptor hook
   */
  public async onError(err: Error, context?: Record<string, any>): Promise<void> {}

  /**
   * Register a plugin in the global plugin registry
   */
  public static register(plugin: LiatePlugin): void {
    const canonical = plugin.metadata.name.toLowerCase().trim();
    this.registeredPlugins.set(canonical, plugin);
  }

  /**
   * Get a registered plugin by name
   */
  public static get(name: string): LiatePlugin | undefined {
    return this.registeredPlugins.get(name.toLowerCase().trim());
  }

  /**
   * List all registered community plugins
   */
  public static list(): PluginMetadata[] {
    return Array.from(this.registeredPlugins.values()).map(p => p.metadata);
  }

  /**
   * Execute global onBeforeRun hooks across all registered plugins
   */
  public static async executeBeforeRun(agentName: string, prompt: string): Promise<string> {
    let currentPrompt = prompt;
    for (const plugin of this.registeredPlugins.values()) {
      if (plugin.onBeforeRun) {
        const modified = await plugin.onBeforeRun(agentName, currentPrompt);
        if (typeof modified === 'string') {
          currentPrompt = modified;
        }
      }
    }
    return currentPrompt;
  }

  /**
   * Execute global onAfterRun hooks across all registered plugins
   */
  public static async executeAfterRun(agentName: string, result: any): Promise<any> {
    let currentResult = result;
    for (const plugin of this.registeredPlugins.values()) {
      if (plugin.onAfterRun) {
        const modified = await plugin.onAfterRun(agentName, currentResult);
        if (modified !== undefined) {
          currentResult = modified;
        }
      }
    }
    return currentResult;
  }
}

export const Plugin = LiatePlugin;
