import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { SKILLS_DIR, GLOBAL_SKILLS_FILE, getProjectSkillsPath } from './paths';

export interface SkillEntry {
  description?: string;
  path?: string;
  content?: string;
  url?: string;
  enabled?: boolean;
}

/**
 * Helper to parse a skills JSON file
 */
async function parseSkillsFile(filePath: string): Promise<Record<string, SkillEntry>> {
  try {
    const data = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(data);

    // Standard schema: { skills: { "name": { path, description, ... } } }
    if (parsed && typeof parsed === 'object' && parsed.skills && typeof parsed.skills === 'object') {
      return parsed.skills;
    }

    // Array format
    if (Array.isArray(parsed)) {
      const result: Record<string, SkillEntry> = {};
      for (const item of parsed) {
        if (item && item.name) {
          result[item.name] = {
            description: item.description || '',
            path: item.path || item.entry || undefined,
            enabled: item.enabled !== false,
          };
        }
      }
      return result;
    }

    // Key-value dictionary
    if (parsed && typeof parsed === 'object') {
      return parsed as Record<string, SkillEntry>;
    }
    return {};
  } catch (e) {
    return {};
  }
}

/**
 * Get project-level skills from ./liate_skills.json
 */
export async function getProjectSkills(cwd: string = process.cwd()): Promise<Record<string, SkillEntry>> {
  return parseSkillsFile(getProjectSkillsPath(cwd));
}

/**
 * Get global-level skills from ~/.liate/liate_skills.json (with fallback to skills.json)
 */
export async function getGlobalSkills(): Promise<Record<string, SkillEntry>> {
  const globalSkills = await parseSkillsFile(GLOBAL_SKILLS_FILE);
  if (Object.keys(globalSkills).length > 0) return globalSkills;
  const legacyPath = path.join(path.dirname(GLOBAL_SKILLS_FILE), 'skills.json');
  return parseSkillsFile(legacyPath);
}

/**
 * Get merged skills (Project-level skills override Global-level skills on collision)
 */
export async function getMergedSkills(cwd: string = process.cwd()): Promise<Record<string, SkillEntry>> {
  const globalSkills = await getGlobalSkills();
  const projectSkills = await getProjectSkills(cwd);
  return {
    ...globalSkills,
    ...projectSkills,
  };
}

export async function getInstalledSkills(cwd: string = process.cwd()): Promise<any[]> {
  const skillsMap = await getMergedSkills(cwd);
  const result: any[] = [];
  for (const [name, entry] of Object.entries(skillsMap)) {
    result.push({
      name,
      description: entry.description || '',
      path: entry.path,
      enabled: entry.enabled !== false
    });
  }
  return result;
}

export async function installSkill(
  name: string, 
  contentOrPath: string, 
  description: string = '', 
  isGlobal: boolean = false, 
  cwd: string = process.cwd()
): Promise<string> {
  const targetFile = isGlobal ? GLOBAL_SKILLS_FILE : getProjectSkillsPath(cwd);
  await fs.mkdir(path.dirname(targetFile), { recursive: true });

  const isFilePath = contentOrPath.endsWith('.md') || contentOrPath.includes('/') || contentOrPath.includes('\\');
  let existing: Record<string, SkillEntry> = {};
  try {
    const raw = await fs.readFile(targetFile, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed.skills) existing = parsed.skills;
    else if (typeof parsed === 'object') existing = parsed;
  } catch {}

  let remoteUrl: string | undefined;
  let textContent: string | undefined;

  let resolvedTarget = contentOrPath.trim();
  const isRemote = resolvedTarget.startsWith('http://') || resolvedTarget.startsWith('https://') || resolvedTarget.includes('/');
  const oidcToken = process.env.VERCEL_OIDC_TOKEN || (globalThis as any).Bun?.env?.VERCEL_OIDC_TOKEN;

  // 1. Check if Vercel OIDC token is present for official skills.sh API
  if (resolvedTarget.includes('/') && !resolvedTarget.startsWith('http://') && !resolvedTarget.startsWith('https://')) {
    const cleanId = resolvedTarget.replace(/^skills\.sh\//, '').replace(/^github:/, '');
    const idParts = cleanId.split('/');

    // Try skills.sh API first if token present or public endpoint
    if (idParts.length >= 2) {
      try {
        const apiUrl = `https://skills.sh/api/v1/skills/${cleanId}`;
        const headers: Record<string, string> = {};
        if (oidcToken) headers['Authorization'] = `Bearer ${oidcToken}`;
        const apiRes = await fetch(apiUrl, { headers, signal: AbortSignal.timeout(8000) });
        if (apiRes.ok) {
          const data: any = await apiRes.json();
          if (data && data.files && Array.isArray(data.files) && data.files.length > 0) {
            const targetSkillDir = path.join(isGlobal ? SKILLS_DIR : path.join(cwd, 'skills', name));
            for (const f of data.files) {
              const filePath = path.join(targetSkillDir, f.path);
              await fs.mkdir(path.dirname(filePath), { recursive: true });
              await fs.writeFile(filePath, f.contents, 'utf-8');
            }
            const skillFile = data.files.find((f: any) => f.path === 'SKILL.md' || f.path.endsWith('.md')) || data.files[0];
            textContent = skillFile?.contents || '';
            remoteUrl = `https://skills.sh/${cleanId}`;
          }
        }
      } catch {}
    }

    // 2. Direct GitHub Raw Multi-path Resolver
    if (!textContent && idParts.length >= 2) {
      const owner = idParts[0];
      const repo = idParts[1];
      const skillName = idParts.slice(2).join('/') || name;

      const candidateUrls = [
        `https://raw.githubusercontent.com/${owner}/${repo}/main/skills/${skillName}/SKILL.md`,
        `https://raw.githubusercontent.com/${owner}/${repo}/main/${skillName}/SKILL.md`,
        `https://raw.githubusercontent.com/${owner}/${repo}/main/skills/${skillName}.md`,
        `https://raw.githubusercontent.com/${owner}/${repo}/main/${skillName}.md`,
        `https://raw.githubusercontent.com/${owner}/${repo}/main/SKILL.md`,
        `https://raw.githubusercontent.com/${owner}/${repo}/master/skills/${skillName}/SKILL.md`,
        `https://raw.githubusercontent.com/${owner}/${repo}/master/${skillName}/SKILL.md`,
        `https://raw.githubusercontent.com/${owner}/${repo}/master/SKILL.md`,
      ];

      for (const cand of candidateUrls) {
        try {
          const res = await fetch(cand, { signal: AbortSignal.timeout(6000) });
          if (res.ok) {
            const txt = await res.text();
            if (txt && txt.trim() && !txt.includes('404: Not Found')) {
              textContent = txt;
              remoteUrl = cand;
              break;
            }
          }
        } catch {}
      }
    }
  }

  // 3. Direct HTTP URL Fetch
  if (!textContent && (resolvedTarget.startsWith('http://') || resolvedTarget.startsWith('https://'))) {
    remoteUrl = resolvedTarget;
    try {
      const res = await fetch(resolvedTarget, { signal: AbortSignal.timeout(10000) });
      if (res.ok) {
        textContent = await res.text();
      }
    } catch (e: any) {
      console.warn(`[Liate Skills] Note: Could not fetch remote skill from ${resolvedTarget}: ${e.message}`);
    }
  }

  if (textContent) {
    // Saved downloaded skill
    const skillPath = path.join(isGlobal ? SKILLS_DIR : path.join(cwd, 'skills', name), 'SKILL.md');
    await fs.mkdir(path.dirname(skillPath), { recursive: true });
    await fs.writeFile(skillPath, textContent, 'utf-8');
    existing[name] = {
      description: description || `Skill downloaded from ${remoteUrl}`,
      path: isGlobal ? skillPath : `./skills/${name}/SKILL.md`,
      url: remoteUrl,
      enabled: true
    };
  } else if (isFilePath && !isRemote) {
    existing[name] = {
      description,
      path: contentOrPath,
      enabled: true
    };
  } else if (isRemote) {
    throw new Error(`Could not find or download skill "${contentOrPath}". Please verify that the repository exists or provide the direct URL/markdown.`);
  } else {
    // If inline markdown passed, save to disk and link
    const skillPath = path.join(isGlobal ? SKILLS_DIR : path.join(cwd, 'skills', name), 'SKILL.md');
    await fs.mkdir(path.dirname(skillPath), { recursive: true });
    await fs.writeFile(skillPath, contentOrPath, 'utf-8');
    existing[name] = {
      description,
      path: isGlobal ? skillPath : `./skills/${name}/SKILL.md`,
      enabled: true
    };
  }

  const payload = {
    $schema: "https://tryliate.com/schema/v1/liate_skills.json",
    skills: existing
  };

  await fs.writeFile(targetFile, JSON.stringify(payload, null, 2), 'utf-8');
  return contentOrPath;
}

export async function getSkillMarkdown(name: string, agentName?: string, cwd: string = process.cwd()): Promise<string> {
  const home = os.homedir();
  const cleanName = name.replace(/\.md$/, '').trim();

  // 1. Check if defined in liate_skills.json (project or global)
  const mergedSkills = await getMergedSkills(cwd);
  if (mergedSkills[cleanName] || mergedSkills[name]) {
    const entry = mergedSkills[cleanName] || mergedSkills[name];
    if (entry.content) return entry.content;
    if (entry.path) {
      const resolvedPath = path.isAbsolute(entry.path) ? entry.path : path.resolve(cwd, entry.path);
      try {
        const text = await fs.readFile(resolvedPath, 'utf-8');
        if (text && text.trim()) return text;
      } catch {}
    }
  }

  const candidatePaths = [
    // 2. Agent-specific skills folder
    ...(agentName ? [
      path.join(cwd, 'agents', agentName, 'skills', cleanName, 'skills.md'),
      path.join(cwd, 'agents', agentName, 'skills', cleanName, 'SKILL.md'),
      path.join(cwd, 'agents', agentName, 'skills', `${cleanName}.md`),
      path.join(cwd, 'agents', agentName, cleanName, 'skills.md'),
      path.join(cwd, 'agents', agentName, cleanName, 'SKILL.md'),
      path.join(cwd, 'agents', agentName, `${cleanName}.md`),
    ] : []),

    // 3. Local workspace relative paths
    path.resolve(cwd, name),
    path.resolve(cwd, `${cleanName}.md`),
    path.resolve(cwd, 'skills', cleanName, 'skills.md'),
    path.resolve(cwd, 'skills', cleanName, 'SKILL.md'),
    path.resolve(cwd, 'skills', `${cleanName}.md`),
    path.resolve(cwd, 'skills', name),

    // 4. Workspace .agents/skills
    path.resolve(cwd, '.agents', 'skills', cleanName, 'SKILL.md'),
    path.resolve(cwd, '.agents', 'skills', cleanName, 'skills.md'),
    path.resolve(cwd, '..', '.agents', 'skills', cleanName, 'SKILL.md'),

    // 5. Global ~/.liate/skills
    path.join(home, '.liate', 'skills', cleanName, 'skills.md'),
    path.join(home, '.liate', 'skills', cleanName, 'SKILL.md'),
    path.join(home, '.liate', 'skills', `${cleanName}.md`),
    path.join(SKILLS_DIR, cleanName, 'SKILL.md'),
    path.join(SKILLS_DIR, cleanName, 'skills.md'),
    path.join(SKILLS_DIR, `${cleanName}.md`),
  ];

  for (const p of candidatePaths) {
    try {
      const content = await fs.readFile(p, 'utf-8');
      if (content && content.trim()) {
        return content;
      }
    } catch {}
  }

  return "";
}

export async function uninstallSkill(name: string, isGlobal: boolean = false, cwd: string = process.cwd()): Promise<void> {
  const targetFile = isGlobal ? GLOBAL_SKILLS_FILE : getProjectSkillsPath(cwd);
  try {
    const raw = await fs.readFile(targetFile, 'utf-8');
    const parsed = JSON.parse(raw);
    const skills = parsed.skills || parsed;
    delete skills[name];
    const payload = parsed.skills ? { $schema: parsed.$schema, skills } : skills;
    await fs.writeFile(targetFile, JSON.stringify(payload, null, 2), 'utf-8');
  } catch {}

  // Clean up skill directory from disk
  const skillDir = path.join(isGlobal ? SKILLS_DIR : path.join(cwd, 'skills'), name);
  try {
    await fs.rm(skillDir, { recursive: true, force: true });
  } catch {}
}
