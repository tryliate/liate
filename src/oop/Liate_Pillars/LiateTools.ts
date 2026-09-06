/**
 * [T] - LiateTools (Tool Registry, MCP Connectors & Custom Native Handlers)
 */

export interface ToolDefinition {
  name: string;
  description?: string;
  parameters?: Record<string, any>;
  execute?: (args: any) => Promise<any> | any;
}

export class LiateTools {
  public tools: Array<string | ToolDefinition>;
  public rawConfig?: Record<string, any>;

  constructor(tools: Array<string | ToolDefinition> | Record<string, any> = []) {
    if (Array.isArray(tools)) {
      this.tools = tools;
    } else if (typeof tools === 'object' && tools !== null) {
      this.rawConfig = tools;
      this.tools = Object.keys(tools);
    } else {
      this.tools = [];
    }
  }

  add(tool: string | ToolDefinition): this {
    this.tools.push(tool);
    return this;
  }

  register(tool: string | ToolDefinition): this {
    return this.add(tool);
  }

  getTools(): Array<string | ToolDefinition> {
    return [...this.tools];
  }

  toJSON() {
    if (this.rawConfig) return this.rawConfig;
    return this.tools.map(t => typeof t === 'string' ? t : t.name);
  }
}

