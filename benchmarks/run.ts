/**
 * Liate Comprehensive Performance Benchmark Suite
 * Measures: startup, HTTP, ReAct overhead, token optimizer, memory, tool dispatch
 */

import { liate, LiateModel, LiateAgent, LiateEnv, LiateToken, LiateWorkflow, LiateDB, LiateQueue, LiateGuard } from '../src/index';
import { minifyToolSchemas, sanitizeToolOutput, pruneTrajectoryMessages } from '../src/om';
import { createLiateApp, WSHub } from '../src/lapi';

const COL = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[90m${s}\x1b[0m`,
};

function bench(label: string, value: string, unit = '') {
  const padded = label.padEnd(42, '.');
  console.log(`  ${COL.dim(padded)} ${COL.green(value)}${unit}`);
}

function divider(title: string) {
  console.log(`\n${COL.bold(COL.cyan(`── ${title} ${'─'.repeat(50 - title.length)}`))}`);
}

function measure(fn: () => void, iterations = 10000): number {
  const start = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  return (performance.now() - start) / iterations;
}

async function measureAsync(fn: () => Promise<void>, iterations = 1000): Promise<number> {
  const start = performance.now();
  for (let i = 0; i < iterations; i++) await fn();
  return (performance.now() - start) / iterations;
}

// ─────────────────────────────────────────────────────────────────────────────
console.log(COL.bold('\n🇮🇳  Liate Sovereign AI Runtime — Performance Benchmark\n'));

// 1. COLD IMPORT (already measured externally, measure internal module boots)
divider('1. Module Boot & Instantiation');

const t0 = performance.now();
const agent = liate({
  L: new LiateModel('sarvam/sarvam-105b'),
  A: new LiateAgent('bench-agent', 'Benchmarking sovereign agent runtime'),
  E: new LiateEnv({ MAX_TURNS: 5 })
});
bench('liate() agent instantiation', (performance.now() - t0).toFixed(3), 'ms');

const t1 = performance.now();
const db = new LiateDB();
bench('LiateDB init (in-memory store)', (performance.now() - t1).toFixed(3), 'ms');

const t2 = performance.now();
const guard = new LiateGuard();
bench('LiateGuard init (DPDP engine)', (performance.now() - t2).toFixed(3), 'ms');

const t3 = performance.now();
const token = new LiateToken({ model: 'sarvam/sarvam-105b', budgetInr: 50 });
bench('LiateToken init (rate card load)', (performance.now() - t3).toFixed(3), 'ms');

const t4 = performance.now();
const workflow = new LiateWorkflow('bench-flow');
bench('LiateWorkflow init', (performance.now() - t4).toFixed(3), 'ms');

const t5 = performance.now();
const wsHub = new WSHub();
const app = createLiateApp(wsHub);
bench('LAPI/v1 Hono app creation (35+ routes)', (performance.now() - t5).toFixed(3), 'ms');

// 2. TOKEN OPTIMIZER THROUGHPUT
divider('2. OM Token Optimizer Throughput');

const largeToolSchema = Array.from({ length: 20 }, (_, i) => ({
  name: `tool_${i}`,
  description: 'A '.repeat(200) + `long tool description for tool ${i}`,
  parameters: {
    type: 'object',
    properties: {
      input: { type: 'string', description: 'Input parameter with verbose docs ' .repeat(10) },
      mode: { type: 'string', enum: ['fast', 'slow', 'balanced'], description: 'Mode selection' }
    },
    required: ['input']
  }
}));

const originalSchemaSize = JSON.stringify(largeToolSchema).length;
const minified = minifyToolSchemas(largeToolSchema);
const minifiedSize = JSON.stringify(minified).length;
const reduction = ((1 - minifiedSize / originalSchemaSize) * 100).toFixed(1);

bench('Tool schema size (20 tools, verbose)', `${originalSchemaSize.toLocaleString()}`, ' chars');
bench('Tool schema after minifyToolSchemas()', `${minifiedSize.toLocaleString()}`, ' chars');
bench('Token reduction', reduction, '%');

const minifyMs = measure(() => minifyToolSchemas(largeToolSchema));
bench('minifyToolSchemas() throughput', (1000 / minifyMs).toFixed(0), ' ops/sec');

const largeOutput = JSON.stringify({ data: Array.from({ length: 100 }, (_, i) => ({ id: i, content: 'x'.repeat(500) })) });
const sanitizeMs = measure(() => sanitizeToolOutput(largeOutput, 3000));
bench('sanitizeToolOutput() throughput', (1000 / sanitizeMs).toFixed(0), ' ops/sec');

const messages: Array<{ role: 'user' | 'assistant'; content: string }> = Array.from({ length: 40 }, (_, i) => ({
  role: i % 2 === 0 ? 'user' : 'assistant',
  content: 'message '.repeat(100) + i
}));
const pruneMs = measure(() => pruneTrajectoryMessages(messages));
bench('pruneTrajectoryMessages() throughput', (1000 / pruneMs).toFixed(0), ' ops/sec');

// 3. LiateToken Cost Calculation
divider('3. LiateToken INR Cost Calculation');

const tokenCalcMs = measure(() => LiateToken.calculateCost({ model: 'sarvam/sarvam-105b', promptTokens: 5000, completionTokens: 1000 }));
bench('calculateCost() throughput', (1000 / tokenCalcMs).toFixed(0), ' ops/sec');

const tokenCountMs = measure(() => LiateToken.count('नमस्ते भारत '.repeat(100)));
bench('count() Indic token estimation', (1000 / tokenCountMs).toFixed(0), ' ops/sec');

const recordMs = measure(() => { token.recordUsage(1000, 200); token.reset(); });
bench('recordUsage() + reset() throughput', (1000 / recordMs).toFixed(0), ' ops/sec');

// 4. LiateGuard PII Redaction
divider('4. LiateGuard DPDP PII Redaction');

const piiText = `
  Ramesh Kumar, Aadhaar: 3456 7890 1234, PAN: ABCDE1234F
  Phone: +91 9876543210, UPI: ramesh@oksbi
  Card: 4111-1111-1111-1111, Account: 1234567890
`.repeat(5);

const guardMs = measure(() => guard.sanitize(piiText), 5000);
bench('sanitize() 5-field PII document', (1000 / guardMs).toFixed(0), ' ops/sec');
bench('sanitize() latency per call', guardMs.toFixed(4), 'ms');

const complianceMs = measure(() => guard.checkCompliance(piiText), 5000);
bench('checkCompliance() throughput', (1000 / complianceMs).toFixed(0), ' ops/sec');

// 5. LiateDB Document Store
divider('5. LiateDB In-Memory Document Store');

const col = db.collection('bench');
const insertMs = measure(() => col.insert({ name: 'test', value: Math.random() }), 5000);
bench('insert() throughput', (1000 / insertMs).toFixed(0), ' ops/sec');

const findMs = measure(() => col.find({ name: 'test' }), 5000);
bench('find() with filter throughput', (1000 / findMs).toFixed(0), ' ops/sec');

// 6. HONO HTTP Handler
divider('6. LAPI/v1 HTTP Handler (Hono on Bun)');

const mockReq = new Request('http://localhost:7071/health');
const httpMs = await measureAsync(async () => { await app.fetch(mockReq); }, 500);
bench('/health handler latency', httpMs.toFixed(3), 'ms');
bench('/health requests per second', (1000 / httpMs).toFixed(0), ' req/s');

// 7. LiateWorkflow Pipeline
divider('7. LiateWorkflow Pipeline Engine');

workflow
  .step('step-1', async (ctx: any) => ({ a: 1 }))
  .step('step-2', async (ctx: any) => ({ b: ctx.state.a + 1 }))
  .step('step-3', async (ctx: any) => ({ result: ctx.state.b * 2 }));

const wfMs = await measureAsync(async () => { await workflow.run({}); }, 500);
bench('3-step workflow execution', wfMs.toFixed(3), 'ms');
bench('Workflow pipelines per second', (1000 / wfMs).toFixed(0), ' pipelines/sec');

// 8. LiateQueue
divider('8. LiateQueue Background Task Dispatch');

const queue = new LiateQueue('bench-queue');
const enqueueMs = measure(() => queue.enqueue('test-agent', { task: 'compute' }, { priority: 1 }), 5000);
bench('enqueue() throughput', (1000 / enqueueMs).toFixed(0), ' ops/sec');

// 9. MEMORY FOOTPRINT
divider('9. Process Memory Footprint');

const mem = process.memoryUsage();
bench('RSS (total process memory)', (mem.rss / 1024 / 1024).toFixed(1), ' MB');
bench('Heap Used', (mem.heapUsed / 1024 / 1024).toFixed(1), ' MB');
bench('Heap Total', (mem.heapTotal / 1024 / 1024).toFixed(1), ' MB');
bench('External (Bun native)', (mem.external / 1024 / 1024).toFixed(1), ' MB');

// Summary
divider('Summary');
console.log(COL.green('\n  ✅ Liate Sovereign AI Runtime Benchmark Complete\n'));
