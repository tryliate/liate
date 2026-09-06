/**
 * Tests for LiateAuth — Sovereign Agent Authentication, API Key Manager, RBAC & Rate Limiter
 * Run with: bun test tests/pillars/auth.test.ts
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { LiateAuth } from '../../src/oop/Liate_Security/LiateAuth';

describe('LiateAuth — Constructor & Secret Management', () => {
  it('generates secure secret if none is configured', () => {
    const auth = new LiateAuth();
    expect(auth).toBeDefined();
  });

  it('uses configured custom secret', async () => {
    const auth = new LiateAuth({ secret: 'custom-secret-123' });
    const { token } = await auth.createApiKey({ name: 'test-key' });
    const session = await auth.verify(token);
    expect(session.authenticated).toBe(true);
    expect(session.name).toBe('test-key');
  });
});

describe('LiateAuth — API Key Lifecycle', () => {
  let auth: LiateAuth;

  beforeEach(() => {
    auth = new LiateAuth({ secret: 'test-secret' });
  });

  it('creates an API key with correct format and default roles', async () => {
    const { token, record } = await auth.createApiKey({ name: 'agent-service', budgetINR: 50 });
    expect(token.startsWith('sk_live_liate_')).toBe(true);
    expect(record.name).toBe('agent-service');
    expect(record.budgetINR).toBe(50);
    expect(record.spentINR).toBe(0);
    expect(record.roles).toContain('agent');
  });

  it('verifies valid Bearer token string', async () => {
    const { token } = await auth.createApiKey({ name: 'bearer-test', roles: ['admin', 'analyst'] });
    const session = await auth.verify(`Bearer ${token}`);
    expect(session.authenticated).toBe(true);
    expect(session.hasRole('admin')).toBe(true);
    expect(session.hasRole('analyst')).toBe(true);
    expect(session.hasRole('non-existent')).toBe(true); // admin role has all permissions
  });

  it('rejects invalid or missing tokens gracefully', async () => {
    const emptySession = await auth.verify('');
    expect(emptySession.authenticated).toBe(false);

    const invalidSession = await auth.verify('sk_live_liate_invalidkey123456');
    expect(invalidSession.authenticated).toBe(false);
  });

  it('revokes an API key properly', async () => {
    const { token, record } = await auth.createApiKey({ name: 'revokable-key' });
    const beforeSession = await auth.verify(token);
    expect(beforeSession.authenticated).toBe(true);

    const revoked = auth.revokeApiKey(record.id);
    expect(revoked).toBe(true);

    const afterSession = await auth.verify(token);
    expect(afterSession.authenticated).toBe(false);
  });
});

describe('LiateAuth — Budget Enforcement & Rate Limiting', () => {
  let auth: LiateAuth;

  beforeEach(() => {
    auth = new LiateAuth({ secret: 'test-secret' });
  });

  it('tracks cost against API key budget and blocks when exhausted', async () => {
    const { token, record } = await auth.createApiKey({ name: 'budget-agent', budgetINR: 10.0 });
    await auth.trackCost(record.id, 5.0);

    const session = await auth.verify(token);
    expect(session.budgetRemainingINR).toBe(5.0);

    await auth.trackCost(record.id, 5.0);
    expect(async () => {
      await auth.verify(token);
    }).toThrow('402 Payment Required');
  });

  it('enforces request rate limits', async () => {
    const { token } = await auth.createApiKey({
      name: 'rate-limited-key',
      rateLimit: { max: 2, windowMs: 1000 }
    });

    const s1 = await auth.verify(token);
    expect(s1.authenticated).toBe(true);
    const s2 = await auth.verify(token);
    expect(s2.authenticated).toBe(true);

    expect(async () => {
      await auth.verify(token);
    }).toThrow('429 Too Many Requests');
  });
});
