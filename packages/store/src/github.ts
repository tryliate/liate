import fs from 'fs/promises';
import path from 'path';
import AdmZip from 'adm-zip';

export interface GithubTarget {
  owner: string;
  repo: string;
  branch: string;
  subPath?: string;
  tag?: string;
}

/**
 * Builds request headers for GitHub requests, including GITHUB_TOKEN if available.
 */
export function getGithubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'User-Agent': 'LiateCLI/1.0',
  };
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

/**
 * Parses GitHub target strings like:
 * - github:tryliate/agents/raksha
 * - github:tryliate/agents/raksha@v1.2.0
 * - tryliate/agents/raksha
 * - tryliate/raksha-agent@v1.0.0
 * - https://github.com/tryliate/agents/tree/main/raksha
 */
export function parseGithubTarget(target: string): GithubTarget | null {
  let cleaned = target.trim();
  let tagOrBranch = 'main';

  // Extract @tag or @branch if specified (e.g. repo@v1.0.0 or path@v1.0.0)
  if (cleaned.includes('@') && !cleaned.startsWith('@')) {
    const atParts = cleaned.split('@');
    cleaned = atParts[0];
    tagOrBranch = atParts[1];
  }

  if (cleaned.startsWith('github:')) {
    cleaned = cleaned.replace(/^github:/, '');
  } else if (cleaned.startsWith('https://github.com/')) {
    cleaned = cleaned.replace(/^https:\/\/github\.com\//, '');
  }

  // Check URL pattern with tree/branch (e.g. owner/repo/tree/v1.0.0/subpath)
  const treeMatch = cleaned.match(/^([^/]+)\/([^/]+)\/tree\/([^/]+)(\/(.+))?$/);
  if (treeMatch) {
    return {
      owner: treeMatch[1],
      repo: treeMatch[2],
      branch: treeMatch[3],
      subPath: treeMatch[5] || '',
      tag: treeMatch[3],
    };
  }

  const parts = cleaned.split('/').filter(Boolean);
  if (parts.length === 2) {
    return {
      owner: parts[0],
      repo: parts[1],
      branch: tagOrBranch,
      tag: tagOrBranch !== 'main' ? tagOrBranch : undefined,
    };
  } else if (parts.length >= 3) {
    return {
      owner: parts[0],
      repo: parts[1],
      branch: tagOrBranch,
      subPath: parts.slice(2).join('/'),
      tag: tagOrBranch !== 'main' ? tagOrBranch : undefined,
    };
  }

  return null;
}

/**
 * Fetches an agent definition and its files directly from GitHub
 */
export async function fetchAgentFromGithub(
  target: string,
  destDir: string
): Promise<{ success: boolean; source: string; version?: string }> {
  // 1. Check if target is an explicit GitHub shorthand / URL
  let ghTarget = parseGithubTarget(target);

  // 2. If single word (e.g. 'raksha'), try the official Sovereign Registry monorepo: tryliate/agents
  if (!ghTarget && !target.includes('/') && !target.includes('\\')) {
    const [rawName, rawTag] = target.split('@');
    ghTarget = {
      owner: 'tryliate',
      repo: 'agents',
      branch: rawTag || 'main',
      subPath: rawName,
      tag: rawTag,
    };
  }

  if (!ghTarget) return { success: false, source: '' };

  const { owner, repo, branch, subPath } = ghTarget;
  const rawBase = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}`;
  const manifestUrl = subPath ? `${rawBase}/${subPath}/liate.json` : `${rawBase}/liate.json`;
  const headers = getGithubHeaders();

  try {
    const res = await fetch(manifestUrl, { headers });

    if (res.ok) {
      const manifestText = await res.text();
      const manifest = JSON.parse(manifestText);

      await fs.mkdir(destDir, { recursive: true });
      await fs.writeFile(path.join(destDir, 'liate.json'), manifestText, 'utf-8');

      // Attempt to download skills.md if present
      const skillsUrl = subPath ? `${rawBase}/${subPath}/skills.md` : `${rawBase}/skills.md`;
      try {
        const skillsRes = await fetch(skillsUrl, { headers });
        if (skillsRes.ok) {
          const skillsText = await skillsRes.text();
          await fs.writeFile(path.join(destDir, 'skills.md'), skillsText, 'utf-8');
        }
      } catch {}

      const sourceDescription = subPath ? `${owner}/${repo}/${subPath}` : `${owner}/${repo}`;
      const versionStr = manifest.version || manifest.A?.version || (branch !== 'main' ? branch : '1.0.0');
      return { success: true, source: `github.com/${sourceDescription}@${branch}`, version: versionStr };
    }
  } catch {}

  // 3. Fallback: If it's a whole standalone repository, download the ZIP archive from GitHub
  if (!subPath) {
    try {
      const zipUrl = `https://github.com/${owner}/${repo}/archive/refs/heads/${branch}.zip`;
      let zipRes = await fetch(zipUrl, { headers });

      // If branch download failed, try tag ref: /archive/refs/tags/${branch}.zip
      if (!zipRes.ok) {
        const tagZipUrl = `https://github.com/${owner}/${repo}/archive/refs/tags/${branch}.zip`;
        zipRes = await fetch(tagZipUrl, { headers });
      }

      if (zipRes.ok) {
        const arrayBuffer = await zipRes.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const zip = new AdmZip(buffer);

        const tempDir = path.join(destDir, `_temp_${Date.now()}`);
        zip.extractAllTo(tempDir, true);

        // Find extracted folder
        const entries = await fs.readdir(tempDir, { withFileTypes: true });
        const rootFolder = entries.find((e) => e.isDirectory());
        const extractedRoot = rootFolder ? path.join(tempDir, rootFolder.name) : tempDir;

        // Copy files to target destination
        await fs.mkdir(destDir, { recursive: true });
        await fs.cp(extractedRoot, destDir, { recursive: true });
        await fs.rm(tempDir, { recursive: true, force: true });

        return { success: true, source: `github.com/${owner}/${repo}@${branch}` };
      }
    } catch {}
  }

  return { success: false, source: '' };
}
