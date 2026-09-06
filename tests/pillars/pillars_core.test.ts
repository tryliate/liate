/**
 * Tests for Core Pillars: LiateModel, LiateIntegration, LiateAgent, LiateTools, LiateEnv, LiateLoop, LiateApp
 * Run with: bun test tests/pillars/pillars_core.test.ts
 */

import { describe, it, expect } from 'bun:test';
import {
  LiateModel,
  LiateIntegration,
  LiateAgent,
  LiateTools,
  LiateEnv,
  LiateLoop,
  LiateApp
} from '../../src/oop/Liate_Pillars';
import { liate } from '../../src/index';

describe('LiateModel [L] Pillar', () => {
  it('instantiates from string model identifier', () => {
    const model = new LiateModel('anthropic/claude-3-7-sonnet');
    expect(model.model).toBe('anthropic/claude-3-7-sonnet');
    expect(model.toJSON()).toBe('anthropic/claude-3-7-sonnet');
  });

  it('instantiates from configuration object with fallbacks', () => {
    const model = new LiateModel({
      model: 'sarvam/sarvam-105b',
      fallback: 'groq/llama-3.3-70b-versatile',
      temperature: 0.2
    });
    expect(model.model).toBe('sarvam/sarvam-105b');
    expect(model.fallback).toBe('groq/llama-3.3-70b-versatile');
    expect(model.temperature).toBe(0.2);
  });
});

describe('LiateIntegration [I] Pillar', () => {
  it('initializes with memory and database scopes', () => {
    const integration = new LiateIntegration({
      memory: 'sessions/user-123',
      database: 'postgres://localhost:5432/agents'
    });
    expect(integration.memory).toBe('sessions/user-123');
    expect(integration.database).toBe('postgres://localhost:5432/agents');
  });
});

describe('LiateTools [T] Pillar', () => {
  it('registers tools array and supports custom additions', () => {
    const tools = new LiateTools(['uvx/mcp-server-time']);
    expect(tools.getTools()).toContain('uvx/mcp-server-time');
    
    tools.add('custom-tool');
    expect(tools.getTools()).toContain('custom-tool');
  });
});

describe('LiateEnv [E] Pillar', () => {
  it('stores environment variables and guardrail settings', () => {
    const env = new LiateEnv({
      SARVAM_API_KEY: 'test-key',
      MAX_TURNS: 5,
      REQUIRE_APPROVAL: false
    });
    expect(env.vars['SARVAM_API_KEY']).toBe('test-key');
    expect(env.MAX_TURNS).toBe(5);
    expect(env.REQUIRE_APPROVAL).toBe(false);
  });
});

describe('LiateAgent & liate() Factory [A] Pillar', () => {
  it('creates an agent using the liate ergonomic function', () => {
    const agent = liate({
      L: new LiateModel('sarvam/sarvam-105b'),
      A: { name: 'bharat-assistant', intent: 'Help Indian MSMEs' },
      T: new LiateTools(['time']),
      E: new LiateEnv({ MAX_TURNS: 3 })
    });

    expect(agent.name).toBe('bharat-assistant');
    expect(agent.L.model).toBe('sarvam/sarvam-105b');
    expect(agent.A.intent).toBe('Help Indian MSMEs');
  });

  it('converts agent to manifest JSON configuration', () => {
    const agent = new LiateAgent('analyst', 'Analyze balance sheets');
    const json = agent.toJSON();
    expect(json.A.name).toBe('analyst');
    expect(json.A.intent).toBe('Analyze balance sheets');
  });
});

describe('LiateApp Container', () => {
  it('registers and resolves multi-agent collections', () => {
    const app = new LiateApp({ name: 'enterprise-suite' });
    const a1 = new LiateAgent('copilot', 'Assistant');
    const a2 = new LiateAgent('auditor', 'Audit logs');

    app.addAgent(a1);
    app.addAgent(a2);

    expect(app.getAgent('copilot')).toBeDefined();
    expect(app.getAgent('auditor')).toBeDefined();
    expect(app.listAgents().length).toBe(2);
  });
});
