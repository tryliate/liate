import path from 'node:path';
import os from 'node:os';

// Resolve the .liate directory safely (safe on Deno Deploy / Edge sandboxes)
function getHomeDir(): string {
  try {
    return os.homedir?.() || process.env.HOME || process.env.USERPROFILE || '/tmp';
  } catch {
    return process.env.HOME || process.env.USERPROFILE || '/tmp';
  }
}

const HOME_DIR = getHomeDir();
export const LIATE_DIR = path.join(HOME_DIR, '.liate');

export const ENV_FILE = path.join(LIATE_DIR, '.env');

// Global paths (~/.liate/)
export const GLOBAL_MCP_FILE = path.join(LIATE_DIR, 'liate_mcp.json');
export const MCP_FILE = GLOBAL_MCP_FILE; // Alias for backward compatibility
export const GLOBAL_SKILLS_FILE = path.join(LIATE_DIR, 'liate_skills.json');
export const SKILLS_FILE = GLOBAL_SKILLS_FILE; // Alias for backward compatibility
export const AGENTS_DIR = path.join(LIATE_DIR, 'agents');
export const AGENTS_FILE = path.join(LIATE_DIR, 'agents.json');
export const SKILLS_DIR = path.join(LIATE_DIR, 'skills');

// Project-level paths (./ in working directory)
export const getProjectMcpPath = (cwd: string = process.cwd()) => path.join(cwd, 'liate_mcp.json');
export const getProjectSkillsPath = (cwd: string = process.cwd()) => path.join(cwd, 'liate_skills.json');
export const getProjectLockPath = (cwd: string = process.cwd()) => path.join(cwd, 'liate.lock');

// Runtime cache, sessions & logs inside ./.liate/
export const getProjectLiateDir = (cwd: string = process.cwd()) => path.join(cwd, '.liate');
export const getProjectCacheFile = (cwd: string = process.cwd()) => path.join(cwd, '.liate', 'liate_cache.json');
export const getProjectSessionsDir = (cwd: string = process.cwd()) => path.join(cwd, '.liate', 'liate_sessions');
export const getProjectSessionsFile = (cwd: string = process.cwd()) => path.join(cwd, '.liate', 'liate_sessions.json');
export const getProjectLogsFile = (cwd: string = process.cwd()) => path.join(cwd, '.liate', 'liate_logs.jsonl');
