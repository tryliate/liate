import { Context } from 'hono';
import { getInstalledMcps, getRawMcps, installMcp, uninstallMcp, updateMcpTools } from '../../store';
import { probeMcpTools, executeMcpTool, createStreamDispatcher } from '../../om';
import { WSHub } from '../websocket';

export function createMcpStreamableHandler(wsHub: WSHub) {
  const streamFn = createStreamDispatcher((msg: any) => wsHub.broadcast(msg));

  return async (c: Context) => {
    const methodHeader = c.req.header('Mcp-Method');
    const nameHeader = c.req.header('Mcp-Name');
    let body: any = {};
    if (c.req.method === 'POST') {
      try { body = await c.req.json(); } catch {}
    }

    const method = methodHeader || body.method || (c.req.method === 'GET' ? 'tools/list' : 'tools/call');

    if (method === 'tools/list' || method === 'initialize') {
      const installed = await getInstalledMcps();
      const allTools: any[] = [];
      for (const [sName, cfg] of Object.entries(installed)) {
        if (cfg.tools && Array.isArray(cfg.tools)) {
          allTools.push(...cfg.tools);
        } else {
          const probed = await probeMcpTools(sName);
          if (probed?.tools) allTools.push(...probed.tools);
        }
      }
      return c.json({
        jsonrpc: '2.0',
        id: body.id || 1,
        result: {
          protocolVersion: '2026-07-28',
          serverInfo: { name: 'liate', version: '1.0.0' },
          capabilities: { tools: {} },
          tools: allTools
        }
      });
    }

    if (method === 'tools/call') {
      const toolName = nameHeader || body.params?.name;
      const args = body.params?.arguments || {};
      if (!toolName) {
        return c.json({ jsonrpc: '2.0', id: body.id || 1, error: { code: -32602, message: 'Missing tool name' } }, 400);
      }

      // Route to installed MCP server providing this tool
      const installed = await getInstalledMcps();
      let matchedServer = '';
      for (const [sName, cfg] of Object.entries(installed)) {
        if (cfg.tools?.some((t: any) => (typeof t === 'string' ? t : t.name) === toolName)) {
          matchedServer = sName;
          break;
        }
      }
      if (!matchedServer) matchedServer = Object.keys(installed)[0] || 'default';

      const result = await executeMcpTool(matchedServer, toolName, args, streamFn, 'streamable-http');
      return c.json({
        jsonrpc: '2.0',
        id: body.id || 1,
        result: {
          content: [
            { type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result) }
          ]
        }
      });
    }

    return c.json({ jsonrpc: '2.0', id: body.id || 1, error: { code: -32601, message: `Method not supported: ${method}` } }, 404);
  };
}

export async function listMcpsHandler(c: Context) {
  return c.json(await getInstalledMcps());
}

export async function listRawMcpsHandler(c: Context) {
  return c.json(await getRawMcps());
}

export async function probeMcpHandler(c: Context) {
  const name = c.req.param('name') || c.req.query('name');
  if (!name) return c.json({ error: 'MCP name is required' }, 400);
  const probeRes = await probeMcpTools(name);
  if (probeRes && probeRes.tools && probeRes.tools.length > 0) {
    await updateMcpTools(name, probeRes.tools, probeRes.serverInfo);
  }
  return c.json(probeRes);
}

export async function addMcpHandler(c: Context) {
  try {
    const body = await c.req.json();
    const name = body.name;
    const config = body.config || { command: body.command, args: body.args, url: body.url };
    if (!name) return c.json({ error: 'MCP name is required' }, 400);

    await installMcp(name, config);
    let probeRes: any = { tools: [], serverInfo: { name, version: '1.0.0' } };
    try {
      probeRes = await probeMcpTools(name);
      if (probeRes && probeRes.tools && probeRes.tools.length > 0) {
        await updateMcpTools(name, probeRes.tools, probeRes.serverInfo);
      }
    } catch {}
    return c.json({ success: true, tools: probeRes?.tools || [], serverInfo: probeRes?.serverInfo });
  } catch (err: any) {
    return c.json({ error: err.message || 'Failed to register MCP server' }, 500);
  }
}

export async function deleteMcpHandler(c: Context) {
  const name = c.req.param('name') || (await c.req.json().catch(() => ({}))).name;
  if (!name) return c.json({ error: 'MCP name is required' }, 400);
  await uninstallMcp(name);
  return c.json({ success: true });
}
