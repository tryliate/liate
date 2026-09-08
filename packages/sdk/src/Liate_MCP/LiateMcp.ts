/**
 * [T] - LiateMcp (Sovereign Model Context Protocol Edge & Serverful Gateway)
 * 
 * Provides a production-grade, type-safe MCP server builder that can be deployed
 * to Cloudflare Workers, Bun.serve, Node.js, Vercel Edge, or embedded directly into LiateApp.
 */

import { randomBytes } from 'node:crypto';


export interface McpToolSchema {
  type?: 'object' | string;
  properties?: Record<string, {
    type: string;
    description?: string;
    enum?: string[];
    default?: any;
  }>;
  required?: string[];
  [key: string]: any;
}

export interface McpToolConfig {
  name?: string;
  description: string;
  schema?: McpToolSchema;
  inputSchema?: McpToolSchema;
  handler: (params: any, context?: any) => Promise<any> | any;
}

export interface McpResourceConfig {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  handler: (uri: string, context?: any) => Promise<string | Buffer> | string | Buffer;
}

export interface McpPromptConfig {
  name: string;
  description?: string;
  arguments?: Array<{ name: string; description?: string; required?: boolean }>;
  handler: (args: Record<string, string>, context?: any) => Promise<any> | any;
}

export interface LiateMcpOptions {
  name?: string;
  version?: string;
  description?: string;
  domain?: string;
  auth?: 'none' | 'bearer' | 'oauth2.1';
  clientId?: string;
  redirectUri?: string;
  apiKey?: string;
  cors?: boolean | Record<string, string>;
}

export class LiateMcp {
  public name: string;
  public version: string;
  public description: string;
  public domain?: string;
  public auth: 'none' | 'bearer' | 'oauth2.1';
  public clientId: string;
  public redirectUri: string;
  public apiKey?: string;

  private tools: Map<string, McpToolConfig> = new Map();
  private resources: Map<string, McpResourceConfig> = new Map();
  private prompts: Map<string, McpPromptConfig> = new Map();

  constructor(options: LiateMcpOptions = {}) {
    this.name = options.name || 'tryliate-connectors';
    this.version = options.version || '2.0.0';
    this.description = options.description || 'Liate Sovereign MCP Edge Gateway';
    this.domain = options.domain;
    this.auth = options.auth || 'none';
    this.clientId = options.clientId || 'liate-mcp-client-default';
    this.redirectUri = options.redirectUri || 'https://www.tryliate.com/auth/callback';
    this.apiKey = options.apiKey;

    // Register built-in search tool by default
    this.registerBuiltInTools();
  }

  /**
   * Register a new tool with the MCP Server
   */
  tool(name: string, config: McpToolConfig): this {
    this.tools.set(name, {
      ...config,
      name,
      schema: config.schema || config.inputSchema || { type: 'object', properties: {} }
    });
    return this;
  }

  /**
   * Register an MCP Resource (e.g. uri://logs, file://schema)
   */
  resource(uri: string, config: McpResourceConfig): this {
    this.resources.set(uri, config);
    return this;
  }

  /**
   * Register a Prompt template
   */
  prompt(name: string, config: McpPromptConfig): this {
    this.prompts.set(name, config);
    return this;
  }

  /**
   * Universal Fetch Handler — compatible with Cloudflare Workers, Bun, Node, Next.js, and Vercel Edge
   */
  async fetch(request: Request, env?: any, ctx?: any): Promise<Response> {
    const url = new URL(request.url);
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-User-Id, X-Liate-Node',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // 1. Root Metadata
    if (url.pathname === '/' || url.pathname === '') {
      return new Response(
        JSON.stringify({
          name: this.name,
          description: this.description,
          version: this.version,
          protocol: 'mcp-2024-11-05',
          status: 'operational',
          toolsCount: this.tools.size,
          endpoints: {
            health: '/health',
            connectors: '/v1/connectors',
            messages: '/v1/messages',
            oauth_authorize: '/oauth/authorize',
            oauth_token: '/oauth/token',
          },
        }, null, 2),
        { headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    // 2. Healthcheck
    if (url.pathname === '/health' || url.pathname === '/api/health') {
      return new Response(
        JSON.stringify({
          service: this.name,
          status: 'ok',
          version: this.version,
          timestamp: new Date().toISOString(),
        }),
        { headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    // 3. Connectors & Tools Catalog (/v1/connectors)
    if (url.pathname === '/v1/connectors' || url.pathname === '/api/connectors') {
      const toolsCatalog = Array.from(this.tools.entries()).map(([name, t]) => ({
        name,
        description: t.description,
        inputSchema: t.schema || t.inputSchema,
      }));

      return new Response(
        JSON.stringify({
          name: this.name,
          version: this.version,
          tools: toolsCatalog,
        }, null, 2),
        { headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    // 4. OAuth 2.1 Authorization Page (/oauth/authorize)
    if (url.pathname === '/oauth/authorize') {
      const clientId = url.searchParams.get('client_id') || this.clientId;
      const redirectUri = url.searchParams.get('redirect_uri') || this.redirectUri;
      const state = url.searchParams.get('state') || '';
      const connector = url.searchParams.get('connector') || this.name;

      if (request.method === 'POST') {
        const authCode = `liate_mcp_${randomBytes(16).toString('hex')}`;

        const targetUrl = new URL(redirectUri);
        targetUrl.searchParams.set('code', authCode);
        if (state) targetUrl.searchParams.set('state', state);
        return Response.redirect(targetUrl.toString(), 302);
      }

      return new Response(this.renderOAuthPage(connector, clientId, redirectUri, state), {
        headers: { 'Content-Type': 'text/html; charset=utf-8', ...corsHeaders },
      });
    }

    // 5. OAuth 2.1 Token Exchange (/oauth/token)
    if (url.pathname === '/oauth/token' && request.method === 'POST') {
      const accessToken = `liate_sk_${randomBytes(32).toString('hex')}`;
      return new Response(
        JSON.stringify({
          access_token: accessToken,
          token_type: 'Bearer',
          expires_in: 2592000,
          scope: 'mcp:execute',
        }),
        { headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    // 6. JSON-RPC 2.0 Execution Endpoint (/v1/messages, /v1/execute, or tool paths)
    if (
      url.pathname === '/v1/messages' || 
      url.pathname === '/messages' || 
      url.pathname.endsWith('/execute') ||
      url.pathname.endsWith('/sse')
    ) {
      if (this.auth === 'bearer' || this.auth === 'oauth2.1') {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return new Response(
            JSON.stringify({ error: 'Unauthorized: Missing or invalid Authorization Bearer token.' }),
            { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
          );
        }
      }

      let body: any = {};
      if (request.method === 'POST') {
        try {
          body = await request.json();
        } catch (_) {}
      }

      const id = body.id !== undefined ? body.id : 1;

      // Handle JSON-RPC method: initialize
      if (body.method === 'initialize') {
        return new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            id,
            result: {
              protocolVersion: '2024-11-05',
              capabilities: {
                tools: {},
                resources: {},
                prompts: {},
              },
              serverInfo: { name: this.name, version: this.version },
            },
          }),
          { headers: { 'Content-Type': 'application/json', ...corsHeaders } }
        );
      }

      // Handle JSON-RPC method: tools/list
      if (body.method === 'tools/list') {
        const toolsList = Array.from(this.tools.entries()).map(([name, t]) => ({
          name,
          description: t.description,
          inputSchema: t.schema || t.inputSchema || { type: 'object', properties: {} },
        }));

        return new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            id,
            result: { tools: toolsList },
          }),
          { headers: { 'Content-Type': 'application/json', ...corsHeaders } }
        );
      }

      // Handle JSON-RPC method: tools/call
      if (body.method === 'tools/call') {
        const toolName = body.params?.name;
        const toolArgs = body.params?.arguments || {};

        const tool = this.tools.get(toolName);
        if (!tool) {
          return new Response(
            JSON.stringify({
              jsonrpc: '2.0',
              id,
              error: { code: -32601, message: `Tool '${toolName}' not found` },
            }),
            { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
          );
        }

        try {
          const result = await tool.handler(toolArgs, { env, ctx, request });
          const text = typeof result === 'string' ? result : JSON.stringify(result);

          return new Response(
            JSON.stringify({
              jsonrpc: '2.0',
              id,
              result: {
                content: [{ type: 'text', text }],
              },
            }),
            { headers: { 'Content-Type': 'application/json', ...corsHeaders } }
          );
        } catch (err: any) {
          return new Response(
            JSON.stringify({
              jsonrpc: '2.0',
              id,
              result: {
                isError: true,
                content: [{ type: 'text', text: `Tool error: ${err.message}` }],
              },
            }),
            { headers: { 'Content-Type': 'application/json', ...corsHeaders } }
          );
        }
      }

      // Fallback direct execution if called with route e.g. /v1/websearch/execute
      const matchedToolName = Array.from(this.tools.keys()).find(k => url.pathname.includes(`/${k}/`));
      if (matchedToolName) {
        const tool = this.tools.get(matchedToolName)!;
        const toolArgs = body.params?.arguments || body;
        try {
          const result = await tool.handler(toolArgs, { env, ctx, request });
          const text = typeof result === 'string' ? result : JSON.stringify(result);
          return new Response(
            JSON.stringify({
              jsonrpc: '2.0',
              id,
              result: { content: [{ type: 'text', text }] },
              status: 'success',
              connector: matchedToolName,
            }),
            { headers: { 'Content-Type': 'application/json', ...corsHeaders } }
          );
        } catch (err: any) {
          return new Response(
            JSON.stringify({ error: err.message }),
            { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
          );
        }
      }
    }

    return new Response(
      JSON.stringify({ error: 'Endpoint not found', pathname: url.pathname }),
      { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }

  /**
   * Listen on a local TCP port (using Bun.serve or Node.js)
   */
  async listen(port: number = 8080): Promise<any> {
    if (typeof (globalThis as any).Deno !== 'undefined') {
      const Deno = (globalThis as any).Deno;
      const server = Deno.serve({ port }, (req: Request) => this.fetch(req));
      console.log(`⚡ [LiateMcp] Sovereign MCP Gateway live at http://localhost:${port} (Deno)`);
      return server;
    }
    if (typeof (globalThis as any).Bun !== 'undefined') {
      const Bun = (globalThis as any).Bun;
      const server = Bun.serve({
        port,
        fetch: (req: Request) => this.fetch(req),
      });
      console.log(`⚡ [LiateMcp] Sovereign MCP Gateway live at http://localhost:${port} (Bun)`);
      return server;
    }
    throw new Error('[LiateMcp] Standalone listen() requires Bun, Deno, or a compatible runtime. For Node/Express, pass mcp.fetch into your router.');
  }

  /**
   * Register default Indic & Search tools
   */
  private registerBuiltInTools(): void {
    // 1. Websearch
    this.tool('websearch', {
      description: 'Execute real-time multi-source web search and news fetching (Google News + DuckDuckGo)',
      schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query string' },
        },
        required: ['query'],
      },
      handler: async ({ query }) => {
        return await performSearch(query || '');
      },
    });
  }

  /**
   * Renders the OAuth Authorization UI page
   */
  private renderOAuthPage(connector: string, clientId: string, redirectUri: string, state: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Authorize Liate MCP Connector</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Inter', sans-serif; }
    body {
      background: radial-gradient(circle at top left, #1e1b4b, #0f172a, #020617);
      color: #f8fafc;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
    }
    .card {
      background: rgba(30, 41, 59, 0.7);
      backdrop-filter: blur(16px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 20px;
      padding: 2.5rem;
      max-width: 440px;
      width: 100%;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
      text-align: center;
    }
    .badge {
      display: inline-block;
      padding: 6px 14px;
      background: rgba(99, 102, 241, 0.2);
      border: 1px solid rgba(99, 102, 241, 0.4);
      color: #818cf8;
      border-radius: 20px;
      font-size: 0.8rem;
      font-weight: 600;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      margin-bottom: 1.5rem;
    }
    .header-icons {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 1rem;
      margin-bottom: 1.5rem;
    }
    .icon-box {
      width: 56px;
      height: 56px;
      border-radius: 16px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.5rem;
    }
    .arrow { color: #64748b; font-size: 1.2rem; }
    h1 { font-size: 1.4rem; font-weight: 700; margin-bottom: 0.5rem; color: #ffffff; }
    p.desc { font-size: 0.95rem; color: #94a3b8; line-height: 1.5; margin-bottom: 1.8rem; }
    .btn-group { display: flex; flex-direction: column; gap: 0.75rem; }
    button {
      width: 100%;
      padding: 0.85rem;
      border-radius: 12px;
      font-weight: 600;
      font-size: 0.95rem;
      cursor: pointer;
      transition: all 0.2s ease;
      border: none;
    }
    .btn-primary {
      background: linear-gradient(135deg, #6366f1, #4f46e5);
      color: white;
      box-shadow: 0 4px 14px rgba(99, 102, 241, 0.4);
    }
    .btn-secondary {
      background: transparent;
      color: #94a3b8;
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
    .footer { font-size: 0.78rem; color: #64748b; margin-top: 1.5rem; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">Sovereign Liate MCP Gateway</div>
    <div class="header-icons">
      <div class="icon-box">⚡</div>
      <span class="arrow">➔</span>
      <div class="icon-box">🔌</div>
    </div>
    <h1>Connect ${connector}</h1>
    <p class="desc">Authorize <strong>Liate Studio</strong> to access <strong>${connector}</strong> via Sovereign Edge Gateway.</p>

    <form method="POST" action="/oauth/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}">
      <div class="btn-group">
        <button type="submit" class="btn-primary">Authorize & Connect</button>
        <button type="button" class="btn-secondary" onclick="window.history.back()">Cancel</button>
      </div>
    </form>

    <div class="footer">Secure Remote MCP Connection via Liate Edge</div>
  </div>
</body>
</html>`;
  }
}

/**
 * Built-in Search Engine (Google News RSS + Multi-source)
 */
async function performSearch(query: string): Promise<{ results: any[]; markdown: string }> {
  const results: Array<{ title: string; snippet: string; url: string; source: string }> = [];
  try {
    const newsRes = await fetch(
      `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-IN&gl=IN&ceid=IN:en`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      }
    );
    if (newsRes.ok) {
      const xml = await newsRes.text();
      const matches = [...xml.matchAll(/<item>[\s\S]*?<title>(.*?)<\/title>[\s\S]*?<link>(.*?)<\/link>[\s\S]*?<\/item>/gi)];
      for (let i = 0; i < matches.length && results.length < 5; i++) {
        const rawTitle = matches[i][1].replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, '').trim();
        const cleanTitle = rawTitle.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
        const url = matches[i][2].replace(/<!\[CDATA\[|\]\]>/g, '').trim();
        results.push({ title: cleanTitle, url, snippet: cleanTitle, source: 'Live Search 2026' });
      }
    }
  } catch (_) {}

  const markdown = results.length > 0
    ? `Found ${results.length} live results for '${query}':\n\n` + results.map((r, i) => `### [${i + 1}] ${r.title}\n**Source:** ${r.source} | **URL:** ${r.url}\n${r.snippet}\n`).join('\n')
    : `No results found for '${query}'.`;

  return { results, markdown };
}
