import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { 
  fetchAgentFromGithub, 
  findCommunityAgent, 
  submitAgentToRegistry, 
  searchCommunityAgents, 
  getInstalledAgents 
} from '@liate/store';

/**
 * Installs an agent from local catalog, GitHub, or Community Registry
 */
export async function installCommand(args: string[]): Promise<void> {
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
}

/**
 * Submits an agent to the community registry
 */
export async function submitCommand(args: string[]): Promise<void> {
  let targetRepo = args[1];
  if (!targetRepo) {
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
}

/**
 * Searches official and community registry for agents
 */
export async function searchCommand(args: string[]): Promise<void> {
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
}

/**
 * Updates installed agents from upstream repositories
 */
export async function updateCommand(args: string[]): Promise<void> {
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
      return;
    }
  }

  if (targetsToUpdate.length === 0) {
    console.log('\nNo agents found to update. Usage: liate update [agent-name]\n');
    return;
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
}

/**
 * Lists installed agents locally
 */
export async function psCommand(): Promise<void> {
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
}
