import { Context } from 'hono';
import { getInstalledAgents, getInstalledMcps } from '../../store';
import { WSHub } from '../websocket';

export async function evalHandler(c: Context) {
  const agents = await getInstalledAgents();
  const mcps = await getInstalledMcps();
  return c.json({
    status: 'healthy',
    protocol: 'LAPI/v1',
    totalAgents: agents.length,
    totalMcpServers: Object.keys(mcps).length,
    protocolVersion: '2026-07-28',
    runtime: 'Bun + Hono Edge Native',
    memoryUsageMb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
    uptimeSeconds: Math.floor(process.uptime()),
  });
}

export function createHitlHandler(wsHub: WSHub) {
  return {
    getQueue: (c: Context) => c.json({
      queue: wsHub.getPendingApprovals(),
      audit: []
    }),
    resolve: async (c: Context) => {
      const body = await c.req.json();
      const { id, allowed, always_allow, toolName } = body;
      if (!id) return c.json({ error: 'Missing approval id' }, 400);
      const resolved = wsHub.resolveApproval(id, allowed !== false, !!always_allow, toolName);
      return c.json({ success: resolved, id, allowed: allowed !== false });
    }
  };
}
