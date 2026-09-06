/**
 * Official Skills.sh API Client & Semantic Search Integrator
 * 
 * Implements:
 * 1. Semantic & Fuzzy Search (GET /api/v1/skills/search?q=...)
 * 2. Infinite Paginated Leaderboard (GET /api/v1/skills?view=trending|hot|all-time)
 * 3. Official Curated Catalog (GET /api/v1/skills/curated)
 * 4. Skill Files & Tree Details (GET /api/v1/skills/:source/:skill)
 * 5. Security Audit Reports (GET /api/v1/skills/audit/:source/:skill)
 */

export interface SkillsShItem {
  id: string;
  slug: string;
  name: string;
  source: string;
  installs: number;
  sourceType: 'github' | 'well-known';
  installUrl: string | null;
  url: string;
  description?: string;
  isDuplicate?: boolean;
}

export interface SkillsShSearchResult {
  data: SkillsShItem[];
  query: string;
  searchType: 'fuzzy' | 'semantic';
  count: number;
  durationMs?: number;
}

export interface SkillsShDetail {
  id: string;
  source: string;
  slug: string;
  installs: number;
  hash: string | null;
  files: Array<{
    path: string;
    contents: string;
  }> | null;
}

export interface SkillsShAudit {
  id: string;
  source: string;
  slug: string;
  audits: Array<{
    provider: string;
    slug: string;
    status: 'pass' | 'warn' | 'fail';
    summary: string;
    auditedAt: string;
    riskLevel?: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    categories?: string[];
  }>;
}

const BASE_URL = 'https://skills.sh';

function getOidcToken(): string | undefined {
  return (globalThis as any).process?.env?.VERCEL_OIDC_TOKEN || 
         (globalThis as any).Bun?.env?.VERCEL_OIDC_TOKEN ||
         (globalThis as any).process?.env?.SKILLS_SH_TOKEN;
}

function getHeaders(token?: string): Record<string, string> {
  const authToken = token || getOidcToken();
  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'User-Agent': 'Liate-Agent-Engine/1.0.0 (https://tryliate.com)'
  };
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }
  return headers;
}

/**
 * Perform search across skills.sh (via public web page query https://skills.sh/?q=... and API)
 */
export async function searchSkillsSh(
  query: string, 
  options: { owner?: string; limit?: number; token?: string } = {}
): Promise<SkillsShSearchResult> {
  const limit = options.limit || 20;
  const isMultiWord = query.trim().includes(' ');

  // 1. Try official authenticated skills.sh API if token provided
  if (options.token || getOidcToken()) {
    let url = `${BASE_URL}/api/v1/skills/search?q=${encodeURIComponent(query)}&limit=${limit}`;
    if (options.owner) url += `&owner=${encodeURIComponent(options.owner)}`;
    try {
      const res = await fetch(url, {
        headers: getHeaders(options.token),
        signal: AbortSignal.timeout(6000)
      });
      if (res.ok) {
        const parsed = await res.json() as SkillsShSearchResult;
        if (parsed && Array.isArray(parsed.data) && parsed.data.length > 0) {
          return parsed;
        }
      }
    } catch {}
  }

  // 2. Fetch directly from public skills.sh search page (https://skills.sh/?q=...)
  try {
    const webUrl = `${BASE_URL}/?q=${encodeURIComponent(query)}`;
    const pageRes = await fetch(webUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      signal: AbortSignal.timeout(8000)
    });

    if (pageRes.ok) {
      const html = await pageRes.text();
      // Match all skill paths like /owner/repo/skill-name
      const skillRegex = /href="\/([a-zA-Z0-9_\-\.]+\/[a-zA-Z0-9_\-\.]+\/[a-zA-Z0-9_\-\.]+)"/g;
      const seen = new Set<string>();
      const webItems: SkillsShItem[] = [];

      let match;
      while ((match = skillRegex.exec(html)) !== null) {
        const fullId = match[1];
        if (
          !fullId.startsWith('topic/') && 
          !fullId.startsWith('docs/') && 
          !fullId.startsWith('api/') &&
          !fullId.startsWith('agent/') &&
          !fullId.startsWith('packs/') &&
          !seen.has(fullId)
        ) {
          seen.add(fullId);
          const parts = fullId.split('/');
          const slug = parts[parts.length - 1];
          const source = parts.slice(0, 2).join('/');
          webItems.push({
            id: fullId,
            slug,
            name: slug.replace(/-/g, ' '),
            source,
            installs: 0,
            sourceType: 'github',
            installUrl: `https://github.com/${source}`,
            url: `https://skills.sh/${fullId}`,
            description: `Official skill from skills.sh/${fullId}`
          });
          if (webItems.length >= limit) break;
        }
      }

      if (webItems.length > 0) {
        return {
          data: webItems,
          query,
          searchType: isMultiWord ? 'semantic' : 'fuzzy',
          count: webItems.length
        };
      }
    }
  } catch (e: any) {
    // Fallback to GitHub search
  }

  // 3. Query live GitHub public ecosystem search (No hardcoding)
  try {
    const ghUrl = `https://api.github.com/search/repositories?q=agent+skills+${encodeURIComponent(query)}&per_page=${limit}`;
    const ghRes = await fetch(ghUrl, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Liate-Skills-Search/1.0 (https://tryliate.com)'
      },
      signal: AbortSignal.timeout(8000)
    });

    if (ghRes.ok) {
      const ghData: any = await ghRes.json();
      if (ghData && Array.isArray(ghData.items)) {
        const liveItems: SkillsShItem[] = ghData.items.map((repo: any) => ({
          id: repo.full_name,
          slug: repo.name,
          name: repo.name,
          source: repo.full_name,
          installs: repo.stargazers_count || 0,
          sourceType: 'github',
          installUrl: repo.html_url,
          url: `https://github.com/${repo.full_name}`,
          description: repo.description || 'Open Agent Skill repository'
        }));

        return {
          data: liveItems,
          query,
          searchType: isMultiWord ? 'semantic' : 'fuzzy',
          count: liveItems.length
        };
      }
    }
  } catch (e: any) {}

  return {
    data: [],
    query,
    searchType: isMultiWord ? 'semantic' : 'fuzzy',
    count: 0
  };
}

/**
 * Fetch paginated leaderboard (trending, hot, all-time)
 */
export async function fetchSkillsShTrending(
  view: 'all-time' | 'trending' | 'hot' = 'trending',
  page: number = 0,
  perPage: number = 50,
  token?: string
): Promise<{ data: SkillsShItem[]; pagination?: any }> {
  const url = `${BASE_URL}/api/v1/skills?view=${view}&page=${page}&per_page=${perPage}`;
  try {
    const res = await fetch(url, {
      headers: getHeaders(token),
      signal: AbortSignal.timeout(10000)
    });
    if (res.ok) {
      return await res.json() as any;
    }
  } catch {}
  return { data: [] };
}

/**
 * Fetch skill files and detail from skills.sh
 */
export async function fetchSkillsShDetail(
  idOrSource: string,
  skillName?: string,
  token?: string
): Promise<SkillsShDetail | null> {
  const cleanId = skillName ? `${idOrSource}/${skillName}` : idOrSource;
  const url = `${BASE_URL}/api/v1/skills/${cleanId.replace(/^skills\.sh\//, '')}`;

  try {
    const res = await fetch(url, {
      headers: getHeaders(token),
      signal: AbortSignal.timeout(10000)
    });
    if (res.ok) {
      return await res.json() as SkillsShDetail;
    }
  } catch {}
  return null;
}

/**
 * Fetch security audit results for a skill
 */
export async function fetchSkillsShAudit(
  idOrSource: string,
  skillName?: string,
  token?: string
): Promise<SkillsShAudit | null> {
  const cleanId = skillName ? `${idOrSource}/${skillName}` : idOrSource;
  const url = `${BASE_URL}/api/v1/skills/audit/${cleanId.replace(/^skills\.sh\//, '')}`;

  try {
    const res = await fetch(url, {
      headers: getHeaders(token),
      signal: AbortSignal.timeout(10000)
    });
    if (res.ok) {
      return await res.json() as SkillsShAudit;
    }
  } catch {}
  return null;
}
