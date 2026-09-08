import fs from 'fs/promises';
import path from 'path';
import { GLOBAL_MCP_FILE, getProjectMcpPath } from './paths';

export interface McpConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  description?: string;
  tools?: any[];
  serverInfo?: any;
}

/**
 * Helper to parse an MCP config file in various formats (mcpServers object, array, or key-value map)
 */
async function parseMcpFile(filePath: string): Promise<Record<string, McpConfig>> {
  try {
    const data = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(data);

    // Standard Liate / Anthropic schema: { mcpServers: { "name": { command, args, ... } } }
    if (parsed && typeof parsed === 'object' && parsed.mcpServers && typeof parsed.mcpServers === 'object') {
      return parsed.mcpServers;
    }

    // Array format
    if (Array.isArray(parsed)) {
      const result: Record<string, McpConfig> = {};
      for (const item of parsed) {
        if (!item.name) continue;
        let command = item.runtime || 'npx';
        let args: string[] = [];
        if (item.runtime === 'sse') {
          result[item.name] = { command: 'sse', args: [item.entry], url: item.entry, env: {} };
          continue;
        }
        if (item.runtime === 'exe') {
          command = item.entry;
          args = item.args || [];
        } else if (item.runtime === 'inbuilt') {
          command = 'node';
          args = [item.entry];
        } else {
          command = process.platform === 'win32' && item.runtime === 'npx' ? 'npx.cmd' : item.runtime;
          args = (item.entry || '').split(' ').filter(Boolean);
          if (item.runtime === 'npx' && !args.includes('-y') && !args.includes('--yes')) {
            args.unshift('-y');
          }
        }
        result[item.name] = { command, args, env: {} };
      }
      return result;
    }

    // Legacy mcps wrapper
    if (parsed && parsed.mcps) {
      return parsed.mcps as Record<string, McpConfig>;
    }

    // Raw key-value dictionary
    const filtered: Record<string, McpConfig> = {};
    if (parsed && typeof parsed === 'object') {
      for (const [k, v] of Object.entries(parsed)) {
        if (v && typeof v === 'object' && ((v as any).command || (v as any).url)) {
          filtered[k] = v as McpConfig;
        }
      }
    }
    return filtered;
  } catch (e) {
    return {};
  }
}

/**
 * Get project-level MCP tools from ./liate_mcp.json
 */
export async function getProjectMcps(cwd: string = process.cwd()): Promise<Record<string, McpConfig>> {
  return parseMcpFile(getProjectMcpPath(cwd));
}

/**
 * Get global-level MCP tools from ~/.liate/liate_mcp.json (with fallback to config.json)
 */
export async function getGlobalMcps(): Promise<Record<string, McpConfig>> {
  const globalMcp = await parseMcpFile(GLOBAL_MCP_FILE);
  if (Object.keys(globalMcp).length > 0) return globalMcp;
  // Fallback to legacy config.json if liate_mcp.json doesn't exist
  const legacyPath = path.join(path.dirname(GLOBAL_MCP_FILE), 'config.json');
  return parseMcpFile(legacyPath);
}

/**
 * Get merged MCP tools (Project-level tools override Global-level tools on collision)
 */
export async function getMergedMcps(cwd: string = process.cwd()): Promise<Record<string, McpConfig>> {
  const globalMcps = await getGlobalMcps();
  const projectMcps = await getProjectMcps(cwd);
  return {
    ...globalMcps,
    ...projectMcps,
  };
}

/**
 * Backward compatibility alias for getMergedMcps
 */
export async function getInstalledMcps(cwd: string = process.cwd()): Promise<Record<string, McpConfig>> {
  return getMergedMcps(cwd);
}

export async function getRawMcps(): Promise<any[]> {
  const mcpsMap = await getMergedMcps();
  const rawArray = [];
  for (const [name, config] of Object.entries(mcpsMap)) {
    if (typeof config === 'object' && config !== null && ((config as any).command || (config as any).url)) {
      const c = config as McpConfig;
      const isSse = !!c.url || c.command === 'sse';
      rawArray.push({
        name: name,
        runtime: isSse ? 'sse' : c.command?.includes('npx') ? 'npx' : c.command?.includes('uvx') ? 'uvx' : 'exe',
        entry: isSse ? c.url || c.args?.[0] : c.command?.includes('npx') || c.command?.includes('uvx') ? c.args?.filter(a => a !== '-y' && a !== '--yes').join(' ') : c.command,
        tools: (c as any).tools || [],
        serverInfo: (c as any).serverInfo || undefined
      });
    }
  }
  return rawArray;
}

/**
 * Install/Add an MCP server to either project liate_mcp.json or global ~/.liate/liate_mcp.json
 */
export async function installMcp(name: string, config: McpConfig, isGlobal: boolean = false, cwd: string = process.cwd()): Promise<void> {
  const targetFile = isGlobal ? GLOBAL_MCP_FILE : getProjectMcpPath(cwd);
  await fs.mkdir(path.dirname(targetFile), { recursive: true });
  
  let existing: Record<string, McpConfig> = {};
  try {
    const raw = await fs.readFile(targetFile, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed.mcpServers) existing = parsed.mcpServers;
    else if (typeof parsed === 'object') existing = parsed;
  } catch {}

  existing[name] = config;
  const payload = {
    $schema: "https://tryliate.com/schema/v1/liate_mcp.json",
    mcpServers: existing
  };

  await fs.writeFile(targetFile, JSON.stringify(payload, null, 2), 'utf-8');
}

export async function updateMcpTools(name: string, tools: any[], serverInfo?: any, cwd: string = process.cwd()): Promise<void> {
  const projectFile = getProjectMcpPath(cwd);
  const targetFile = (await fs.access(projectFile).then(() => true).catch(() => false)) ? projectFile : GLOBAL_MCP_FILE;
  
  try {
    const raw = await fs.readFile(targetFile, 'utf-8');
    const parsed = JSON.parse(raw);
    const servers = parsed.mcpServers || parsed;
    if (servers[name]) {
      servers[name].tools = tools;
      if (serverInfo) servers[name].serverInfo = serverInfo;
      const payload = parsed.mcpServers ? { $schema: parsed.$schema, mcpServers: servers } : servers;
      await fs.writeFile(targetFile, JSON.stringify(payload, null, 2), 'utf-8');
    }
  } catch {}
}

export async function uninstallMcp(name: string, isGlobal: boolean = false, cwd: string = process.cwd()): Promise<void> {
  const targetFile = isGlobal ? GLOBAL_MCP_FILE : getProjectMcpPath(cwd);
  try {
    const raw = await fs.readFile(targetFile, 'utf-8');
    const parsed = JSON.parse(raw);
    const servers = parsed.mcpServers || parsed;
    delete servers[name];
    const payload = parsed.mcpServers ? { $schema: parsed.$schema, mcpServers: servers } : servers;
    await fs.writeFile(targetFile, JSON.stringify(payload, null, 2), 'utf-8');
  } catch {}
}
