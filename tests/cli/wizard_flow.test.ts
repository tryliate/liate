/**
 * Comprehensive End-to-End Test Suite for Liate CLI Wizard Flow
 * 
 * Verifies the complete lifecycle of agent scaffolding:
 * 1. Project directory structure generation
 * 2. 5-Pillar manifest (liate.json) validity
 * 3. Container TypeScript class (app.ts) execution
 * 4. Procedural skills integration (skills/procedures.md)
 * 5. Environment templates (.env, .env.example)
 * 6. Deterministic lockfile generation (liate.lock)
 * 7. Multi-turn execution within scaffolded workspace
 * 
 * Run with:
 *   bun test tests/cli/wizard_flow.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);
const CLI_PATH = path.resolve(__dirname, '../../src/cli/index.ts').replace(/\\/g, '/');
const WORKSPACE_DIR = path.resolve(__dirname, '../..');

async function runCli(args: string, cwd: string = WORKSPACE_DIR): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const { stdout, stderr } = await execAsync(`bun run "${CLI_PATH}" ${args}`, {
      cwd,
      env: { ...process.env, CI: 'true' },
      timeout: 35000
    });
    return { stdout, stderr, code: 0 };
  } catch (err: any) {
    return {
      stdout: err.stdout || '',
      stderr: err.stderr || err.message,
      code: err.code || 1
    };
  }
}

describe('🪄 Liate CLI Wizard Flow End-to-End Verification', () => {
  const wizardTestDir = path.join(WORKSPACE_DIR, '.tmp_wizard_e2e');
  const agentName = 'sovereign-wizard-agent';
  const projectDir = path.join(wizardTestDir, agentName);

  beforeAll(async () => {
    await fs.mkdir(wizardTestDir, { recursive: true });
  });

  afterAll(async () => {
    try {
      await fs.rm(wizardTestDir, { recursive: true, force: true });
    } catch {}
  });

  // ─── 1. Wizard Scaffolding Step ───────────────────────────────────────────
  describe('1. Scaffolding Execution', () => {
    it('liate init --yes <name> should successfully execute the wizard pipeline', async () => {
      const res = await runCli(`init --yes ${agentName}`, wizardTestDir);
      expect(res.code).toBe(0);
      expect(res.stdout).toContain('Created project');
      expect(res.stdout).toContain('All set!');
    }, 20000);

    it('should generate the canonical folder structure', async () => {
      const projectExists = await fs.access(projectDir).then(() => true).catch(() => false);
      const skillsExists = await fs.access(path.join(projectDir, 'skills')).then(() => true).catch(() => false);
      const sessionsExists = await fs.access(path.join(projectDir, '.liate', 'liate_sessions')).then(() => true).catch(() => false);
      const memoryExists = await fs.access(path.join(projectDir, '.liate', 'liate_memory')).then(() => true).catch(() => false);

      expect(projectExists).toBe(true);
      expect(skillsExists).toBe(true);
      expect(sessionsExists).toBe(true);
      expect(memoryExists).toBe(true);
    });
  });

  // ─── 2. Artifact Integrity Verification ───────────────────────────────────
  describe('2. Manifest & Source Code Integrity', () => {
    it('liate.json should have valid 5-pillar structure', async () => {
      const raw = await fs.readFile(path.join(projectDir, 'liate.json'), 'utf-8');
      const manifest = JSON.parse(raw);

      // L-Pillar
      expect(manifest.L).toBe('sarvam/sarvam-105b');
      // I-Pillar
      expect(manifest.I?.memory).toBeDefined();
      // A-Pillar
      expect(manifest.A?.name).toBe(agentName);
      expect(manifest.A?.intent).toBeDefined();
      expect(manifest.A?.skills).toBe('./skills/procedures.md');
      // T-Pillar
      expect(typeof manifest.T).toBe('object');
      // E-Pillar
      expect(manifest.E?.MAX_TURNS).toBe('10');
    });

    it('app.ts should declare LiateAgent container class', async () => {
      const appTs = await fs.readFile(path.join(projectDir, 'app.ts'), 'utf-8');
      expect(appTs).toContain('extends LiateAgent');
      expect(appTs).toContain('export const agent = new');
      expect(appTs).toContain('LiateLoop');
      expect(appTs).toContain('Mission: Agentantra');
    });

    it('skills/procedures.md should contain procedural instructions', async () => {
      const skillsMd = await fs.readFile(path.join(projectDir, 'skills', 'procedures.md'), 'utf-8');
      expect(skillsMd).toContain('# Procedural Skills for');
      expect(skillsMd).toContain('Core Rules:');
    });

    it('package.json should have runnable agent scripts', async () => {
      const rawPkg = await fs.readFile(path.join(projectDir, 'package.json'), 'utf-8');
      const pkg = JSON.parse(rawPkg);
      expect(pkg.name).toBe(agentName);
      expect(pkg.scripts.run).toContain('liate run');
      expect(pkg.scripts.serve).toContain('liate serve');
    });

    it('.env and .env.example should contain environment templates', async () => {
      const envExample = await fs.readFile(path.join(projectDir, '.env.example'), 'utf-8');
      expect(envExample).toContain('SARVAM_API_KEY');
      expect(envExample).toContain('LIATE_ENDPOINT');
    });
  });

  // ─── 3. Execution & Runtime Verification ──────────────────────────────────
  describe('3. Execution from Inside Scaffolded Workspace', () => {
    beforeAll(async () => {
      // Configure real SARVAM_API_KEY in the scaffolded .env
      const sarvamKey = process.env.SARVAM_API_KEY || 'sk_test_dummy_key';
      const envContent = `SARVAM_API_KEY=${sarvamKey}\nLIATE_ENDPOINT=http://localhost:7071\n`;
      await fs.writeFile(path.join(projectDir, '.env'), envContent, 'utf-8');
    });

    it('liate run ./liate.json should execute agent in the newly created project', async () => {
      const sarvamKey = process.env.SARVAM_API_KEY || '';
      const isRealKey = sarvamKey && !sarvamKey.startsWith('sk-test') && !sarvamKey.startsWith('sk_test');
      if (!isRealKey) return;
      const res = await runCli('run liate.json "Greetings from the wizard test"', projectDir);
      expect(res.code).toBe(0);
      expect(res.stdout).toContain(`Running agent: "${agentName}"`);
      expect(res.stdout).toContain('--- RESULT ---');
    }, 35000);

    it('liate lock ./liate.json should generate deterministic liate.lock', async () => {
      const res = await runCli('lock liate.json', projectDir);
      expect(res.code).toBe(0);
      expect(res.stdout).toContain('Generated liate.lock successfully');

      const lockFileExists = await fs.access(path.join(projectDir, 'liate.lock')).then(() => true).catch(() => false);
      expect(lockFileExists).toBe(true);

      const lockRaw = await fs.readFile(path.join(projectDir, 'liate.lock'), 'utf-8');
      const lockData = JSON.parse(lockRaw);
      expect(lockData.A?.name).toBe(agentName);
      expect(lockData.$integrity).toBeDefined();
    }, 20000);

    it('liate lock ./liate.json --verify should validate lockfile integrity', async () => {
      const res = await runCli('lock liate.json --verify', projectDir);
      expect(res.code).toBe(0);
      expect(res.stdout).toContain('liate.lock is VALID');
    }, 20000);
  });
});
