#!/usr/bin/env bun
/**
 * Liate CLI
 * Sovereign AI Agent Engine & Project Scaffolder
 */

import { scaffoldWizard } from './commands/init';
import { runCommand } from './commands/run';
import { serveCommand } from './commands/serve';
import { loginCommand, whoamiCommand, logoutCommand, walletCommand } from './commands/auth';
import { deployCommand, connectCommand } from './commands/deploy';
import { installCommand, submitCommand, searchCommand, updateCommand, psCommand } from './commands/registry';
import { mcpCommand, skillsCommand } from './commands/tools';
import { keysCommand, lockCommand, cacheCommand, sessionsCommand, logsCommand } from './commands/state';
import { helpCommand, versionCommand, soonCommand } from './commands/help';

export * from './utils';

const knownCommands = [
  'init', 'create', 'run', 'install', 'i', 'submit', 'publish', 'search', 'update', 'upgrade',
  'serve', 'dev', 'start', 'soon', '--soon', 'announce', 'mission', 'cloud',
  'login', 'logout', 'whoami', 'wallet', 'connect', 'deploy', 'ps', 'agents',
  'mcp', 'skills', 'keys', 'key', 'cache', 'sessions',
  'logs', 'lock', 'version', '-v', '--version', 'help', '-h', '--help'
];

/**
 * Main CLI Router
 */
async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2);
  const isYes = rawArgs.includes('-y') || rawArgs.includes('--yes');
  const args = rawArgs.filter(a => a !== '-y' && a !== '--yes');

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
    case 'init':
    case 'create':
      await scaffoldWizard(positionalArgs[1], isYes, explicitModel);
      break;

    case 'run':
      await runCommand(args);
      break;

    case 'install':
    case 'i':
      await installCommand(args);
      break;

    case 'submit':
    case 'publish':
      await submitCommand(args);
      break;

    case 'search':
      await searchCommand(args);
      break;

    case 'update':
    case 'upgrade':
      await updateCommand(args);
      break;

    case 'ps':
    case 'agents':
      await psCommand();
      break;

    case 'serve':
    case 'dev':
    case 'start':
      await serveCommand(args);
      break;

    case 'login':
      await loginCommand(args);
      break;

    case 'whoami':
      await whoamiCommand();
      break;

    case 'logout':
      await logoutCommand();
      break;

    case 'wallet':
      await walletCommand();
      break;

    case 'deploy':
      await deployCommand(args);
      break;

    case 'connect':
      await connectCommand(args);
      break;

    case 'mcp':
      await mcpCommand(args);
      break;

    case 'skills':
      await skillsCommand(args);
      break;

    case 'keys':
    case 'key':
      await keysCommand(args);
      break;

    case 'lock':
      await lockCommand(args);
      break;

    case 'cache':
      await cacheCommand(args);
      break;

    case 'sessions':
      await sessionsCommand(args);
      break;

    case 'logs':
      await logsCommand(args);
      break;

    case 'soon':
    case '--soon':
    case 'announce':
    case 'mission':
    case 'cloud':
      soonCommand();
      break;

    case 'version':
    case '-v':
    case '--version':
      versionCommand();
      break;

    case 'help':
    case '-h':
    case '--help':
    default:
      helpCommand();
      break;
  }
}

// Execute when invoked as entrypoint
main().catch((err) => {
  console.error('\n[Liate Fatal Error]:', err.message || err);
  process.exit(1);
});
