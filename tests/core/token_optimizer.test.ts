/**
 * Tests for core/token_optimizer.ts
 * Run with: bun test
 */

import { describe, it, expect } from 'bun:test';
import {
  minifyToolSchemas,
  sanitizeToolOutput,
  pruneTrajectoryMessages
} from '../../src/om';
import type { LlmMessage } from '../../src/aum/llm';

// ─── minifyToolSchemas ───────────────────────────────────────────────────────

describe('minifyToolSchemas', () => {
  it('returns empty array for empty input', () => {
    expect(minifyToolSchemas([])).toEqual([]);
  });

  it('returns empty array for null/undefined input', () => {
    expect(minifyToolSchemas(null as any)).toEqual([]);
    expect(minifyToolSchemas(undefined as any)).toEqual([]);
  });

  it('strips $schema, title, additionalProperties, default from inputSchema', () => {
    const tools = [{
      name: 'websearch',
      description: 'Search the web',
      inputSchema: {
        $schema: 'http://json-schema.org/draft-07/schema#',
        title: 'WebSearch Input',
        additionalProperties: false,
        default: {},
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query', default: '' }
        },
        required: ['query']
      }
    }];

    const result = minifyToolSchemas(tools);
    expect(result[0].name).toBe('websearch');
    expect(result[0].inputSchema!.$schema).toBeUndefined();
    expect(result[0].inputSchema!.title).toBeUndefined();
    expect(result[0].inputSchema!.additionalProperties).toBeUndefined();
    // type, properties, required should be preserved
    expect(result[0].inputSchema!.type).toBe('object');
    expect(result[0].inputSchema!.required).toEqual(['query']);
  });

  it('truncates long descriptions to 150 chars', () => {
    const tools = [{
      name: 'tool',
      description: 'A'.repeat(200),
      inputSchema: {}
    }];
    const result = minifyToolSchemas(tools);
    expect(result[0].description!.length).toBeLessThanOrEqual(150);
    expect(result[0].description!.endsWith('...')).toBe(true);
  });

  it('preserves short descriptions unchanged', () => {
    const tools = [{ name: 'tool', description: 'Short desc', inputSchema: {} }];
    const result = minifyToolSchemas(tools);
    expect(result[0].description).toBe('Short desc');
  });
});

// ─── sanitizeToolOutput ──────────────────────────────────────────────────────

describe('sanitizeToolOutput', () => {
  it('returns empty string for null/undefined', () => {
    expect(sanitizeToolOutput(null)).toBe('');
    expect(sanitizeToolOutput(undefined)).toBe('');
  });

  it('truncates strings longer than maxChars', () => {
    const longStr = 'a'.repeat(4000);
    const result = sanitizeToolOutput(longStr, 100);
    expect(result.length).toBeLessThan(150);
    expect(result).toContain('[Truncated for token optimization]');
  });

  it('strips base64-like blobs (long strings without spaces)', () => {
    const obj = {
      title: 'My Doc',
      base64Content: 'A'.repeat(200) // no spaces, >100 chars
    };
    const result = sanitizeToolOutput(obj);
    const parsed = JSON.parse(result);
    expect(parsed.base64Content).toContain('[token_pruned]');
    expect(parsed.title).toBe('My Doc');
  });

  it('slices large arrays to top 10 with summary', () => {
    const obj = { items: Array.from({ length: 20 }, (_, i) => ({ id: i })) };
    const result = sanitizeToolOutput(obj);
    const parsed = JSON.parse(result);
    expect(parsed.items.length).toBe(11); // 10 items + 1 summary object
    expect(parsed.items[10]._summary).toContain('10 additional');
  });

  it('removes pagination cursor keys', () => {
    const obj = {
      data: [{ id: 1 }],
      nextPageToken: 'abc123cursor',
      cursor: 'xyz',
      requestId: 'req-abc'
    };
    const result = sanitizeToolOutput(obj);
    const parsed = JSON.parse(result);
    expect(parsed.nextPageToken).toBeUndefined();
    expect(parsed.cursor).toBeUndefined();
    expect(parsed.requestId).toBeUndefined();
    expect(parsed.data).toBeDefined();
  });
});

// ─── pruneTrajectoryMessages ─────────────────────────────────────────────────

describe('pruneTrajectoryMessages', () => {
  it('returns unchanged messages if <= 4', () => {
    const msgs: LlmMessage[] = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi' }
    ];
    expect(pruneTrajectoryMessages(msgs)).toEqual(msgs);
  });

  it('compacts old tool messages beyond keepRecentTurns window', () => {
    // Build a 10-message history with 5 tool outputs
    const msgs: LlmMessage[] = [
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'a1', toolCalls: [{ id: 't1', name: 'search', args: {} }] },
      { role: 'tool', content: 'X'.repeat(400), toolResult: { toolCallId: 't1', name: 'search', result: 'X'.repeat(400) } },
      { role: 'user', content: 'q2' },
      { role: 'assistant', content: 'a2', toolCalls: [{ id: 't2', name: 'search', args: {} }] },
      { role: 'tool', content: 'Y'.repeat(400), toolResult: { toolCallId: 't2', name: 'search', result: 'Y'.repeat(400) } },
      { role: 'user', content: 'q3' },
      { role: 'assistant', content: 'a3', toolCalls: [{ id: 't3', name: 'search', args: {} }] },
      { role: 'tool', content: 'Z'.repeat(400), toolResult: { toolCallId: 't3', name: 'search', result: 'Z'.repeat(400) } },
      { role: 'user', content: 'q4' }
    ];

    const result = pruneTrajectoryMessages(msgs, 1);
    // Recent tool outputs should be preserved, older ones compacted
    const toolMessages = result.filter(m => m.role === 'tool');
    const compacted = toolMessages.filter(m => typeof m.content === 'string' && m.content.includes('[Historical output compacted]'));
    expect(compacted.length).toBeGreaterThan(0);
  });

  it('preserves user and assistant messages regardless of age', () => {
    const msgs: LlmMessage[] = Array.from({ length: 10 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `message ${i}`
    } as LlmMessage));

    const result = pruneTrajectoryMessages(msgs, 1);
    const userMsgs = result.filter(m => m.role === 'user');
    const asstMsgs = result.filter(m => m.role === 'assistant');
    expect(userMsgs.length).toBe(5);
    expect(asstMsgs.length).toBe(5);
  });
});
