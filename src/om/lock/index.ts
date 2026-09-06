import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { LiateConfig } from '../../aum';
import { getMergedMcps } from '../../store/mcps';
import { getMergedSkills } from '../../store/skills';
import { getProjectLockPath } from '../../store/paths';

export interface LiateLockFile {
  $liatescript: string;
  $schema: string;
  $generated: string;
  $engine: string;
  $integrity: string;
  L: {
    model: string;
    resolved_provider: string;
    model_fingerprint?: string;
  };
  I?: {
    memory_type: string;
    knowledge_sources: number;
    sessions_dir: string;
  };
  A: {
    name: string;
    version: string;
    intent_hash: string;
    resolved_skills: string[];
    skills_integrity: Record<string, string>;
  };
  T: {
    mcp_servers: Record<string, {
      type: 'stdio' | 'sse' | 'http';
      integrity?: string;
      tools: string[];
    }>;
  };
  E: {
    budget_guards: {
      max_turns: number;
      max_tokens?: number;
      max_spend_inr?: number;
    };
  };
}

export function computeSha256(content: string): string {
  return 'sha256-' + crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

export async function generateLiateLock(
  spec: LiateConfig,
  cwd: string = process.cwd()
): Promise<LiateLockFile> {
  const modelStr = spec.L || 'sarvam/sarvam-105b';
  const [provider] = modelStr.split('/');
  const agentName = spec.A?.name || 'anonymous';
  const agentVersion = spec.A?.version || '1.0.0';
  const intentStr = spec.A?.intent || '';
  const intentHash = computeSha256(intentStr);

  // 1. Resolve skills and compute their individual checksums
  const skillsIntegrity: Record<string, string> = {};
  const resolvedSkills: string[] = [];
  const mergedSkills = await getMergedSkills(cwd);

  const requestedSkills = Array.isArray(spec.A?.skills)
    ? spec.A.skills
    : typeof spec.A?.skills === 'string'
      ? (spec.A.skills as string).split(',').map((s: string) => s.trim()).filter(Boolean)
      : [];

  for (const skillName of requestedSkills) {
    resolvedSkills.push(skillName);
    const skillObj = mergedSkills[skillName];
    const content = skillObj?.content || JSON.stringify(skillObj || '');
    skillsIntegrity[skillName] = computeSha256(content);
  }

  // 2. Resolve MCP Servers
  const mcpServersMap: Record<string, any> = {};
  const mergedMcps = await getMergedMcps(cwd);

  if (Array.isArray(spec.T)) {
    for (const tName of spec.T) {
      const cfg = mergedMcps[tName] || {};
      mcpServersMap[tName] = {
        type: cfg.command ? 'stdio' : 'http',
        tools: cfg.tools || ['*'],
        integrity: computeSha256(JSON.stringify(cfg))
      };
    }
  } else if (typeof spec.T === 'object' && spec.T !== null) {
    for (const [sName, sCfg] of Object.entries(spec.T)) {
      mcpServersMap[sName] = {
        type: (sCfg as any).command ? 'stdio' : 'http',
        tools: (sCfg as any).tools || ['*'],
        integrity: computeSha256(JSON.stringify(sCfg))
      };
    }
  }

  // 3. Assemble the lock object
  const lockData: Omit<LiateLockFile, '$integrity'> = {
    $liatescript: '1.0.0',
    $schema: 'https://tryliate.com/schema/liate.lock.json',
    $generated: new Date().toISOString(),
    $engine: 'liate-aum@2026.1',
    L: {
      model: modelStr,
      resolved_provider: provider.toLowerCase(),
      model_fingerprint: computeSha256(modelStr)
    },
    I: {
      memory_type: spec.I?.memory ? 'session_disk' : 'stateless',
      knowledge_sources: 0,
      sessions_dir: '.liate/sessions'
    },
    A: {
      name: agentName,
      version: agentVersion,
      intent_hash: intentHash,
      resolved_skills: resolvedSkills,
      skills_integrity: skillsIntegrity
    },
    T: {
      mcp_servers: mcpServersMap
    },
    E: {
      budget_guards: {
        max_turns: parseInt(spec.E?.MAX_TURNS || '5', 10),
        max_tokens: spec.E?.MAX_TOKENS ? parseInt(spec.E.MAX_TOKENS, 10) : undefined,
        max_spend_inr: spec.E?.MAX_SPEND ? parseFloat(spec.E.MAX_SPEND) : undefined
      }
    }
  };

  const canonicalString = JSON.stringify(lockData, Object.keys(lockData).sort());
  const masterIntegrity = computeSha256(canonicalString);

  const finalLock: LiateLockFile = {
    ...lockData,
    $integrity: masterIntegrity
  };

  const lockPath = getProjectLockPath(cwd);
  await fs.writeFile(lockPath, JSON.stringify(finalLock, null, 2), 'utf8');

  return finalLock;
}

export async function verifyLiateLock(
  spec: LiateConfig,
  cwd: string = process.cwd()
): Promise<{ valid: boolean; reason?: string; reasons: string[]; lock?: LiateLockFile }> {
  const lockPath = getProjectLockPath(cwd);
  
  let rawContent: string;
  try {
    rawContent = await fs.readFile(lockPath, 'utf8');
  } catch {
    const reason = 'liate.lock.json not found. Run "liate run" to generate an integrity lock.';
    return { valid: false, reason, reasons: [reason] };
  }

  let lock: LiateLockFile;
  try {
    lock = JSON.parse(rawContent);
  } catch {
    const reason = 'liate.lock.json is malformed JSON.';
    return { valid: false, reason, reasons: [reason] };
  }

  const { $integrity, ...rest } = lock;
  const canonicalString = JSON.stringify(rest, Object.keys(rest).sort());
  const computedIntegrity = computeSha256(canonicalString);

  if ($integrity !== computedIntegrity) {
    const reason = 'Lockfile integrity mismatch! liate.lock.json was modified outside Liate.';
    return { valid: false, reason, reasons: [reason] };
  }

  const modelStr = spec.L || 'sarvam/sarvam-105b';
  if (lock.L?.model !== modelStr) {
    const reason = `Model drift detected! Lock has "${lock.L?.model}" but spec has "${modelStr}".`;
    return { valid: false, reason, reasons: [reason] };
  }

  const currentIntentHash = computeSha256(spec.A?.intent || '');
  if (lock.A?.intent_hash !== currentIntentHash) {
    const reason = 'Agent intent drift! Intent in liate.json does not match locked intent hash.';
    return { valid: false, reason, reasons: [reason] };
  }

  return { valid: true, reasons: [], lock };
}
