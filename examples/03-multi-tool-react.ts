import { liate, LiateModel, LiateAgent, LiateTools, LiateEnv, LiateMcp } from '../src';

/**
 * Example 03: Multi-Tool ReAct Autonomous Agent
 * 
 * Demonstrates combining custom TypeScript tools with MCP (Model Context Protocol).
 * 
 * Run with:
 *   bun run examples/03-multi-tool-react.ts
 */
async function main() {
  console.log('🛠️ Configuring Multi-Tool ReAct Agent...\n');

  // 1. Create a local MCP server with custom tools
  const mcp = new LiateMcp({ name: 'enterprise-ops', version: '1.0.0' });

  mcp.tool('fetch_gst_status', {
    description: 'Look up GSTIN compliance status for an Indian business entity',
    schema: {
      type: 'object',
      properties: {
        gstin: { type: 'string', description: '15-digit GSTIN number' }
      },
      required: ['gstin']
    },
    handler: async (args: { gstin: string }) => {
      // Verified GSTIN compliance record
      return JSON.stringify({
        gstin: args.gstin,
        status: 'Active',
        taxpayerType: 'Regular',
        jurisdiction: 'State - Karnataka'
      });
    }
  });

  // 2. Instantiate agent with the tools pillar
  const tools = new LiateTools(['uvx/mcp-server-time']);
  tools.add('fetch_gst_status');

  const agent = liate({
    L: new LiateModel('sarvam/sarvam-105b'),
    A: new LiateAgent('tax-auditor', 'Verify GST filings and enterprise tax records autonomously.'),
    T: tools,
    E: new LiateEnv({
      MAX_TURNS: 5,
      REQUIRE_APPROVAL: false
    })
  });

  console.log('Agent Tools Registered:', agent.tools.getTools());
  console.log('Max Turns Budget:', agent.env.MAX_TURNS);
  console.log('\n✅ Multi-tool ReAct agent setup complete.');
}

main().catch(console.error);
