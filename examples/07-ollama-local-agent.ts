import { liate, LiateModel, LiateAgent, LiateEnv } from '../src';

/**
 * Example 07: 100% Offline Sovereign Agent with Local Ollama
 * 
 * Model: gemma4:e2b
 * Runs completely locally with zero internet, zero cloud, zero API keys.
 * 
 * Run with:
 *   bun run examples/07-ollama-local-agent.ts
 */
async function main() {
  console.log('🤖 Initializing 100% Offline Local Sovereign Agent with Ollama...\n');

  const agent = liate({
    // [L] Local Ollama Provider (gemma4:e2b)
    L: new LiateModel('ollama/gemma4:e2b'),

    // [A] Sovereign Agent Persona & Intent
    A: new LiateAgent(
      'sovereign-local-analyst', 
      'You are a sovereign legal and policy AI assistant running 100% offline.'
    ),

    // [E] Environment
    E: new LiateEnv({
      MAX_TURNS: 1
    })
  });

  console.log(`Agent Name:     ${agent.name}`);
  console.log(`Model Provider: ${agent.L.model}`);
  console.log(`Endpoint:       http://localhost:11434/v1`);
  console.log('\n--- Sending Prompt to Local gemma4:e2b ---');

  const prompt = 'In exactly 2 short bullet points, explain what the DPDP Act 2023 of India is.';
  console.log(`Prompt: "${prompt}"\n`);

  const startTime = performance.now();
  const answer = await agent.run(prompt);
  const latency = ((performance.now() - startTime) / 1000).toFixed(2);

  console.log('--- Response from Local Gemma ---');
  console.log(answer.trim());
  console.log(`\n⚡ Total local generation time: ${latency}s`);
  console.log('✅ 100% Sovereign & Offline: Zero tokens sent to any external cloud.');
}

main().catch((err) => {
  console.error('❌ Error executing Ollama agent:', err);
});
