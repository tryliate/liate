/**
 * Tests for LiatePlan — Autonomous Goal Decomposition, Replanning & Execution Engine
 * Run with: bun test tests/pillars/plan.test.ts
 */

import { describe, it, expect } from 'bun:test';
import { LiatePlan } from '../../src/oop/Liate_Orchestration/LiatePlan';

describe('LiatePlan — Instantiation and Step Management', () => {
  it('instantiates with options and configures goal', () => {
    const plan = new LiatePlan({ goal: 'Analyze India EV Market 2026', maxSteps: 5 });
    expect(plan.goal).toBe('Analyze India EV Market 2026');
    expect(plan.maxSteps).toBe(5);
    expect(plan.allowReplanning).toBe(true);
    expect(plan.requireApproval).toBe(false);
  });

  it('adds steps and assigns deterministic ids and status', () => {
    const plan = new LiatePlan({ goal: 'Test' });
    plan.addStep({
      title: 'Fetch Data',
      description: 'Fetch market data from database'
    });
    plan.addStep({
      title: 'Analyze',
      description: 'Run numerical analysis'
    });

    const steps = plan.getSteps();
    expect(steps.length).toBe(2);
    expect(steps[0].title).toBe('Fetch Data');
    expect(steps[0].status).toBe('pending');
    expect(steps[1].title).toBe('Analyze');
  });

  it('retrieves specific step by id', () => {
    const plan = new LiatePlan();
    plan.addStep({ id: 'custom_step_1', title: 'Custom Step' });
    const step = plan.getStep('custom_step_1');
    expect(step).toBeDefined();
    expect(step?.title).toBe('Custom Step');
  });
});

describe('LiatePlan — Execution & State Aggregation', () => {
  it('executes steps sequentially and aggregates state and results', async () => {
    const plan = new LiatePlan({ goal: 'Calculate tax liability' });

    plan.addStep({
      id: 'step_fetch',
      title: 'Fetch revenue',
      handler: (ctx) => {
        ctx.set('revenue', 1000000);
        return { revenue: 1000000 };
      }
    });

    plan.addStep({
      id: 'step_tax',
      title: 'Calculate 18% GST',
      handler: (ctx) => {
        const gst = ctx.state.revenue * 0.18;
        ctx.set('gst', gst);
        return { gst };
      }
    });

    const summary = await plan.execute({ initiatedBy: 'Auditor' });
    expect(summary.success).toBe(true);
    expect(summary.completedSteps).toBe(2);
    expect(summary.failedSteps).toBe(0);
    expect(summary.state.revenue).toBe(1000000);
    expect(summary.state.gst).toBe(180000);
    expect(summary.state.initiatedBy).toBe('Auditor');
    expect(summary.results['step_tax'].gst).toBe(180000);
  });

  it('skips steps when dependencies are unmet', async () => {
    const plan = new LiatePlan({ goal: 'Dependency checking' });

    plan.addStep({
      id: 'step_a',
      title: 'Step A',
      handler: () => {
        throw new Error('Step A failed');
      }
    });

    plan.addStep({
      id: 'step_b',
      title: 'Step B',
      dependsOn: ['step_a'],
      handler: () => 'Should not run'
    });

    // Disable replanning to test pure dependency failure
    plan.allowReplanning = false;
    const summary = await plan.execute();

    expect(summary.success).toBe(false);
    expect(summary.failedSteps).toBe(1);
    expect(plan.getStep('step_a')?.status).toBe('failed');
  });
});

describe('LiatePlan — Dynamic Replanning & Self-Correction', () => {
  it('automatically inserts recovery steps when a step fails', async () => {
    const plan = new LiatePlan({ 
      goal: 'Resilient web fetch',
      allowReplanning: true 
    });

    let failedOnce = false;

    plan.addStep({
      id: 'fetch_primary',
      title: 'Primary API Fetch',
      handler: () => {
        failedOnce = true;
        throw new Error('503 Service Unavailable');
      }
    });

    const summary = await plan.execute();
    expect(failedOnce).toBe(true);
    expect(summary.replanCount).toBe(1);
    expect(summary.totalSteps).toBe(2); // Original failed step + inserted recovery step

    const recoveryStep = plan.getSteps()[1];
    expect(recoveryStep.id).toContain('recovery_fetch_primary');
    expect(recoveryStep.status).toBe('completed');
  });
});

describe('LiatePlan — Lifecycle Event Emission', () => {
  it('emits lifecycle events during plan execution', async () => {
    const plan = new LiatePlan({ goal: 'Event test' });
    const events: string[] = [];

    plan.on('plan:start', () => events.push('plan:start'));
    plan.on('step:start', (e) => events.push(`step:start:${e.step.title}`));
    plan.on('step:complete', (e) => events.push(`step:complete:${e.step.title}`));
    plan.on('plan:completed', () => events.push('plan:completed'));

    plan.addStep({ title: 'Task 1', handler: () => 'done 1' });
    plan.addStep({ title: 'Task 2', handler: () => 'done 2' });

    await plan.execute();

    expect(events).toContain('plan:start');
    expect(events).toContain('step:start:Task 1');
    expect(events).toContain('step:complete:Task 1');
    expect(events).toContain('step:start:Task 2');
    expect(events).toContain('step:complete:Task 2');
    expect(events).toContain('plan:completed');
  });
});

describe('LiatePlan — Human In The Loop (HITL) Approval Gate', () => {
  it('pauses execution when requireApproval is true until approved', async () => {
    const plan = new LiatePlan({ 
      goal: 'Transfer funds',
      requireApproval: true 
    });

    plan.addStep({ title: 'Disburse Funds', handler: () => 'Transferred' });

    let paused = true;
    plan.on('plan:require_approval', () => {
      // Simulate human approval after short delay
      setTimeout(() => {
        paused = false;
        plan.approve();
      }, 50);
    });

    const summary = await plan.execute();
    expect(paused).toBe(false);
    expect(plan.isApproved).toBe(true);
    expect(summary.success).toBe(true);
  });
});

describe('LiatePlan — Autonomous LLM Decomposition', () => {
  it('parses JSON decomposition from attached agent', async () => {
    const mockAgent = {
      run: async (_prompt: string) => {
        return JSON.stringify([
          { title: 'Scrape policy', description: 'Scrape state government PDF' },
          { title: 'Extract subsidies', description: 'Extract subsidy percentages' }
        ]);
      }
    };

    const plan = new LiatePlan({
      goal: 'Analyze state EV policy',
      agent: mockAgent
    });

    const steps = await plan.generate();
    expect(steps.length).toBe(2);
    expect(steps[0].title).toBe('Scrape policy');
    expect(steps[1].title).toBe('Extract subsidies');
  });

  it('exports plan state to JSON serialization', () => {
    const plan = new LiatePlan({ goal: 'Serialize test' });
    plan.addStep({ title: 'Step 1' });
    const json = plan.toJSON();
    expect(json.goal).toBe('Serialize test');
    expect(json.totalSteps).toBe(1);
    expect(json.steps[0].title).toBe('Step 1');
  });
});
