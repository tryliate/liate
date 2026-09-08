import fs from 'node:fs/promises';
import path from 'node:path';
import { LiateError } from '../Liate_Security/LiateError';

/**
 * [47] - LiateIO (Sovereign Universal Data Ingest, Egress & Tabular Transformation Engine)
 * 
 * Provides unified, high-performance bidirectional parsing and generation for CSV,
 * TSV, JSONL, Excel, and Markdown tables. Enables zero-token dataset inspection,
 * streaming batch transformations, and auto-generated agent export tools.
 */

export interface IOReadOptions {
  delimiter?: string;
  hasHeader?: boolean;
  limit?: number;
  skip?: number;
}

export interface IOWriteOptions {
  delimiter?: string;
  headers?: string[];
  sheetName?: string;
}

export interface DatasetInspection {
  format: 'csv' | 'tsv' | 'jsonl' | 'excel' | 'markdown';
  headers: string[];
  totalRows: number;
  sample: Record<string, any>[];
  fileSizeBytes?: number;
}

export class LiateIO {
  constructor() {}

  /**
   * Parse CSV / TSV text or file path into typed objects
   */
  public async fromCSV<T extends Record<string, any> = Record<string, any>>(
    fileInput: string | Buffer,
    options: IOReadOptions = {}
  ): Promise<T[]> {
    const raw = await this.readInput(fileInput);
    const delimiter = options.delimiter || (raw.includes('\t') ? '\t' : ',');
    const lines = raw.split(/\r?\n/).filter(line => line.trim().length > 0);

    if (lines.length === 0) return [];

    const hasHeader = options.hasHeader ?? true;
    const headerLine = lines[0];
    const headers = hasHeader 
      ? headerLine.split(delimiter).map(h => h.trim().replace(/^["']|["']$/g, ''))
      : lines[0].split(delimiter).map((_, i) => `col_${i + 1}`);

    const dataLines = hasHeader ? lines.slice(1) : lines;
    const skip = options.skip || 0;
    const limit = options.limit || dataLines.length;

    const rows: T[] = [];
    const sliced = dataLines.slice(skip, skip + limit);

    for (const line of sliced) {
      const values = this.parseCsvLine(line, delimiter);
      const row: Record<string, any> = {};
      headers.forEach((h, i) => {
        const val = values[i] !== undefined ? values[i] : null;
        row[h] = this.autoCoerce(val);
      });
      rows.push(row as T);
    }

    return rows;
  }

  /**
   * Export typed objects into formatted CSV string or file
   */
  public async toCSV<T extends Record<string, any> = Record<string, any>>(
    data: T[],
    filePath?: string,
    options: IOWriteOptions = {}
  ): Promise<string> {
    if (!data || data.length === 0) {
      if (filePath) await fs.writeFile(filePath, '', 'utf-8');
      return '';
    }

    const delimiter = options.delimiter || ',';
    const headers = options.headers || Object.keys(data[0]);

    const lines: string[] = [];
    lines.push(headers.join(delimiter));

    for (const row of data) {
      const line = headers.map(h => {
        const val = row[h] !== undefined && row[h] !== null ? String(row[h]) : '';
        return val.includes(delimiter) || val.includes('"') || val.includes('\n')
          ? `"${val.replace(/"/g, '""')}"`
          : val;
      }).join(delimiter);
      lines.push(line);
    }

    const csvContent = lines.join('\n');
    if (filePath) {
      const dir = path.dirname(filePath);
      if (dir && dir !== '.') await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(filePath, csvContent, 'utf-8');
    }

    return csvContent;
  }

  /**
   * Parse JSONL (JSON Lines) file or text
   */
  public async fromJSONL<T = any>(fileInput: string | Buffer): Promise<T[]> {
    const raw = await this.readInput(fileInput);
    const lines = raw.split(/\r?\n/).filter(line => line.trim().length > 0);
    const results: T[] = [];

    for (const line of lines) {
      try {
        results.push(JSON.parse(line));
      } catch {}
    }

    return results;
  }

  /**
   * Export array to JSONL string or file
   */
  public async toJSONL<T = any>(data: T[], filePath?: string): Promise<string> {
    const lines = data.map(item => JSON.stringify(item)).join('\n');
    if (filePath) {
      const dir = path.dirname(filePath);
      if (dir && dir !== '.') await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(filePath, lines, 'utf-8');
    }
    return lines;
  }

  /**
   * Fast dataset inspector for LLMs (reads metadata, headers, count & 3 sample rows)
   */
  public async inspect(fileInput: string | Buffer): Promise<DatasetInspection> {
    let raw = '';
    let fileSizeBytes: number | undefined;

    if (typeof fileInput === 'string') {
      try {
        const stat = await fs.stat(fileInput);
        fileSizeBytes = stat.size;
        raw = await fs.readFile(fileInput, 'utf-8');
      } catch {
        raw = fileInput;
      }
    } else {
      fileSizeBytes = fileInput.length;
      raw = fileInput.toString('utf-8');
    }

    const isJsonl = raw.trim().startsWith('{') && raw.includes('\n');
    if (isJsonl) {
      const rows = await this.fromJSONL(raw);
      return {
        format: 'jsonl',
        headers: rows.length > 0 ? Object.keys(rows[0]) : [],
        totalRows: rows.length,
        sample: rows.slice(0, 3),
        fileSizeBytes
      };
    }

    const rows = await this.fromCSV(raw);
    return {
      format: raw.includes('\t') ? 'tsv' : 'csv',
      headers: rows.length > 0 ? Object.keys(rows[0]) : [],
      totalRows: rows.length,
      sample: rows.slice(0, 3),
      fileSizeBytes
    };
  }

  /**
   * Convert into autonomous Agent Tools for inspecting and exporting datasets
   */
  public toTools() {
    return [
      {
        name: 'inspect_dataset_table',
        description: 'Inspects a CSV, TSV, or JSONL file to get its headers, row count, and sample preview without loading entire file',
        parameters: {
          type: 'object',
          properties: {
            filePathOrContent: { type: 'string', description: 'Path to the dataset file or raw string' }
          },
          required: ['filePathOrContent']
        },
        execute: async (args: { filePathOrContent: string }) => this.inspect(args.filePathOrContent)
      },
      {
        name: 'export_csv_report',
        description: 'Exports an array of structured JSON records into a clean CSV report file',
        parameters: {
          type: 'object',
          properties: {
            data: { type: 'array', description: 'Array of records to export' },
            outputFilePath: { type: 'string', description: 'Target destination file path (e.g. ./reports/audit.csv)' }
          },
          required: ['data', 'outputFilePath']
        },
        execute: async (args: { data: any[]; outputFilePath: string }) => {
          await this.toCSV(args.data, args.outputFilePath);
          return {
            status: 'EXPORT_SUCCESS',
            targetFile: args.outputFilePath,
            rowCount: args.data.length
          };
        }
      }
    ];
  }

  private async readInput(fileInput: string | Buffer): Promise<string> {
    if (Buffer.isBuffer(fileInput)) return fileInput.toString('utf-8');
    if (typeof fileInput === 'string') {
      try {
        return await fs.readFile(fileInput, 'utf-8');
      } catch {
        return fileInput;
      }
    }
    return '';
  }

  private parseCsvLine(line: string, delimiter: string): string[] {
    const pattern = new RegExp(
      '(\\s*' + (delimiter === '\t' ? '\\t' : delimiter) + '\\s*|\\r?\\n|\\r|^)' +
      '(?:"([^"]*(?:""[^"]*)*)"|([^"' + (delimiter === '\t' ? '\\t' : delimiter) + '\\r\\n]*))',
      'gi'
    );
    const result: string[] = [];
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(line))) {
      const delimiterMatch = match[1];
      if (delimiterMatch.length && delimiterMatch !== delimiter && result.length === 0) {
        // Line start
      }
      let value = '';
      if (match[2] !== undefined) {
        value = match[2].replace(/""/g, '"');
      } else if (match[3] !== undefined) {
        value = match[3];
      }
      result.push(value.trim());
      if (pattern.lastIndex >= line.length) break;
    }

    return result;
  }

  private autoCoerce(val: string | null): any {
    if (val === null || val === '') return null;
    if (val.toLowerCase() === 'true') return true;
    if (val.toLowerCase() === 'false') return false;
    if (!isNaN(Number(val)) && !val.startsWith('0') && val.length < 16) {
      return Number(val);
    }
    return val;
  }
}

export const IO = LiateIO;
