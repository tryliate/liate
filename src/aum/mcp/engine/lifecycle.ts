import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export interface McpLifecycleManager {
  transports: StdioClientTransport[];
  clients: Client[];
}

export function createLifecycleManager(): McpLifecycleManager {
  return {
    transports: [],
    clients: []
  };
}

export async function cleanupMcpServers(manager: McpLifecycleManager, stream: any, nodeId: string) {
  if (manager.clients.length === 0) return;

  stream({
    nodeId,
    type: 'SYSTEM_LOG',
    content: `Cleaning up ${manager.clients.length} background MCP processes...`,
    timestamp: ''
  });

  for (const client of manager.clients) {
    try {
      await client.close();
    } catch (e) {
      console.error("Error closing MCP client:", e);
    }
  }

  for (const transport of manager.transports) {
    try {
      await transport.close();
    } catch (e) {
      console.error("Error closing MCP transport:", e);
    }
  }
}
