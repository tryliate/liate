const { liate } = require('./index');

// ⚡ 5-Line Sovereign Agent with REAL-TIME MCP Tool Execution
const agent = liate({
  L: 'sarvam/sarvam-105b',
  I: { memory: 'session_live' },
  A: { name: 'Time Agent', intent: 'Fetch live real-time clock for any timezone' },
  T: {
    time: {
      command: 'uvx',
      args: ['mcp-server-time'],
    },
  },
  E: { SARVAM_API_KEY: process.env.SARVAM_API_KEY || '' },
});

async function main() {
  console.log('🚀 Running REAL LIVE MCP Agent in Node.js...');
  const result = await agent.run('What is the exact live current time in Mumbai right now? Use your real-time tool.');
  console.log('\n--- LIVE REAL AGENT OUTPUT ---');
  console.log(result);
}

main().catch(console.error);
