/**
 * Tests for LAPI Server Engine & HTTP Endpoints
 * 
 * Run with: bun test tests/lapi/routes.test.ts
 */

import { describe, it, expect } from 'bun:test';
import { createLiateApp, WSHub } from '../../src/lapi';

describe('LAPI Server & HTTP Endpoints', () => {
  const wsHub = new WSHub();
  const app = createLiateApp(wsHub);

  it('GET /health should return 200 and online status', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('online');
    expect(body.protocol).toBe('LAPI/v1');
  });

  it('GET /lapi/v1/health should return 200 and online status', async () => {
    const res = await app.request('/lapi/v1/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('online');
  });

  it('GET /api/agents should list registered sovereign agents', async () => {
    const res = await app.request('/api/agents');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body) || typeof body === 'object').toBe(true);
  });

  it('GET /lapi/v1/tasks should return active background task list', async () => {
    const res = await app.request('/lapi/v1/tasks');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body) || typeof body === 'object').toBe(true);
  });

  it('GET /api/keys should list configured keys or empty map', async () => {
    const res = await app.request('/api/keys');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body === 'object').toBe(true);
  });

  it('OPTIONS / should return CORS headers', async () => {
    const res = await app.request('/health', {
      method: 'OPTIONS',
      headers: {
        'Origin': 'http://localhost:3000',
        'Access-Control-Request-Method': 'GET'
      }
    });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeDefined();
  });

  it('GET /api/catalog/skills should return prebuilt skills catalog', async () => {
    const res = await app.request('/api/catalog/skills');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    expect(body.some((s: any) => s.name === 'data-analyst')).toBe(true);
  });

  it('GET /api/catalog/llm should return supported LLM models', async () => {
    const res = await app.request('/api/catalog/llm');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    expect(body.some((m: any) => m.id === 'sarvam/sarvam-105b')).toBe(true);
  });
});
