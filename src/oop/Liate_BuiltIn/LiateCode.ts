import fs from 'node:fs/promises';
import path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { LiateError } from '../Liate_Security/LiateError';

const execAsync = promisify(exec);

/**
 * [49] - LiateCode (Sovereign Software Engineering & Coding Agent Engine)
 * 
 * Powers autonomous coding agents with surgical search-and-replace diff patching,
 * zero-token AST symbol extraction, pre-flight syntax diagnostics, and native Git
 * version control automation.
 */

export interface CodeSymbol {
  name: string;
  type: 'function' | 'class' | 'interface' | 'type' | 'variable' | 'export';
  line: number;
  signature?: string;
}

export interface PatchResult {
  success: boolean;
  filePath: string;
  linesChanged: number;
  error?: string;
}

export interface SyntaxCheckResult {
  valid: boolean;
  errors: string[];
}

export class LiateCode {
  constructor() {}

  /**
   * Surgical Search-and-Replace diff patch on a source code file
   */
  public async patch(
    filePath: string, 
    searchBlock: string, 
    replaceBlock: string
  ): Promise<PatchResult> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      
      // Normalize line endings for exact matching
      const normalizedContent = content.replace(/\r\n/g, '\n');
      const normalizedSearch = searchBlock.replace(/\r\n/g, '\n').trim();
      const normalizedReplace = replaceBlock.replace(/\r\n/g, '\n');

      if (!normalizedContent.includes(normalizedSearch)) {
        return {
          success: false,
          filePath,
          linesChanged: 0,
          error: `Target search block was not found in ${path.basename(filePath)}`
        };
      }

      const updated = normalizedContent.replace(normalizedSearch, normalizedReplace);
      await fs.writeFile(filePath, updated, 'utf-8');

      const linesChanged = Math.abs(normalizedReplace.split('\n').length - normalizedSearch.split('\n').length) + 1;

      return {
        success: true,
        filePath,
        linesChanged
      };
    } catch (err: any) {
      return {
        success: false,
        filePath,
        linesChanged: 0,
        error: err.message
      };
    }
  }

  /**
   * Zero-Token AST & Symbol Extractor for TypeScript/JavaScript/Python
   */
  public async findSymbols(filePathOrCode: string): Promise<CodeSymbol[]> {
    let code = '';
    if (typeof filePathOrCode === 'string' && filePathOrCode.includes('\n')) {
      code = filePathOrCode;
    } else {
      try {
        code = await fs.readFile(filePathOrCode, 'utf-8');
      } catch {
        code = filePathOrCode;
      }
    }

    const symbols: CodeSymbol[] = [];
    const lines = code.split('\n');

    lines.forEach((line, index) => {
      const lineNum = index + 1;
      const trimmed = line.trim();

      // Class declaration
      const classMatch = trimmed.match(/^(?:export\s+)?class\s+([A-Za-z0-9_$]+)/);
      if (classMatch) {
        symbols.push({ name: classMatch[1], type: 'class', line: lineNum, signature: trimmed });
        return;
      }

      // Interface declaration
      const interfaceMatch = trimmed.match(/^(?:export\s+)?interface\s+([A-Za-z0-9_$]+)/);
      if (interfaceMatch) {
        symbols.push({ name: interfaceMatch[1], type: 'interface', line: lineNum, signature: trimmed });
        return;
      }

      // Type alias
      const typeMatch = trimmed.match(/^(?:export\s+)?type\s+([A-Za-z0-9_$]+)/);
      if (typeMatch) {
        symbols.push({ name: typeMatch[1], type: 'type', line: lineNum, signature: trimmed });
        return;
      }

      // Function declaration
      const funcMatch = trimmed.match(/^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)/);
      if (funcMatch) {
        symbols.push({ name: funcMatch[1], type: 'function', line: lineNum, signature: trimmed });
        return;
      }

      // Arrow function / Const export
      const constMatch = trimmed.match(/^(?:export\s+)?const\s+([A-Za-z0-9_$]+)\s*=/);
      if (constMatch) {
        symbols.push({ name: constMatch[1], type: 'variable', line: lineNum, signature: trimmed });
      }
    });

    return symbols;
  }

  /**
   * Pre-flight syntax validation for JavaScript and TypeScript
   */
  public validateSyntax(code: string): SyntaxCheckResult {
    const errors: string[] = [];

    // Basic bracket and parenthesis balance checks
    const brackets: Record<string, string> = { '(': ')', '{': '}', '[': ']' };
    const stack: string[] = [];

    for (let i = 0; i < code.length; i++) {
      const char = code[i];
      if (['(', '{', '['].includes(char)) {
        stack.push(char);
      } else if ([')', '}', ']'].includes(char)) {
        const last = stack.pop();
        if (!last || brackets[last] !== char) {
          errors.push(`Mismatched bracket '${char}' around character ${i}`);
          break;
        }
      }
    }

    if (stack.length > 0) {
      errors.push(`Unclosed brackets remaining: ${stack.join(', ')}`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Autonomous Git operations
   */
  public git = {
    status: async (cwd: string = process.cwd()) => {
      try {
        const { stdout } = await execAsync('git status --short', { cwd });
        const lines = stdout.split('\n').filter(Boolean);
        const modified: string[] = [];
        const staged: string[] = [];
        const untracked: string[] = [];

        lines.forEach(l => {
          const code = l.slice(0, 2);
          const file = l.slice(3).trim();
          if (code.includes('M')) modified.push(file);
          else if (code.includes('A')) staged.push(file);
          else if (code.includes('?')) untracked.push(file);
        });

        return { modified, staged, untracked };
      } catch (e: any) {
        return { modified: [], staged: [], untracked: [], error: e.message };
      }
    },

    diff: async (cwd: string = process.cwd()) => {
      try {
        const { stdout } = await execAsync('git diff', { cwd });
        return stdout;
      } catch (e: any) {
        return '';
      }
    },

    commit: async (message: string, cwd: string = process.cwd()) => {
      try {
        await execAsync('git add -A', { cwd });
        const { stdout } = await execAsync(`git commit -m "${message.replace(/"/g, '\\"')}"`, { cwd });
        return stdout.trim();
      } catch (e: any) {
        return `Git commit failed: ${e.message}`;
      }
    }
  };

  /**
   * Convert into autonomous tools for coding agents
   */
  public toTools() {
    return [
      {
        name: 'patch_source_code_file',
        description: 'Applies a surgical search-and-replace diff patch to modify a source file accurately',
        parameters: {
          type: 'object',
          properties: {
            filePath: { type: 'string', description: 'Relative or absolute path to the file to patch' },
            searchBlock: { type: 'string', description: 'Exact existing code block to find and replace' },
            replaceBlock: { type: 'string', description: 'New code block to replace with' }
          },
          required: ['filePath', 'searchBlock', 'replaceBlock']
        },
        execute: async (args: { filePath: string; searchBlock: string; replaceBlock: string }) => {
          return this.patch(args.filePath, args.searchBlock, args.replaceBlock);
        }
      },
      {
        name: 'extract_code_symbols',
        description: 'Extracts classes, interfaces, and function signatures from a source file without loading full contents',
        parameters: {
          type: 'object',
          properties: {
            filePath: { type: 'string', description: 'Path to the source file to inspect' }
          },
          required: ['filePath']
        },
        execute: async (args: { filePath: string }) => {
          const symbols = await this.findSymbols(args.filePath);
          return { symbolCount: symbols.length, symbols };
        }
      }
    ];
  }
}

export const Code = LiateCode;
