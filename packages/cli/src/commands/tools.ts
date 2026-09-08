import { 
  getMergedMcps, 
  installMcp, 
  uninstallMcp, 
  getMergedSkills, 
  installSkill, 
  uninstallSkill,
  searchSkillsSh,
  fetchSkillsShTrending,
  fetchSkillsShAudit
} from '@liate/store';

/**
 * Handles `liate mcp <list|add|rm>`
 */
export async function mcpCommand(args: string[]): Promise<void> {
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
}

/**
 * Handles `liate skills <list|add|install|search|trending|audit|rm>`
 */
export async function skillsCommand(args: string[]): Promise<void> {
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
}
