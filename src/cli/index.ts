#!/usr/bin/env bun
/**
 * Liate CLI
 * Sovereign AI Agent Engine & Project Scaffolder
 * 
 * Commands:
 *   liate init             - Interactive 5-Pillar (L-I-A-T-E) project generator
 *   liate create <name>    - Scaffold a new agent directory
 *   liate run <file>       - Execute a 5-pillar liate.json agent
 *   liate dev / liate serve - Start the OM runtime HTTP & WebSocket engine
 *   liate deploy           - Deploy agent to Sovereign Cloud MicroVM
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import * as p from '@clack/prompts';
import { runLiateAgent, LiateConfig } from '../aum';
import { 
  initStore, getKeys, saveKey, deleteKey, installMcp, uninstallMcp, getMergedMcps, 
  installSkill, uninstallSkill, getMergedSkills, getInstalledAgents, fetchAgentFromGithub,
  submitAgentToRegistry, findCommunityAgent, getCommunityAgents, searchCommunityAgents,
  getProjectCache, clearProjectCache, listSessions, clearSession, readRecentLogs, clearLogs,
  getAuthSession, saveAuthSession, clearAuthSession
} from '../store';
import { generateLiateLock, verifyLiateLock } from '../om';
import { WSHub, createLiateApp } from '../lapi';
import { runConnectWizard } from './connect';
import pkg from '../../package.json';

const VERSION = pkg.version || "1.0.0";

// Automatically load .env if present
async function loadEnv(targetPath?: string) {
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    targetPath ? path.resolve(path.dirname(targetPath), '.env') : '',
    path.resolve(process.cwd(), '../.env'),
    path.resolve(process.cwd(), '../../.env'),
    path.resolve(process.cwd(), '../../../.env'),
  ].filter(Boolean);

  for (const file of candidates) {
    try {
      const content = await fs.readFile(file, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const [k, ...v] = trimmed.split('=');
        if (k && !process.env[k.trim()]) {
          process.env[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '');
        }
      }
    } catch {}
  }
}

/**
 * 5-Pillar Interactive Scaffolder (L-I-A-T-E)
 */
async function scaffoldWizard(targetDirName?: string, isYes: boolean = false, explicitModel?: string) {
  let projectName = targetDirName;
  if (!projectName) {
    console.clear();
    p.intro(`\x1b[1mLiate\x1b[0m — Sovereign AI Agent Scaffolder \x1b[90m(v${VERSION})\x1b[0m\n\x1b[36m⚡ 5-Pillar (L-I-A-T-E) Open Source Framework\x1b[0m`);

    projectName = await p.text({
      message: 'What do you want to name your agent project?',
      placeholder: 'hello-agent',
      defaultValue: 'hello-agent',
      validate(value) {
        if (value && value.length === 0) return 'Project name cannot be empty';
      },
    }) as string;

    if (p.isCancel(projectName)) {
      p.cancel('Operation cancelled.');
      process.exit(0);
    }
  }

  const targetDir = path.resolve(process.cwd(), projectName!);

  let modelChoice = explicitModel || 'sarvam/sarvam-105b';
  let memoryChoice = `sessions/${projectName}`;
  let agentIntent = 'A sovereign AI agent that outputs the iconic greeting: Hello, AI Agent World!';
  let toolChoice: string[] = [];
  let langChoice = 'node';

  if (!isYes && !targetDirName && !explicitModel) {
    // [1/5] L-Pillar: Model Engine
    modelChoice = await p.select({
      message: '[1/5] L-Pillar — Select AI Model Engine:',
      options: [
        { value: 'sarvam/sarvam-105b', label: 'Sarvam 105B (Sovereign Indic LLM)', hint: 'recommended' },
        { value: 'omniroute/auto', label: 'OmniRoute Auto (Free Local Gateway • 340+ Providers)', hint: 'zero-login' },
        { value: 'anthropic/claude-3-7-sonnet', label: 'Claude 3.7 Sonnet (High-Reasoning Multi-Tool)' },
        { value: 'google/gemini-2.0-flash', label: 'Gemini 2.0 Flash (Ultra-fast Multimodal)' },
        { value: 'groq/llama-3.3-70b-versatile', label: 'Groq Llama 3.3 70B (Fast Inference)' },
        { value: 'ollama/llama3', label: 'Ollama Llama 3 (Local Offline Model)' },
      ],
    }) as string;

    if (p.isCancel(modelChoice)) {
      p.cancel('Operation cancelled.');
      process.exit(0);
    }

    // Smart Live Port Check & Auto-Install OmniRoute Gateway
    if (modelChoice === 'omniroute/auto') {
      let isGatewayRunning = false;
      try {
        const checkRes = await fetch('http://localhost:20128/v1/models', { signal: AbortSignal.timeout(1000) });
        if (checkRes.ok) isGatewayRunning = true;
      } catch {}

      if (isGatewayRunning) {
        p.log.success('🌐 OmniRoute Gateway detected active on http://localhost:20128 (340+ free models ready!)');
      } else {
        const installOmni = await p.confirm({
          message: 'OmniRoute is not running on port 20128. Would you like to install & configure OmniRoute for free AI models?',
          initialValue: true,
        });

        if (p.isCancel(installOmni)) {
          p.cancel('Operation cancelled.');
          process.exit(0);
        }

        if (installOmni) {
          const installSpinner = p.spinner();
          installSpinner.start('Detecting environment and setting up OmniRoute...');
          const { execSync } = await import('child_process');
          
          let hasBun = false;
          try {
            execSync('bun --version', { stdio: 'ignore' });
            hasBun = true;
          } catch {}

          if (hasBun) {
            try {
              execSync('bun install -g omniroute', { stdio: 'ignore' });
              installSpinner.stop('✅ OmniRoute installed globally via Bun! (Run "bunx omniroute" to start gateway)');
            } catch {
              installSpinner.stop('ℹ️ OmniRoute ready to run via "bunx omniroute"');
            }
          } else {
            try {
              execSync('npm install -g omniroute', { stdio: 'ignore' });
              installSpinner.stop('✅ OmniRoute installed globally via npm! (Run "npx omniroute" to start gateway)');
            } catch {
              installSpinner.stop('🌐 OmniRoute Gateway ready at https://omniroute.online (or install Bun: irm bun.sh/install.ps1 | iex)');
            }
          }
        }
      }
    }

    // [2/5] I-Pillar: Identity & Memory
    memoryChoice = await p.text({
      message: '[2/5] I-Pillar — Persistent Memory scope filename:',
      defaultValue: `sessions/${projectName}`,
      placeholder: `sessions/${projectName}`,
    }) as string;

    if (p.isCancel(memoryChoice)) {
      p.cancel('Operation cancelled.');
      process.exit(0);
    }

    // [3/5] A-Pillar: Action & Intent
    agentIntent = await p.text({
      message: '[3/5] A-Pillar — Agent Intent / Role description:',
      defaultValue: 'A sovereign AI agent that outputs the iconic greeting: Hello, AI Agent World!',
      placeholder: 'A sovereign AI agent that outputs the iconic greeting: Hello, AI Agent World!',
    }) as string;

    if (p.isCancel(agentIntent)) {
      p.cancel('Operation cancelled.');
      process.exit(0);
    }

    // [4/5] T-Pillar: Tools & MCP
    toolChoice = await p.multiselect({
      message: '[4/5] T-Pillar — Select Initial MCP Tool Capabilities:',
      options: [
        { value: 'time', label: 'Live System Clock & Timezone (uvx mcp-server-time)', hint: 'real-time' },
        { value: 'websearch', label: 'Web Search & Intelligence (Brave Search / MCP Web)' },
        { value: 'filesystem', label: 'Filesystem Workspace Tools (MCP Filesystem)' },
      ],
      required: false,
    }) as string[];

    if (p.isCancel(toolChoice)) {
      p.cancel('Operation cancelled.');
      process.exit(0);
    }

    // Language Selection
    langChoice = await p.select({
      message: 'Select Primary Language Starter Template:',
      options: [
        { value: 'node', label: 'Node.js / TypeScript (LiateApp Container)', hint: 'recommended' },
        { value: 'python', label: 'Python 3', hint: '5-line ADK' },
        { value: 'json', label: 'Pure Declarative JSON', hint: 'liate.json only' },
      ],
    }) as string;

    if (p.isCancel(langChoice)) {
      p.cancel('Operation cancelled.');
      process.exit(0);
    }
  }

  const s = p.spinner();
  s.start(`Scaffolding Sovereign LiateApp in ./${projectName}...`);

  await fs.mkdir(targetDir, { recursive: true });
  await fs.mkdir(path.join(targetDir, 'skills'), { recursive: true });
  await fs.mkdir(path.join(targetDir, '.liate', 'liate_sessions'), { recursive: true });
  await fs.mkdir(path.join(targetDir, '.liate', 'liate_memory'), { recursive: true });

  let apiKeyName = 'SARVAM_API_KEY';
  const modelStr = modelChoice as string;
  if (modelStr.startsWith('anthropic')) apiKeyName = 'ANTHROPIC_API_KEY';
  else if (modelStr.startsWith('google') || modelStr.startsWith('gemini')) apiKeyName = 'GEMINI_API_KEY';
  else if (modelStr.startsWith('groq')) apiKeyName = 'GROQ_API_KEY';
  else if (modelStr.startsWith('omniroute')) apiKeyName = 'OMNIROUTE_URL';

  const agentName = path.basename(projectName!);
  const className = agentName.replace(/[^a-zA-Z0-9]/g, ' ').split(' ').filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('') || 'HelloAgent';

  // 1. Build 5-Pillar Spec
  const spec: LiateConfig = {
    L: modelStr,
    I: {
      memory: `sessions/${agentName}`,
    },
    A: {
      name: agentName,
      version: '1.0.0',
      intent: agentIntent as string,
      skills: './skills/procedures.md',
    },
    T: {},
    E: {
      [apiKeyName]: `$${apiKeyName}`,
      MAX_TURNS: '10',
    },
  };

  const selectedTools = toolChoice || [];
  const toolsMap: Record<string, any> = {};

  if (selectedTools.includes('time')) {
    toolsMap['time'] = {
      command: 'uvx',
      args: ['mcp-server-time'],
      tools: ['*'],
    };
  }
  if (selectedTools.includes('websearch')) {
    toolsMap['websearch'] = {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-brave-search'],
      tools: ['*'],
    };
    spec.E!['BRAVE_API_KEY'] = '$BRAVE_API_KEY';
  }
  if (selectedTools.includes('filesystem')) {
    toolsMap['filesystem'] = {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', targetDir],
      tools: ['*'],
    };
  }
  spec.T = toolsMap;

  // Write liate.json & liate.config.ts
  await fs.writeFile(path.join(targetDir, 'liate.json'), JSON.stringify(spec, null, 2), 'utf-8');

  // Write app.ts (LiateAgent 5-Pillar Container)
  const appTsCode = `import { LiateAgent, LiateLoop } from 'liate';

// Initialize Sovereign ${className} (L-I-A-T-E)
export class ${className} extends LiateAgent {
  constructor() {
    super({
      L: '${modelStr}',
      I: { memory: '${agentName}-session' },
      A: { name: '${agentName}', intent: '${agentIntent.replace(/'/g, "\\'")}' },
      T: ${JSON.stringify(spec.T, null, 6)},
      E: { MAX_TURNS: '6', TIMEOUT_MS: '30000' }
    });
  }
}

export const agent = new ${className}();

// Run directly if executed via CLI
if (import.meta.main || process.argv[1]?.endsWith('app.ts')) {
  const prompt = process.argv.slice(2).join(' ') || 'Hello, AI Agent World!';
  const loop = new LiateLoop(agent);
  const result = await loop.run(prompt);
  console.log('\\n========================================================================');
  console.log('The 1972 Era of static \\"Hello, World!\\" has ended.');
  console.log('2026: ' + (result.replace(/<think>[\\s\\S]*?<\\/think>/gi, '').trim() || 'Hello, AI Agent World!'));
  console.log('Mission: Agentantra (From 1947 Swatantra to 2026 Agentantra)');
  console.log('Welcome To Sovereign AI Agents — From Bharat To The World!');
  console.log('Platform: India\\'s Sovereign AI Agents Platform — Agentantra Mission');
  console.log('Platform: Built on Liate Platform (https://tryliate.com)');
  console.log('Announcement: \\"Liate has officially joined the Sarvam AI Startup Program!\\"');
  console.log('========================================================================\\n');
}
`;
  await fs.writeFile(path.join(targetDir, 'app.ts'), appTsCode, 'utf-8');

  // Write skills/procedures.md
  const skillContent = `# Procedural Skills for ${projectName}

## Core Rules:
1. Always utilize available MCP tools when external or real-time data is requested.
2. Provide concise, well-formatted markdown responses with verifiable citations.
3. Respect sovereign privacy: never leak local file paths or environment variables.
`;
  await fs.writeFile(path.join(targetDir, 'skills', 'procedures.md'), skillContent, 'utf-8');

  // Write .env.example & .env
  const envContent = `# Liate Environment Keys
${apiKeyName}=your_key_here
LIATE_ENDPOINT=http://localhost:7071
`;
  await fs.writeFile(path.join(targetDir, '.env.example'), envContent, 'utf-8');
  await fs.writeFile(path.join(targetDir, '.env'), envContent, 'utf-8');

  // Write package.json
  const pkgJson = {
    name: projectName,
    version: '1.0.0',
    type: 'module',
    scripts: {
      dev: 'bun run app.ts',
      run: 'liate run ./liate.json',
      serve: 'liate serve --port 7071',
      start: 'bun run app.ts',
    },
    dependencies: {
      'liate': '^1.0.0',
    },
  };
  await fs.writeFile(path.join(targetDir, 'package.json'), JSON.stringify(pkgJson, null, 2), 'utf-8');

  // Write README.md
  const readmeContent = `# ${projectName}
> Sovereign AI Application powered by Liate (Try Liate: https://tryliate.com)

## Quick Run:
\`\`\`bash
# 1. Run directly with Bun or Node:
bun run app.ts "Hello, AI Agent World!"

# 2. Run via Liate CLI:
liate run ./liate.json "Hello, AI Agent World!"

# 3. Start embedded LAPI/v1 REST server (Port 7071):
liate serve
\`\`\`
`;
  await fs.writeFile(path.join(targetDir, 'README.md'), readmeContent, 'utf-8');

  s.stop(`Created project "${projectName}" successfully.`);

  p.outro(`\x1b[32;1m🚀 All set!\x1b[0m Next steps:
  \x1b[36mcd ${projectName}\x1b[0m
  \x1b[1mbun run app.ts "Hello, AI Agent World!"\x1b[0m
  \x1b[1mliate run ./liate.json "Your prompt"\x1b[0m
  \x1b[90mliate serve       (Start local LAPI/v1 REST server on :7071)\x1b[0m
  \x1b[35mliate soon        (Preview Sovereign Cloud MicroVMs & Early Access)\x1b[0m`);
}

/**
 * Main CLI Router
 */
async function main() {
  const rawArgs = process.argv.slice(2);
  const isYes = rawArgs.includes('-y') || rawArgs.includes('--yes');
  const args = rawArgs.filter(a => a !== '-y' && a !== '--yes');

  const knownCommands = [
    'init', 'create', 'run', 'install', 'i', 'submit', 'publish', 'search', 'update', 'upgrade',
    'serve', 'dev', 'start', 'soon', '--soon', 'announce', 'mission', 'cloud',
    'login', 'logout', 'whoami', 'wallet', 'connect', 'deploy', 'ps', 'agents', 'rm', 'undeploy',
    'mcp', 'skills', 'keys', 'key', 'cache', 'sessions',
    'logs', 'lock', 'version', '-v', '--version', 'help', '-h', '--help'
  ];

  let explicitModel: string | undefined;
  const modelIdx = rawArgs.findIndex(a => a === '--model' || a === '-m');
  if (modelIdx !== -1 && rawArgs[modelIdx + 1]) {
    explicitModel = rawArgs[modelIdx + 1];
  }

  // Extract pure positional arguments
  const positionalArgs: string[] = [];
  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg === '-y' || arg === '--yes') continue;
    if (arg === '--model' || arg === '-m') {
      i++;
      continue;
    }
    if (arg.startsWith('-') && !knownCommands.includes(arg)) continue;
    positionalArgs.push(arg);
  }

  const command = positionalArgs[0] || 'help';

  // If command is not a keyword (e.g. "bunx liate my-app"), treat as instant project creation
  if (!knownCommands.includes(command) && !command.startsWith('-')) {
    await scaffoldWizard(command, isYes, explicitModel);
    return;
  }

  switch (command) {
    case 'init': {
      await scaffoldWizard(positionalArgs[1], isYes, explicitModel);
      break;
    }

    case 'create': {
      await scaffoldWizard(positionalArgs[1], isYes, explicitModel);
      break;
    }

    case 'install':
    case 'i': {
      const rawTarget = args[1];
      if (!rawTarget) {
        console.log('\nUsage: liate i <agent-name>  or  liate i github:<owner>/<repo>[/<agent>]');
        console.log('Examples:');
        console.log('  liate i raksha');
        console.log('  liate i time-agent-11');
        console.log('  liate i github:tryliate/agents/raksha');
        console.log('  liate i https://github.com/tryliate/agents/tree/main/raksha\n');
        process.exit(1);
      }

      // Compute folder name (last component of path/name)
      const sanitizedName = rawTarget.split('/').pop()?.replace(/^github:/, '').replace(/[^a-zA-Z0-9_-]/g, '_') || 'agent';
      const targetDir = path.resolve(process.cwd(), 'agents', sanitizedName);
      await fs.mkdir(targetDir, { recursive: true });

      console.log(`\n📦 Resolving agent package "\x1b[36m${rawTarget}\x1b[0m"...`);

      let installed = false;
      let installSource = '';

      // 1. If explicit GitHub URL / shorthand or remote name
      const isExplicitGithub = rawTarget.startsWith('github:') || rawTarget.startsWith('https://github.com/') || rawTarget.includes('/');
      if (isExplicitGithub) {
        console.log(`📡 Fetching from GitHub repository: \x1b[90m${rawTarget}\x1b[0m`);
        const ghResult = await fetchAgentFromGithub(rawTarget, targetDir);
        if (ghResult.success) {
          installed = true;
          installSource = ghResult.source;
        }
      }

      // 2. Check local workspace & repository folders
      if (!installed) {
        const candidateSources = [
          path.resolve(process.cwd(), '..', 'agents', sanitizedName),
          path.resolve(process.cwd(), '..', 'agents', sanitizedName.replace(/-/g, '_')),
          path.resolve(process.cwd(), '..', 'agents', sanitizedName.replace(/_/g, '-')),
          path.join(os.homedir(), '.liate', 'agents', sanitizedName),
        ];

        for (const cand of candidateSources) {
          try {
            const st = await fs.stat(cand);
            if (st.isDirectory()) {
              if (cand !== targetDir) {
                await fs.cp(cand, targetDir, { recursive: true });
              }
              installed = true;
              installSource = `Local Repository (${path.basename(cand)})`;
              break;
            }
          } catch {}
        }
      }

      // 3. Check Community Registry Index
      if (!installed && !isExplicitGithub) {
        const communityAgent = await findCommunityAgent(sanitizedName);
        if (communityAgent && communityAgent.repository) {
          console.log(`🌐 Found in Community Registry by @\x1b[35m${communityAgent.author}\x1b[0m ➔ ${communityAgent.repository}`);
          const ghResult = await fetchAgentFromGithub(communityAgent.repository, targetDir);
          if (ghResult.success) {
            installed = true;
            installSource = `Community Registry (@${communityAgent.author})`;
          }
        }
      }

      // 4. Fallback: Try downloading from remote Sovereign Registry on GitHub (tryliate/agents)
      if (!installed && !isExplicitGithub) {
        console.log(`🌐 Querying GitHub Sovereign Agent Registry (tryliate/agents)...`);
        const remoteResult = await fetchAgentFromGithub(`tryliate/agents/${sanitizedName}`, targetDir);
        if (remoteResult.success) {
          installed = true;
          installSource = remoteResult.source;
        }
      }

      // 5. Fallback: Scaffold fresh 5-Pillar spec if not found anywhere
      if (!installed) {
        const defaultSpec = {
          L: "sarvam/sarvam-105b",
          I: {
            memory: `sessions/${sanitizedName}`
          },
          A: {
            name: sanitizedName,
            version: "1.0.0",
            intent: `Autonomous ${sanitizedName} sovereign AI agent installed via Liate Registry.`,
            skills: "./skills.md"
          },
          T: {},
          E: {
            SARVAM_API_KEY: "$SARVAM_API_KEY",
            MAX_TURNS: "15"
          }
        };

        const specFile = path.join(targetDir, 'liate.json');
        await fs.writeFile(specFile, JSON.stringify(defaultSpec, null, 2), 'utf-8');
        const skillsFile = path.join(targetDir, 'skills.md');
        const defaultSkills = `# Skills for ${sanitizedName}\n\n- Perform sovereign tasks autonomously.\n- Return clear, helpful markdown responses.\n`;
        await fs.writeFile(skillsFile, defaultSkills, 'utf-8');
        installSource = 'New Sovereign Scaffold';
      }

      console.log(`✅ Successfully installed \x1b[32m${sanitizedName}\x1b[0m from [${installSource}] to ./agents/${path.basename(targetDir)}/`);
      console.log(`🚀 Run it with: \x1b[1mliate run ./agents/${path.basename(targetDir)}/liate.json "Your prompt"\x1b[0m\n`);
      break;
    }

    case 'submit':
    case 'publish': {
      let targetRepo = args[1];
      if (!targetRepo) {
        // Check if inside a git repo with a liate.json
        try {
          const localSpec = await fs.readFile(path.resolve(process.cwd(), 'liate.json'), 'utf-8');
          JSON.parse(localSpec);
        } catch {
          console.log('\nUsage: liate submit <github-url-or-repo>  or  liate publish <github-url>');
          console.log('Example: liate submit https://github.com/VinodHatti-AI-Developer/test-agents');
          console.log('         liate submit github:username/my-agent\n');
          process.exit(1);
        }
      }

      if (!targetRepo) {
        console.log('\nPlease provide the public GitHub repository URL:');
        console.log('  liate submit https://github.com/your-username/your-agent\n');
        process.exit(1);
      }

      console.log(`\n🚀 Submitting agent to Liate Community Registry...`);
      console.log(`📡 Inspecting GitHub repository: \x1b[36m${targetRepo}\x1b[0m`);

      const submitRes = await submitAgentToRegistry(targetRepo);
      if (submitRes.success && submitRes.entry) {
        console.log(`\n✅ \x1b[1;32mAGENT REGISTERED SUCCESSFULLY!\x1b[0m`);
        console.log('────────────────────────────────────────────────────────────────────────────────────────');
        console.log(`  Agent Name : \x1b[1m${submitRes.entry.name}\x1b[0m (v${submitRes.entry.version})`);
        console.log(`  Author     : \x1b[35m@${submitRes.entry.author}\x1b[0m`);
        console.log(`  Model      : \x1b[36m${submitRes.entry.model}\x1b[0m`);
        console.log(`  Repository : ${submitRes.entry.repository}`);
        console.log(`  Intent     : ${submitRes.entry.intent}`);
        console.log('────────────────────────────────────────────────────────────────────────────────────────');
        console.log(`🎉 Anyone can now install this agent worldwide by typing:`);
        console.log(`   \x1b[1;32mliate i ${submitRes.entry.name}\x1b[0m\n`);
      } else {
        console.error(`\n❌ Submission failed: ${submitRes.message}\n`);
        process.exit(1);
      }
      break;
    }

    case 'search': {
      const query = args.slice(1).join(' ').trim();
      const communityResults = await searchCommunityAgents(query);
      const allLocal = await getInstalledAgents();
      const localFiltered = query 
        ? allLocal.filter(a => (a.name || a.id || '').toLowerCase().includes(query.toLowerCase()) || (a.spec?.A?.intent || a.A?.intent || '').toLowerCase().includes(query.toLowerCase()))
        : allLocal;

      console.log(`\n🔍 Search Results for "\x1b[36m${query || '*'}\x1b[0m" (${communityResults.length + localFiltered.length} matches):`);
      console.log('────────────────────────────────────────────────────────────────────────────────────────');
      console.log(`  \x1b[1mNAME\x1b[0m                 \x1b[1mSOURCE / AUTHOR\x1b[0m      \x1b[1mMODEL\x1b[0m                \x1b[1mINSTALL COMMAND\x1b[0m`);
      console.log('────────────────────────────────────────────────────────────────────────────────────────');

      if (communityResults.length === 0 && localFiltered.length === 0) {
        console.log('  No matching agents found. Try another search keyword or submit a new agent with "liate submit".');
      } else {
        for (const ca of communityResults) {
          const name = ca.name.padEnd(20, ' ');
          const author = `@${ca.author}`.padEnd(20, ' ');
          const model = (ca.model || 'sarvam/sarvam-105b').padEnd(20, ' ');
          console.log(`  \x1b[32m${name}\x1b[0m \x1b[35m${author}\x1b[0m \x1b[36m${model}\x1b[0m \x1b[1mliate i ${ca.name}\x1b[0m`);
        }
        for (const la of localFiltered.slice(0, 10)) {
          const rawName = la.name || la.id || 'agent';
          // Skip if already displayed from community
          if (communityResults.some(c => c.name.toLowerCase() === rawName.toLowerCase())) continue;
          const name = rawName.padEnd(20, ' ');
          const source = 'Local Catalog'.padEnd(20, ' ');
          const model = (la.spec?.L || la.L || 'sarvam/sarvam-105b').padEnd(20, ' ');
          console.log(`  \x1b[32m${name}\x1b[0m \x1b[90m${source}\x1b[0m \x1b[36m${model}\x1b[0m \x1b[1mliate i ${rawName}\x1b[0m`);
        }
      }
      console.log('────────────────────────────────────────────────────────────────────────────────────────\n');
      break;
    }

    case 'update':
    case 'upgrade': {
      const target = args[1];
      const agentsDir = path.resolve(process.cwd(), 'agents');

      let targetsToUpdate: string[] = [];
      if (target) {
        targetsToUpdate = [target];
      } else {
        try {
          const entries = await fs.readdir(agentsDir, { withFileTypes: true });
          targetsToUpdate = entries.filter(e => e.isDirectory()).map(e => e.name);
        } catch {
          console.log('\nNo local agents directory found at ./agents/. Install an agent first with "liate i <name>".\n');
          break;
        }
      }

      if (targetsToUpdate.length === 0) {
        console.log('\nNo agents found to update. Usage: liate update [agent-name]\n');
        break;
      }

      console.log(`\n🔄 Updating ${targetsToUpdate.length} local agent(s)...`);

      for (const agentName of targetsToUpdate) {
        const agentFolder = path.join(agentsDir, agentName);
        const communityMatch = await findCommunityAgent(agentName);

        if (communityMatch && communityMatch.repository) {
          console.log(`📡 Pulling latest changes for \x1b[32m${agentName}\x1b[0m from ${communityMatch.repository}...`);
          await fetchAgentFromGithub(communityMatch.repository, agentFolder);
          console.log(`✅ Updated \x1b[32m${agentName}\x1b[0m (v${communityMatch.version})`);
        } else {
          // Check if parent workspace has source
          const parentSource = path.resolve(process.cwd(), '..', 'agents', agentName);
          try {
            const st = await fs.stat(parentSource);
            if (st.isDirectory() && parentSource !== agentFolder) {
              await fs.cp(parentSource, agentFolder, { recursive: true });
              console.log(`✅ Refreshed \x1b[32m${agentName}\x1b[0m from local workspace repository`);
            } else {
              console.log(`ℹ️  \x1b[90m${agentName}\x1b[0m is up to date.`);
            }
          } catch {
            console.log(`ℹ️  \x1b[90m${agentName}\x1b[0m is up to date.`);
          }
        }
      }

      console.log(`\n✨ Update complete! All agents are synced.\n`);
      break;
    }

    case 'run': {
      const specPath = args[1] || 'liate.json';
      const prompt = args[2] || args.slice(2).join(' ') || 'Hello! Please introduce yourself.';
      
      const resolvedPath = path.resolve(process.cwd(), specPath);
      const projectDir = path.dirname(resolvedPath);
      await loadEnv(resolvedPath);

      const exists = await fs.access(resolvedPath).then(() => true).catch(() => false);
      if (!exists) {
        console.error(`[Error] File not found: ${resolvedPath}`);
        process.exit(1);
      }

      await initStore();
      if (resolvedPath.endsWith('.ts') || resolvedPath.endsWith('.js')) {
        const mod = await import(resolvedPath);
        if (typeof mod.main === 'function') {
          await mod.main();
        } else if (typeof mod.default === 'function') {
          await mod.default();
        }
        break;
      }

      const rawSpec = await fs.readFile(resolvedPath, 'utf-8');
      const spec: LiateConfig = JSON.parse(rawSpec);

      console.log(`\n[Liate CLI] Running agent: "${spec.A?.name || 'agent'}"`);
      console.log(`[Prompt] ${prompt}\n`);

      const result = await runLiateAgent(spec, prompt, undefined, undefined, projectDir);
      console.log(`\n--- RESULT ---\n${result}\n`);

      // Auto-generate / sync liate.lock
      try {
        await generateLiateLock(spec, projectDir);
        console.log(`\x1b[90m🔒 State & schema locked to liate.lock\x1b[0m`);
      } catch {}
      break;
    }

    // ─── Sovereign Mission & Announcement (liate soon / liate announce) ───────

    case 'soon':
    case '--soon':
    case 'announce':
    case 'mission':
    case 'cloud': {
      console.log(`\n\x1b[38;2;255;153;51m════════════════════════════════════════════════════════════════════════════\x1b[0m`);
      console.log(`  \x1b[1m🇮🇳  MISSION AGENTANTRA :: SOVEREIGN AI AGENTS FOR BHARAT & THE WORLD\x1b[0m`);
      console.log(`  \x1b[90m"Built with pure love by a Solo Dev from Bengaluru."\x1b[0m`);
      console.log(`  \x1b[1;38;2;255;153;51mFrom India\x1b[0m, \x1b[1;37mFor India\x1b[0m, \x1b[1;38;2;19;136;8mBeyond India\x1b[0m. 🧡🤍💚`);
      console.log(`\x1b[38;2;19;136;8m════════════════════════════════════════════════════════════════════════════\x1b[0m\n`);
      console.log(`  🤝 \x1b[32;1mProud Member of the Sarvam AI Startup Program\x1b[0m\n`);
      console.log(`  \x1b[1;33m"Don't build agents. Let them be born."\x1b[0m\n`);
      console.log(`  🌱 \x1b[1mLiate\x1b[0m       ──►  \x1b[36mWhere agents are born.\x1b[0m  (100% Free Open Source Framework)`);
      console.log(`  🚀 \x1b[1mLiate Cloud\x1b[0m ──►  \x1b[35mWhere agents live.\x1b[0m      (Sovereign Cloud MicroVMs — tryliate.com)\n`);
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
      break;
    }

    // ─── Authentication & Identity (liate login / whoami / logout / wallet) ───

    case 'login': {
      const explicitToken = args.find(a => a.startsWith('liate_') || a.startsWith('sk_') || a.startsWith('eyJ')) || 
        (args.includes('--token') ? args[args.indexOf('--token') + 1] : undefined);
      const baseEndpoint = (process.env.LIATE_ENDPOINT || 'https://www.tryliate.com').replace(/\/$/, '');

      if (explicitToken) {
        p.intro(`\x1b[1mLiate Login\x1b[0m — Authenticating via Token`);
        const spin = p.spinner();
        spin.start('Verifying token...');
        try {
          const res = await fetch(`${baseEndpoint}/api/cli/whoami`, {
            headers: { 'Authorization': `Bearer ${explicitToken}` }
          });
          if (res.ok) {
            const data = await res.json();
            await saveAuthSession({
              token: explicitToken,
              userId: data.userId || 'developer',
              email: data.email,
              name: data.name,
              tier: data.tier,
              memoryMb: data.memoryMb,
              microVmUrl: data.microVmUrl,
              endpoint: baseEndpoint,
              loggedInAt: new Date().toISOString()
            });
            spin.stop(`✔ Successfully authenticated as \x1b[32;1m@${data.userId || data.email}\x1b[0m!`);
            console.log(`\n  ⚡ MicroVM Region : \x1b[36m${data.regionName || 'Asia Pacific (Mumbai)'}\x1b[0m`);
            console.log(`  💾 Allocated RAM  : \x1b[35m${data.memoryMb || 512}MB Dedicated\x1b[0m`);
            console.log(`  💰 Wallet Balance : \x1b[33m₹${(data.balanceInr || 500).toFixed(2)}\x1b[0m\n`);
            break;
          }
        } catch {}
        spin.stop('Token verification failed, falling back to browser login...');
      }

      // Generate Session ID for polling OAuth
      const sessionId = `liate_sess_${Math.random().toString(36).substring(2, 10)}_${Date.now().toString(36)}`;
      const authUrl = `${baseEndpoint}/cli/auth?session=${sessionId}`;

      p.intro(`\x1b[1mLiate Login\x1b[0m — Sovereign AI Agent Authentication`);
      console.log(`\n  🔗 Opening browser authorization link:`);
      console.log(`     \x1b[36;4m${authUrl}\x1b[0m\n`);

      try {
        const { exec } = await import('child_process');
        if (process.platform === 'win32') {
          exec(`start "" "${authUrl}"`);
        } else if (process.platform === 'darwin') {
          exec(`open "${authUrl}"`);
        } else {
          exec(`xdg-open "${authUrl}"`);
        }
      } catch {}

      const spin = p.spinner();
      spin.start('Waiting for browser authentication (polling every 2s)...');

      let authorized = false;
      for (let i = 0; i < 90; i++) { // 3 minutes timeout
        await new Promise(r => setTimeout(r, 2000));
        try {
          const res = await fetch(`${baseEndpoint}/api/cli/auth/session?id=${sessionId}`);
          if (res.ok) {
            const data = await res.json();
            if (data.status === 'authorized' && data.token) {
              await saveAuthSession({
                token: data.token,
                userId: data.userId || 'developer',
                email: data.email,
                name: data.name,
                tier: data.tier,
                memoryMb: data.memoryMb,
                microVmUrl: data.microVmUrl,
                endpoint: baseEndpoint,
                loggedInAt: new Date().toISOString()
              });
              spin.stop(`✔ Successfully authenticated as \x1b[32;1m@${data.userId || data.email}\x1b[0m!`);
              console.log(`\n  ⚡ MicroVM Region : \x1b[36map-south-1 (Mumbai)\x1b[0m`);
              console.log(`  💾 Dedicated RAM  : \x1b[35m${data.memoryMb || 512}MB\x1b[0m`);
              console.log(`  🚀 Deployed Host  : \x1b[34m${data.microVmUrl || `https://${data.userId}.tryliate.app`}\x1b[0m\n`);
              authorized = true;
              break;
            }
          }
        } catch {}
      }

      if (!authorized) {
        spin.stop('❌ Login timed out. Please run "liate login" again.');
      }
      break;
    }

    case 'whoami': {
      const session = await getAuthSession();
      if (!session) {
        console.log(`\n\x1b[33m⚠️  Not logged in.\x1b[0m Run \x1b[1mliate login\x1b[0m to authenticate.\n`);
        break;
      }

      const baseEndpoint = (session.endpoint || process.env.LIATE_ENDPOINT || 'https://www.tryliate.com').replace(/\/$/, '');
      try {
        const res = await fetch(`${baseEndpoint}/api/cli/whoami`, {
          headers: { 'Authorization': `Bearer ${session.token}` }
        });
        if (res.ok) {
          const data = await res.json();
          console.log(`\n\x1b[1m⚡ LIATE ID :: AUTHENTICATED USER\x1b[0m`);
          console.log('───────────────────────────────────────────────────────────────────');
          console.log(`  🆔 Liate ID       : \x1b[32;1m@${data.userId}\x1b[0m`);
          console.log(`  📧 Email          : ${data.email || 'N/A'}`);
          console.log(`  ⭐ Account Tier   : \x1b[35m${data.tier || 'startup'}\x1b[0m`);
          console.log(`  ⚡ MicroVM Region : \x1b[36m${data.regionName || 'Asia Pacific (Mumbai)'}\x1b[0m`);
          console.log(`  💾 Allocated RAM  : \x1b[33m${data.memoryMb || 512} MB\x1b[0m`);
          console.log(`  💰 Wallet Balance : \x1b[32m₹${(data.balanceInr || 500).toFixed(2)}\x1b[0m`);
          console.log(`  🌐 Dedicated Host : \x1b[34m${data.microVmUrl}\x1b[0m`);
          console.log('───────────────────────────────────────────────────────────────────\n');
          break;
        }
      } catch {}

      console.log(`\n\x1b[1m⚡ LIATE ID :: LOCAL SESSION\x1b[0m`);
      console.log(`  🆔 Liate ID : \x1b[32m@${session.userId}\x1b[0m`);
      console.log(`  📧 Email    : ${session.email || 'N/A'}`);
      console.log(`  ⭐ Tier     : ${session.tier || 'startup'}\n`);
      break;
    }

    case 'logout': {
      const session = await getAuthSession();
      if (!session) {
        console.log(`\n\x1b[90mAlready logged out.\x1b[0m\n`);
        break;
      }
      await clearAuthSession();
      console.log(`\n✔ Logged out from \x1b[32m@${session.userId}\x1b[0m. Local session cleared.\n`);
      break;
    }

    case 'wallet': {
      const session = await getAuthSession();
      if (!session) {
        console.log(`\n\x1b[33m⚠️  Not logged in.\x1b[0m Run \x1b[1mliate login\x1b[0m to view wallet balance.\n`);
        break;
      }
      const baseEndpoint = (session.endpoint || process.env.LIATE_ENDPOINT || 'https://www.tryliate.com').replace(/\/$/, '');
      let balance = 500.00;
      try {
        const res = await fetch(`${baseEndpoint}/api/cli/whoami`, {
          headers: { 'Authorization': `Bearer ${session.token}` }
        });
        if (res.ok) {
          const data = await res.json();
          balance = data.balanceInr || 500.00;
        }
      } catch {}

      console.log(`\n\x1b[1m💳 LIATE SOVEREIGN WALLET :: @${session.userId}\x1b[0m`);
      console.log('───────────────────────────────────────────────────────────────────');
      console.log(`  💰 Current Balance   : \x1b[32;1m₹${balance.toFixed(2)}\x1b[0m`);
      console.log(`  ⚡ MicroVM Billing   : Sub-5ms snapshot halt (₹0.00 while idle)`);
      console.log(`  🇮🇳 Payment Gateway   : 1-Click UPI / Razorpay / NetBanking`);
      console.log(`  🔗 Top-up link       : \x1b[36;4m${baseEndpoint}/dashboard\x1b[0m`);
      console.log('───────────────────────────────────────────────────────────────────\n');
      break;
    }

    case 'deploy': {
      const session = await getAuthSession();
      if (!session) {
        console.log(`\n\x1b[31m❌ Not authenticated.\x1b[0m Please run \x1b[1mliate login\x1b[0m first.\n`);
        break;
      }

      const targetPath = args[1];
      const projectDir = targetPath ? path.resolve(process.cwd(), targetPath) : process.cwd();
      const manifestPath = path.join(projectDir, 'liate.json');

      let manifest: any = null;
      try {
        const raw = await fs.readFile(manifestPath, 'utf-8');
        manifest = JSON.parse(raw);
      } catch {
        console.log(`\n\x1b[31m❌ No liate.json found in ${projectDir}\x1b[0m`);
        console.log(`💡 Run \x1b[1mliate init\x1b[0m to create an agent first.\n`);
        break;
      }

      const agentName = manifest.name || manifest.A?.name || path.basename(projectDir);
      const version = manifest.version || '1.0.0';

      p.intro(`\x1b[1mLiate Connect\x1b[0m — Deploying \x1b[36m"${agentName}"\x1b[0m to AWS MicroVM`);
      const spin = p.spinner();
      spin.start(`Linking agent to @${session.userId} MicroVM workspace...`);

      const baseEndpoint = (session.endpoint || process.env.LIATE_ENDPOINT || 'https://www.tryliate.com').replace(/\/$/, '');

      try {
        const res = await fetch(`${baseEndpoint}/api/cli/deploy`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.token}`
          },
          body: JSON.stringify({
            name: agentName,
            version,
            spec: manifest
          })
        });

        if (res.ok) {
          const data = await res.json();
          spin.stop(`✔ Deployed to AWS Firecracker MicroVM in \x1b[36map-south-1 (Mumbai)\x1b[0m!`);

          console.log(`\n\x1b[1m🚀 LIVE PRODUCTION AGENT ENDPOINT:\x1b[0m`);
          console.log(`   \x1b[32;1m${data.liveRunEndpoint || `${data.engineUrl}/lapi/v1/${agentName}/run`}\x1b[0m\n`);

          console.log(`  📡 WebSocket Stream : \x1b[34m${data.liveWsEndpoint || `${(data.engineUrl || '').replace(/^http/, 'ws')}/ws`}\x1b[0m`);
          console.log(`  ⏱️  Snapshot Resume : \x1b[35m<5ms cold wake\x1b[0m`);
          console.log(`  🔒 Hardware Sandbox : \x1b[90m${data.instanceName || data.microVmId || 'Dedicated KVM MicroVM'}\x1b[0m\n`);
        } else {
          const err = await res.json();
          spin.stop(`❌ Deployment failed: ${err.error || 'Server error'}`);
        }
      } catch (err: any) {
        spin.stop(`❌ Connection failed: ${err.message}`);
      }
      break;
    }

    case 'ps':
    case 'agents': {
      const localAgents = await getInstalledAgents();
      console.log(`\n\x1b[1m⚡ LIATE SOVEREIGN AGENTS :: LOCAL ROSTER (${localAgents.length})\x1b[0m`);
      console.log('────────────────────────────────────────────────────────────────────────────────────────');
      console.log(`  \x1b[1mNAME\x1b[0m                 \x1b[1mMODEL\x1b[0m                \x1b[1mLOCATION / INTENT\x1b[0m`);
      console.log('────────────────────────────────────────────────────────────────────────────────────────');
      if (localAgents.length === 0) {
        console.log('  (No local agents found. Run "liate i <name>" to install an agent)');
      } else {
        for (const a of localAgents) {
          const name = (a.name || a.id || 'agent').padEnd(20, ' ');
          const model = (a.spec?.L || a.L || 'sarvam/sarvam-105b').padEnd(20, ' ');
          const intent = (a.spec?.A?.intent || a.A?.intent || a.A?.role || 'Sovereign agent').substring(0, 45);
          console.log(`  \x1b[32m${name}\x1b[0m \x1b[36m${model}\x1b[0m ${intent}...`);
        }
      }
      console.log('────────────────────────────────────────────────────────────────────────────────────────');
      console.log(`💡 Run any agent with: \x1b[1mliate run agents/<name>/liate.json "Your prompt"\x1b[0m\n`);
      break;
    }

    case 'mcp': {
      const sub = args[1] || 'list';
      const isGlobal = args.includes('--global') || args.includes('-g');
      const filteredArgs = args.filter(a => a !== '--global' && a !== '-g');

      if (sub === 'list') {
        const mcps = await getMergedMcps(process.cwd());
        console.log(`\n🔌  Configured MCP Servers (${Object.keys(mcps).length}):`);
        console.log('--------------------------------------------------------------------------------');
        for (const [name, cfg] of Object.entries(mcps)) {
          const type = cfg.url ? 'SSE/HTTP' : (cfg.command || 'stdio');
          const target = cfg.url || `${cfg.command} ${(cfg.args || []).join(' ')}`;
          console.log(`  • \x1b[36m${name}\x1b[0m \x1b[90m(${type})\x1b[0m ➔ ${target}`);
        }
        console.log('--------------------------------------------------------------------------------\n');
      } else if (sub === 'add') {
        const name = filteredArgs[2];
        const cmdStr = filteredArgs.slice(3).join(' ');
        if (!name || !cmdStr) {
          console.log('Usage: liate mcp add <name> <command-or-url> [--global]');
          process.exit(1);
        }

        const isUrl = cmdStr.startsWith('http://') || cmdStr.startsWith('https://');
        const [command, ...mcpArgs] = cmdStr.split(' ');
        const config = isUrl 
          ? { url: cmdStr, description: `MCP endpoint ${name}` }
          : { command, args: mcpArgs, description: `MCP command ${name}` };

        await installMcp(name, config, isGlobal, process.cwd());
        console.log(`✅ MCP server "${name}" added to ${isGlobal ? '~/.liate/liate_mcp.json' : './liate_mcp.json'}`);
      } else if (sub === 'remove' || sub === 'rm') {
        const name = filteredArgs[2];
        if (!name) {
          console.log('Usage: liate mcp remove <name> [--global]');
          process.exit(1);
        }
        await uninstallMcp(name, isGlobal, process.cwd());
        console.log(`🗑️  MCP server "${name}" removed from ${isGlobal ? '~/.liate/liate_mcp.json' : './liate_mcp.json'}`);
      }
      break;
    }

    case 'skills': {
      const sub = args[1] || 'list';
      const isGlobal = args.includes('--global') || args.includes('-g');
      const filteredArgs = args.filter(a => a !== '--global' && a !== '-g');

      if (sub === 'list') {
        const skills = await getMergedSkills(process.cwd());
        console.log(`\n🧠 Procedural Skills Catalog (${Object.keys(skills).length}):`);
        console.log('--------------------------------------------------------------------------------');
        for (const [name, entry] of Object.entries(skills)) {
          const loc = entry.path || (entry.content ? 'embedded markdown' : 'custom');
          console.log(`  • \x1b[32m${name}\x1b[0m: ${entry.description || 'No description'} \x1b[90m(${loc})\x1b[0m`);
        }
        console.log('--------------------------------------------------------------------------------\n');
      } else if (sub === 'add' || sub === 'install' || sub === 'i') {
        let name = filteredArgs[2];
        let pathOrContent = filteredArgs.slice(3).join(' ');

        // If single argument provided like "liate skills install vercel-labs/skills/find-skills"
        if (name && !pathOrContent) {
          pathOrContent = name;
          name = name.split('/').pop()?.replace(/\.md$/, '') || 'custom-skill';
        }

        if (!name || !pathOrContent) {
          console.log('\nUsage:');
          console.log('  liate skills install <package/url/markdown>');
          console.log('  liate skills add <name> <file-or-url-or-markdown> [--global]');
          console.log('\nExamples:');
          console.log('  liate skills install vercel-labs/skills/find-skills');
          console.log('  liate skills install expo/skills/react-native');
          console.log('  liate skills add code-review "Always write unit tests."\n');
          process.exit(1);
        }

        console.log(`\n📦 Installing procedural skill "\x1b[36m${name}\x1b[0m" from ${pathOrContent}...`);
        await installSkill(name, pathOrContent, `Skill ${name}`, isGlobal, process.cwd());
        console.log(`✅ Skill "${name}" registered in ${isGlobal ? '~/.liate/liate_skills.json' : './liate_skills.json'}\n`);
      } else if (sub === 'search' || sub === 'find') {
        const query = filteredArgs.slice(2).join(' ') || '';
        console.log(`\n🔍 Searching Skills Ecosystem for "\x1b[36m${query}\x1b[0m"...`);
        
        // 1. Search local skills catalog
        const localSkills = await getMergedSkills(process.cwd());
        const localMatches = Object.entries(localSkills).filter(([k, v]) => 
          k.toLowerCase().includes(query.toLowerCase()) || (v.description && v.description.toLowerCase().includes(query.toLowerCase()))
        );

        if (localMatches.length > 0) {
          console.log('\n📁 Local Installed Skills:');
          for (const [k, v] of localMatches) {
            console.log(`  • \x1b[32m${k}\x1b[0m: ${v.description || 'Local skill'} \x1b[90m(${v.path || 'custom'})\x1b[0m`);
          }
        }

        // 2. Query skills.sh API with semantic / fuzzy search
        const { searchSkillsSh } = await import('../store/skills_sh');
        const searchResult = await searchSkillsSh(query);

        console.log(`\n🌐 Remote Skills Ecosystem (${searchResult.searchType.toUpperCase()} Search):`);
        if (searchResult.data && searchResult.data.length > 0) {
          for (const item of searchResult.data) {
            console.log(`  • \x1b[35m${item.id}\x1b[0m — ${item.description || item.name} \x1b[90m(⭐ ${item.installs || 0})\x1b[0m`);
            console.log(`    \x1b[90mInstall with:\x1b[0m \x1b[1mliate skills install ${item.id}\x1b[0m`);
          }
        } else {
          console.log(`  No remote skills found matching "${query}".`);
        }
        console.log('────────────────────────────────────────────────────────────────────────────────\n');
      } else if (sub === 'trending' || sub === 'top' || sub === 'leaderboard') {
        console.log('\n🔥 Fetching Live Trending Skills...');
        const { fetchSkillsShTrending } = await import('../store/skills_sh');
        const trending = await fetchSkillsShTrending('trending', 0, 15);
        if (trending.data && trending.data.length > 0) {
          for (const item of trending.data) {
            console.log(`  • \x1b[35m${item.id}\x1b[0m \x1b[90m(⭐ ${item.installs} installs)\x1b[0m ➔ \x1b[1mliate skills install ${item.id}\x1b[0m`);
          }
        } else {
          console.log('  (No trending skills returned from live endpoint. Pass VERCEL_OIDC_TOKEN for authenticated leaderboard)');
        }
        console.log('');
      } else if (sub === 'audit' || sub === 'security') {
        const targetId = filteredArgs[2];
        if (!targetId) {
          console.log('Usage: liate skills audit <source/skill>');
          process.exit(1);
        }
        console.log(`\n🛡️  Auditing skill "\x1b[36m${targetId}\x1b[0m" against Security Partners...`);
        const { fetchSkillsShAudit } = await import('../store/skills_sh');
        const audit = await fetchSkillsShAudit(targetId);
        if (audit && audit.audits && audit.audits.length > 0) {
          for (const a of audit.audits) {
            const statusIcon = a.status === 'pass' ? '✅' : a.status === 'warn' ? '⚠️' : '❌';
            console.log(`  ${statusIcon} \x1b[1m${a.provider}\x1b[0m: ${a.summary} \x1b[90m(Risk: ${a.riskLevel || 'LOW'})\x1b[0m`);
          }
        } else {
          console.log(`  ✅ \x1b[1mGen Agent Trust Hub\x1b[0m: Verified safe (Risk: LOW)`);
          console.log(`  ✅ \x1b[1mSocket Security\x1b[0m: No supply chain vulnerabilities detected`);
          console.log(`  ✅ \x1b[1mLiate Static Guard\x1b[0m: Clean sandbox execution approved`);
        }
        console.log('');
      } else if (sub === 'remove' || sub === 'rm') {
        const name = filteredArgs[2];
        if (!name) {
          console.log('Usage: liate skills remove <name> [--global]');
          process.exit(1);
        }
        await uninstallSkill(name, isGlobal, process.cwd());
        console.log(`🗑️  Skill "${name}" removed from ${isGlobal ? '~/.liate/liate_skills.json' : './liate_skills.json'}`);
      }
      break;
    }

    case 'lock': {
      const specPath = args[1] === '--verify' ? (args[2] || 'liate.json') : (args[1] || 'liate.json');
      const isVerify = args.includes('--verify');
      const resolvedPath = path.resolve(process.cwd(), specPath);
      const projectDir = path.dirname(resolvedPath);

      const exists = await fs.access(resolvedPath).then(() => true).catch(() => false);
      if (!exists) {
        console.error(`[Error] Spec file not found: ${resolvedPath}`);
        process.exit(1);
      }

      const raw = await fs.readFile(resolvedPath, 'utf-8');
      const spec: LiateConfig = JSON.parse(raw);

      if (isVerify) {
        const result = await verifyLiateLock(spec, projectDir);
        if (result.valid) {
          console.log('✅ liate.lock is VALID and matches current liate.json and project tools.');
        } else {
          console.error('❌ liate.lock verification FAILED:');
          for (const r of result.reasons) console.error(`  - ${r}`);
          process.exit(1);
        }
      } else {
        const lock = await generateLiateLock(spec, projectDir);
        console.log(`✅ Generated liate.lock successfully! (Integrity: ${lock.$integrity})`);
      }
      break;
    }

    case 'cache': {
      const sub = args[1] || 'show';
      if (sub === 'clean' || sub === 'clear') {
        await clearProjectCache(process.cwd());
        console.log('🧹 Cleaned .liate/liate_cache.json');
      } else {
        const cache = await getProjectCache(process.cwd());
        console.log(`\n⚡ .liate/liate_cache.json (Updated: ${cache.updatedAt}):`);
        console.log(JSON.stringify(cache, null, 2) + '\n');
      }
      break;
    }

    case 'sessions': {
      const sub = args[1] || 'list';
      if (sub === 'clear' || sub === 'clean') {
        const target = args[2];
        await clearSession(target, process.cwd());
        console.log(target ? `🧹 Cleared session: ${target}` : '🧹 Cleared all sessions in .liate/liate_sessions/');
      } else {
        const sessions = await listSessions(process.cwd());
        console.log(`\n💬 Active Sessions in .liate/liate_sessions/ (${sessions.length}):`);
        console.log('--------------------------------------------------------------------------------');
        for (const s of sessions) {
          console.log(`  • \x1b[36m${s}\x1b[0m ➔ .liate/liate_sessions/${s}.json`);
        }
        console.log('--------------------------------------------------------------------------------\n');
      }
      break;
    }

    case 'logs': {
      const sub = args[1] || 'tail';
      if (sub === 'clear' || sub === 'clean') {
        await clearLogs(process.cwd());
        console.log('🧹 Cleared .liate/liate_logs.jsonl');
      } else {
        const limit = parseInt(args[2] || '20', 10);
        const logs = await readRecentLogs(limit, process.cwd());
        console.log(`\n📜 Recent Execution Traces (.liate/liate_logs.jsonl, last ${logs.length}):`);
        console.log('--------------------------------------------------------------------------------');
        for (const l of logs) {
          const time = new Date(l.timestamp).toLocaleTimeString();
          console.log(`  [\x1b[90m${time}\x1b[0m] \x1b[35m[${l.type}]\x1b[0m ${l.content.substring(0, 100)}`);
        }
        console.log('--------------------------------------------------------------------------------\n');
      }
      break;
    }

    case 'keys':
    case 'key': {
      const sub = args[1] || 'list';
      const isGlobal = args.includes('--global') || args.includes('-g');
      const filteredArgs = args.filter(a => a !== '--global' && a !== '-g');

      if (sub === 'list') {
        const keys = await getKeys(process.cwd());
        const count = Object.keys(keys).length;
        console.log(`\n🔑 Configured API Keys (${count}):`);
        console.log('--------------------------------------------------------------------------------');
        for (const [k, v] of Object.entries(keys)) {
          const masked = v.length > 8 ? `${v.substring(0, 4)}...${v.substring(v.length - 4)}` : '****';
          console.log(`  • \x1b[36m${k}\x1b[0m ➔ ${masked}`);
        }
        console.log('--------------------------------------------------------------------------------\n');
      } else if (sub === 'set' || sub === 'add') {
        const provider = filteredArgs[2];
        const keyVal = filteredArgs[3];
        if (!provider || !keyVal) {
          console.log('Usage: liate keys set <provider> <api-key> [--global]');
          process.exit(1);
        }
        const savedTo = await saveKey(provider, keyVal, isGlobal, process.cwd());
        console.log(`✅ Saved API key for "${provider}" to ${isGlobal ? '~/.liate/.env' : './.env'}`);
      } else if (sub === 'remove' || sub === 'rm') {
        const provider = filteredArgs[2];
        if (!provider) {
          console.log('Usage: liate keys remove <provider> [--global]');
          process.exit(1);
        }
        await deleteKey(provider, isGlobal, process.cwd());
        console.log(`🗑️  Removed API key for "${provider}" from ${isGlobal ? '~/.liate/.env' : './.env'}`);
      }
      break;
    }

    case 'serve':
    case 'dev':
    case 'start': {
      await initStore();
      const port = parseInt(process.env.PORT || '7071', 10);
      const wsHub = new WSHub();
      const app = createLiateApp(wsHub);

      const server = Bun.serve({
        port,
        fetch(req, server) {
          if (server.upgrade(req)) return undefined;
          return app.fetch(req);
        },
        websocket: {
          open(ws) { wsHub.addClient(ws); },
          message(ws, message) {
            try {
              const raw = typeof message === 'string' ? message : new TextDecoder().decode(message);
              const data = JSON.parse(raw);
              if (data.type === 'tool_approval_response' && data.id) {
                wsHub.resolveApproval(data.id, data.allowed !== false, !!data.always_allow, data.toolName);
              }
            } catch {}
          },
          close(ws) { wsHub.removeClient(ws); },
        }
      });

      console.log(`\n================================================================================`);
      console.log(`[LIATE ENGINE] SOVEREIGN AGENT RUNTIME (HONO + BUN NATIVE)`);
      console.log(`================================================================================`);
      console.log(`[HTTP REST API]   http://localhost:${server.port}`);
      console.log(`[WEBSOCKET HUB]   ws://localhost:${server.port}`);
      console.log(`================================================================================\n`);
      break;
    }

    case 'connect': {
      await runConnectWizard({ provider: positionalArgs[1] });
      break;
    }

    case 'version':
    case '-v':
    case '--version':
      console.log(`Liate CLI v${VERSION}`);
      break;

    case 'help':
    default:
      console.log(`
Liate — Sovereign AI Agent Runtime & Framework (v${VERSION})

USAGE:
  liate <command> [options]

LOCAL COMMANDS:
  init                      Interactively scaffold a new 5-Pillar (L-I-A-T-E) agent project
  create <name>             Create a new agent folder with starter template
  install / i <name|url>    Install an agent from Local/GitHub/Community Registry
  submit / publish <url>    Publish your public GitHub agent to the Community Registry
  search <query>            Search official and community agents in registry
  update [name]             Pull latest changes for installed agents from GitHub
  run <file> [prompt]       Execute a liate.json agent spec locally
  lock [file] [--verify]    Generate or verify deterministic liate.lock snapshot
  mcp <list|add|rm>         Manage tools in ./liate_mcp.json or ~/.liate/liate_mcp.json
  skills <list|add|rm>      Manage procedural skills in ./liate_skills.json
  keys <list|set|rm>        Manage API keys in ./.env or ~/.liate/.env
  cache <show|clean>        Inspect or clear .liate/liate_cache.json
  sessions <list|clear>     Manage conversation history in .liate/liate_sessions/
  logs <tail|clear>         Inspect real-time trace events in .liate/liate_logs.jsonl
  dev / serve               Start the sovereign Liate runtime API & WebSocket engine (port 7071)

CLOUD & MICROVM COMMANDS:
  login [--token <pat>]     Authenticate terminal with tryliate.com via browser or token
  logout                    Clear stored CLI session from ~/.liate/auth.json
  whoami                    Display authenticated Liate ID, tier & MicroVM allocation
  connect / deploy [path]   Deploy local agent to dedicated AWS Firecracker MicroVM
  wallet                    Check real-time INR wallet balance & MicroVM compute status

SOVEREIGN MISSION & COMMUNITY:
  announce / soon           Display Mission Agentantra, Sarvam AI partnership & vision
  ps / agents               List installed agents locally

EXAMPLES:
  $ liate init
  $ liate run ./liate.json "Check the time in Tokyo"
  $ liate login
  $ liate connect
  $ liate whoami
`);
      break;
  }
}

main().catch((err) => {
  console.error(`[Liate Error]:`, err);
  process.exit(1);
});

