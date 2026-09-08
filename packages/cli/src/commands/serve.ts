import { initStore } from '@liate/store';
import { WSHub, createLiateApp } from '@liate/server';

/**
 * Starts the sovereign Liate runtime HTTP & WebSocket engine (Hono + Bun)
 */
export async function serveCommand(args: string[] = []): Promise<void> {
  await initStore();
  
  let port = parseInt(process.env.PORT || '7071', 10);
  const portIdx = args.findIndex(a => a === '--port' || a === '-p');
  if (portIdx !== -1 && args[portIdx + 1]) {
    const parsed = parseInt(args[portIdx + 1], 10);
    if (!isNaN(parsed)) port = parsed;
  }

  const wsHub = new WSHub();
  const app = createLiateApp(wsHub);

  const server = Bun.serve({
    port,
    fetch(req, server) {
      if (server.upgrade(req)) return undefined;
      return app.fetch(req);
    },
    websocket: {
      open(ws) { wsHub.addClient(ws); },
      message(ws, message) {
        try {
          const raw = typeof message === 'string' ? message : new TextDecoder().decode(message);
          const data = JSON.parse(raw);
          if (data.type === 'tool_approval_response' && data.id) {
            wsHub.resolveApproval(data.id, data.allowed !== false, !!data.always_allow, data.toolName);
          }
        } catch {}
      },
      close(ws) { wsHub.removeClient(ws); },
    }
  });

  console.log(`\n================================================================================`);
  console.log(`[LIATE ENGINE] SOVEREIGN AGENT RUNTIME (HONO + BUN NATIVE)`);
  console.log(`================================================================================`);
  console.log(`[HTTP REST API]   http://localhost:${server.port}`);
  console.log(`[WEBSOCKET HUB]   ws://localhost:${server.port}`);
  console.log(`================================================================================\n`);
}
