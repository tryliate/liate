import { Hono } from 'hono';
import { createLiateApp, WSHub } from '@liate/server';
import { initStore } from '@liate/store';

export interface LiateServerOptions {
  port?: number;
  cwd?: string;
  silent?: boolean;
}

/**
 * Sovereign AI Agent Host Server (LAPI/v1 + WebSocket Engine)
 */
export class LiateServer {
  public port: number;
  public cwd: string;
  public wsHub: WSHub;
  public app: Hono;
  private serverInstance?: any;
  private silent: boolean;

  constructor(options: LiateServerOptions = {}) {
    this.port = options.port || parseInt(process.env.PORT || '7071', 10);
    this.cwd = options.cwd || process.cwd();
    this.silent = !!options.silent;
    this.wsHub = new WSHub();
    this.app = createLiateApp(this.wsHub);
  }

  /**
   * Start the LiateServer HTTP & WebSocket listener
   */
  public async start(): Promise<void> {
    await initStore().catch((err: any) => {
      if (!this.silent) {
        console.warn('[LIATE STORE] Read-only or restricted filesystem detected:', err?.message || err);
      }
    });

    const wsHub = this.wsHub;
    const app = this.app;

    // 1. Native Deno Server (Deno / Deno Deploy)
    if (typeof (globalThis as any).Deno !== 'undefined') {
      const Deno = (globalThis as any).Deno;
      this.serverInstance = Deno.serve({
        port: this.port,
        onListen: () => {
          if (!this.silent) {
            console.log(`\n================================================================================`);
            console.log(`[LIATE SERVER] SOVEREIGN LAPI/v1 AGENT RUNTIME (DENO NATIVE)`);
            console.log(`================================================================================`);
            console.log(`[HTTP LAPI REST]  http://localhost:${this.port}`);
            console.log(`[WEBSOCKET HUB]   ws://localhost:${this.port}`);
            console.log(`[PROTOCOL]        LAPI/v1`);
            console.log(`================================================================================\n`);
          }
        }
      }, (req: Request) => {
        if (req.headers.get("upgrade") === "websocket") {
          try {
            const { socket, response } = Deno.upgradeWebSocket(req);
            socket.onopen = () => wsHub.addClient(socket);
            socket.onmessage = (e: MessageEvent) => {
              try {
                const data = JSON.parse(e.data);
                if (data.type === 'tool_approval_response' && data.id) {
                  const allowed = data.allowed !== false;
                  const always = !!data.always_allow || !!data.always;
                  wsHub.resolveApproval(data.id, allowed, always, data.toolName);
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
      return;
    }

    // 2. Native Bun Server
    if (typeof (globalThis as any).Bun !== 'undefined') {
      const Bun = (globalThis as any).Bun;
      this.serverInstance = Bun.serve({
        port: this.port,
        idleTimeout: 120,
        fetch(req: Request, server: any) {
          if (server.upgrade(req)) {
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
      });

      if (!this.silent) {
        console.log(`\n================================================================================`);
        console.log(`[LIATE SERVER] SOVEREIGN LAPI/v1 AGENT RUNTIME (BUN NATIVE)`);
        console.log(`================================================================================`);
        console.log(`[HTTP LAPI REST]  http://localhost:${this.serverInstance.port}`);
        console.log(`[WEBSOCKET HUB]   ws://localhost:${this.serverInstance.port}`);
        console.log(`[PROTOCOL]        LAPI/v1`);
        console.log(`================================================================================\n`);
      }
      return;
    }
  }

  /**
   * Stop the LiateServer listener
   */
  public async stop(): Promise<void> {
    if (this.serverInstance) {
      if (typeof this.serverInstance.stop === 'function') {
        this.serverInstance.stop();
      } else if (typeof this.serverInstance.shutdown === 'function') {
        await this.serverInstance.shutdown();
      }
      this.serverInstance = undefined;
    }
  }

  /**
   * Fetch handler for embedding in Hono, Express, Next.js or Cloudflare Workers
   */
  public get fetch() {
    return this.app.fetch.bind(this.app);
  }
}
