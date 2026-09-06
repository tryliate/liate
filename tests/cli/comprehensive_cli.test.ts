/**
 * Comprehensive End-to-End Test Suite for Liate CLI
 * 
 * Executes real CLI commands via child process against src/cli/index.ts
 * Verifies exit codes, stdout outputs, file generation, lockfiles, and store state.
 * 
 * Run with:
 *   bun test tests/cli/comprehensive_cli.test.ts
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

describe('🛠️ Comprehensive Liate CLI End-to-End Test Suite', () => {
  const sandboxDir = path.join(WORKSPACE_DIR, '.tmp_cli_e2e_sandbox');
  const runProjectDir = path.join(sandboxDir, 'test-run-agent');

  beforeAll(async () => {
    await fs.mkdir(sandboxDir, { recursive: true });
    await fs.mkdir(runProjectDir, { recursive: true });

    const SARVAM_KEY = process.env.SARVAM_API_KEY || 'sk_test_dummy_key';

    const testSpec = {
      L: 'sarvam/sarvam-105b',
      I: { memory: 'test_cli_mem' },
      A: {
        name: 'cli-tester',
        version: '1.0.0',
        intent: 'You are a sovereign AI assistant.'
      },
      T: {},
      E: {
        SARVAM_API_KEY: SARVAM_KEY,
        MAX_TURNS: '1'
      }
    };
    await fs.writeFile(path.join(runProjectDir, 'liate.json'), JSON.stringify(testSpec, null, 2), 'utf-8');
  });

  afterAll(async () => {
    try {
      await fs.rm(sandboxDir, { recursive: true, force: true });
    } catch {}
  });

  // ─── 1. Metadata & Help ───────────────────────────────────────────────────
  describe('1. Version & Help Commands', () => {
    it('liate version / -v / --version should print active version', async () => {
      const res = await runCli('version');
      expect(res.code).toBe(0);
      expect(res.stdout).toContain('Liate CLI v');

      const resShort = await runCli('-v');
      expect(resShort.code).toBe(0);
      expect(resShort.stdout).toContain('Liate CLI v');
    }, 15000);

    it('liate help should print complete command directory', async () => {
      const res = await runCli('help');
      expect(res.code).toBe(0);
      expect(res.stdout).toContain('USAGE:');
      expect(res.stdout).toContain('liate <command>');
      expect(res.stdout).toContain('LOCAL COMMANDS:');
      expect(res.stdout).toContain('init');
      expect(res.stdout).toContain('run');
    }, 15000);
  });

  // ─── 2. Mission & Announcement ────────────────────────────────────────────
  describe('2. Sovereign Mission & Announcement Commands', () => {
    it('liate announce / mission / soon should display Mission Agentantra banner', async () => {
      const res = await runCli('announce');
      expect(res.code).toBe(0);
      expect(res.stdout).toContain('MISSION AGENTANTRA');
      expect(res.stdout).toContain('Sarvam AI Startup Program');
      expect(res.stdout).toContain('Where agents are born');
      expect(res.stdout).toContain('tryliate.com');
    }, 15000);
  });

  // ─── 3. Project Creation & Scaffolding ────────────────────────────────────
  describe('3. Agent Project Scaffolding (create & init)', () => {
    const testProjectName = 'test-e2e-scaffolded-agent';
    const projectDir = path.join(sandboxDir, testProjectName);

    it('liate create <name> should scaffold a new agent folder with liate.json', async () => {
      const res = await runCli(`create ${testProjectName}`, sandboxDir);
      expect(res.code).toBe(0);
      expect(res.stdout).toContain('Created project');

      const manifestExists = await fs.access(path.join(projectDir, 'liate.json')).then(() => true).catch(() => false);
      expect(manifestExists).toBe(true);

      const raw = await fs.readFile(path.join(projectDir, 'liate.json'), 'utf-8');
      const manifest = JSON.parse(raw);
      expect(manifest.L).toBeDefined();
      expect(manifest.A.name).toBe(testProjectName);
    }, 15000);

    it('liate init --yes <name> should non-interactively create starter agent', async () => {
      const initProjectName = 'test-e2e-init-agent';
      const res = await runCli(`init --yes ${initProjectName}`, sandboxDir);
      expect(res.code).toBe(0);
      expect(res.stdout).toContain('Created project');

      const initProjectDir = path.join(sandboxDir, initProjectName);
      const manifestExists = await fs.access(path.join(initProjectDir, 'liate.json')).then(() => true).catch(() => false);
      expect(manifestExists).toBe(true);
    }, 15000);
  });

  // ─── 4. Agent Execution & Lockfile ────────────────────────────────────────
  describe('4. Agent Execution & Deterministic Lockfile (run & lock)', () => {
    it('liate run <file> "prompt" should execute 5-pillar agent spec', async () => {
      const res = await runCli(`run liate.json "Hello CLI test"`, runProjectDir);
      expect(res.code).toBe(0);
      expect(res.stdout).toContain('Running agent: "cli-tester"');
      expect(res.stdout).toContain('--- RESULT ---');
    }, 35000);

    it('liate lock <file> should generate a valid liate.lock file', async () => {
      const res = await runCli(`lock liate.json`, runProjectDir);
      expect(res.code).toBe(0);
      expect(res.stdout).toContain('Generated liate.lock successfully');

      const lockExists = await fs.access(path.join(runProjectDir, 'liate.lock')).then(() => true).catch(() => false);
      expect(lockExists).toBe(true);
    }, 15000);

    it('liate lock <file> --verify should confirm lock integrity', async () => {
      const res = await runCli(`lock liate.json --verify`, runProjectDir);
      expect(res.code).toBe(0);
      expect(res.stdout).toContain('liate.lock is VALID');
    }, 15000);
  });

  // ─── 5. MCP Tools Management ──────────────────────────────────────────────
  describe('5. MCP Management (mcp list, add, remove)', () => {
    it('liate mcp list should display configured MCP servers', async () => {
      const res = await runCli('mcp list', sandboxDir);
      expect(res.code).toBe(0);
      expect(res.stdout).toContain('Configured MCP Servers');
    }, 15000);

    it('liate mcp add <name> <command> should register new tool server', async () => {
      const res = await runCli('mcp add time-tool uvx mcp-server-time', sandboxDir);
      expect(res.code).toBe(0);
      expect(res.stdout).toContain('MCP server "time-tool" added');

      const listRes = await runCli('mcp list', sandboxDir);
      expect(listRes.stdout).toContain('time-tool');
    }, 15000);

    it('liate mcp remove <name> should unregister tool server', async () => {
      const res = await runCli('mcp remove time-tool', sandboxDir);
      expect(res.code).toBe(0);
      expect(res.stdout).toContain('removed');
    }, 15000);
  });

  // ─── 6. Procedural Skills Management ──────────────────────────────────────
  describe('6. Procedural Skills Management (skills list, add, remove)', () => {
    it('liate skills list should display procedural skills', async () => {
      const res = await runCli('skills list', sandboxDir);
      expect(res.code).toBe(0);
      expect(res.stdout).toContain('Procedural Skills Catalog');
    }, 15000);

    it('liate skills add <name> <content> should register procedural skill', async () => {
      const res = await runCli('skills add data-extractor # Data Extractor Skill', sandboxDir);
      expect(res.code).toBe(0);
      expect(res.stdout).toContain('registered');

      const listRes = await runCli('skills list', sandboxDir);
      expect(listRes.stdout).toContain('data-extractor');
    }, 15000);

    it('liate skills remove <name> should unregister procedural skill', async () => {
      const res = await runCli('skills remove data-extractor', sandboxDir);
      expect(res.code).toBe(0);
      expect(res.stdout).toContain('removed');
    }, 15000);
  });

  // ─── 7. API Keys Management ───────────────────────────────────────────────
  describe('7. API Keys Vault Management (keys list, set, remove)', () => {
    it('liate keys list should display key providers', async () => {
      const res = await runCli('keys list', sandboxDir);
      expect(res.code).toBe(0);
      expect(res.stdout).toContain('Configured API Keys');
    }, 15000);

    it('liate keys set <provider> <key> should securely store key in .env', async () => {
      const res = await runCli('keys set GROQ_API_KEY gsk_test_mock_secret_999', sandboxDir);
      expect(res.code).toBe(0);
      expect(res.stdout).toContain('Saved API key');

      const listRes = await runCli('keys list', sandboxDir);
      expect(listRes.stdout).toContain('GROQ_API_KEY');
    }, 15000);

    it('liate keys remove <provider> should remove key from .env', async () => {
      const res = await runCli('keys remove GROQ_API_KEY', sandboxDir);
      expect(res.code).toBe(0);
      expect(res.stdout).toContain('Removed API key');
    }, 15000);
  });

  // ─── 8. State, Sessions, Logs & Cache ─────────────────────────────────────
  describe('8. Sessions, Logs, Cache & Process Roster', () => {
    it('liate ps / agents should display local agents roster', async () => {
      const res = await runCli('ps', sandboxDir);
      expect(res.code).toBe(0);
      expect(res.stdout).toContain('LIATE SOVEREIGN AGENTS');
    }, 15000);

    it('liate search <query> should perform registry agent search', async () => {
      const res = await runCli('search finance', sandboxDir);
      expect(res.code).toBe(0);
      expect(res.stdout).toContain('Search Results');
    }, 15000);

    it('liate cache show / clean should manage runtime optimization cache', async () => {
      const resShow = await runCli('cache show', sandboxDir);
      expect(resShow.code).toBe(0);

      const resClean = await runCli('cache clean', sandboxDir);
      expect(resClean.code).toBe(0);
      expect(resClean.stdout).toContain('Cleaned');
    }, 15000);

    it('liate sessions list / clear should manage conversation histories', async () => {
      const resList = await runCli('sessions list', sandboxDir);
      expect(resList.code).toBe(0);
      expect(resList.stdout).toContain('Active Sessions');

      const resClear = await runCli('sessions clear', sandboxDir);
      expect(resClear.code).toBe(0);
      expect(resClear.stdout).toContain('Cleared');
    }, 15000);

    it('liate logs tail / clear should manage real-time trace events', async () => {
      const resTail = await runCli('logs tail', sandboxDir);
      expect(resTail.code).toBe(0);

      const resClear = await runCli('logs clear', sandboxDir);
      expect(resClear.code).toBe(0);
      expect(resClear.stdout).toContain('Cleared');
    }, 15000);
  });
});
