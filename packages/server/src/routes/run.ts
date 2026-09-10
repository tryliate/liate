import { Context } from 'hono';
import { runLiateAgent, LiateConfig } from '@liate/runtime';
import { loadAgent } from '@liate/store';
import { WSHub } from '../websocket';

export function createRunHandler(wsHub: WSHub) {
  return async (c: Context) => {
    let body: any = {};
    try {
      body = await c.req.json();
    } catch {}

    const agentIdParam = c.req.param('agent_id');
    let targetSpec = body.manifest || body.spec || body.config;
    const prompt = body.prompt || '';
    const sessionScope = body.session || body.session_id || body.memory;

    // 1. Resolve agent spec from route param :agent_id or body
    const agentIdentifier = agentIdParam || body.name || body.agent_id || body.id;
    if (!targetSpec && agentIdentifier && agentIdentifier !== 'default' && agentIdentifier !== 'current') {
      const loaded = await loadAgent(agentIdentifier);
      if (loaded) {
        targetSpec = loaded.spec || (loaded.L ? loaded : undefined);
      }
    }

    if (!targetSpec) {
      targetSpec = {
        L: 'sarvam/sarvam-105b',
        A: { name: agentIdentifier || 'agent', intent: 'Autonomous sovereign AI agent' },
      };
    }


    // Override session memory scope if provided in request
    if (sessionScope) {
      targetSpec.I = { ...(targetSpec.I || {}), memory: sessionScope };
    }

    if (!prompt) {
      return c.json({ error: 'Missing prompt in request body' }, 400);
    }

    const wantsStream = body.stream === true || (c.req.header('Accept') || '').includes('text/event-stream');

    if (wantsStream) {
      // SSE Streaming Response
      return new Response(new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          const sendEvent = (event: string, data: any) => {
            controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
          };

          try {
            sendEvent('status', { type: 'STATUS', msg: `Starting agent: "${targetSpec.A?.name || 'agent'}"` });
            const result = await runLiateAgent(
              targetSpec,
              prompt,
              (type: string, content: string) => {
                wsHub.broadcast({ type: 'agent_stream', stepType: type, content });
                sendEvent(type.toLowerCase(), { type, content });
              },
              (tool: string, args: any) => wsHub.requestApproval(tool, args)
            );
            controller.close();
          } catch (err: any) {
            sendEvent('error', { type: 'ERROR', error: err.message });
            controller.close();
          }

        }
      }), {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        }
      });
    }

    // Standard JSON Response
    const traces: string[] = [];
    const toolsExecuted: any[] = [];

    try {
      const result = await runLiateAgent(
        targetSpec,
        prompt,
        (type: string, content: string) => {
          wsHub.broadcast({ type: 'agent_stream', stepType: type, content });
          if (type === 'TOOL_CALL') {
            traces.push(`• ${content}`);
          } else if (type === 'TOOL_RESULT') {
            traces.push(`• Result: ${content.substring(0, 100)}`);
          }
        },
        (tool: string, args: any) => wsHub.requestApproval(tool, args)
      );

      return c.json({
        status: 'success',
        agent: targetSpec.A?.name || agentIdentifier || 'agent',
        response: result,
        output: result,
        result: result,
        traces,
        tools: toolsExecuted,
      });
    } catch (err: any) {
      console.error(`[LAPI RUN] Inference failed for "${agentIdentifier}":`, err?.message);
      return c.json({
        status: 'error',
        error: err?.message || 'Inference execution failed',
        agent: targetSpec.A?.name || agentIdentifier || 'agent',
        traces
      }, 500);
    }
  };
}
