import fs from 'node:fs/promises';
import path from 'node:path';
import { parseGithubTarget } from './github';
import { LIATE_DIR } from './paths';

export interface CommunityAgentEntry {
  name: string;
  version: string;
  intent: string;
  repository: string;
  author: string;
  model: string;
  submitted_at: string;
}

const GLOBAL_COMMUNITY_FILE = path.join(LIATE_DIR, 'community_agents.json');
const currentDir = (import.meta as any).dirname || process.cwd();
const CATALOG_COMMUNITY_FILE = path.resolve(currentDir, '..', '..', 'catalog', 'community', 'agents.json');

/**
 * Loads all community registered agents
 */
export async function getCommunityAgents(): Promise<CommunityAgentEntry[]> {
  const map: Map<string, CommunityAgentEntry> = new Map();

  // 1. Read from catalog/community/agents.json if present
  try {
    const raw = await fs.readFile(CATALOG_COMMUNITY_FILE, 'utf-8');
    const data = JSON.parse(raw);
    const list: CommunityAgentEntry[] = Array.isArray(data) ? data : data.agents || [];
    for (const a of list) {
      if (a.name) map.set(a.name.toLowerCase(), a);
    }
  } catch {}

  // 2. Read from ~/.liate/community_agents.json if present
  try {
    const raw = await fs.readFile(GLOBAL_COMMUNITY_FILE, 'utf-8');
    const data = JSON.parse(raw);
    const list: CommunityAgentEntry[] = Array.isArray(data) ? data : data.agents || [];
    for (const a of list) {
      if (a.name) map.set(a.name.toLowerCase(), a);
    }
  } catch {}

  return Array.from(map.values());
}

/**
 * Finds a community agent by name
 */
export async function findCommunityAgent(name: string): Promise<CommunityAgentEntry | null> {
  const all = await getCommunityAgents();
  return all.find(a => a.name.toLowerCase() === name.toLowerCase()) || null;
}

/**
 * Searches community agents by keyword query
 */
export async function searchCommunityAgents(query: string): Promise<CommunityAgentEntry[]> {
  const all = await getCommunityAgents();
  const q = query.trim().toLowerCase();
  if (!q) return all;

  return all.filter(a => {
    return (
      a.name.toLowerCase().includes(q) ||
      a.intent.toLowerCase().includes(q) ||
      a.author.toLowerCase().includes(q) ||
      a.model.toLowerCase().includes(q) ||
      a.repository.toLowerCase().includes(q)
    );
  });
}

/**
 * Submits and registers a GitHub agent into the Liate Community Registry Index
 */
export async function submitAgentToRegistry(
  githubTarget: string
): Promise<{ success: boolean; entry?: CommunityAgentEntry; message: string }> {
  const target = parseGithubTarget(githubTarget);
  if (!target) {
    return {
      success: false,
      message: `Invalid GitHub target: "${githubTarget}". Expected format: https://github.com/owner/repo or github:owner/repo`,
    };
  }

  const { owner, repo, branch, subPath } = target;
  const rawBase = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}`;
  const manifestUrl = subPath ? `${rawBase}/${subPath}/liate.json` : `${rawBase}/liate.json`;

  let manifest: any = null;
  try {
    const res = await fetch(manifestUrl, {
      headers: { 'User-Agent': 'LiateCLI/1.0' },
    });

    if (!res.ok) {
      return {
        success: false,
        message: `Could not find liate.json at ${manifestUrl} (HTTP ${res.status}). Make sure the repository is public and contains liate.json.`,
      };
    }

    const text = await res.text();
    manifest = JSON.parse(text);
  } catch (err: any) {
    return {
      success: false,
      message: `Failed to fetch or parse liate.json: ${err.message}`,
    };
  }

  const agentName = manifest.name || manifest.A?.name || repo;
  const version = manifest.version || manifest.A?.version || '1.0.0';
  const intent = manifest.A?.intent || manifest.A?.role || manifest.description || 'Sovereign Community Agent';
  const model = manifest.L || manifest.model || 'sarvam/sarvam-105b';

  const entry: CommunityAgentEntry = {
    name: agentName,
    version,
    intent,
    repository: `https://github.com/${owner}/${repo}${subPath ? `/tree/${branch}/${subPath}` : ''}`,
    author: owner,
    model,
    submitted_at: new Date().toISOString(),
  };

  // 1. Save to catalog/community/agents.json if accessible
  try {
    await fs.mkdir(path.dirname(CATALOG_COMMUNITY_FILE), { recursive: true });
    let currentCatalog: CommunityAgentEntry[] = [];
    try {
      const existing = await fs.readFile(CATALOG_COMMUNITY_FILE, 'utf-8');
      const parsed = JSON.parse(existing);
      currentCatalog = Array.isArray(parsed) ? parsed : parsed.agents || [];
    } catch {}

    const updatedCatalog = currentCatalog.filter(a => a.name.toLowerCase() !== agentName.toLowerCase());
    updatedCatalog.push(entry);
    await fs.writeFile(CATALOG_COMMUNITY_FILE, JSON.stringify({ agents: updatedCatalog }, null, 2), 'utf-8');
  } catch {}

  // 2. Save to ~/.liate/community_agents.json
  try {
    await fs.mkdir(path.dirname(GLOBAL_COMMUNITY_FILE), { recursive: true });
    let currentGlobal: CommunityAgentEntry[] = [];
    try {
      const existing = await fs.readFile(GLOBAL_COMMUNITY_FILE, 'utf-8');
      const parsed = JSON.parse(existing);
      currentGlobal = Array.isArray(parsed) ? parsed : parsed.agents || [];
    } catch {}

    const updatedGlobal = currentGlobal.filter(a => a.name.toLowerCase() !== agentName.toLowerCase());
    updatedGlobal.push(entry);
    await fs.writeFile(GLOBAL_COMMUNITY_FILE, JSON.stringify({ agents: updatedGlobal }, null, 2), 'utf-8');
  } catch {}

  return {
    success: true,
    entry,
    message: `Agent "${agentName}" (v${version}) submitted successfully to the Liate Community Registry!`,
  };
}
