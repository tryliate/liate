import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { ENV_FILE } from './paths';

const PROVIDER_ENV_MAP: Record<string, string> = {
  openrouter: 'OPENROUTER_API_KEY',
  groq: 'GROQ_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_GENERATIVE_AI_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  sarvam: 'SARVAM_API_KEY',
  rapidapi: 'RAPIDAPI_KEY',
};

const ENV_PROVIDER_MAP: Record<string, string> = Object.entries(PROVIDER_ENV_MAP).reduce((acc, [k, v]) => {
  acc[v] = k;
  return acc;
}, {} as Record<string, string>);

export async function getKeys(cwd: string = process.cwd()): Promise<Record<string, string>> {
  const keys: Record<string, string> = {};

  const parseEnvContent = (data: string) => {
    const lines = data.split('\n');
    for (const line of lines) {
      const match = line.match(/^\s*([^=]+?)\s*=\s*(.*)\s*$/);
      if (match) {
        const envKey = match[1].trim();
        const val = match[2].trim().replace(/^["']|["']$/g, '');
        const provider = ENV_PROVIDER_MAP[envKey];
        if (provider) {
          keys[provider] = val;
        }
        keys[envKey] = val;
      }
    }
  };

  // 1. Read from standard global ~/.liate/.env first (base)
  try {
    const data = await fs.readFile(ENV_FILE, 'utf-8');
    parseEnvContent(data);
  } catch {}

  // 2. Read from local project ./.liate/.env
  try {
    const projectLiateEnv = await fs.readFile(path.resolve(cwd, '.liate', '.env'), 'utf-8');
    parseEnvContent(projectLiateEnv);
  } catch {}

  // 3. Read from local project ./.env (overrides global)
  try {
    const localEnv = await fs.readFile(path.resolve(cwd, '.env'), 'utf-8');
    parseEnvContent(localEnv);
  } catch {}

  // 4. Inject process.env environment variables
  for (const [k, v] of Object.entries(process.env)) {
    if (v) {
      const provider = ENV_PROVIDER_MAP[k];
      if (provider) {
        keys[provider] = v;
      }
      keys[k] = v;
    }
  }

  return keys;
}

export async function saveKey(
  provider: string, 
  key: string, 
  isGlobal: boolean = false, 
  cwd: string = process.cwd()
): Promise<string> {
  const envKey = PROVIDER_ENV_MAP[provider.toLowerCase()] || (provider.endsWith('_KEY') ? provider : `${provider.toUpperCase()}_API_KEY`);
  const targetEnvFile = isGlobal ? ENV_FILE : path.resolve(cwd, '.env');

  let data = '';
  try {
    data = await fs.readFile(targetEnvFile, 'utf-8');
  } catch (e) {}

  const lines = data.split('\n');
  let updated = false;
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^\s*([^=]+?)\s*=\s*(.*)\s*$/);
    if (match && match[1] === envKey) {
      lines[i] = `${envKey}=${key}`;
      updated = true;
      break;
    }
  }

  if (!updated) {
    if (data && !data.endsWith('\n')) lines.push('');
    lines.push(`${envKey}=${key}`);
  }

  await fs.mkdir(path.dirname(targetEnvFile), { recursive: true });
  await fs.writeFile(targetEnvFile, lines.filter(l => l !== undefined).join('\n'), 'utf-8');
  return targetEnvFile;
}

export async function deleteKey(
  keyOrProvider: string, 
  isGlobal: boolean = false, 
  cwd: string = process.cwd()
): Promise<string> {
  const envKey = PROVIDER_ENV_MAP[keyOrProvider.toLowerCase()] || keyOrProvider;
  const targetEnvFile = isGlobal ? ENV_FILE : path.resolve(cwd, '.env');

  let data = '';
  try {
    data = await fs.readFile(targetEnvFile, 'utf-8');
  } catch (e) {
    return targetEnvFile;
  }

  const lines = data.split('\n').filter(line => {
    const match = line.match(/^\s*([^=]+?)\s*=\s*(.*)\s*$/);
    return !(match && (match[1] === envKey || match[1] === keyOrProvider));
  });

  await fs.writeFile(targetEnvFile, lines.join('\n'), 'utf-8');
  return targetEnvFile;
}
