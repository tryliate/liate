import fs from 'fs/promises';
import path from 'path';
import { getProjectSessionsDir } from './paths';

export interface SessionMessage {
  role: string;
  content?: string;
  toolCalls?: any[];
  toolResult?: any;
  timestamp?: string;
}

function sanitizeScope(scope: string): string {
  const clean = scope.replace(/^sessions[\/\\]/, '').replace(/\.json$/, '').trim();
  return clean || 'default';
}

/**
 * Load previous messages for a given session memory scope from .liate/liate_sessions/<scope>.json
 */
export async function loadSession(
  memoryScope: string, 
  cwd: string = process.cwd()
): Promise<SessionMessage[]> {
  const safeName = sanitizeScope(memoryScope);
  const sessionPath = path.join(getProjectSessionsDir(cwd), `${safeName}.json`);

  try {
    const raw = await fs.readFile(sessionPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter(m => m && m.role);
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Persist conversation messages into .liate/liate_sessions/<scope>.json
 */
export async function saveSession(
  memoryScope: string, 
  messages: SessionMessage[], 
  cwd: string = process.cwd(),
  maxTurns: number = 50
): Promise<void> {
  const safeName = sanitizeScope(memoryScope);
  const sessionsDir = getProjectSessionsDir(cwd);
  await fs.mkdir(sessionsDir, { recursive: true });

  const sessionPath = path.join(sessionsDir, `${safeName}.json`);
  const boundedMessages = messages.slice(-maxTurns);
  await fs.writeFile(sessionPath, JSON.stringify(boundedMessages, null, 2), 'utf-8');
}

/**
 * List all active session scopes in .liate/liate_sessions/
 */
export async function listSessions(cwd: string = process.cwd()): Promise<string[]> {
  const sessionsDir = getProjectSessionsDir(cwd);
  try {
    const files = await fs.readdir(sessionsDir);
    return files
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace(/\.json$/, ''));
  } catch {
    return [];
  }
}

/**
 * Clear a specific session scope or all sessions
 */
export async function clearSession(
  memoryScope?: string, 
  cwd: string = process.cwd()
): Promise<void> {
  const sessionsDir = getProjectSessionsDir(cwd);
  if (memoryScope) {
    const safeName = sanitizeScope(memoryScope);
    const sessionPath = path.join(sessionsDir, `${safeName}.json`);
    try {
      await fs.rm(sessionPath, { force: true });
    } catch {}
  } else {
    try {
      await fs.rm(sessionsDir, { recursive: true, force: true });
    } catch {}
  }
}

