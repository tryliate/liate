import fs from 'fs/promises';
import path from 'path';
import { getProjectCacheFile, getProjectLiateDir } from './paths';

export interface LiateCache {
  version: string;
  updatedAt: string;
  mcpToolsCache?: Record<string, any[]>;
  metrics?: {
    totalPromptTokens?: number;
    totalCompletionTokens?: number;
    totalRuns?: number;
    lastLatencyMs?: number;
  };
}

export async function getProjectCache(cwd: string = process.cwd()): Promise<LiateCache> {
  const cachePath = getProjectCacheFile(cwd);
  try {
    const raw = await fs.readFile(cachePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {
      version: '1.0',
      updatedAt: new Date().toISOString(),
      mcpToolsCache: {},
      metrics: {
        totalPromptTokens: 0,
        totalCompletionTokens: 0,
        totalRuns: 0
      }
    };
  }
}

export async function updateProjectCache(
  patch: Partial<LiateCache>, 
  cwd: string = process.cwd()
): Promise<LiateCache> {
  const cache = await getProjectCache(cwd);
  const updated: LiateCache = {
    ...cache,
    ...patch,
    updatedAt: new Date().toISOString(),
    mcpToolsCache: {
      ...(cache.mcpToolsCache || {}),
      ...(patch.mcpToolsCache || {})
    },
    metrics: {
      ...(cache.metrics || {}),
      ...(patch.metrics || {})
    }
  };

  const cachePath = getProjectCacheFile(cwd);
  await fs.mkdir(path.dirname(cachePath), { recursive: true });
  await fs.writeFile(cachePath, JSON.stringify(updated, null, 2), 'utf-8');
  return updated;
}

export async function clearProjectCache(cwd: string = process.cwd()): Promise<void> {
  const cachePath = getProjectCacheFile(cwd);
  try {
    await fs.rm(cachePath, { force: true });
  } catch {}
}


