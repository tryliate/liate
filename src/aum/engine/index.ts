import { minifyToolSchemas, pruneTrajectoryMessages } from '../../om';
import { generateNativeText, LlmMessage } from '../llm';
import { AumStreamType } from '../types';

export interface ExecuteOptions {
  provider: string;
  model: string;
  apiKey: string;
  systemPrompt: string;
  pastMessages: LlmMessage[];
  userPrompt: string;
  nativeTools: any[];
  toolExecutors: Record<string, (args: any) => Promise<string>>;
  maxTurns: number;
  log: (type: AumStreamType, msg: string) => void;
}

/**
 * Autonomous ReAct (Reasoning + Acting) Agent Execution Loop
 */
export async function executeReActLoop(options: ExecuteOptions): Promise<string> {
  const {
    provider,
    model,
    apiKey,
    systemPrompt,
    pastMessages,
    userPrompt,
    nativeTools,
    toolExecutors,
    maxTurns,
    log
  } = options;

  const messages: LlmMessage[] = [
    ...pastMessages,
    { role: 'user', content: userPrompt }
  ];

  const minifiedTools = minifyToolSchemas(nativeTools);
  let finalAnswer = '';
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let peakContextTokens = 0;

  for (let turn = 1; turn <= maxTurns; turn++) {
    log('THOUGHT', `Turn ${turn}/${maxTurns}: Running ReAct inference (${provider}/${model})...`);

    const prunedMessages = pruneTrajectoryMessages(messages);

    const response = await generateNativeText({
      provider,
      model,
      apiKey,
      systemPrompt,
      messages: prunedMessages,
      tools: minifiedTools
    });

    if (response.usage) {
      const promptTokens = response.usage.prompt_tokens || 0;
      const completionTokens = response.usage.completion_tokens || 0;
      totalPromptTokens += promptTokens;
      totalCompletionTokens += completionTokens;
      peakContextTokens = Math.max(peakContextTokens, promptTokens);
    }

    if (response.error) {
      throw new Error(response.error);
    }

    // Check if tool calls were requested by LLM
    if (response.toolCalls && response.toolCalls.length > 0) {
      log('THOUGHT', `Received ${response.toolCalls.length} tool call request(s) from LLM`);

      messages.push({
        role: 'assistant',
        content: response.text || '',
        toolCalls: response.toolCalls
      });

      // Execute each tool call
      for (const tc of response.toolCalls) {
        const executor = toolExecutors[tc.name];
        let resultText = '';
        if (executor) {
          resultText = await executor(tc.args);
        } else {
          resultText = `Tool ${tc.name} is not registered.`;
        }

        messages.push({
          role: 'tool',
          content: resultText,
          toolResult: {
            toolCallId: tc.id,
            name: tc.name,
            result: resultText
          }
        });
      }
    } else {
      // Final Answer Reached
      finalAnswer = response.text || '';
      log('RESULT', finalAnswer);
      break;
    }
  }

  const totalTokens = totalPromptTokens + totalCompletionTokens;
  console.log(`\x1b[90m--------------------------------------------------------------------------------\x1b[0m`);
  log('STATUS', `\x1b[1m[METRICS]\x1b[0m Peak Context: ${peakContextTokens} tokens | Total Turn I/O: ${totalTokens} (Prompt: ${totalPromptTokens}, Output: ${totalCompletionTokens})`);
  console.log(`\x1b[35m--------------------------------------------------------------------------------\x1b[0m\n`);

  return finalAnswer;
}
