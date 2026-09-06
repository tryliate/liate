import { LiatePlan } from '../src';

/**
 * Example 08: Autonomous Goal Planning & Dynamic Replanning (LiatePlan)
 * 
 * Demonstrates:
 * 1. Multi-step goal decomposition (Plan-and-Solve)
 * 2. Dependency tracking across steps (dependsOn)
 * 3. Real-time step progress event emission
 * 4. Aggregated state & execution summary
 * 
 * Run with:
 *   bun run examples/08-plan-autonomous-agent.ts
 */
async function main() {
  console.log('📋 Initializing Autonomous Planning Engine (LiatePlan)...\n');

  const plan = new LiatePlan({
    goal: 'Audit enterprise supplier KYC and calculate DPDP compliance risk',
    maxSteps: 5,
    allowReplanning: true
  });

  // 1. Define structured steps with handlers & state sharing
  plan.addStep({
    id: 'step_fetch_supplier',
    title: 'Fetch Supplier KYC Records',
    description: 'Retrieve encrypted records from the registry',
    handler: async (ctx) => {
      console.log('   [Handler] Fetching supplier KYC payload...');
      ctx.set('supplierName', 'Bharat Logistics Ltd');
      ctx.set('gstin', '29ABCDE1234F1Z5');
      ctx.set('documents', ['pan.pdf', 'aadhaar.pdf']);
      return { status: 'fetched', count: 2 };
    }
  });

  plan.addStep({
    id: 'step_compliance_audit',
    title: 'Run DPDP Privacy & PII Audit',
    description: 'Verify citizen personal data protection standards',
    dependsOn: ['step_fetch_supplier'],
    handler: async (ctx) => {
      console.log(`   [Handler] Auditing privacy compliance for ${ctx.state.supplierName}...`);
      const riskScore = 12; // Low risk
      ctx.set('dpdpScore', riskScore);
      ctx.set('compliant', true);
      return { compliant: true, riskScore };
    }
  });

  plan.addStep({
    id: 'step_generate_certificate',
    title: 'Generate Sovereign Compliance Certificate',
    description: 'Create cryptographically signed audit report',
    dependsOn: ['step_compliance_audit'],
    handler: async (ctx) => {
      console.log(`   [Handler] Finalizing compliance token for GSTIN: ${ctx.state.gstin}...`);
      return {
        certificateId: 'CERT-IN-2026-9921',
        issuedAt: new Date().toISOString(),
        status: 'VERIFIED_COMPLIANT'
      };
    }
  });

  // 2. Wire real-time event listeners
  plan.on('plan:start', (e) => console.log(`🚀 Plan Execution Started: "${e.goal}" (${e.totalSteps} steps)`));
  plan.on('step:start', (e) => console.log(`   ▶ [Step ${e.index + 1}] Starting: "${e.step.title}"`));
  plan.on('step:complete', (e) => console.log(`   ✅ [Step] Completed in ${e.durationMs}ms\n`));

  // 3. Execute the plan
  const summary = await plan.execute({ initiatedBy: 'Auditor-Console' });

  console.log('═════════════════════════════════════════════════════════════');
  console.log('  LIATEPLAN EXECUTION SUMMARY');
  console.log('═════════════════════════════════════════════════════════════');
  console.log(`  Goal:             ${summary.goal}`);
  console.log(`  Steps Completed:  ${summary.completedSteps} / ${summary.totalSteps}`);
  console.log(`  Total Duration:   ${summary.durationMs} ms`);
  console.log(`  Overall Success:  ${summary.success ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`  Final State:      ${JSON.stringify(summary.state, null, 2)}`);
  console.log('═════════════════════════════════════════════════════════════');
}

main().catch(console.error);
