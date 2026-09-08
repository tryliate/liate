import fs from 'fs/promises';
import path from 'path';
import type { LiateConfig } from '@liate/runtime';
import { 
  getKeys, 
  saveKey, 
  deleteKey, 
  generateLiateLock, 
  verifyLiateLock, 
  getProjectCache, 
  clearProjectCache, 
  listSessions, 
  clearSession, 
  readRecentLogs, 
  clearLogs 
} from '@liate/store';

/**
 * Handles `liate keys <list|set|rm>`
 */
export async function keysCommand(args: string[]): Promise<void> {
  const sub = args[1] || 'list';
  const isGlobal = args.includes('--global') || args.includes('-g');
  const filteredArgs = args.filter(a => a !== '--global' && a !== '-g');

  if (sub === 'list') {
    const keys = await getKeys(process.cwd());
    const count = Object.keys(keys).length;
    console.log(`\n🔑 Configured API Keys (${count}):`);
    console.log('--------------------------------------------------------------------------------');
    for (const [k, v] of Object.entries(keys)) {
      const val = String(v || '');
      const masked = val.length > 8 ? `${val.substring(0, 4)}...${val.substring(val.length - 4)}` : '****';
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
    await saveKey(provider, keyVal, isGlobal, process.cwd());
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
}

/**
 * Handles `liate lock <file> [--verify]`
 */
export async function lockCommand(args: string[]): Promise<void> {
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
}

/**
 * Handles `liate cache <show|clean>`
 */
export async function cacheCommand(args: string[]): Promise<void> {
  const sub = args[1] || 'show';
  if (sub === 'clean' || sub === 'clear') {
    await clearProjectCache(process.cwd());
    console.log('🧹 Cleaned .liate/liate_cache.json');
  } else {
    const cache = await getProjectCache(process.cwd());
    console.log(`\n⚡ .liate/liate_cache.json (Updated: ${cache.updatedAt}):`);
    console.log(JSON.stringify(cache, null, 2) + '\n');
  }
}

/**
 * Handles `liate sessions <list|clean>`
 */
export async function sessionsCommand(args: string[]): Promise<void> {
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
}

/**
 * Handles `liate logs <tail|clean>`
 */
export async function logsCommand(args: string[]): Promise<void> {
  const sub = args[1] || 'tail';
  if (sub === 'clear' || sub === 'clean') {
    await clearLogs(process.cwd());
    console.log('🧹 Cleaned .liate/liate_logs.jsonl');
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
}
