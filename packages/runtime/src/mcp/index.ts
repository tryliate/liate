import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { sanitizeToolOutput } from '@liate/optimizer';
import { StreamableHttpClientTransport } from '../stream';
import { getMergedMcps } from '@liate/store';
import { AumStreamType, AumApprovalCallback } from '../types';

export * from './execute';

export interface ConnectedToolsResult {
  mcpClients: Client[];
  mcpTransports: any[];
  nativeTools: any[];
  toolExecutors: Record<string, (args: any) => Promise<string>>;
}

export async function connectPillarTools(
  toolsConfig: any,
  envConfig: Record<string, string> | undefined,
  agentName: string,
  agentVersion: string = '1.0.0',
  cwd: string,
  log: (type: AumStreamType, msg: string) => void,
  onRequireApproval?: AumApprovalCallback
): Promise<ConnectedToolsResult> {
  const mcpClients: Client[] = [];
  const mcpTransports: any[] = [];
  const nativeTools: any[] = [];
  const toolExecutors: Record<string, (args: any) => Promise<string>> = {};

  if (!toolsConfig) {
    return { mcpClients, mcpTransports, nativeTools, toolExecutors };
  }

  let resolvedToolsMap: Record<string, any> = {};
  const mergedMcps = await getMergedMcps(cwd);

  if (Array.isArray(toolsConfig)) {
    for (const tName of toolsConfig) {
      if (mergedMcps[tName]) {
        resolvedToolsMap[tName] = mergedMcps[tName];
      } else {
        log('STATUS', `\x1b[33m[T-Pillar]\x1b[0m MCP server "${tName}" not found in liate_mcp.json or ~/.liate/liate_mcp.json`);
      }
    }
  } else if (typeof toolsConfig === 'object') {
    for (const [serverName, serverCfg] of Object.entries(toolsConfig)) {
      if ((serverCfg as any).command || (serverCfg as any).url) {
        resolvedToolsMap[serverName] = serverCfg;
      } else if (mergedMcps[serverName] && typeof serverCfg === 'object' && serverCfg !== null) {
        resolvedToolsMap[serverName] = { ...mergedMcps[serverName], ...(serverCfg as Record<string, any>) };
      } else {
        resolvedToolsMap[serverName] = serverCfg;
      }
    }
  }

  if (Object.keys(resolvedToolsMap).length > 0) {
    const mcpCount = Object.keys(resolvedToolsMap).length;
    log('STATUS', `\x1b[1m[T-Pillar]\x1b[0m Connecting to ${mcpCount} MCP server(s)...`);

    for (const [serverName, serverCfg] of Object.entries(resolvedToolsMap)) {
      try {
        let transport: any;
        const isHttpUrl = serverCfg.url || serverCfg.command?.startsWith('http://') || serverCfg.command?.startsWith('https://') || (serverCfg.args && serverCfg.args[0]?.startsWith('http'));
        
        if (isHttpUrl || serverCfg.command === 'http' || serverCfg.command === 'sse') {
          let targetUrl = serverCfg.url || (serverCfg.command?.startsWith('http') ? serverCfg.command : serverCfg.args?.[0]) || '';
          if (targetUrl) {
            targetUrl = targetUrl.replace(/\$([A-Z0-9_]+)/gi, (_: string, varName: string) => envConfig?.[varName] || (process.env as any)[varName] || `$${varName}`);
          }
          const isSse = serverCfg.type === 'sse' || serverCfg.command === 'sse';
          if (isSse && typeof (globalThis as any).EventSource !== 'undefined') {
            transport = new SSEClientTransport(new URL(targetUrl));
          } else {
            const httpHeaders: Record<string, string> = {
              'Accept': 'application/json, text/event-stream',
              ...(serverCfg.headers || {})
            };

            let authKey: string | undefined = undefined;
            if (serverCfg.env) {
              for (const [k, v] of Object.entries(serverCfg.env)) {
                if (typeof v === 'string') {
                  const resolved = v.startsWith('$') ? (envConfig?.[v.substring(1)] || (process.env as any)[v.substring(1)]) : v;
                  if (resolved) { authKey = resolved; break; }
                }
              }
            }
            if (!authKey && envConfig) {
              authKey = envConfig[`${serverName.toUpperCase()}_API_KEY`] || envConfig.API_KEY || envConfig.apiKey;
            }

            if (authKey && !httpHeaders['Authorization'] && !httpHeaders['authorization']) {
              httpHeaders['Authorization'] = `Bearer ${authKey}`;
            }

            transport = new StreamableHttpClientTransport(targetUrl, httpHeaders);
          }
        } else if (serverCfg.command) {
          let cmd = serverCfg.command;
          if (process.platform === 'win32') {
            if (cmd === 'npx') cmd = 'npx.cmd';
            else if (cmd === 'npm') cmd = 'npm.cmd';
            else if (cmd === 'pnpm') cmd = 'pnpm.cmd';
            else if (cmd === 'yarn') cmd = 'yarn.cmd';
          }

          let args = [...(serverCfg.args || [])];
          if ((cmd === 'npx' || cmd === 'npx.cmd') && !args.includes('-y') && !args.includes('--yes')) {
            args.unshift('-y');
          }

          const stdioEnv: Record<string, string> = {};
          for (const [k, v] of Object.entries(process.env)) {
            if (typeof v === 'string') {
              stdioEnv[k] = v;
            }
          }
          if (serverCfg.env) {
            for (const [k, v] of Object.entries(serverCfg.env)) {
              if (typeof v === 'string') {
                if (v.startsWith('$')) {
                  const varName = v.substring(1);
                  stdioEnv[k] = envConfig?.[varName] || process.env[varName] || envConfig?.[k] || process.env[k] || '';
                } else {
                  stdioEnv[k] = v;
                }
              }
            }
          }
          if (envConfig) {
            for (const [k, v] of Object.entries(envConfig)) {
              if (typeof v === 'string') {
                stdioEnv[k] = v;
              }
            }
          }

          transport = new StdioClientTransport({
            command: cmd,
            args: args,
            env: stdioEnv
          });
        }

        if (transport) {
          const safeJsonSchemaValidator = {
            getValidator: () => (input: any) => ({ valid: true, data: input })
          };

          const client = new Client({
            name: `liate-agent-${agentName}`,
            version: agentVersion
          }, {
            capabilities: {},
            jsonSchemaValidator: safeJsonSchemaValidator as any
          });

          await client.connect(transport);
          mcpTransports.push(transport);
          mcpClients.push(client);

          const toolsRes = await client.listTools();
          const targetToolNames = Array.isArray(serverCfg.tools) && serverCfg.tools.length > 0 && !serverCfg.tools.includes('*') ? new Set(serverCfg.tools) : null;
          
          for (const t of toolsRes.tools) {
            if (targetToolNames && !targetToolNames.has(t.name)) {
              continue;
            }

            nativeTools.push({
              name: t.name,
              description: t.description || `Execute tool ${t.name}`,
              inputSchema: t.inputSchema || { type: 'object', properties: {} }
            });

            toolExecutors[t.name] = async (args: any) => {
              const needsApproval = envConfig?.REQUIRE_APPROVAL === 'true' ||
                envConfig?.REQUIRE_APPROVAL === '1' ||
                envConfig?.[`APPROVE_${t.name.toUpperCase()}`] === 'true' ||
                (envConfig?.AUTO_APPROVE_TOOLS ? !envConfig.AUTO_APPROVE_TOOLS.split(',').map(s => s.trim()).includes(t.name) : false);

              if (needsApproval && onRequireApproval) {
                log('STATUS', `[APPROVAL] Awaiting user approval for tool [${t.name}]...`);
                const allowed = await onRequireApproval(t.name, args);
                if (!allowed) {
                  log('STATUS', `[APPROVAL] Tool [${t.name}] was denied by user.`);
                  return 'Tool execution was denied by user permission.';
                }
                log('STATUS', `[APPROVAL] Tool [${t.name}] was approved.`);
              }

              log('TOOL_CALL', `Tool [${t.name}] payload: ${JSON.stringify(args)}`);
              try {
                const startTime = Date.now();
                const res = await client.callTool({ name: t.name, arguments: args });
                const durationMs = Date.now() - startTime;

                let text = '';
                if (res && res.content && Array.isArray(res.content)) {
                  text = res.content.map((c: any) => c.text).join('\n');
                } else if (typeof res === 'object') {
                  text = JSON.stringify(res);
                } else {
                  text = String(res);
                }

                const cleanResult = sanitizeToolOutput(text);
                log('TOOL_RESULT', `Tool [${t.name}] (${durationMs}ms): ${cleanResult.substring(0, 100)}...`);
                return cleanResult;
              } catch (err: any) {
                log('ERROR', `Tool [${t.name}] failed: ${err.message}`);
                return `Error executing ${t.name}: ${err.message}`;
              }
            };
          }
          log('STATUS', `[MCP] Server "${serverName}" connected with ${nativeTools.length} tool(s): [${nativeTools.map(t => t.name).join(', ')}]`);
        }
      } catch (err: any) {
        log('ERROR', `Failed to initialize MCP server "${serverName}": ${err.stack || err.message}`);
      }
    }
  }

  return { mcpClients, mcpTransports, nativeTools, toolExecutors };
}
