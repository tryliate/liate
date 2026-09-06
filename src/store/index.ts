import fs from 'fs/promises';
import { LIATE_DIR, AGENTS_DIR, SKILLS_DIR, ENV_FILE, MCP_FILE, SKILLS_FILE, AGENTS_FILE } from './paths';

export * from './paths';
export * from './keys';
export * from './mcps';
export * from './skills';
export * from './agents';
export * from './cache';
export * from './sessions';
export * from './logs';
export * from './vectors';
export * from './github';
export * from './community';
export * from './auth';


/**
 * Ensures the sovereign .liate storage directory structure and default config files exist
 */
export async function initStore(): Promise<void> {
  await fs.mkdir(LIATE_DIR, { recursive: true });
  await fs.mkdir(AGENTS_DIR, { recursive: true });
  await fs.mkdir(SKILLS_DIR, { recursive: true });

  // Ensure config files exist
  try { await fs.access(ENV_FILE); } catch { await fs.writeFile(ENV_FILE, '', 'utf-8'); }
  try { await fs.access(MCP_FILE); } catch { await fs.writeFile(MCP_FILE, '{}', 'utf-8'); }
  try { await fs.access(SKILLS_FILE); } catch { await fs.writeFile(SKILLS_FILE, '[]', 'utf-8'); }
  try { await fs.access(AGENTS_FILE); } catch { await fs.writeFile(AGENTS_FILE, '[]', 'utf-8'); }
}
