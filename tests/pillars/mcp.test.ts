/**
 * Tests for pillars/mcp.ts — LiateMcp (non-network, structural tests)
 * Run with: bun test
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { LiateMcp } from '../../src/oop/Liate_MCP/LiateMcp';

// ─── Constructor defaults ─────────────────────────────────────────────────────

describe('LiateMcp — constructor', () => {
  it('sets default name and version', () => {
    const mcp = new LiateMcp();
    expect(mcp.name).toBe('tryliate-connectors');
    expect(mcp.version).toBe('2.0.0');
    expect(mcp.auth).toBe('none');
  });

  it('applies custom options', () => {
    const mcp = new LiateMcp({ name: 'my-mcp', version: '3.0.0', auth: 'bearer', apiKey: 'sk-test' });
    expect(mcp.name).toBe('my-mcp');
    expect(mcp.version).toBe('3.0.0');
    expect(mcp.auth).toBe('bearer');
    expect(mcp.apiKey).toBe('sk-test');
  });

  it('registers built-in websearch tool by default', async () => {
    const mcp = new LiateMcp();
    const req = new Request('http://localhost/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
    });
    const res = await mcp.fetch(req);
    const body = await res.json() as any;
    const toolNames = body.result.tools.map((t: any) => t.name);
    expect(toolNames).toContain('websearch');
  });
});

// ─── Tool registration ────────────────────────────────────────────────────────

describe('LiateMcp — tool registration', () => {
  let mcp: LiateMcp;
  beforeEach(() => { mcp = new LiateMcp({ name: 'test' }); });

  it('registers a custom tool', async () => {
    mcp.tool('greet', {
      description: 'Returns a greeting',
      schema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
      handler: async ({ name }) => `Hello, ${name}!`
    });

    const req = new Request('http://localhost/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
    });
    const res = await mcp.fetch(req);
    const body = await res.json() as any;
    const names = body.result.tools.map((t: any) => t.name);
    expect(names).toContain('greet');
  });

  it('executes a registered tool via tools/call', async () => {
    mcp.tool('add', {
      description: 'Adds two numbers',
      schema: { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } } },
      handler: async ({ a, b }) => a + b
    });

    const req = new Request('http://localhost/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 2, method: 'tools/call',
        params: { name: 'add', arguments: { a: 3, b: 4 } }
      })
    });
    const res = await mcp.fetch(req);
    const body = await res.json() as any;
    expect(res.status).toBe(200);
    expect(body.result.content[0].text).toBe('7');
  });

  it('returns 404 for unknown tool call', async () => {
    const req = new Request('http://localhost/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 3, method: 'tools/call',
        params: { name: 'nonexistent', arguments: {} }
      })
    });
    const res = await mcp.fetch(req);
    const body = await res.json() as any;
    expect(res.status).toBe(404);
    expect(body.error.code).toBe(-32601);
  });

  it('supports method chaining on tool()', () => {
    const result = mcp
      .tool('t1', { description: 'Tool 1', handler: async () => 'ok' })
      .tool('t2', { description: 'Tool 2', handler: async () => 'ok' });
    expect(result).toBe(mcp);
  });
});

// ─── HTTP endpoints ───────────────────────────────────────────────────────────

describe('LiateMcp — HTTP endpoints', () => {
  let mcp: LiateMcp;
  beforeEach(() => { mcp = new LiateMcp({ name: 'endpoint-test' }); });

  it('returns metadata at GET /', async () => {
    const res = await mcp.fetch(new Request('http://localhost/'));
    const body = await res.json() as any;
    expect(body.name).toBe('endpoint-test');
    expect(body.protocol).toBe('mcp-2024-11-05');
    expect(body.status).toBe('operational');
  });

  it('returns 200 ok at /health', async () => {
    const res = await mcp.fetch(new Request('http://localhost/health'));
    const body = await res.json() as any;
    expect(res.status).toBe(200);
    expect(body.status).toBe('ok');
  });

  it('handles OPTIONS preflight with CORS headers', async () => {
    const res = await mcp.fetch(new Request('http://localhost/v1/messages', { method: 'OPTIONS' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('handles initialize JSON-RPC method', async () => {
    const res = await mcp.fetch(new Request('http://localhost/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'initialize' })
    }));
    const body = await res.json() as any;
    expect(body.result.protocolVersion).toBe('2024-11-05');
    expect(body.result.serverInfo.name).toBe('endpoint-test');
  });

  it('returns 404 for unknown pathname', async () => {
    const res = await mcp.fetch(new Request('http://localhost/nonexistent-path'));
    expect(res.status).toBe(404);
  });
});

// ─── OAuth token security ─────────────────────────────────────────────────────

describe('LiateMcp — OAuth token security', () => {
  it('generates a token with sufficient entropy (length > 40 chars)', async () => {
    const mcp = new LiateMcp({ name: 'oauth-test' });
    const res = await mcp.fetch(new Request('http://localhost/oauth/token', { method: 'POST' }));
    const body = await res.json() as any;
    const token = body.access_token as string;
    // liate_sk_ prefix + 64 hex chars from randomBytes(32)
    expect(token.startsWith('liate_sk_')).toBe(true);
    expect(token.length).toBeGreaterThan(50);
    // Must be hex — no Math.random() artifacts
    const hexPart = token.replace('liate_sk_', '');
    expect(/^[0-9a-f]+$/.test(hexPart)).toBe(true);
  });

  it('generates unique tokens on each request', async () => {
    const mcp = new LiateMcp({ name: 'unique-test' });
    const r1 = await (await mcp.fetch(new Request('http://localhost/oauth/token', { method: 'POST' }))).json() as any;
    const r2 = await (await mcp.fetch(new Request('http://localhost/oauth/token', { method: 'POST' }))).json() as any;
    expect(r1.access_token).not.toBe(r2.access_token);
  });
});
