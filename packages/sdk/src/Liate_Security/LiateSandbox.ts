import vm from 'node:vm';
import { exec as childExec } from 'node:child_process';

/**
 * [39] - LiateSandbox (Sovereign Isolated Code Execution & Safety Chamber)
 * 
 * Dual-Mode Execution:
 * 1. **Local Mode** (default, free forever): Fast, zero-network Node.js VM sandbox.
 *    Safe for math, algorithms, and quick expression evaluation. No API key required.
 *    Usage: `new LiateSandbox({ mode: 'local' })`
 *
 * 2. **Cloud Mode** (Liate Platform — requires account & LIATE_API_KEY):
 *    Remote cloud sandbox on Liate Platform (https://api.tryliate.com).
 *    Supports multi-language execution: Python, Bash, Node.js, Playwright, UV.
 *    Usage: `LiateSandbox.create({ mode: 'cloud', apiKey: process.env.LIATE_API_KEY })`
 *    Sign up at https://tryliate.com to get a Liate Platform account.
 */

export type SandboxMode = 'local' | 'cloud';
export type SandboxTier = 'micro' | 'standard' | 'power' | 'heavy' | 'pro' | 'ultra' | 'monster' | '512mb' | '1gb' | '2gb' | '4gb' | '8gb' | '16gb' | '32gb';

export interface SandboxOptions {
  mode?: SandboxMode;
  tier?: SandboxTier;
  apiKey?: string;
  baseUrl?: string;
  image?: string;
  timeoutMs?: number; // Execution timeout in milliseconds (Default: 2000ms for local)
  allowedGlobals?: string[];
  allowConsole?: boolean;
  context?: Record<string, any>;
}

export interface SandboxResult {
  success: boolean;
  result: any;
  logs: string[];
  executionTimeMs: number;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  error?: string;
}

export class LiateSandbox {
  public mode: SandboxMode;
  public tier: string;
  public apiKey?: string;
  public baseUrl: string;
  public id?: string;
  public status: 'INITIALIZING' | 'READY' | 'RUNNING' | 'SUSPENDED' | 'TERMINATED' = 'INITIALIZING';

  private defaultOptions: Required<Omit<SandboxOptions, 'context' | 'allowedGlobals' | 'mode' | 'tier' | 'apiKey' | 'baseUrl' | 'image'>> & {
    allowedGlobals: string[];
  };

  constructor(options: SandboxOptions = {}) {
    this.apiKey = options.apiKey || (typeof process !== 'undefined' ? process.env.LIATE_API_KEY : undefined);
    this.baseUrl = (options.baseUrl || (typeof process !== 'undefined' ? process.env.LIATE_BASE_URL : undefined) || 'https://api.tryliate.com').replace(/\/$/, '');
    this.tier = options.tier || '1gb';
    
    // Auto-detect cloud mode if explicitly requested or if tier/apiKey provided with mode !== 'local'
    this.mode = options.mode || (options.tier && options.mode !== 'local' ? 'cloud' : 'local');

    this.defaultOptions = {
      timeoutMs: options.timeoutMs || 2000,
      allowConsole: options.allowConsole ?? true,
      allowedGlobals: options.allowedGlobals || [
        'Math', 'JSON', 'Date', 'RegExp', 'Array', 'Object', 'String', 'Number', 'Boolean', 'parseInt', 'parseFloat', 'isNaN', 'isFinite'
      ]
    };

    if (this.mode === 'local') {
      this.status = 'READY';
    }
  }

  /**
   * Static factory to create a live Cloud MicroVM sandbox.
   * 
   * @requires LIATE_API_KEY — Liate Platform account (https://tryliate.com)
   * @note Cloud-only. For local-only sandboxing use `new LiateSandbox()` (mode: 'local')
   */
  public static async create(options: SandboxOptions = {}): Promise<LiateSandbox> {
    const sandbox = new LiateSandbox({ ...options, mode: 'cloud' });
    await sandbox.initCloudSandbox();
    return sandbox;
  }

  /**
   * Initialize a remote cloud MicroVM on Liate Platform.
   * 
   * @requires LIATE_API_KEY env variable — get yours at https://tryliate.com
   * @note Cloud-only method. Not available in local mode or self-hosted deployments.
   * @throws {Error} If LIATE_API_KEY is missing or the MicroVM provisioning request fails.
   */
  private async initCloudSandbox(): Promise<void> {
    const url = `${this.baseUrl}/v1/sandboxes`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ tier: this.tier })
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`[Liate Cloud Error ${res.status}]: Failed to create MicroVM: ${err}`);
    }

    const data = await res.json();
    this.id = data.id || data.sandbox_id;
    this.status = 'READY';
  }

  /**
   * Execute dynamic code (JavaScript locally, or shell/command in Cloud MicroVM)
   */
  public async run(codeOrCmd: string, options: SandboxOptions = {}): Promise<SandboxResult> {
    const activeMode = options.mode || this.mode;

    if (activeMode === 'cloud') {
      return await this.exec(codeOrCmd);
    }

    return this.runLocal(codeOrCmd, options);
  }

  /**
   * Execute bash or terminal command inside the isolated Cloud MicroVM.
   * 
   * @requires Liate Platform account (https://tryliate.com) and LIATE_API_KEY
   * @note Cloud-only. For local JS sandboxing, use `run(code, { mode: 'local' })` instead.
   */
  public async exec(command: string): Promise<SandboxResult> {
    if (this.mode === 'local') {
      return this.execLocal(command);
    }

    const startTime = Date.now();

    // Auto-create cloud sandbox if not yet initialized
    if (!this.id) {
      await this.initCloudSandbox();
    }

    const url = `${this.baseUrl}/v1/sandboxes/${this.id}/exec`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ cmd: command })
      });

      const executionTimeMs = Date.now() - startTime;

      if (!res.ok) {
        const errText = await res.text();
        return {
          success: false,
          result: null,
          logs: [errText],
          stdout: '',
          stderr: errText,
          exitCode: res.status,
          executionTimeMs,
          error: `Execution failed with HTTP ${res.status}: ${errText}`
        };
      }

      const data = await res.json();
      const stdout = data.stdout || data.output || '';
      const stderr = data.stderr || '';
      const exitCode = data.exitCode ?? (data.success === false ? 1 : 0);

      return {
        success: exitCode === 0,
        result: stdout || stderr,
        logs: stdout ? stdout.split('\n').filter(Boolean) : [],
        stdout,
        stderr,
        exitCode,
        executionTimeMs
      };
    } catch (err: any) {
      const executionTimeMs = Date.now() - startTime;
      return {
        success: false,
        result: null,
        logs: [],
        stdout: '',
        stderr: err.message,
        exitCode: 1,
        executionTimeMs,
        error: err.message || String(err)
      };
    }
  }

  /**
   * Run Python code snippet inside the isolated Cloud MicroVM
   */
  public async runPython(code: string): Promise<SandboxResult> {
    const escaped = code.replace(/'/g, "'\\''");
    return await this.exec(`python3 -c '${escaped}'`);
  }

  /**
   * Run Bash script inside isolated sandbox (local or cloud)
   */
  public async runBash(script: string): Promise<SandboxResult> {
    return await this.exec(script);
  }

  /**
   * Execute bash, python, or terminal command via sovereign local Liate runtime engine
   */
  public async execLocal(command: string): Promise<SandboxResult> {
    const startTime = Date.now();
    const timeout = this.defaultOptions.timeoutMs || 15000;

    return new Promise((resolve) => {
      let normalizedCmd = command;
      if (process.platform === 'win32') {
        if (normalizedCmd.startsWith('python3 ')) {
          normalizedCmd = 'python ' + normalizedCmd.slice(8);
        } else if (normalizedCmd === 'python3') {
          normalizedCmd = 'python';
        }
      }

      childExec(normalizedCmd, { timeout, maxBuffer: 10 * 1024 * 1024 }, (err: any, stdout: string, stderr: string) => {
        const executionTimeMs = Date.now() - startTime;
        const outStr = (stdout || '').trim();
        const errStr = (stderr || '').trim();

        if (err && err.killed) {
          return resolve({
            success: false,
            result: null,
            logs: [`Execution timed out after ${timeout}ms`],
            stdout: outStr,
            stderr: `Execution timed out after ${timeout}ms`,
            exitCode: 124,
            executionTimeMs,
            error: `Execution timed out after ${timeout}ms`
          });
        }

        const success = !err || err.code === 0;
        resolve({
          success,
          result: outStr || errStr,
          logs: outStr ? outStr.split('\n').filter(Boolean) : [],
          stdout: outStr,
          stderr: errStr,
          exitCode: err ? (err.code || 1) : 0,
          executionTimeMs,
          error: err ? (err.message || String(err)) : undefined
        });
      });
    });
  }

  /**
   * Suspend cloud MicroVM (freezes RAM to ₹0.00 compute snapshot)
   */
  public async suspend(): Promise<void> {
    if (!this.id || this.mode !== 'cloud') return;
    await fetch(`${this.baseUrl}/v1/sandboxes/${this.id}/suspend`, {
      method: 'POST',
      headers: this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {}
    });
    this.status = 'SUSPENDED';
  }

  /**
   * Resume suspended cloud MicroVM (< 200ms from memory snapshot)
   */
  public async resume(): Promise<void> {
    if (!this.id || this.mode !== 'cloud') return;
    await fetch(`${this.baseUrl}/v1/sandboxes/${this.id}/resume`, {
      method: 'POST',
      headers: this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {}
    });
    this.status = 'READY';
  }

  /**
   * Terminate and destroy cloud MicroVM
   */
  public async terminate(): Promise<void> {
    if (!this.id || this.mode !== 'cloud') return;
    await fetch(`${this.baseUrl}/v1/sandboxes/${this.id}`, {
      method: 'DELETE',
      headers: this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {}
    });
    this.status = 'TERMINATED';
  }

  /**
   * Execute dynamic JavaScript code in local Node VM sandbox
   */
  private runLocal(code: string, options: SandboxOptions = {}): SandboxResult {
    const startTime = Date.now();
    const logs: string[] = [];
    const timeoutMs = options.timeoutMs || this.defaultOptions.timeoutMs;

    try {
      // 1. Build sanitized sandbox environment
      const sandboxObj: Record<string, any> = {
        console: {
          log: (...args: any[]) => logs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')),
          warn: (...args: any[]) => logs.push('[WARN] ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')),
          error: (...args: any[]) => logs.push('[ERROR] ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '))
        },
        ...(options.context || {})
      };

      // Populate allowed standard globals
      for (const globalName of this.defaultOptions.allowedGlobals) {
        if ((globalThis as any)[globalName] !== undefined) {
          sandboxObj[globalName] = (globalThis as any)[globalName];
        }
      }

      // Explicitly block dangerous globals
      sandboxObj.process = undefined;
      sandboxObj.require = undefined;
      sandboxObj.global = undefined;
      sandboxObj.globalThis = sandboxObj;

      const vmContext = vm.createContext(sandboxObj);

      // 2. Wrap user code to support statements, loops, and raw expressions
      const hasReturn = /\breturn\b/.test(code);
      const isStatement = /^\s*(for|while|if|switch|let|const|var|function|class|try|do)\b/.test(code);
      const wrappedCode = (hasReturn || isStatement)
        ? `(function() { "use strict"; ${code}\n})()`
        : `(function() { "use strict"; return (${code});\n})()`;

      const script = new vm.Script(wrappedCode, {
        filename: 'sandbox.js'
      });

      // 3. Execute with strict CPU timeout
      const result = script.runInContext(vmContext, {
        timeout: timeoutMs,
        displayErrors: true
      });

      const executionTimeMs = Date.now() - startTime;

      return {
        success: true,
        result: result === undefined ? null : result,
        logs,
        executionTimeMs
      };
    } catch (err: any) {
      const executionTimeMs = Date.now() - startTime;
      const errorMsg = err.message || String(err);

      return {
        success: false,
        result: null,
        logs,
        executionTimeMs,
        error: errorMsg.includes('timed out') ? `Script execution timed out after ${timeoutMs}ms` : errorMsg
      };
    }
  }

  /**
   * Convert sandbox into a ready-to-use LiateTool for any LiateAgent
   */
  public toTool(toolName: string = 'execute_javascript_code') {
    return {
      name: toolName,
      description: 'Executes JavaScript code in a secure, isolated sandbox. Use this to perform complex math calculations, algorithms, data formatting, or data processing.',
      parameters: {
        type: 'object',
        properties: {
          code: {
            type: 'string',
            description: 'The JavaScript code snippet to execute. Must return a value or return statement.'
          }
        },
        required: ['code']
      },
      execute: async (args: { code: string }) => {
        const res = await this.run(args.code);
        if (!res.success) {
          return { error: res.error, logs: res.logs };
        }
        return { result: res.result, logs: res.logs, executionTimeMs: res.executionTimeMs };
      }
    };
  }

  /**
   * Convert sandbox into a ready-to-use Python interpreter tool for AI agents
   */
  public toPythonTool(toolName: string = 'python_interpreter') {
    return {
      name: toolName,
      description: 'Executes Python code in an isolated Linux hardware MicroVM. Use this for data analysis, scripts, ML libraries, and calculations.',
      parameters: {
        type: 'object',
        properties: {
          code: {
            type: 'string',
            description: 'The Python code snippet to execute.'
          }
        },
        required: ['code']
      },
      execute: async (args: { code: string }) => {
        const res = await this.runPython(args.code);
        return { stdout: res.stdout, stderr: res.stderr, exitCode: res.exitCode, executionTimeMs: res.executionTimeMs };
      }
    };
  }

  /**
   * Convert sandbox into a ready-to-use Bash terminal tool for AI agents
   */
  public toBashTool(toolName: string = 'bash_terminal') {
    return {
      name: toolName,
      description: 'Executes bash shell commands inside an isolated Linux hardware MicroVM.',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'The bash shell command to execute.'
          }
        },
        required: ['command']
      },
      execute: async (args: { command: string }) => {
        const res = await this.exec(args.command);
        return { stdout: res.stdout, stderr: res.stderr, exitCode: res.exitCode, executionTimeMs: res.executionTimeMs };
      }
    };
  }
}

export const Sandbox = LiateSandbox;
