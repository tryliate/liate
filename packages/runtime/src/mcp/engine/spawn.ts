import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamFn } from '../../stream';

export interface McpSpawnConfig {
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
}

export function createMcpTransport(
  mcpConfig: any, 
  installedMcps: Record<string, any>, 
  keys: Record<string, string>, 
  stream: StreamFn, 
  nodeId: string
): { transport: StdioClientTransport | null, serverName: string } {
  
  const serverName = mcpConfig.name;
  if (!serverName) return { transport: null, serverName: '' };
  
  let command = '';
  let cmdArgs: string[] = [];
  let env: Record<string, string> = {};

  if (installedMcps[serverName]) {
    command = installedMcps[serverName].command;
    cmdArgs = installedMcps[serverName].args;
    env = installedMcps[serverName].env || {};
  } else if (mcpConfig.entry) {
    const isSse = mcpConfig.runtime === 'sse' || mcpConfig.entry.startsWith('http');
    if (isSse) {
      command = 'sse';
      cmdArgs = [mcpConfig.entry];
    } else if (mcpConfig.runtime === 'exe') {
      command = mcpConfig.entry;
      cmdArgs = mcpConfig.args || [];
    } else if (mcpConfig.runtime === 'inbuilt') {
      command = 'node';
      cmdArgs = [mcpConfig.entry];
    } else {
      command = process.platform === 'win32' && mcpConfig.runtime === 'npx' ? 'npx.cmd' : (mcpConfig.runtime || 'npx');
      cmdArgs = (mcpConfig.entry || '').split(' ').filter(Boolean);
      if (mcpConfig.runtime === 'npx' && !cmdArgs.includes('-y') && !cmdArgs.includes('--yes')) {
        cmdArgs.unshift('-y');
      }
    }
  } else {
    stream({
      nodeId,
      type: 'SYSTEM_LOG',
      content: `Warning: MCP Server '${serverName}' not found in registry. Skipping.`,
      timestamp: ''
    });
    return { transport: null, serverName };
  }

  if (command) {
    stream({
      nodeId,
      type: 'SYSTEM_LOG',
      content: `Booting Native MCP Server for Tooling: ${serverName}`,
      timestamp: ''
    });

    const serverEnv = { ...process.env, ...env, ...keys };
    const transport = new StdioClientTransport({
      command,
      args: cmdArgs,
      env: serverEnv as Record<string, string>
    });

    return { transport, serverName };
  }

  return { transport: null, serverName };
}
