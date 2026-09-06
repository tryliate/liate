import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamFn } from '../../../om';
import { getKeys, getInstalledMcps } from '../../../store';
import { createMcpTransport } from './spawn';
import { createLifecycleManager, cleanupMcpServers, type McpLifecycleManager } from './lifecycle';
import { injectFallbackArgs, sanitizeSchema } from './schema';

export { cleanupMcpServers };
export type { McpLifecycleManager };

export async function bootMcpServers(
  mcps: any[],
  userPrompt: string,
  stream: StreamFn,
  nodeId: string
): Promise<{ nativeTools: any[], toolExecutors: Record<string, Function>, manager: McpLifecycleManager }> {
  
  const nativeTools: any[] = [];
  const toolExecutors: Record<string, Function> = {};
  const manager = createLifecycleManager();
  
  if (!mcps || mcps.length === 0) {
    return { nativeTools, toolExecutors, manager };
  }

  const keys = await getKeys();
  const installedMcps = await getInstalledMcps();

  for (const mcpConfig of mcps) {
    const { transport, serverName } = createMcpTransport(mcpConfig, installedMcps, keys, stream, nodeId);
    if (!transport) continue;

    const mcpClient = new Client({
      name: `om-agent-${nodeId}`,
      version: '1.0.0',
    }, { capabilities: {} });

    try {
      await mcpClient.connect(transport);
      manager.transports.push(transport);
      manager.clients.push(mcpClient);

      const toolsResult = await mcpClient.listTools();
      const activeToolNames = mcpConfig.activeTools || {};
      const isFiltering = Object.values(activeToolNames).some(v => v === true);
      
      const addedTools = [];
      for (const t of toolsResult.tools) {
        if (!isFiltering || activeToolNames[t.name] === true) {
          nativeTools.push({
            name: t.name,
            description: t.description || `Execute ${t.name}`,
            inputSchema: sanitizeSchema(t.inputSchema)
          });

          toolExecutors[t.name] = async (args: any) => {
            const mcpArgs = injectFallbackArgs(args, t, userPrompt);

            stream({
              nodeId,
              type: 'THOUGHT',
              content: `Executing Native MCP Tool [${t.name}]...`,
              timestamp: ''
            });
            
            try {
              const result = await mcpClient.callTool({
                name: t.name,
                arguments: mcpArgs
              });
              
              let stringResult = typeof result === 'object' ? JSON.stringify(result) : String(result);
              if (result && result.isError) {
                stringResult += "\n\n[SYSTEM INSTRUCTION]: The tool failed. Please try calling the tool again with the correct required parameters.";
              }
              
              return stringResult;
            } catch (err: any) {
              return `[Error executing tool]: ${err.message}. Please try calling the tool again with the correct required parameters.`;
            }
          };
          addedTools.push(t.name);
        }
      }
      
      stream({
        nodeId,
        type: 'SYSTEM_LOG',
        content: `Added native tools to Agent: ${addedTools.join(', ')}`,
        timestamp: ''
      });
    } catch (e: any) {
      stream({
        nodeId,
        type: 'SYSTEM_LOG',
        content: `Error connecting to MCP Server ${serverName}: ${e.message}`,
        timestamp: ''
      });
    }
  }

  return { nativeTools, toolExecutors, manager };
}
