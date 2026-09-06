/**
 * Tests for LiateSandbox — Isolated JavaScript Execution & Safety Chamber
 * Run with: bun test tests/pillars/sandbox.test.ts
 */

import { describe, it, expect } from 'bun:test';
import { LiateSandbox } from '../../src/oop/Liate_Security/LiateSandbox';

describe('LiateSandbox — Isolated Code Execution', () => {
  const sandbox = new LiateSandbox({ timeoutMs: 1000 });

  it('evaluates basic math and expressions', async () => {
    const res = await sandbox.run('2 + 2 * 10');
    expect(res.success).toBe(true);
    expect(res.result).toBe(22);
    expect(res.executionTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('supports statements and return statements', async () => {
    const code = `
      let sum = 0;
      for (let i = 1; i <= 5; i++) {
        sum += i;
      }
      return sum;
    `;
    const res = await sandbox.run(code);
    expect(res.success).toBe(true);
    expect(res.result).toBe(15);
  });

  it('captures console logs accurately', async () => {
    const code = `
      console.log("Agent step 1");
      console.warn("Notice warning");
      return "done";
    `;
    const res = await sandbox.run(code);
    expect(res.success).toBe(true);
    expect(res.logs.length).toBeGreaterThanOrEqual(2);
    expect(res.logs[0]).toContain('Agent step 1');
  });

  it('strictly blocks dangerous Node.js globals', async () => {
    const checkProcess = await sandbox.run('typeof process');
    expect(checkProcess.result).toBe('undefined');

    const checkRequire = await sandbox.run('typeof require');
    expect(checkRequire.result).toBe('undefined');
  });

  it('enforces timeout on infinite loops', async () => {
    const infiniteCode = 'while(true) {}';
    const res = await sandbox.run(infiniteCode, { timeoutMs: 200 });
    expect(res.success).toBe(false);
    expect(res.error).toBeDefined();
    expect(res.error?.toLowerCase()).toContain('timed out');
  });

  it('exposes a valid tool definition via toTool()', async () => {
    const tool = sandbox.toTool();
    expect(tool.name).toBe('execute_javascript_code');
    expect(tool.parameters).toBeDefined();
    
    const output = await tool.execute({ code: 'Math.max(10, 25, 5)' });
    expect(output.result).toBe(25);
  });
});
