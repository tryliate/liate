/**
 * Liate — Sovereign AI Agent Engine
 * Universal Dual-Runtime Entry Point: Deno Deploy, Deno CLI, Bun, and Edge Isolates
 */

import { WSHub, createLiateApp } from './src/lapi/index.ts';
import { initStore } from './src/store/index.ts';

// 1. Initialize persistent storage (with graceful memory fallback for read-only edge runtimes)
await initStore().catch((err) => {
  console.warn('[LIATE STORE] Running in edge stateless/in-memory mode:', err?.message || err);
});

// 2. Instantiate WebSocket hub and Hono App
export const wsHub = new WSHub();
export const app = createLiateApp(wsHub);

const isDeno = typeof (globalThis as any).Deno !== 'undefined';
const isBun = typeof (globalThis as any).Bun !== 'undefined';

// 3. Standalone Runner for Deno CLI (`deno run main.ts` or `deno task start`)
if (isDeno && (import.meta as any).main) {
  const Deno = (globalThis as any).Deno;
  const port = Number(Deno.env?.get?.('PORT')) || 8000;

  Deno.serve({ port }, (req: Request) => {
    if (req.headers.get('upgrade') === 'websocket') {
      try {
        const { socket, response } = Deno.upgradeWebSocket(req);
        socket.onopen = () => wsHub.addClient(socket);
        socket.onmessage = (e: MessageEvent) => {
          try {
            const data = JSON.parse(e.data);
            if (data.type === 'tool_approval_response' && data.id) {
              wsHub.resolveApproval(data.id, data.allowed !== false, !!data.always_allow, data.toolName);
            }
          } catch {}
        };
        socket.onclose = () => wsHub.removeClient(socket);
        return response;
      } catch (err) {
        console.error('[WebSocket Upgrade Error]:', err);
      }
    }
    return app.fetch(req);
  });
}

// 4. Universal Default Export for Deno Deploy, Cloudflare Workers, and Bun.serve
export default {
  port: Number(process.env.PORT) || 7071,
  fetch(req: Request, server?: any) {
    if (server?.upgrade && server.upgrade(req)) {
      return undefined;
    }
    return app.fetch(req);
  },
  websocket: {
    open(ws: any) {
      wsHub.addClient(ws);
    },
    message(ws: any, message: any) {
      try {
        const raw = typeof message === 'string' ? message : new TextDecoder().decode(message);
        const data = JSON.parse(raw);
        if (data.type === 'tool_approval_response' && data.id) {
          const allowed = data.allowed !== false;
          const always = !!data.always_allow || !!data.always;
          wsHub.resolveApproval(data.id, allowed, always, data.toolName);
        }
      } catch {}
    },
    close(ws: any) {
      wsHub.removeClient(ws);
    }
  }
};
