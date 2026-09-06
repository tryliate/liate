import { LiateToken } from '../src';

/**
 * Example 05: INR Token Cost Tracking & Hard Budget Guardrails
 * 
 * Demonstrates real-time paise-level tracking with official Sarvam AI 2026 rate cards.
 * 
 * Run with:
 *   bun run examples/05-budget-guardrails.ts
 */
async function main() {
  console.log('💰 Testing LiateToken Budget Guardrails...\n');

  // Hard limit of ₹0.50 (50 paise) for testing budget trigger
  const tokenTracker = new LiateToken({
    model: 'sarvam/sarvam-105b',
    budgetInr: 0.50,
    onCost: (cost) => {
      console.log(`[Cost Event] Current Total: ${cost.formattedINR} (${cost.formattedUSD})`);
    }
  });

  console.log('--- Step 1: Record 5,000 prompt tokens & 1,000 output tokens ---');
  tokenTracker.recordUsage(5000, 1000);
  const u1 = tokenTracker.getUsage();
  console.log(`Spent: ${u1.formattedINR} | Budget Remaining: ₹${(0.50 - u1.costINR).toFixed(4)}`);
  console.log(`Is Budget Exceeded? ${tokenTracker.isBudgetExceeded() ? '🚨 YES' : '✅ NO'}\n`);

  console.log('--- Step 2: Record large inference turn (15,000 output tokens) ---');
  tokenTracker.recordUsage(2000, 15000);
  const u2 = tokenTracker.getUsage();
  console.log(`Spent: ${u2.formattedINR}`);
  console.log(`Is Budget Exceeded? ${tokenTracker.isBudgetExceeded() ? '🚨 YES (Hard stop triggered!)' : '✅ NO'}`);

  console.log('\n📊 Rate Card Summary (Sarvam 105B):');
  const rate = LiateToken.calculateCost({
    model: 'sarvam/sarvam-105b',
    promptTokens: 1_000_000,
    completionTokens: 1_000_000
  });
  console.log(`  Input Rate (1M tokens): ₹${(rate.costINR * (29.28 / (29.28 + 73.20))).toFixed(2)}`);
  console.log(`  Output Rate (1M tokens): ₹${(rate.costINR * (73.20 / (29.28 + 73.20))).toFixed(2)}`);
}

main().catch(console.error);
