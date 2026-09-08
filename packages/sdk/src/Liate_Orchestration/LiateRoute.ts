/**
 * [25] - LiateRoute (Semantic Intent Router, Webhook Listener & Custom Endpoint Engine)
 * 
 * Routes incoming HTTP / LAPI requests via natural language semantic intent matching,
 * provides custom agent-backed REST endpoints, and manages autonomous webhook handlers.
 */

import { LiateAgent } from '../Liate_Pillars/LiateAgent';

export interface RouteContext {
  req: Request;
  params: Record<string, string>;
  query: Record<string, string>;
  json: () => Promise<any>;
  text: () => Promise<string>;
  agent: LiateAgent;
}

export type RouteHandler = (ctx: RouteContext) => Promise<Response | any> | Response | any;

export interface WebhookConfig {
  secret?: string;
  signatureHeader?: string;
  handler: (event: any, agent: LiateAgent) => Promise<void | any>;
}

export interface RouteGuardrails {
  maxBudgetINR?: number;
  rateLimit?: { max: number; windowMs: number };
  requireAuth?: boolean;
}

export interface CustomRoute {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  guardrails?: RouteGuardrails;
  handler: RouteHandler;
}

export class LiateRoute {
  private semanticMap: Map<string, LiateAgent> = new Map();
  private routes: CustomRoute[] = [];
  private webhooks: Map<string, WebhookConfig> = new Map();

  constructor() {}

  /**
   * Register semantic natural-language intent mappings
   * e.g. router.semantic({ "tax | gst | invoice": taxAgent, "code | git | bug": devAgent })
   */
  public semantic(mappings: Record<string, LiateAgent>): this {
    for (const [pattern, agent] of Object.entries(mappings)) {
      this.semanticMap.set(pattern.toLowerCase(), agent);
    }
    return this;
  }

  /**
   * Register a custom GET endpoint
   */
  public get(path: string, handler: RouteHandler): this {
    this.routes.push({ method: 'GET', path, handler });
    return this;
  }

  /**
   * Register a custom POST endpoint with optional guardrails
   */
  public post(
    path: string, 
    handlerOrConfig: RouteHandler | { guardrails?: RouteGuardrails; handler: RouteHandler }
  ): this {
    if (typeof handlerOrConfig === 'function') {
      this.routes.push({ method: 'POST', path, handler: handlerOrConfig });
    } else {
      this.routes.push({ 
        method: 'POST', 
        path, 
        guardrails: handlerOrConfig.guardrails, 
        handler: handlerOrConfig.handler 
      });
    }
    return this;
  }

  /**
   * Register an autonomous webhook listener (Razorpay, Stripe, GitHub)
   */
  public webhook(path: string, config: WebhookConfig): this {
    this.webhooks.set(path, config);
    return this;
  }

  /**
   * Match user prompt against registered semantic intent patterns
   */
  public matchIntent(prompt: string): LiateAgent | null {
    const clean = prompt.toLowerCase();

    for (const [pattern, agent] of this.semanticMap.entries()) {
      const keywords = pattern.split('|').map(k => k.trim());
      for (const keyword of keywords) {
        if (clean.includes(keyword)) {
          return agent;
        }
      }
    }

    return null;
  }

  /**
   * Dispatches incoming HTTP requests against registered custom routes and webhooks
   */
  public async dispatch(req: Request, defaultAgent: LiateAgent): Promise<Response | null> {
    const url = new URL(req.url);
    const pathname = url.pathname;
    const method = req.method.toUpperCase();

    // 1. Check Webhooks
    const webhook = this.webhooks.get(pathname);
    if (webhook && method === 'POST') {
      try {
        const body = await req.json();
        await webhook.handler(body, defaultAgent);
        return new Response(JSON.stringify({ success: true, processed: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message || 'Webhook failed' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // 2. Check Custom REST Routes
    for (const r of this.routes) {
      if (r.method === method && r.path === pathname) {
        const ctx: RouteContext = {
          req,
          params: {},
          query: Object.fromEntries(url.searchParams.entries()),
          json: () => req.json(),
          text: () => req.text(),
          agent: defaultAgent
        };

        const result = await r.handler(ctx);
        if (result instanceof Response) return result;

        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    return null; // Route not matched by custom router
  }

  public getSemanticEntries(): Array<{ pattern: string; agentName: string }> {
    const entries: Array<{ pattern: string; agentName: string }> = [];
    for (const [pattern, agent] of this.semanticMap.entries()) {
      entries.push({ pattern, agentName: agent.name });
    }
    return entries;
  }

  public getCustomRoutes(): Array<{ method: string; path: string }> {
    return this.routes.map(r => ({ method: r.method, path: r.path }));
  }
}

export const Route = LiateRoute;
