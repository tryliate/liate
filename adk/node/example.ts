import { liate } from './client';

declare const process: any;

// ⚡ 5-Line Sovereign Agent in TypeScript
const agent = liate({
  L: 'sarvam/sarvam-105b',
  I: { memory: 'session_node_live' },
  A: { name: 'Time Agent', intent: 'Fetch live real-time clock for any timezone' },
  T: { time: { command: 'uvx', args: ['mcp-server-time'] } },
  E: { SARVAM_API_KEY: typeof process !== 'undefined' && process.env ? process.env.SARVAM_API_KEY || '' : '' },
});

async function main() {
  console.log('🚀 Running 5-line TypeScript Agent...');
  const result = await agent.run('What is the current time in Mumbai?');
  console.log('Output:', result);
}

main().catch(console.error);
