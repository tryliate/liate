import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { WSHub } from './websocket';
import { healthHandler } from './routes/health';
import { createRunHandler } from './routes/run';
import { listAgentsHandler, getAgentHandler, deployAgentHandler, installAgentHandler, deleteAgentHandler } from './routes/agents';
import { dispatchTaskHandler, listTasksHandler, getTaskHandler, cancelTaskHandler } from './routes/tasks';
import { createMcpStreamableHandler, listMcpsHandler, listRawMcpsHandler, probeMcpHandler, addMcpHandler, deleteMcpHandler } from './routes/mcp';
import { evalHandler, createHitlHandler } from './routes/eval';
import { listKeysHandler, saveKeyHandler, deleteKeyHandler } from './routes/keys';
import { listSkillsHandler, saveSkillHandler, deleteSkillHandler } from './routes/skills';
import { createChatHandler } from './routes/chat';
import fs from 'node:fs/promises';
import path from 'node:path';

export { WSHub };

/**
 * Creates the Sovereign LAPI/v1 Engine (Hono + Bun)
 */
export function createLiateApp(wsHub: WSHub = new WSHub()) {
  const app = new Hono();
  const runHandler = createRunHandler(wsHub);
  const mcpHandler = createMcpStreamableHandler(wsHub);
  const hitlHandler = createHitlHandler(wsHub);
  const chatHandler = createChatHandler(wsHub);

  // 0. LAPI HTTP Request Logger Middleware
  app.use('*', async (c, next) => {
    const start = Date.now();
    const method = c.req.method;
    const path = c.req.path;
    await next();
    const duration = Date.now() - start;
    const status = c.res.status;
    const statusColor = status >= 400 ? '\x1b[31m' : status >= 300 ? '\x1b[33m' : '\x1b[32m';
    if (!path.includes('/health')) {
      console.log(`\x1b[90m[${new Date().toLocaleTimeString()}]\x1b[0m \x1b[36;1m[LAPI API]\x1b[0m \x1b[1m${method}\x1b[0m ${path} ➔ ${statusColor}${status}\x1b[0m \x1b[90m(${duration}ms)\x1b[0m`);
    }
  });

  // 1. Configurable CORS Middleware
  const configuredOrigin = process.env.LIATE_CORS_ORIGIN;
  app.use('*', cors({
    origin: (origin) => {
      if (!origin) return '*';
      if (configuredOrigin) {
        if (configuredOrigin === '*') return '*';
        const allowed = configuredOrigin.split(',').map(s => s.trim());
        return allowed.includes(origin) ? origin : null;
      }
      // Allow localhost/127.0.0.1 in development, otherwise return request origin for dev convenience
      return origin;
    },
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Mcp-Method', 'Mcp-Name'],
  }));

  // ── Health Check Endpoints ────────────────────────────────────────────────
  app.get('/', healthHandler);
  app.get('/health', healthHandler);
  app.get('/api/health', healthHandler);
  app.get('/lapi/v1/health', healthHandler);
  app.get('/api/v1/health', healthHandler);

  // ── Canonical LAPI/v1 Execution Endpoints ────────────────────────────────
  app.post('/lapi/v1/:agent_id/run', runHandler);
  app.post('/lapi/v1/run', runHandler);
  app.post('/api/agent/run', runHandler);
  app.post('/api/run', runHandler);

  // ── Agent Discovery & Lifecycle ──────────────────────────────────────────
  app.get('/lapi/v1/agents', listAgentsHandler);
  app.get('/api/agents', listAgentsHandler);
  app.post('/lapi/v1/agents', installAgentHandler);
  app.post('/api/agents', installAgentHandler);
  app.delete('/api/agents/:name', deleteAgentHandler);

  app.post('/lapi/v1/deploy', deployAgentHandler);
  app.post('/api/agent/deploy', deployAgentHandler);
  app.post('/api/deploy', deployAgentHandler);

  // ── Async Background Tasks ──────────────────────────────────────────────
  app.get('/lapi/v1/tasks', listTasksHandler);
  app.get('/lapi/v1/tasks/:task_id', getTaskHandler);
  app.post('/lapi/v1/tasks/:task_id/cancel', cancelTaskHandler);
  app.post('/lapi/v1/:agent_id/tasks', dispatchTaskHandler);

  // Parameterized Agent routes (must come after static /tasks and /deploy)
  app.get('/lapi/v1/:agent_id', getAgentHandler);

  // ── Streamable HTTP MCP Endpoints ────────────────────────────────────────
  app.all('/mcp', mcpHandler);
  app.all('/lapi/v1/mcp', mcpHandler);
  app.get('/api/mcp/raw', listRawMcpsHandler);
  app.get('/api/mcp/tools', probeMcpHandler);
  app.get('/api/mcp/:name/tools', probeMcpHandler);
  app.get('/api/mcp', listMcpsHandler);
  app.post('/api/mcp', addMcpHandler);
  app.post('/api/mcp/delete', deleteMcpHandler);
  app.delete('/api/mcp/:name', deleteMcpHandler);

  // ── Telemetry & Evaluation ────────────────────────────────────────────────
  app.get('/lapi/v1/eval', evalHandler);
  app.get('/api/eval', evalHandler);
  app.get('/api/hitl', hitlHandler.getQueue);
  app.post('/api/hitl', hitlHandler.resolve);
  app.post('/api/hitl/approve', hitlHandler.resolve);

  // ── Keys Management ───────────────────────────────────────────────────────
  app.get('/api/keys', listKeysHandler);
  app.post('/api/keys', saveKeyHandler);
  app.delete('/api/keys', deleteKeyHandler);

  // ── Skills Library ────────────────────────────────────────────────────────
  app.get('/lapi/v1/skills', listSkillsHandler);
  app.get('/api/skills', listSkillsHandler);
  app.post('/api/skills', saveSkillHandler);
  app.delete('/api/skills/:name', deleteSkillHandler);

  // ── Multi-Turn Interactive Chat Endpoint ──────────────────────────────────
  app.post('/api/chat', chatHandler);

  // ── Catalog Prebuilt / Community ──────────────────────────────────────────
  app.get('/api/catalog/:type', async (c) => {
    const type = c.req.param('type');
    if (!['mcps', 'skills', 'llm'].includes(type)) {
      return c.json({ error: 'Invalid catalog type' }, 400);
    }

    const loadCatalog = async (category: 'prebuilt' | 'community', itemType: string) => {
      const dir = (import.meta as any).dirname || process.cwd();
      const candidates = [
        path.join(process.cwd(), 'catalog', category, `${itemType}.json`),
        path.join(dir, '..', '..', 'catalog', category, `${itemType}.json`),
        path.join(process.cwd(), '..', 'catalog', category, `${itemType}.json`)
      ];
      for (const p of candidates) {
        try {
          const content = await fs.readFile(p, 'utf-8');
          return JSON.parse(content);
        } catch {}
      }
      return [];
    };

    const prebuilt = await loadCatalog('prebuilt', type);
    const community = await loadCatalog('community', type);

    const extractArray = (data: any, key: string) => {
      if (Array.isArray(data)) return data;
      if (data && typeof data === 'object' && Array.isArray(data[key])) return data[key];
      return [];
    };

    return c.json([...extractArray(prebuilt, type), ...extractArray(community, type)]);
  });

  return app;
}

export const createLapiApp = createLiateApp;
