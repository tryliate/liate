import { LiateWorkflow, LiateDB } from '../src';

/**
 * Example 04: Sequential Multi-Agent Workflow Pipeline
 * 
 * Demonstrates deterministic pipeline chaining with shared context and memory.
 * 
 * Run with:
 *   bun run examples/04-workflow-pipeline.ts
 */
async function main() {
  console.log('⚡ Initializing Sequential Workflow Pipeline...\n');

  // In-memory document storage for pipeline state
  const db = new LiateDB();
  const leads = db.collection('leads');

  leads.insert({ name: 'TechCorp India', domain: 'fintech', score: 0 });

  const workflow = new LiateWorkflow('lead-enrichment-pipeline');

  // Step 1: Fetch lead record
  workflow.step('fetch-record', async (ctx: any) => {
    console.log('[Step 1] Fetching lead record...');
    const records = await leads.find({ domain: 'fintech' });
    return { lead: records[0] };
  });

  // Step 2: Enrich with domain intelligence
  workflow.step('enrich-intelligence', async (ctx: any) => {
    console.log(`[Step 2] Enriching lead: ${ctx.state.lead.name}...`);
    const enriched = {
      ...ctx.state.lead,
      marketSegment: 'Tier-1 Enterprise',
      score: 88
    };
    await leads.update(ctx.state.lead.id, enriched);
    return { lead: enriched, enrichedAt: new Date().toISOString() };
  });

  // Step 3: Summarize pipeline result
  workflow.step('summarize', async (ctx: any) => {
    console.log('[Step 3] Finalizing lead score summary...');
    return {
      status: 'QUALIFIED',
      finalScore: ctx.state.lead.score,
      leadId: ctx.state.lead.id
    };
  });

  const result = await workflow.run({});
  console.log('\n📊 Pipeline Execution Result:');
  console.log(JSON.stringify(result, null, 2));
}

main().catch(console.error);
