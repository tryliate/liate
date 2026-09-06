import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { getProjectLogsFile } from './paths';

export interface LiateLogEvent {
  timestamp: string;
  agent?: string;
  type: 'STATUS' | 'THOUGHT' | 'TOOL_CALL' | 'TOOL_RESULT' | 'CHUNK' | 'RESULT' | 'ERROR';
  content: string;
  turn?: number;
  tokens?: {
    prompt?: number;
    completion?: number;
  };
  durationMs?: number;
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
  attributes?: Record<string, any>;
}

export interface OtelConfig {
  endpoint?: string;
  headers?: Record<string, string>;
  serviceName?: string;
  enabled?: boolean;
}

/**
 * Generate standard 16-byte hex trace ID
 */
export function generateTraceId(): string {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Generate standard 8-byte hex span ID
 */
export function generateSpanId(): string {
  return crypto.randomBytes(8).toString('hex');
}

/**
 * Append a structured trace event to .liate/liate_logs.jsonl and optionally forward to OTel OTLP collector
 */
export async function appendLog(
  event: Omit<LiateLogEvent, 'timestamp'> & { timestamp?: string }, 
  cwd: string = process.cwd()
): Promise<void> {
  const timestamp = event.timestamp || new Date().toISOString();
  const traceId = event.traceId || (globalThis as any).__LIATE_ACTIVE_TRACE_ID || generateTraceId();
  const spanId = event.spanId || generateSpanId();

  const record: LiateLogEvent = {
    timestamp,
    traceId,
    spanId,
    ...event
  };

  // 1. Local JSONL Trace Log
  try {
    const logPath = getProjectLogsFile(cwd);
    await fs.mkdir(path.dirname(logPath), { recursive: true });
    const line = JSON.stringify(record) + '\n';
    await fs.appendFile(logPath, line, 'utf-8');
  } catch {}

  // 2. OpenTelemetry (OTLP) HTTP Forwarder (Non-blocking)
  sendOtelSpan(record).catch(() => {});
}

/**
 * Send OTel Span to standard OpenTelemetry Collector over OTLP/HTTP
 */
export async function sendOtelSpan(event: LiateLogEvent): Promise<void> {
  const endpoint = 
    process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT || 
    (process.env.OTEL_EXPORTER_OTLP_ENDPOINT ? `${process.env.OTEL_EXPORTER_OTLP_ENDPOINT.replace(/\/$/, '')}/v1/traces` : null);

  if (!endpoint) return;

  const rawHeaders = process.env.OTEL_EXPORTER_OTLP_HEADERS || '';
  const parsedHeaders: Record<string, string> = {};
  if (rawHeaders) {
    rawHeaders.split(',').forEach(h => {
      const [k, v] = h.split('=');
      if (k && v) parsedHeaders[k.trim()] = v.trim();
    });
  }

  const startTimeNanos = (new Date(event.timestamp).getTime() * 1_000_000).toString();
  const endTimeNanos = ((new Date(event.timestamp).getTime() + (event.durationMs || 10)) * 1_000_000).toString();

  const spanAttributes: Array<{ key: string; value: any }> = [
    { key: 'gen_ai.event.type', value: { stringValue: event.type } },
    { key: 'gen_ai.agent.name', value: { stringValue: event.agent || 'liate-agent' } },
    { key: 'gen_ai.content', value: { stringValue: event.content.substring(0, 2048) } },
  ];

  if (event.turn !== undefined) {
    spanAttributes.push({ key: 'gen_ai.agent.turn', value: { intValue: event.turn } });
  }

  if (event.tokens) {
    if (event.tokens.prompt) {
      spanAttributes.push({ key: 'gen_ai.usage.prompt_tokens', value: { intValue: event.tokens.prompt } });
    }
    if (event.tokens.completion) {
      spanAttributes.push({ key: 'gen_ai.usage.completion_tokens', value: { intValue: event.tokens.completion } });
    }
  }

  if (event.attributes) {
    for (const [k, v] of Object.entries(event.attributes)) {
      spanAttributes.push({ key: k, value: { stringValue: String(v) } });
    }
  }

  const otlpPayload = {
    resourceSpans: [
      {
        resource: {
          attributes: [
            { key: 'service.name', value: { stringValue: event.agent || 'liate-sovereign-agent' } },
            { key: 'telemetry.sdk.name', value: { stringValue: 'liate-adk-telemetry' } },
            { key: 'telemetry.sdk.version', value: { stringValue: '2.0.0' } },
          ],
        },
        scopeSpans: [
          {
            scope: { name: 'liate.react.loop', version: '2.0.0' },
            spans: [
              {
                traceId: event.traceId?.padEnd(32, '0') || generateTraceId(),
                spanId: event.spanId?.padEnd(16, '0') || generateSpanId(),
                parentSpanId: event.parentSpanId?.padEnd(16, '0'),
                name: `liate.react.${event.type.toLowerCase()}`,
                kind: 1, // SPAN_KIND_INTERNAL
                startTimeUnixNano: startTimeNanos,
                endTimeUnixNano: endTimeNanos,
                attributes: spanAttributes,
                status: {
                  code: event.type === 'ERROR' ? 2 : 1, // 2 = STATUS_CODE_ERROR, 1 = STATUS_CODE_OK
                },
              },
            ],
          },
        ],
      },
    ],
  };

  try {
    await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...parsedHeaders,
      },
      body: JSON.stringify(otlpPayload),
    });
  } catch {}
}

/**
 * Read the last N logs from .liate/liate_logs.jsonl
 */
export async function readRecentLogs(
  limit: number = 50, 
  cwd: string = process.cwd()
): Promise<LiateLogEvent[]> {
  const logPath = getProjectLogsFile(cwd);
  try {
    const raw = await fs.readFile(logPath, 'utf-8');
    const lines = raw.split('\n').filter(l => l.trim().length > 0);
    const recent = lines.slice(-limit);
    return recent.map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    }).filter(Boolean) as LiateLogEvent[];
  } catch {
    return [];
  }
}

/**
 * Clear the logfile
 */
export async function clearLogs(cwd: string = process.cwd()): Promise<void> {
  const logPath = getProjectLogsFile(cwd);
  try {
    await fs.rm(logPath, { force: true });
  } catch {}
}



