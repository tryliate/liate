import { LiatePlan, liate, LiateModel, LiateAgent, LiateEnv } from '../src';

/**
 * Example 09: Autonomous Goal Planning with Sarvam AI (Sarvam 105B)
 * 
 * Demonstrates:
 * 1. Attaching an India-first Sarvam 105B sovereign agent to LiatePlan
 * 2. Autonomous goal decomposition by Sarvam AI
 * 3. Step-by-step execution & real-time telemetry
 * 
 * Run with:
 *   bun run examples/09-plan-sarvam-agent.ts
 */
async function main() {
  console.log('🇮🇳 Initializing LiatePlan with Sarvam AI 105B Sovereign Agent...\n');

  // 1. Create Sarvam AI Agent
  const sarvamAgent = liate({
    L: new LiateModel('sarvam/sarvam-105b'),
    A: new LiateAgent(
      'sarvam-enterprise-planner',
      'You are a sovereign business intelligence planner for Indian enterprises. Provide clear, accurate and actionable responses.'
    ),
    E: new LiateEnv({
      MAX_TURNS: 2
    })
  });

  // 2. Attach Sarvam agent to LiatePlan
  const plan = new LiatePlan({
    goal: 'Formulate a 2-step export compliance checklist for shipping electronics from India to the UAE under the CEPA agreement',
    agent: sarvamAgent,
    maxSteps: 2,
    allowReplanning: true
  });

  // 3. Register real-time event listeners
  plan.on('plan:generating', (e) => console.log(`🔍 [Sarvam AI] Decomposing objective: "${e.goal}"...`));
  plan.on('plan:generated', (e) => {
    console.log(`\n📋 [Sarvam AI] Generated ${e.steps.length} Execution Steps:`);
    e.steps.forEach((s: any, idx: number) => {
      console.log(`   ${idx + 1}. [${s.title}] — ${s.description || 'No description'}`);
    });
    console.log('');
  });

  plan.on('step:start', (e) => console.log(`▶ [Executing Step ${e.index + 1}/${plan.getSteps().length}] "${e.step.title}"...`));
  plan.on('step:complete', (e) => console.log(`✅ [Completed Step] in ${e.durationMs}ms\n`));

  // 4. Autonomous Generation and Execution
  console.log('--- Step 1: Autonomous Plan Generation by Sarvam AI ---');
  await plan.generate();

  console.log('--- Step 2: Executing Plan with Sarvam AI Agent ---');
  const summary = await plan.execute();

  console.log('═════════════════════════════════════════════════════════════');
  console.log('  SARVAM AI LIATEPLAN FINAL SUMMARY');
  console.log('═════════════════════════════════════════════════════════════');
  console.log(`  Goal:             ${summary.goal}`);
  console.log(`  Completed Steps:  ${summary.completedSteps} / ${summary.totalSteps}`);
  console.log(`  Duration:         ${summary.durationMs} ms`);
  console.log(`  Success:          ${summary.success ? '✅ SUCCESS' : '❌ FAILED'}`);
  console.log('═════════════════════════════════════════════════════════════\n');

  // Print results from Sarvam for each step
  console.log('--- Step Outputs from Sarvam 105B ---');
  for (const step of plan.getSteps()) {
    console.log(`\n📌 [${step.title}] Result:`);
    const cleanOutput = typeof step.result === 'string' 
      ? step.result.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
      : JSON.stringify(step.result, null, 2);
    console.log(cleanOutput);
  }
}

main().catch(console.error);
