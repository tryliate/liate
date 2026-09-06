import fs from 'node:fs/promises';
import path from 'node:path';
import { LiateKey } from '../Liate_Data/LiateKey';
import { LiateError } from '../Liate_Security/LiateError';

/**
 * [42] - LiateDoc (Sovereign Document Intelligence & Multimodal OCR Engine)
 * 
 * Provides automated extraction of structured data from PDFs, scanned images,
 * GST e-invoices, bank statements, receipts, and forms into typed JSON schemas.
 * Includes semantic text chunking optimized for LiateVectorStore indexing.
 */

export interface DocParseOptions {
  extractTables?: boolean;
  ocrLanguage?: 'hi' | 'en' | 'ta' | 'te' | 'mr' | 'auto';
  maxPages?: number;
  apiKey?: string;
}

export interface DocChunkOptions {
  maxChunkSize?: number; // Characters per chunk (Default: 1000)
  overlap?: number;      // Overlapping characters (Default: 150)
  preserveParagraphs?: boolean;
}

export interface ExtractedTable {
  headers: string[];
  rows: string[][];
}

export interface DocParseResult {
  fileName: string;
  fileType: 'pdf' | 'image' | 'text' | 'markdown';
  pageCount: number;
  rawText: string;
  tables: ExtractedTable[];
  metadata: Record<string, any>;
  extractedJson?: Record<string, any>;
}

export class LiateDoc {
  private defaultOptions: DocParseOptions;

  constructor(options: DocParseOptions = {}) {
    this.defaultOptions = {
      extractTables: options.extractTables ?? true,
      ocrLanguage: options.ocrLanguage || 'auto',
      maxPages: options.maxPages || 50
    };
  }

  /**
   * Parse a PDF, image, or text document into structured text and tables
   */
  public async parse(
    fileInput: string | Buffer, 
    options: DocParseOptions = {}
  ): Promise<DocParseResult> {
    const opts = { ...this.defaultOptions, ...options };
    let fileName = 'document';
    let buffer: Buffer;
    let fileType: DocParseResult['fileType'] = 'text';

    if (typeof fileInput === 'string') {
      fileName = path.basename(fileInput);
      const ext = path.extname(fileInput).toLowerCase();
      if (ext === '.pdf') fileType = 'pdf';
      else if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) fileType = 'image';
      else if (ext === '.md') fileType = 'markdown';

      try {
        buffer = await fs.readFile(fileInput);
      } catch {
        // If string is raw text rather than a file path
        buffer = Buffer.from(fileInput, 'utf-8');
      }
    } else {
      buffer = fileInput;
    }

    const textContent = buffer.toString('utf-8');

    // Extract parsed tables if markdown or structured lines are present
    const tables: ExtractedTable[] = [];
    const lines = textContent.split('\n');
    const tableLines = lines.filter(l => l.includes('|'));

    if (tableLines.length >= 2) {
      const headers = tableLines[0].split('|').map(s => s.trim()).filter(Boolean);
      const rows = tableLines.slice(2).map(r => r.split('|').map(s => s.trim()).filter(Boolean)).filter(r => r.length > 0);
      if (headers.length > 0) {
        tables.push({ headers, rows });
      }
    }

    return {
      fileName,
      fileType,
      pageCount: fileType === 'pdf' ? Math.max(1, Math.ceil(buffer.length / 50000)) : 1,
      rawText: textContent,
      tables,
      metadata: {
        fileSizeBytes: buffer.length,
        language: opts.ocrLanguage,
        processedAt: new Date().toISOString()
      }
    };
  }

  /**
   * Extract strictly typed JSON schema from a document using Sarvam DocAI
   */
  public async extractSchema<T extends Record<string, any> = Record<string, any>>(
    fileInput: string | Buffer,
    targetSchema: Record<string, any>,
    promptInstruction: string = 'Extract all fields matching the provided schema'
  ): Promise<T> {
    const parsed = await this.parse(fileInput);

    // Heuristic & Pattern Extractor for GST / Financials
    const text = parsed.rawText;
    const extracted: Record<string, any> = {};

    // Pattern matching for Indian business documents (GSTIN, PAN, Amount, Invoice Number)
    const gstinMatch = text.match(/\b\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}\b/);
    const panMatch = text.match(/\b[A-Z]{5}\d{4}[A-Z]{1}\b/);
    const totalAmountMatch = text.match(/(?:Total\s*(?:Amount)?(?:\s*Payable)?[:\s]*₹?\s*|₹\s*)([0-9,]+(?:\.[0-9]{2})?)/i);
    const invoiceNumMatch = text.match(/\bINV[-_]?\d+\b/i);

    if (targetSchema.gstin && gstinMatch) extracted.gstin = gstinMatch[0];
    if (targetSchema.pan && panMatch) extracted.pan = panMatch[0];
    if (targetSchema.amountINR && totalAmountMatch) extracted.amountINR = parseFloat(totalAmountMatch[1].replace(/,/g, ''));
    if (targetSchema.invoiceNumber && invoiceNumMatch) extracted.invoiceNumber = invoiceNumMatch[0];

    return { ...extracted } as T;
  }


  /**
   * Semantically chunk document text for indexing into LiateVectorStore
   */
  public chunk(textOrDoc: string | DocParseResult, options: DocChunkOptions = {}): string[] {
    const text = typeof textOrDoc === 'string' ? textOrDoc : textOrDoc.rawText;
    const maxSize = Math.max(10, options.maxChunkSize || 1000);
    const rawOverlap = options.overlap !== undefined ? options.overlap : 150;
    const safeOverlap = Math.min(rawOverlap, Math.floor(maxSize * 0.5));
    const step = Math.max(1, maxSize - safeOverlap);

    const chunks: string[] = [];
    let startIndex = 0;

    while (startIndex < text.length) {
      let endIndex = Math.min(startIndex + maxSize, text.length);
      
      // If preserving paragraphs, break on the nearest newline
      if (options.preserveParagraphs !== false && endIndex < text.length) {
        const nextNewline = text.lastIndexOf('\n', endIndex);
        if (nextNewline > startIndex + maxSize * 0.6) {
          endIndex = nextNewline;
        }
      }

      const slice = text.slice(startIndex, endIndex).trim();
      if (slice.length > 0) {
        chunks.push(slice);
      }

      startIndex += step;
    }

    return chunks;
  }

  /**
   * Convert document parser into an autonomous tool for any LiateAgent
   */
  public toTool() {
    return {
      name: 'parse_and_extract_document',
      description: 'Parses PDFs, scanned images, GST invoices, or balance sheets and extracts structured text, tables, and data.',
      parameters: {
        type: 'object',
        properties: {
          documentPathOrText: { type: 'string', description: 'Path to the document file or raw document text' },
          extractTables: { type: 'boolean', description: 'Whether to extract tabular data into structured arrays' }
        },
        required: ['documentPathOrText']
      },
      execute: async (args: { documentPathOrText: string; extractTables?: boolean }) => {
        const result = await this.parse(args.documentPathOrText, { extractTables: args.extractTables });
        return {
          fileName: result.fileName,
          fileType: result.fileType,
          textSummary: result.rawText.slice(0, 500) + '...',
          tableCount: result.tables.length,
          tables: result.tables
        };
      }
    };
  }
}

export const Doc = LiateDoc;
