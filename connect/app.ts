import { LiateAgent, LiateLoop } from 'liate';

// Initialize Sovereign HelloAgent (L-I-A-T-E)
export class HelloAgent extends LiateAgent {
  constructor() {
    super({
      L: 'sarvam/sarvam-105b',
      I: { memory: 'connect-session' },
      A: { name: 'connect', intent: 'A sovereign AI agent that outputs the iconic greeting: Hello, AI Agent World!' },
      T: {},
      E: { MAX_TURNS: '6', TIMEOUT_MS: '30000' }
    });
  }
}

export const agent = new HelloAgent();

// Run directly if executed via CLI
if (import.meta.main || process.argv[1]?.endsWith('app.ts')) {
  const prompt = process.argv.slice(2).join(' ') || 'Hello, AI Agent World!';
  const loop = new LiateLoop(agent);
  const result = await loop.run(prompt);
  console.log('\n========================================================================');
  console.log('The 1972 Era of static \"Hello, World!\" has ended.');
  console.log('2026: ' + (result.replace(/<think>[\s\S]*?<\/think>/gi, '').trim() || 'Hello, AI Agent World!'));
  console.log('Mission: Agentantra (From 1947 Swatantra to 2026 Agentantra)');
  console.log('Welcome To Sovereign AI Agents — From Bharat To The World!');
  console.log('Platform: India\'s Sovereign AI Agents Platform — Agentantra Mission');
  console.log('Platform: Built on Liate Platform (https://tryliate.com)');
  console.log('Announcement: \"Liate has officially joined the Sarvam AI Startup Program!\"');
  console.log('========================================================================\n');
}
