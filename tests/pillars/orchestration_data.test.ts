/**
 * Tests for Orchestration & Data Pillars: LiateWorkflow, LiateDB, LiateQueue, LiateEvent
 * Run with: bun test tests/pillars/orchestration_data.test.ts
 */

import { describe, it, expect } from 'bun:test';
import { LiateWorkflow, LiateQueue, LiateEvent } from '../../src/oop/Liate_Orchestration';
import { LiateDB } from '../../src/oop/Liate_Data';

describe('LiateWorkflow Pipeline Engine', () => {
  it('executes sequential pipeline steps and aggregates state', async () => {
    const wf = new LiateWorkflow<{ count: number; name?: string }>('test-pipeline');

    wf.step('initialize', (ctx) => {
      ctx.set('count', 10);
      ctx.set('name', 'Liate');
    });

    wf.step('multiply', (ctx) => {
      ctx.set('count', ctx.state.count * 2);
    });

    const state = await wf.run({ count: 0 });
    expect(state.count).toBe(20);
    expect(state.name).toBe('Liate');
  });

  it('supports sleep step in pipeline', async () => {
    const wf = new LiateWorkflow('sleep-wf');
    wf.sleep('pause', 10);
    const res = await wf.run();
    expect(res).toBeDefined();
  });
});

describe('LiateDB In-Memory / Document Store', () => {
  const db = new LiateDB();

  it('inserts, queries, and filters documents', async () => {
    const col = db.collection('agents');
    await col.insert({ id: 'a1', name: 'Sarvam Copilot', tier: 'enterprise' });
    await col.insert({ id: 'a2', name: 'Time Agent', tier: 'community' });

    const found = await col.findById('a1');
    expect(found?.name).toBe('Sarvam Copilot');

    const filtered = await col.find({ tier: 'enterprise' });
    expect(filtered.length).toBe(1);
    expect(filtered[0].id).toBe('a1');
  });

  it('updates and deletes records', async () => {
    const col = db.collection('settings');
    await col.insert({ id: 's1', maxBudget: 50 });
    
    await col.update('s1', { maxBudget: 100 });
    const updated = await col.findById('s1');
    expect(updated?.maxBudget).toBe(100);

    const deletedCount = await col.delete('s1');
    expect(deletedCount).toBe(1);
    expect(await col.findById('s1')).toBeNull();
  });
});

describe('LiateQueue Background Tasks', () => {
  it('enqueues and processes asynchronous tasks', async () => {
    const queue = new LiateQueue<{ message: string }>('invoice-queue', { concurrency: 2 });
    let processedMessage = '';

    queue.process(async (job) => {
      processedMessage = job.payload.message;
    });

    const job = await queue.enqueue('billing-agent', { message: 'Process Invoice' });
    expect(job.id).toBeDefined();
    expect(['queued', 'processing', 'completed']).toContain(job.status);

    // Wait a brief tick for queue worker
    await new Promise((r) => setTimeout(r, 50));
    expect(processedMessage).toBe('Process Invoice');
  });
});

describe('LiateEvent Bus & Pub/Sub', () => {
  it('publishes and subscribes to events across agents', async () => {
    const bus = new LiateEvent();
    let receivedPayload: any = null;

    bus.on('agent:done', (event) => {
      receivedPayload = event.payload;
    });

    bus.emit('agent:done', { agentId: 'bharat-1', status: 'success' });
    expect(receivedPayload).toBeDefined();
    expect(receivedPayload.agentId).toBe('bharat-1');
  });
});
