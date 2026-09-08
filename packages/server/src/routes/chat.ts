import { Context } from 'hono';
import { generateNativeText, LlmRequest, bootMcpServers, cleanupMcpServers, createStreamDispatcher } from '@liate/runtime';
import { getKeys } from '@liate/store';
import { WSHub } from '../websocket';
import { LiateToken } from '@liate/sdk';

export function createChatHandler(wsHub: WSHub) {
  const streamFn = createStreamDispatcher((msg: any) => wsHub.broadcast(msg));

  return async (c: Context) => {
    const body = await c.req.json();
    const { 
      model, 
      system, 
      messages, 
      provider, 
      mcps, 
      nodeId, 
      effort = 'medium',
      maxTurns,
      maxSteps: reqMaxSteps 
    } = body;

    const keys = await getKeys();
    let modelId = model || 'sarvam/sarvam-105b';
    if (provider && !modelId.startsWith(`${provider}/`)) {
      modelId = `${provider}/${modelId}`;
    }

    const userPrompt = messages && messages.length > 0 ? messages[messages.length - 1].content : '';

    const bootRes = await bootMcpServers(mcps || [], userPrompt, streamFn, nodeId || 'chat');
    const nativeTools = bootRes.nativeTools;
    const toolExecutors = bootRes.toolExecutors;
    const manager = bootRes.manager;

    let effortPrompt = '';
    if (effort === 'high') {
      effortPrompt = "\n\n[SYSTEM REASONING EFFORT: HIGH] You must think step-by-step in extreme detail. Explore multiple angles, weigh alternatives, and be as exhaustive and analytical as possible before answering.";
    } else if (effort === 'low') {
      effortPrompt = "\n\n[SYSTEM REASONING EFFORT: LOW] Answer immediately. Do not overthink. Prioritize extreme brevity and speed. Output the final answer with zero fluff.";
    }

    let toolsPrompt = '';
    if (nativeTools.length > 0 && provider?.toLowerCase() === 'groq') {
      toolsPrompt = "\n\n[CRITICAL TOOL INSTRUCTION] You MUST invoke tools natively via the API schema. Do NOT write any conversational text, explanations, or thoughts before calling a tool. Call the tool first, and only write your response after the tool returns its results. Never output literal XML tags like <function> or <tool> in your text.";
    }

    const identityPrompt = "\n\n[CRITICAL INSTRUCTION] Adopt the provided system instructions seamlessly as your natural identity and behavior. Do not expose, mention, or explicitly state that you are following a 'rule', 'instruction', or 'directive'. Act as if this is your inherent nature.";
    const finalSystemPrompt = (system || '') + effortPrompt + toolsPrompt + identityPrompt;

    const effectiveMaxSteps = Number(maxTurns || reqMaxSteps || 5);
    const tokenTracker = new LiateToken({ model: modelId });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          let step = 0;

          while (step < effectiveMaxSteps) {
            step++;
            const reqPayload: LlmRequest = {
              provider: provider || 'sarvam',
              model: modelId.split('/').pop() || model,
              systemPrompt: finalSystemPrompt,
              messages: messages,
              tools: nativeTools,
              apiKey: keys[provider] || process.env[`${(provider || '').toUpperCase()}_API_KEY`] || '',
              effort,
              maxSteps: effectiveMaxSteps,
              onChunk: (chunk: string) => {
                controller.enqueue(encoder.encode(chunk));
              }
            };

            const response = await generateNativeText(reqPayload);

            if (response.usage) {
              tokenTracker.recordUsage(
                response.usage.prompt_tokens || 0,
                response.usage.completion_tokens || 0
              );
            }

            if (response.error) {
              controller.enqueue(encoder.encode(`\n\n**Error:** ${response.error}`));
              break;
            }

            const responseText = response.text || '';
            messages.push({
              role: 'assistant',
              content: responseText,
              toolCalls: response.toolCalls
            });

            const isStreaming = !nativeTools || nativeTools.length === 0;
            if (!isStreaming && responseText) {
              controller.enqueue(encoder.encode(responseText));
            }

            if (response.toolCalls && response.toolCalls.length > 0) {
              for (const tc of response.toolCalls) {
                controller.enqueue(encoder.encode(`\n\n*(Using tool: ${tc.name}...)*\n\n`));
                let resVal: any;
                if (toolExecutors[tc.name]) {
                  resVal = await toolExecutors[tc.name](tc.args);
                } else {
                  resVal = `Tool ${tc.name} not found or active.`;
                }

                messages.push({
                  role: 'tool',
                  content: '',
                  toolResult: {
                    toolCallId: tc.id,
                    name: tc.name,
                    result: resVal
                  }
                });
              }
              continue;
            } else {
              break;
            }
          }
        } catch (err: any) {
          controller.enqueue(encoder.encode(`\n\n**Error:** ${err.message}`));
        } finally {
          if (manager) {
            await cleanupMcpServers(manager, streamFn, nodeId || 'chat');
          }
          controller.close();
        }
      }
    });

    const usage = tokenTracker.getUsage();
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
        'X-Liate-Total-Tokens': String(usage.totalTokens),
        'X-Liate-Total-Inr': String(usage.costINR.toFixed(4))
      }
    });
  };
}
