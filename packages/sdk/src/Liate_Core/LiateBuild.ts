import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

/**
 * [32] - LiateBuild (Sovereign Agent Bundler, Tree-Shaker & Binary Compiler)
 * 
 * Compiles TypeScript agent applications into standalone single-file executables,
 * optimized edge bundles (Cloudflare Workers), and zero-dependency distribution packages.
 */

export interface BuildConfig {
  entry?: string;
  outdir?: string;
  minify?: boolean;
  target?: 'bun' | 'node' | 'browser';
  sourcemap?: boolean;
}

export interface CompileBinaryOptions {
  entry?: string;
  outputName?: string;
  outdir?: string;
  minify?: boolean;
  bytecode?: boolean;
}

export interface BuildResult {
  success: boolean;
  outdir: string;
  files: string[];
  buildTimeMs: number;
  error?: string;
}

export class LiateBuild {
  public entry: string;
  public outdir: string;

  constructor(config: BuildConfig = {}) {
    this.entry = config.entry || './src/index.ts';
    this.outdir = config.outdir || './dist';
  }

  /**
   * Bundle TypeScript agent codebase into optimized distribution files
   */
  public async bundle(options: BuildConfig = {}): Promise<BuildResult> {
    const startTime = Date.now();
    const entry = options.entry || this.entry;
    const outdir = options.outdir || this.outdir;
    const target = options.target || 'node';

    return new Promise((resolve) => {
      const args = ['build', entry, '--outdir', outdir, '--target', target];
      if (options.minify) args.push('--minify');
      if (options.sourcemap) args.push('--sourcemap');

      const proc = spawn('bun', args, { shell: true });
      let stderr = '';

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        const buildTimeMs = Date.now() - startTime;
        if (code === 0) {
          let files: string[] = [];
          if (fs.existsSync(outdir)) {
            files = fs.readdirSync(outdir);
          }
          resolve({ success: true, outdir, files, buildTimeMs });
        } else {
          resolve({ success: false, outdir, files: [], buildTimeMs, error: stderr || `Exit code ${code}` });
        }
      });
    });
  }

  /**
   * Compile entire agent codebase into a standalone single-file binary executable
   * (Runs anywhere with ZERO dependencies or installed runtimes!)
   */
  public async compileBinary(options: CompileBinaryOptions = {}): Promise<{ success: boolean; binaryPath: string; buildTimeMs: number; error?: string }> {
    const startTime = Date.now();
    const entry = options.entry || this.entry;
    const outdir = options.outdir || this.outdir;
    const name = options.outputName || 'liate-agent';
    const isWindows = process.platform === 'win32';
    const binaryName = isWindows ? `${name}.exe` : name;
    const binaryPath = path.join(outdir, binaryName);

    if (!fs.existsSync(outdir)) {
      fs.mkdirSync(outdir, { recursive: true });
    }

    return new Promise((resolve) => {
      const args = ['build', '--compile', entry, '--outfile', binaryPath];
      if (options.minify ?? true) args.push('--minify');
      if (options.bytecode) args.push('--bytecode');

      const proc = spawn('bun', args, { shell: true });
      let stderr = '';

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        const buildTimeMs = Date.now() - startTime;
        if (code === 0) {
          resolve({ success: true, binaryPath, buildTimeMs });
        } else {
          resolve({ success: false, binaryPath: '', buildTimeMs, error: stderr || `Exit code ${code}` });
        }
      });
    });
  }

  /**
   * Bundle specifically for Cloudflare Workers / Vercel Edge functions
   */
  public async bundleEdge(outputFile: string = './dist/worker.js'): Promise<{ success: boolean; outputFile: string; buildTimeMs: number }> {
    const startTime = Date.now();
    const outdir = path.dirname(outputFile);
    const result = await this.bundle({
      entry: this.entry,
      outdir,
      target: 'browser',
      minify: true
    });

    return {
      success: result.success,
      outputFile,
      buildTimeMs: Date.now() - startTime
    };
  }
}

export const Build = LiateBuild;
