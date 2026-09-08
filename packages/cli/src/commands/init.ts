import fs from 'fs/promises';
import path from 'path';
import * as p from '@clack/prompts';
import type { LiateConfig } from '@liate/runtime';
import { VERSION } from '../utils';

/**
 * 5-Pillar Interactive Scaffolder (L-I-A-T-E)
 */
export async function scaffoldWizard(targetDirName?: string, isYes: boolean = false, explicitModel?: string): Promise<void> {
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
  \x1b[35mliate soon        (Preview Sovereign Cloud & Early Access)\x1b[0m`);
}
