import { Context } from 'hono';

export const healthHandler = (c: Context) => {
  const isDeno = typeof (globalThis as any).Deno !== 'undefined';
  const isBun = typeof (globalThis as any).Bun !== 'undefined';
  const runtime = isDeno ? 'Deno Deploy / Edge Native (Hono)' : isBun ? 'Bun / Edge Native (Hono)' : 'Node / Edge Native (Hono)';

  return c.json({
    name: 'liate',
    status: 'online',
    protocol: 'LAPI/v1',
    runtime,
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
};


