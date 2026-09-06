import { liate, LiateModel, LiateAgent, LiateToken } from '../src';

/**
 * Example 01: 6-Line Sovereign Agent Quickstart
 * 
 * Run with:
 *   bun run examples/01-hello-agent.ts
 */
async function main() {
  console.log('🚀 Running 01-hello-agent example...\n');

  const agent = liate({
    // [L] Sovereign Language Model (India-first Sarvam AI)
    L: new LiateModel('sarvam/sarvam-105b'),

    // [A] Sovereign Agent Persona & Intent
    A: new LiateAgent('bharat-copilot', 'You are a sovereign business intelligence analyst for Indian enterprises.'),

    // [Token] Real INR Cost Tracking & Budget Guardrails
    Token: new LiateToken({
      budgetInr: 50.00, // ₹50 hard limit
      onCost: (cost) => console.log(`[Token Guard] Burned: ₹${cost.totalInr.toFixed(4)}`)
    })
  });

  console.log('Agent Name:', agent.name);
  console.log('Agent Model:', agent.L.model);
  console.log('Agent Intent:', agent.intent);
  console.log('\n✅ Agent initialized and ready to run with:');
  console.log('  await agent.run("Summarize key export opportunities for Indian electronics in 2026")');
}

main().catch(console.error);
