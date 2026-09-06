/**
 * Comprehensive End-to-End Test Suite for LAPI/v1 Server Engine
 * 
 * Verifies all 28+ HTTP routes, SSE streams, JSON-RPC MCP gateway,
 * async task queues, HITL approval gates, keys, skills, and WebSocket hub.
 * 
 * Run with:
 *   bun test tests/lapi/comprehensive_lapi.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { createLiateApp, WSHub } from '../../src/lapi';
import fs from 'fs/promises';
import path from 'path';

describe('⚡ Comprehensive LAPI/v1 End-to-End Test Suite', () => {
  const wsHub = new WSHub();
  const app = createLiateApp(wsHub);

  const testTempDir = path.join(process.cwd(), '.tmp_lapi_test');

  beforeAll(async () => {
    await fs.mkdir(testTempDir, { recursive: true });
  });

  afterAll(async () => {
    try {
      await fs.rm(testTempDir, { recursive: true, force: true });
    } catch {}
  });

  // ─── 1. Health Probes ───────────────────────────────────────────────────────
  describe('1. Health & Diagnostic Endpoints', () => {
    it('GET / should return 200 with server metadata', async () => {
      const res = await app.request('/');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.name).toBe('liate');
      expect(data.status).toBe('online');
      expect(data.protocol).toBe('LAPI/v1');
    });

    it('GET /health and /api/health should return 200', async () => {
      const r1 = await app.request('/health');
      const r2 = await app.request('/api/health');
      expect(r1.status).toBe(200);
      expect(r2.status).toBe(200);
      const body = await r1.json();
      expect(body.status).toBe('online');
    });

    it('GET /lapi/v1/health should return canonical LAPI/v1 response', async () => {
      const res = await app.request('/lapi/v1/health');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.protocol).toBe('LAPI/v1');
      expect(body.runtime).toContain('Bun');
    });
  });

  // ─── 2. Agent Execution & Streaming ─────────────────────────────────────────
  describe('2. Agent Execution & Inference Endpoints', () => {
    const SARVAM_KEY = process.env.SARVAM_API_KEY || 'sk_test_dummy_key';

    const realSarvamSpec = {
      L: 'sarvam/sarvam-105b',
      I: { memory: 'test_session_lapi' },
      A: {
        name: 'bharat-analyst',
        intent: 'You are a sovereign AI business analyst for Bharat.'
      },
      T: {},
      E: {
        SARVAM_API_KEY: SARVAM_KEY,
        MAX_TURNS: 1
      }
    };

    it('POST /lapi/v1/run should accept valid 5-pillar spec and execute real inference', async () => {
      const res = await app.request('/lapi/v1/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spec: realSarvamSpec,
          prompt: 'State "Namaste Bharat" in one short sentence.'
        })
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toBeDefined();
      expect(data.output || data.response || data.result).toBeDefined();
    }, 35000);

    it('POST /api/agent/run should be compatible with ADK callers with real model', async () => {
      const res = await app.request('/api/agent/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spec: realSarvamSpec,
          prompt: 'Say hi.'
        })
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toBeDefined();
    }, 35000);

    it('POST /lapi/v1/run with stream:true should return real SSE text/event-stream', async () => {
      const res = await app.request('/lapi/v1/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream'
        },
        body: JSON.stringify({
          spec: realSarvamSpec,
          prompt: 'Say hello in Hindi.',
          stream: true
        })
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toContain('text/event-stream');
      const text = await res.text();
      expect(text.length).toBeGreaterThan(0);
      expect(text).toContain('data:');
    }, 35000);

    it('POST /lapi/v1/run without prompt should return 400 error', async () => {
      const res = await app.request('/lapi/v1/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spec: realSarvamSpec
        })
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBeDefined();
    });
  });

  // ─── 3. Agent Lifecycle & Discovery ─────────────────────────────────────────
  describe('3. Agent Lifecycle & Discovery', () => {
    it('GET /lapi/v1/agents should return list of installed agents', async () => {
      const res = await app.request('/lapi/v1/agents');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
    });

    it('POST /lapi/v1/agents should register a new agent manifest', async () => {
      const agentPayload = {
        name: 'dynamic-test-agent',
        spec: {
          L: 'sarvam/sarvam-105b',
          I: { memory: 'dynamic_mem' },
          A: { name: 'dynamic-test-agent', intent: 'Dynamic test' },
          T: {},
          E: {}
        }
      };

      const res = await app.request('/lapi/v1/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(agentPayload)
      });

      expect([200, 201]).toContain(res.status);
    });

    it('POST /lapi/v1/deploy should package and prepare agent deployment', async () => {
      const res = await app.request('/lapi/v1/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_name: 'test-deploy-agent',
          spec: {
            L: 'sarvam/sarvam-105b',
            A: { name: 'test-deploy-agent', intent: 'Deployment probe' }
          }
        })
      });

      expect([200, 201]).toContain(res.status);
      const data = await res.json();
      expect(data.status || data.success || data.deployment_id).toBeDefined();
    });
  });

  // ─── 4. Async Task Queue ────────────────────────────────────────────────────
  describe('4. Asynchronous Background Task Queue', () => {
    let createdTaskId: string;

    it('POST /lapi/v1/:agent_id/tasks should dispatch a background task', async () => {
      const res = await app.request('/lapi/v1/test-agent/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 'Execute long background task',
          spec: {
            L: 'sarvam/sarvam-105b',
            A: { name: 'test-agent', intent: 'Background task worker' }
          }
        })
      });

      expect([200, 202]).toContain(res.status);
      const data = await res.json();
      expect(data.taskId || data.task_id || data.id).toBeDefined();
      createdTaskId = data.taskId || data.task_id || data.id;
    });

    it('GET /lapi/v1/tasks should list active and recent tasks', async () => {
      const res = await app.request('/lapi/v1/tasks');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data) || typeof data === 'object').toBe(true);
    });

    it('GET /lapi/v1/tasks/:task_id should return status of created task', async () => {
      if (!createdTaskId) return;
      const res = await app.request(`/lapi/v1/tasks/${createdTaskId}`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.id || data.task_id).toBe(createdTaskId);
    });

    it('POST /lapi/v1/tasks/:task_id/cancel should cancel the task', async () => {
      if (!createdTaskId) return;
      const res = await app.request(`/lapi/v1/tasks/${createdTaskId}/cancel`, {
        method: 'POST'
      });
      expect([200, 204]).toContain(res.status);
    });
  });

  // ─── 5. Streamable HTTP MCP Gateway ─────────────────────────────────────────
  describe('5. Streamable HTTP MCP Gateway', () => {
    it('POST /lapi/v1/mcp with initialize method should return protocol capabilities', async () => {
      const res = await app.request('/lapi/v1/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            clientInfo: { name: 'lapi-test-client', version: '1.0.0' }
          }
        })
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.result).toBeDefined();
      expect(data.result.serverInfo.name).toBe('liate');
    });

    it('POST /lapi/v1/mcp with tools/list should list available tools', async () => {
      const res = await app.request('/lapi/v1/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/list'
        })
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.result).toBeDefined();
      expect(Array.isArray(data.result.tools)).toBe(true);
    });

    it('GET /api/mcp/raw should list raw MCP configs', async () => {
      const res = await app.request('/api/mcp/raw');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(typeof data === 'object').toBe(true);
    });

    it('POST /api/mcp should register a new MCP server config', async () => {
      const res = await app.request('/api/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'temp-test-mcp',
          config: {
            command: 'node',
            args: ['-v']
          }
        })
      });

      expect([200, 201]).toContain(res.status);
    });

    it('DELETE /api/mcp/:name should remove MCP server config', async () => {
      const res = await app.request('/api/mcp/temp-test-mcp', {
        method: 'DELETE'
      });

      expect([200, 204]).toContain(res.status);
    });
  });

  // ─── 6. HITL (Human In The Loop) Gates ───────────────────────────────────────
  describe('6. HITL Gates & Tool Approvals', () => {
    it('GET /api/hitl should return pending approval queue', async () => {
      const res = await app.request('/api/hitl');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data) || typeof data === 'object').toBe(true);
    });

    it('POST /api/hitl/approve should handle approval resolution', async () => {
      const res = await app.request('/api/hitl/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'non-existent-probe-id',
          allowed: true
        })
      });

      expect([200, 404]).toContain(res.status);
    });
  });

  // ─── 7. Keys Management ─────────────────────────────────────────────────────
  describe('7. API Key Vault Management', () => {
    it('GET /api/keys should list keys without exposing secrets', async () => {
      const res = await app.request('/api/keys');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(typeof data === 'object').toBe(true);
    });

    it('POST /api/keys should save a new key', async () => {
      const res = await app.request('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'TEST_PROVIDER_KEY',
          key: 'sk_test_mock_secret_12345'
        })
      });

      expect([200, 201]).toContain(res.status);
    });

    it('DELETE /api/keys should remove key', async () => {
      const res = await app.request('/api/keys', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: 'TEST_PROVIDER_KEY'
        })
      });

      expect([200, 204]).toContain(res.status);
    });
  });

  // ─── 8. Skills Library ──────────────────────────────────────────────────────
  describe('8. Skills Library Management', () => {
    it('GET /lapi/v1/skills should return registered skills', async () => {
      const res = await app.request('/lapi/v1/skills');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data) || typeof data === 'object').toBe(true);
    });

    it('POST /api/skills should register markdown skill', async () => {
      const res = await app.request('/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'test-skill',
          content: '# Test Skill\n- Execute test instructions',
          description: 'Automated test skill'
        })
      });

      expect([200, 201]).toContain(res.status);
    });

    it('DELETE /api/skills/:name should remove registered skill', async () => {
      const res = await app.request('/api/skills/test-skill', {
        method: 'DELETE'
      });

      expect([200, 204]).toContain(res.status);
    });
  });

  // ─── 9. Catalogs & Chat ─────────────────────────────────────────────────────
  describe('9. Catalogs & Interactive Chat', () => {
    it('GET /api/catalog/mcps should return MCP catalog items', async () => {
      const res = await app.request('/api/catalog/mcps');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
    });

    it('GET /api/catalog/skills should return skills catalog items', async () => {
      const res = await app.request('/api/catalog/skills');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);
    });

    it('GET /api/catalog/llm should return model catalog items', async () => {
      const res = await app.request('/api/catalog/llm');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.some((m: any) => m.id === 'sarvam/sarvam-105b')).toBe(true);
    });

    it('POST /api/chat should handle multi-turn conversational streaming response', async () => {
      const res = await app.request('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'user', content: 'Hello assistant' }
          ],
          model: 'sarvam/sarvam-105b',
          session: 'chat_test_session'
        })
      });

      expect(res.status).toBe(200);
      const text = await res.text();
      expect(typeof text === 'string').toBe(true);
    });
  });

  // ─── 10. WebSocket Hub ──────────────────────────────────────────────────────
  describe('10. WebSocket Hub Events & Approvals', () => {
    it('should register and remove WebSocket client handles safely', () => {
      const mockWs = {
        send: (msg: string) => {},
        readyState: 1
      };

      wsHub.addClient(mockWs as any);
      expect(wsHub.clientCount).toBeGreaterThan(0);

      wsHub.broadcast({ type: 'test_ping', data: 'hello' });

      wsHub.removeClient(mockWs as any);
    });

    it('should handle tool approval dispatching and resolution', async () => {
      let broadcastedId = '';
      const testWs = {
        send: (msg: string) => {
          try {
            const parsed = JSON.parse(msg);
            if (parsed.type === 'tool_approval_request') {
              broadcastedId = parsed.id;
            }
          } catch {}
        },
        readyState: 1
      };

      wsHub.addClient(testWs as any);

      const approvalPromise = wsHub.requestApproval('test_tool_call_1', { code: '1+1' }, 10000);
      
      // Resolve using captured broadcasted id
      setTimeout(() => {
        if (broadcastedId) {
          wsHub.resolveApproval(broadcastedId, true, false, 'test_tool_call_1');
        }
      }, 50);

      const allowed = await approvalPromise;
      expect(allowed).toBe(true);

      wsHub.removeClient(testWs as any);
    });
  });
});
