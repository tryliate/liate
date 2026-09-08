import { VERSION } from '../utils';

/**
 * Displays CLI version
 */
export function versionCommand(): void {
  console.log(`Liate CLI v${VERSION}`);
}

/**
 * Displays CLI usage and command documentation
 */
export function helpCommand(): void {
  console.log(`
Liate — Sovereign AI Agent Framework & Pure Cloud Runtime Engine (v${VERSION})

USAGE:
  liate <command> [options]

LOCAL AGENT DEVELOPMENT:
  init                      Interactively scaffold a new 5-Pillar (L-I-A-T-E) agent project
  create <name>             Create a new agent folder with starter template
  run <file> [prompt]       Execute an agent spec locally (or --cloud to run on Sovereign Engine)
  install / i <name|url>    Install an agent from Local/GitHub/Community Registry
  submit / publish <url>    Publish your public GitHub agent to the Community Registry
  search <query>            Search official and community agents in registry
  update [name]             Pull latest changes for installed agents from GitHub
  lock [file] [--verify]    Generate or verify deterministic liate.lock snapshot
  mcp <list|add|rm>         Manage tools in ./liate_mcp.json or ~/.liate/liate_mcp.json
  skills <list|add|rm>      Manage procedural skills in ./liate_skills.json
  keys <list|set|rm>        Manage API keys in ./.env or ~/.liate/.env
  cache <show|clean>        Inspect or clear .liate/liate_cache.json
  sessions <list|clear>     Manage conversation history in .liate/liate_sessions/
  logs <tail|clear>         Inspect real-time trace events in .liate/liate_logs.jsonl
  dev / serve               Start the local Liate runtime API & WebSocket engine (port 7071)

SOVEREIGN CLOUD ENGINE (BYOC):
  login [--token <pat>]     Authenticate terminal with tryliate.com via browser or token
  logout                    Clear stored CLI session from ~/.liate/auth.json
  whoami                    Display authenticated Liate ID & Sovereign Engine status
  connect [--cloudflare]    Deploy Pure Sovereign Runtime Engine to Cloudflare Workers / Vercel
  ps / agents               List installed agents in local workspace

EXAMPLES:
  $ liate init
  $ liate run ./liate.json "Research latest AI agent news"
  $ liate run ./liate.json --cloud "Run in Cloudflare Sovereign Engine"
  $ liate connect --cloudflare

`);
}

/**
 * Displays Sovereign Mission & Sarvam AI partnership announcement
 */
export function soonCommand(): void {
  console.log(`\n\x1b[38;2;255;153;51m════════════════════════════════════════════════════════════════════════════\x1b[0m`);
  console.log(`  \x1b[1m🇮🇳  MISSION AGENTANTRA :: SOVEREIGN AI AGENTS FOR BHARAT & THE WORLD\x1b[0m`);
  console.log(`  \x1b[90m"Built with pure love by a Solo Dev from Bengaluru."\x1b[0m`);
  console.log(`  \x1b[1;38;2;255;153;51mFrom India\x1b[0m, \x1b[1;37mFor India\x1b[0m, \x1b[1;38;2;19;136;8mBeyond India\x1b[0m. 🧡🤍💚`);
  console.log(`\x1b[38;2;19;136;8m════════════════════════════════════════════════════════════════════════════\x1b[0m\n`);
  console.log(`  🤝 \x1b[32;1mProud Member of the Sarvam AI Startup Program\x1b[0m\n`);
  console.log(`  \x1b[1;33m"Don't build agents. Let them be born."\x1b[0m\n`);
  console.log(`  🌱 \x1b[1mLiate\x1b[0m       ──►  \x1b[36mWhere agents are born.\x1b[0m  (100% Free Open Source Framework)`);
  console.log(`  🚀 \x1b[1mLiate Cloud\x1b[0m ──►  \x1b[35mWhere agents live.\x1b[0m      (Sovereign Cloud Runtime — tryliate.com)\n`);
  console.log(`  🌟 \x1b[1mThe Sovereign Open Agent Vision:\x1b[0m`);
  console.log(`  ┌────────────────────────────────────────────────────────────────────────┐`);
  console.log(`  │ 🧠 \x1b[1mSovereign Models (Sarvam AI)\x1b[0m — Native intelligence for Indian languages │`);
  console.log(`  │ 🌐 \x1b[1mOmniRoute Free Gateway\x1b[0m — 340+ AI models at ₹0 with zero API key barriers│`);
  console.log(`  │ 🏛️  \x1b[1mClass-as-an-Agent\x1b[0m — True typed OOP architecture (5-Pillar L-I-A-T-E)     │`);
  console.log(`  │ 📦 \x1b[1mUniversal Package Manager\x1b[0m — \x1b[36mliate i <agent>\x1b[0m installs from GitHub/Registry│`);
  console.log(`  │ 🛡️  \x1b[1mDPDP Act Privacy Shield\x1b[0m — 100% Indian Data Localization & PII Redaction  │`);
  console.log(`  └────────────────────────────────────────────────────────────────────────┘\n`);
  console.log(`  👉 \x1b[1mBe part of the mission:\x1b[0m \x1b[36;4mhttps://tryliate.com\x1b[0m\n`);
  console.log(`  ✨ \x1b[90mGive life to your first sovereign agent locally with \x1b[1mliate init\x1b[0m & \x1b[1mliate run\x1b[0m!\x1b[0m\n`);
}
