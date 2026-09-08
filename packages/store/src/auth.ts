import fs from 'fs/promises';
import path from 'path';
import { LIATE_DIR } from './paths';

export const AUTH_FILE = path.join(LIATE_DIR, 'auth.json');

export interface StoredAuthSession {
  token: string;
  userId: string;
  email?: string;
  name?: string;
  tier?: string;
  memoryMb?: number;
  microVmUrl?: string;
  engineUrl?: string;
  endpoint?: string;
  loggedInAt: string;
}

/**
 * Reads stored CLI authentication session from ~/.liate/auth.json
 */
export async function getAuthSession(): Promise<StoredAuthSession | null> {
  try {
    const raw = await fs.readFile(AUTH_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && parsed.token && (parsed.userId || parsed.token)) {
      return parsed;
    }
  } catch {}
  return null;
}

/**
 * Saves CLI authentication session to ~/.liate/auth.json
 */
export async function saveAuthSession(session: StoredAuthSession): Promise<void> {
  await fs.mkdir(LIATE_DIR, { recursive: true });
  await fs.writeFile(AUTH_FILE, JSON.stringify(session, null, 2), 'utf-8');
}

/**
 * Clears stored CLI authentication session from ~/.liate/auth.json
 */
export async function clearAuthSession(): Promise<boolean> {
  try {
    await fs.unlink(AUTH_FILE);
    return true;
  } catch {
    return false;
  }
}
