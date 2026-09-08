import { StreamFn, StreamableHttpClientTransport } from '../stream';
import { getInstalledMcps, getKeys } from '@liate/store';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

export async function executeMcpTool(
  serverName: string,
  toolName: string,
  args: Record<string, any>,
  stream: StreamFn,
  nodeId: string,
  entry?: string,
  runtime?: string
): Promise<any> {
  stream({
    nodeId,
    type: 'STATUS',
    content: `Executing Native MCP tool [${toolName}] on server [${serverName}]...`,
    timestamp: ''
  });

  try {
    const installedMcps = await getInstalledMcps();
    let command = '';
    let cmdArgs: string[] = [];
    let env: Record<string, string> = {};

    if (installedMcps[serverName]) {
      command = installedMcps[serverName].command || '';
      cmdArgs = installedMcps[serverName].args || [];
      env = installedMcps[serverName].env || {};
    } else if (entry) {
      const isSse = runtime === 'sse' || entry.startsWith('http');
      if (isSse) {
        command = 'sse';
        cmdArgs = [entry];
      } else if (runtime === 'exe') {
        command = entry;
      } else if (runtime === 'inbuilt') {
        command = 'node';
        cmdArgs = [entry];
      } else {
        command = process.platform === 'win32' && runtime === 'npx' ? 'npx.cmd' : (runtime || 'npx');
        cmdArgs = (entry || '').split(' ').filter(Boolean);
        if (runtime === 'npx' && !cmdArgs.includes('-y') && !cmdArgs.includes('--yes')) {
          cmdArgs.unshift('-y');
        }
      }
    } else {
      throw new Error(`Unknown MCP server: ${serverName}. Not found in registry and no node entry provided.`);
    }

    const keys = await getKeys();
    const serverEnv = { ...process.env, ...env, ...keys };

    stream({
      nodeId,
      type: 'THOUGHT',
      content: `Booting Native MCP Server: ${command} ${cmdArgs.join(' ')}`,
      timestamp: ''
    });

    const isSseTransport = command === 'sse' || (entry && entry.includes('/sse'));
    const isHttpTransport = command === 'http' || (entry && (entry.startsWith('http://') || entry.startsWith('https://')));
    const url = cmdArgs[0] || entry || '';

    let transport;
    if (isSseTransport) {
      transport = new SSEClientTransport(new URL(url));
    } else if (isHttpTransport) {
      transport = new StreamableHttpClientTransport(url);
    } else {
      transport = new StdioClientTransport({
        command,
        args: cmdArgs,
        env: serverEnv as Record<string, string>
      });
    }

    const mcp = new Client({
      name: `om-agent-${nodeId}`,
      version: '1.0.0',
    }, {
      capabilities: {}
    });

    await mcp.connect(transport);

    stream({
      nodeId,
      type: 'THOUGHT',
      content: `Calling ${toolName} with args: ${JSON.stringify(args)}`,
      timestamp: ''
    });

    const toolsResult = await mcp.listTools();
    const tools = toolsResult.tools;
    
    stream({
      nodeId,
      type: 'THOUGHT',
      content: `Available tools from server: ${tools.map((t: any) => t.name).join(', ')}`,
      timestamp: ''
    });

    const tool = tools.find((t: any) => t.name === toolName || t.name === `${serverName}_${toolName}` || t.name.endsWith(toolName));

    if (!tool) {
      throw new Error(`Tool ${toolName} not found on MCP server. Available: ${tools.map((t: any) => t.name).join(', ')}`);
    }

    const result = await mcp.callTool({
      name: tool.name,
      arguments: args
    });

    let textResult: string | any = result;
    if (result && result.content && Array.isArray(result.content)) {
      textResult = result.content.map((c: any) => c.text).join('\n');
    } else if (typeof result === 'object') {
      textResult = JSON.stringify(result);
    }

    stream({
      nodeId,
      type: 'RESULT',
      content: textResult,
      timestamp: ''
    });

    await transport.close();

    return textResult;
  } catch (error: any) {
    stream({
      nodeId,
      type: 'ERROR',
      content: error.message,
      timestamp: ''
    });
    return `[MCP Execution Error]: ${error.message}`;
  }
}

export async function probeMcpTools(serverName: string): Promise<any> {
  try {
    const installedMcps = await getInstalledMcps();
    if (!installedMcps[serverName]) {
      throw new Error(`Unknown MCP server: ${serverName}`);
    }

    const mcpConfig = installedMcps[serverName];
    
    // Return cached tools immediately if already probed
    if (mcpConfig.tools && Array.isArray(mcpConfig.tools) && mcpConfig.tools.length > 0 && mcpConfig.tools[0] !== '*') {
      return {
        serverInfo: mcpConfig.serverInfo || { name: serverName, version: '1.0.0' },
        tools: mcpConfig.tools.map((t: any) => typeof t === 'string' ? { name: t, description: `Tool ${t}` } : t)
      };
    }

    const { command, args, env } = mcpConfig;
    const keys = await getKeys();
    const serverEnv = { ...process.env, ...env, ...keys };

    const isSse = command === 'sse' || (mcpConfig.url && mcpConfig.url.includes('/sse'));
    const isHttp = command === 'http' || (mcpConfig.url && (mcpConfig.url.startsWith('http://') || mcpConfig.url.startsWith('https://')));
    const url = mcpConfig.url || (args && args[0]) || '';

    let transport;
    if (isSse) {
      transport = new SSEClientTransport(new URL(url));
    } else if (isHttp) {
      transport = new StreamableHttpClientTransport(url);
    } else {
      transport = new StdioClientTransport({
        command: command || 'npx',
        args: args || [],
        env: serverEnv as Record<string, string>
      });
    }

    const mcp = new Client({
      name: `om-probe`,
      version: '1.0.0',
    }, {
      capabilities: {}
    });

    await mcp.connect(transport);
    const serverInfo = mcp.getServerVersion ? mcp.getServerVersion() : undefined;
    const toolsResult = await mcp.listTools();
    await transport.close();
    
    return {
      serverInfo,
      tools: toolsResult.tools.map((t: any) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema
      }))
    };
  } catch (error: any) {
    console.error(`Failed to probe tools for ${serverName}:`, error.message);
    return { serverInfo: null, tools: [] };
  }
}
