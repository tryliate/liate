import fs from 'fs/promises';
import path from 'path';
import pkg from '../../../package.json';

export const VERSION = pkg.version || "1.0.0";

/**
 * Automatically loads .env files from the working directory and parent directories if present.
 */
export async function loadEnv(targetPath?: string): Promise<void> {
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    targetPath ? path.resolve(path.dirname(targetPath), '.env') : '',
    path.resolve(process.cwd(), '../.env'),
    path.resolve(process.cwd(), '../../.env'),
    path.resolve(process.cwd(), '../../../.env'),
  ].filter(Boolean);

  for (const file of candidates) {
    try {
      const content = await fs.readFile(file, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const [k, ...v] = trimmed.split('=');
        if (k && !process.env[k.trim()]) {
          process.env[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '');
        }
      }
    } catch {}
  }
}
