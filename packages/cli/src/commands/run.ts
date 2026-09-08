import fs from 'fs/promises';
import path from 'path';
import { runLiateAgent, type LiateConfig } from '@liate/runtime';
import { initStore, generateLiateLock } from '@liate/store';
import { loadEnv } from '../utils';

/**
 * Executes a 5-pillar liate.json agent spec or TS/JS agent script
 */
export async function runCommand(args: string[]): Promise<void> {
  const specPath = args[1] || 'liate.json';
  const prompt = args[2] || args.slice(2).join(' ') || 'Hello! Please introduce yourself.';
  
  const resolvedPath = path.resolve(process.cwd(), specPath);
  const projectDir = path.dirname(resolvedPath);
  await loadEnv(resolvedPath);

  const exists = await fs.access(resolvedPath).then(() => true).catch(() => false);
  if (!exists) {
    console.error(`[Error] File not found: ${resolvedPath}`);
    process.exit(1);
  }

  await initStore();
  if (resolvedPath.endsWith('.ts') || resolvedPath.endsWith('.js')) {
    const mod = await import(resolvedPath);
    if (typeof mod.main === 'function') {
      await mod.main();
    } else if (typeof mod.default === 'function') {
      await mod.default();
    }
    return;
  }

  const rawSpec = await fs.readFile(resolvedPath, 'utf-8');
  const spec: LiateConfig = JSON.parse(rawSpec);

  console.log(`\n[Liate CLI] Running agent: "${spec.A?.name || 'agent'}"`);
  console.log(`[Prompt] ${prompt}\n`);

  const result = await runLiateAgent(spec, prompt, undefined, undefined, projectDir);
  console.log(`\n--- RESULT ---\n${result}\n`);

  // Auto-generate / sync liate.lock
  try {
    await generateLiateLock(spec, projectDir);
    console.log(`\x1b[90m🔒 State & schema locked to liate.lock\x1b[0m`);
  } catch {}
}
