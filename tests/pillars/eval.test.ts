/**
 * Tests for pillars/eval.ts — LiateEval
 * Run with: bun test
 */

import { describe, it, expect } from 'bun:test';
import { LiateEval } from '../../src/oop/Liate_Core/LiateEval';

// ─── Mock agent ───────────────────────────────────────────────────────────────

function makeMockAgent(response: string) {
  return {
    run: async (_input: string) => response
  };
}

// ─── Basic test registration ─────────────────────────────────────────────────

describe('LiateEval — test registration', () => {
  it('registers test cases via .test()', () => {
    const ev = new LiateEval({ name: 'Suite', verbose: false });
    ev.test('case-1', { input: 'hello', contains: ['world'] });
    // @ts-ignore — accessing private for test
    expect(ev['testCases'].length).toBe(1);
    // @ts-ignore
    expect(ev['testCases'][0].name).toBe('case-1');
  });

  it('supports chaining .test() calls', () => {
    const ev = new LiateEval({ verbose: false });
    ev.test('a', { input: 'x' }).test('b', { input: 'y' });
    // @ts-ignore
    expect(ev['testCases'].length).toBe(2);
  });
});

// ─── Passing tests ────────────────────────────────────────────────────────────

describe('LiateEval — passing assertions', () => {
  it('passes when output contains expected substring', async () => {
    const agent = makeMockAgent('Hello, World!');
    const ev = new LiateEval({ agent, verbose: false });
    ev.test('substring', { input: 'greet', contains: ['Hello'] });
    const report = await ev.run();
    expect(report.passed).toBe(1);
    expect(report.failed).toBe(0);
    expect(report.passRate).toBe(100);
  });

  it('passes when output does NOT contain forbidden string', async () => {
    const agent = makeMockAgent('Safe response');
    const ev = new LiateEval({ agent, verbose: false });
    ev.test('no-pii', { input: 'query', notContains: ['password', 'secret'] });
    const report = await ev.run();
    expect(report.passed).toBe(1);
  });

  it('passes when custom validator returns true', async () => {
    const agent = makeMockAgent('42');
    const ev = new LiateEval({ agent, verbose: false });
    ev.test('custom', {
      input: 'what is the answer',
      customValidator: (result) => result.output.includes('42')
    });
    const report = await ev.run();
    expect(report.passed).toBe(1);
  });
});

// ─── Failing tests ────────────────────────────────────────────────────────────

describe('LiateEval — failing assertions', () => {
  it('fails when expected substring is missing', async () => {
    const agent = makeMockAgent('Goodbye');
    const ev = new LiateEval({ agent, verbose: false });
    ev.test('missing', { input: 'greet', contains: ['Hello'] });
    const report = await ev.run();
    expect(report.failed).toBe(1);
    expect(report.results[0].failures.length).toBeGreaterThan(0);
    expect(report.results[0].failures[0]).toContain('Hello');
  });

  it('fails when forbidden string is present', async () => {
    const agent = makeMockAgent('Your password is 12345');
    const ev = new LiateEval({ agent, verbose: false });
    ev.test('pii-leak', { input: 'tell me', notContains: ['password'] });
    const report = await ev.run();
    expect(report.failed).toBe(1);
  });

  it('fails when custom validator returns false', async () => {
    const agent = makeMockAgent('wrong answer');
    const ev = new LiateEval({ agent, verbose: false });
    ev.test('custom-fail', {
      input: 'question',
      customValidator: () => false
    });
    const report = await ev.run();
    expect(report.failed).toBe(1);
    expect(report.results[0].failures).toContain('Custom validator returned false');
  });

  it('fails when latency exceeds maxLatencyMs', async () => {
    const slowAgent = {
      run: async (_: string) => {
        await new Promise(r => setTimeout(r, 50));
        return 'done';
      }
    };
    const ev = new LiateEval({ agent: slowAgent, verbose: false });
    ev.test('latency', { input: 'go', maxLatencyMs: 10 });
    const report = await ev.run();
    expect(report.failed).toBe(1);
  });
});

// ─── Tool precision ───────────────────────────────────────────────────────────

describe('LiateEval — tool precision', () => {
  it('reports 100% tool precision when no expectedTools are defined', async () => {
    const agent = makeMockAgent('result');
    const ev = new LiateEval({ agent, verbose: false });
    ev.test('no-tools', { input: 'hello' });
    const report = await ev.run();
    expect(report.toolPrecision).toBe(100);
  });

  it('reports <100% precision when expected tool names are absent from output', async () => {
    const agent = makeMockAgent('I searched using brave_search');
    const ev = new LiateEval({ agent, verbose: false });
    ev.test('tool-check', {
      input: 'search something',
      expectedTools: ['brave_search', 'missing_tool']
    });
    const report = await ev.run();
    // brave_search is in output → 1/2 = 50% precision
    expect(report.toolPrecision).toBeLessThan(100);
  });
});

// ─── Report structure ────────────────────────────────────────────────────────

describe('LiateEval — report structure', () => {
  it('generates a report with correct metadata', async () => {
    const agent = makeMockAgent('ok');
    const ev = new LiateEval({ name: 'My Suite', agent, verbose: false });
    ev.test('t1', { input: 'x', contains: ['ok'] });
    const report = await ev.run();
    expect(report.suiteName).toBe('My Suite');
    expect(report.totalTests).toBe(1);
    expect(typeof report.avgLatencyMs).toBe('number');
    expect(typeof report.timestamp).toBe('string');
    expect(typeof report.summary).toBe('string');
  });

  it('throws when no agent is configured', async () => {
    const ev = new LiateEval({ verbose: false });
    ev.test('t', { input: 'x' });
    await expect(ev.run()).rejects.toThrow('No agent configured');
  });

  it('accepts agent override in run()', async () => {
    const ev = new LiateEval({ verbose: false });
    ev.test('override', { input: 'hi', contains: ['hello'] });
    const report = await ev.run(makeMockAgent('hello world'));
    expect(report.passed).toBe(1);
  });
});

// ─── Multiple test cases ──────────────────────────────────────────────────────

describe('LiateEval — multi-case suite', () => {
  it('runs all test cases and aggregates correctly', async () => {
    const agent = makeMockAgent('Sarvam is sovereign AI');
    const ev = new LiateEval({ agent, verbose: false });
    ev
      .test('c1', { input: 'q1', contains: ['Sarvam'] })
      .test('c2', { input: 'q2', contains: ['sovereign'] })
      .test('c3', { input: 'q3', contains: ['missing-keyword'] });

    const report = await ev.run();
    expect(report.totalTests).toBe(3);
    expect(report.passed).toBe(2);
    expect(report.failed).toBe(1);
    expect(report.passRate).toBeCloseTo(66.67, 1);
  });
});
