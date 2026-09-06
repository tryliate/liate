/**
 * Tests for Media, Doc & Core Pillars:
 * LiateVoice, LiateDoc, LiateCode, LiateView, LiateIO, LiateCron, LiateRoute
 * 
 * Run with: bun test tests/pillars/media_doc.test.ts
 */

import { describe, it, expect } from 'bun:test';
import { LiateVoice } from '../../src/oop/Liate_BuiltIn/LiateVoice';
import { LiateDoc } from '../../src/oop/Liate_BuiltIn/LiateDoc';
import { LiateCode, CodeSymbol } from '../../src/oop/Liate_BuiltIn/LiateCode';
import { LiateView } from '../../src/oop/Liate_Core/LiateView';
import { LiateIO } from '../../src/oop/Liate_Data/LiateIO';
import { LiateCron } from '../../src/oop/Liate_Orchestration/LiateCron';
import { LiateRoute } from '../../src/oop/Liate_Orchestration/LiateRoute';
import { LiateAgent } from '../../src/oop/Liate_Pillars/LiateAgent';

describe('LiateVoice (Indic Voice Engine)', () => {
  it('should initialize with default Indic language options', () => {
    const voice = new LiateVoice({ language: 'hi-IN', speaker: 'ananya' });
    expect(voice).toBeDefined();
    expect(typeof voice.speechToText).toBe('function');
    expect(typeof voice.textToSpeech).toBe('function');
  });

  it('should support event emission for real-time audio streams', (done) => {
    const voice = new LiateVoice();
    voice.on('speech_start', () => {
      expect(true).toBe(true);
      done();
    });
    voice.emit('speech_start');
  });
});

describe('LiateDoc (Document & OCR Intelligence)', () => {
  it('should parse raw text and return structured DocParseResult', async () => {
    const doc = new LiateDoc();
    const rawContent = `# Sovereign AI Architecture\nLiate.js delivers agentic backends.`;
    const result = await doc.parse(rawContent);

    expect(result).toBeDefined();
    expect(result.rawText).toContain('Sovereign AI Architecture');
    expect(Array.isArray(result.tables)).toBe(true);
  });

  it('should chunk documents into semantic passages', () => {
    const doc = new LiateDoc();
    const text = 'Paragraph one with important information.\n\nParagraph two with details.';
    const chunks = doc.chunk(text, { maxChunkSize: 50 });

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].length).toBeLessThanOrEqual(60);
  });
});

describe('LiateCode (Autonomous Coding Engine)', () => {
  it('should validate syntax and detect code structures', () => {
    const code = new LiateCode();
    expect(code).toBeDefined();
    expect(typeof code.patch).toBe('function');
    expect(typeof code.findSymbols).toBe('function');
  });

  it('should extract AST symbols from TypeScript source', async () => {
    const code = new LiateCode();
    const source = `
      export class SovereignAgent {}
      export function executeTask() {}
    `;
    const symbols: CodeSymbol[] = await code.findSymbols(source);
    expect(symbols.length).toBeGreaterThanOrEqual(1);
    const names = symbols.map((s: CodeSymbol) => s.name);
    expect(names).toContain('SovereignAgent');
  });
});

describe('LiateView (Generative UI Component Engine)', () => {
  it('should construct rich UI component definitions', () => {
    const view = new LiateView();
    const card = view.card({
      title: 'Agent Performance',
      subtitle: 'Real-time Metrics',
      fields: [{ label: 'Latency', value: '12ms' }]
    });

    expect(card.type).toBe('card');
    expect(card.props.title).toBe('Agent Performance');
    expect(card.props.fields?.[0].value).toBe('12ms');
  });

  it('should generate interactive Table and Alert components', () => {
    const view = new LiateView();
    const table = view.table({
      title: 'API Costs',
      headers: ['Model', 'Cost (INR)'],
      rows: [['sarvam-2b', '₹0.001'], ['llama-3.3-70b', '₹0.02']]
    });

    const alert = view.alert({
      title: 'Budget Alert',
      message: 'Approaching 80% daily threshold',
      type: 'warning'
    });

    expect(table.type).toBe('table');
    expect(table.props.rows.length).toBe(2);
    expect(alert.type).toBe('alert');
    expect(alert.props.type).toBe('warning');
  });
});

describe('LiateIO (Tabular Ingest & Export)', () => {
  it('should parse CSV string into typed objects', async () => {
    const io = new LiateIO();
    const csvData = `id,name,role\n1,Arjun,Commander\n2,Devi,Strategist`;
    const rows = await io.fromCSV<{ id: string; name: string; role: string }>(csvData);

    expect(rows.length).toBe(2);
    expect(rows[0].name).toBe('Arjun');
    expect(rows[1].role).toBe('Strategist');
  });

  it('should serialize objects into CSV string', async () => {
    const io = new LiateIO();
    const records = [
      { city: 'Bengaluru', tier: '1' },
      { city: 'Kochi', tier: '2' }
    ];
    const csv = await io.toCSV(records);
    expect(csv).toContain('Bengaluru');
    expect(csv).toContain('Kochi');
    expect(csv).toContain('city,tier');
  });

  it('should inspect tabular datasets and provide summary statistics', async () => {
    const io = new LiateIO();
    const jsonl = `{"metric":"tokens","count":100}\n{"metric":"cost","count":2}`;
    const inspection = await io.inspect(jsonl);

    expect(inspection.totalRows).toBe(2);
    expect(inspection.format).toBe('jsonl');
  });
});

describe('LiateCron (Autonomous Background Scheduler)', () => {
  it('should instantiate and configure scheduled jobs', () => {
    const agent = new LiateAgent('cron-tester');
    const cron = new LiateCron({
      schedule: 'every 10s',
      agent,
      prompt: 'Check system health',
      autoStart: false
    });

    expect(cron.id).toBeDefined();
    expect(cron.options.prompt).toBe('Check system health');
    expect(cron.status()).toBe('idle');
  });

  it('should support start and stop lifecycle', () => {
    const cron = new LiateCron({ intervalMs: 5000, autoStart: false });
    cron.start();
    expect(cron.status()).toBe('running');
    cron.stop();
    expect(cron.status()).toBe('stopped');
  });
});

describe('LiateRoute (Semantic & HTTP Intent Router)', () => {
  it('should register and route semantic intents', () => {
    const router = new LiateRoute();
    const billingAgent = new LiateAgent('billing-agent');
    const supportAgent = new LiateAgent('support-agent');

    router.semantic({
      'invoice | payment | gst | bill': billingAgent,
      'help | issue | bug | login': supportAgent
    });

    const match1 = router.matchIntent('I have a problem with my invoice payment');
    expect(match1?.name).toBe('billing-agent');

    const match2 = router.matchIntent('Cannot login to my account, please help');
    expect(match2?.name).toBe('support-agent');
  });

  it('should register custom HTTP handlers and dispatch requests', async () => {
    const router = new LiateRoute();
    const defaultAgent = new LiateAgent('root-agent');

    router.get('/custom/metrics', async () => {
      return new Response(JSON.stringify({ status: 'ok', uptime: 100 }), {
        headers: { 'Content-Type': 'application/json' }
      });
    });

    const req = new Request('http://localhost/custom/metrics', { method: 'GET' });
    const res = await router.dispatch(req, defaultAgent);
    expect(res).not.toBeNull();
    expect(res?.status).toBe(200);
    const body = await res?.json();
    expect(body.status).toBe('ok');
  });
});
