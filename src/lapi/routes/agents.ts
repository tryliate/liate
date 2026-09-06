import { Context, Next } from 'hono';
import { getInstalledAgents, loadAgent, saveAgent, installAgent, uninstallAgent } from '../../store';

export async function listAgentsHandler(c: Context) {
  const agents = await getInstalledAgents();
  return c.json(agents);
}

export async function getAgentHandler(c: Context, next: Next) {
  const agentId = c.req.param('agent_id');
  if (!agentId || ['mcp', 'eval', 'health', 'agents', 'skills', 'keys', 'ws', 'deploy', 'run', 'hitl', 'chat', 'image', 'video'].includes(agentId)) {
    return next();
  }
  const agent = await loadAgent(agentId);
  if (!agent) return c.json({ error: `Agent "${agentId}" not found` }, 404);
  return c.json({ status: 'success', agent });
}

export async function deployAgentHandler(c: Context) {
  const body = await c.req.json();
  const name = body.name || body.manifest?.A?.name || body.spec?.A?.name || body.id || 'custom-agent';
  const spec = body.manifest || body.spec || body;
  await saveAgent(name, spec);
  return c.json({ status: 'deployed', agent: name, success: true });
}

export async function installAgentHandler(c: Context) {
  const body = await c.req.json();
  await installAgent(body);
  return c.json({ success: true });
}

export async function deleteAgentHandler(c: Context) {
  const name = c.req.param('name');
  if (!name) return c.json({ error: 'Agent name is required' }, 400);
  await uninstallAgent(name);
  return c.json({ success: true });
}
