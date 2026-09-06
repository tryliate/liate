import { LiateConfig, AumStreamCallback, AumApprovalCallback } from './types';
import { createAumLogger } from './logs';
import { loadPillarSkills } from './skills';
import { loadPillarMemory, savePillarMemory } from './memory';
import { connectPillarTools } from './mcp';
import { executeReActLoop } from './engine';
import { getKeys } from '../store';

export * from './types';
export * from './logs';
export * from './skills';
export * from './memory';
export * from './mcp';
export * from './engine';

/**
 * Sovereign AI Agent Runtime Entrypoint (AUM Engine)
 */
export async function runLiateAgent(
  config: LiateConfig,
  userPrompt: string,
  onStream?: AumStreamCallback,
  onRequireApproval?: AumApprovalCallback,
  cwd: string = process.cwd()
): Promise<string> {
  const agentName = config.A?.name || 'agent';
  const log = createAumLogger(agentName, cwd, onStream);

  console.log(`\n\x1b[35m--------------------------------------------------------------------------------\x1b[0m`);
  console.log(`\x1b[1m[LAPI RUNNER] Starting 5-Pillar Agent: \x1b[36m"${agentName}"\x1b[0m`);
  console.log(`\x1b[35m--------------------------------------------------------------------------------\x1b[0m`);

  // 1. Resolve L-Pillar (Model & Provider)
  const modelStr = config.L || 'sarvam/sarvam-105b';
  const [rawProvider, ...rest] = modelStr.split('/');
  const provider = rawProvider.toLowerCase();
  const model = rest.join('/') || modelStr;
  log('STATUS', `\x1b[1m[L-Pillar]\x1b[0m Model Engine: \x1b[34m${provider}/${model}\x1b[0m`);

  // 2. Resolve A-Pillar (Intent & Skills)
  log('STATUS', `\x1b[1m[A-Pillar]\x1b[0m Agent Intent: "${(config.A?.intent || '').substring(0, 75)}..."`);
  const loadedSkillsContent = await loadPillarSkills(config.A?.skills, agentName, cwd, log);

  // 3. Resolve I-Pillar (Session State & Memory)
  const { memoryScope, pastMessages } = await loadPillarMemory(config.I?.memory, cwd, log);

  // 4. Resolve E-Pillar Credentials
  const storedKeys = await getKeys(cwd);
  let apiKey = storedKeys[provider] || storedKeys[`${provider.toUpperCase()}_API_KEY`] || storedKeys[rawProvider] || '';

  if (config.E) {
    for (const [k, v] of Object.entries(config.E)) {
      if (typeof v === 'string' && (k.toUpperCase().includes(provider.toUpperCase()) || k.toUpperCase().includes('API_KEY'))) {
        if (v.startsWith('$')) {
          const varName = v.substring(1);
          apiKey = process.env[varName] || storedKeys[varName] || storedKeys[provider] || apiKey;
        } else {
          apiKey = v;
        }
      }
    }
  }

  if (!apiKey) {
    const envKeyName = `${provider.toUpperCase()}_API_KEY`;
    apiKey = process.env[envKeyName] || storedKeys[provider] || storedKeys[envKeyName] || storedKeys[rawProvider] || '';
  }

  if (!apiKey && (provider === 'omniroute' || provider === 'omni' || provider === 'ollama' || provider === 'vllm')) {
    apiKey = 'local-offline-key';
  }

  if (!apiKey) {
    throw new Error(`Missing API key for provider "${provider}". Please set ${provider.toUpperCase()}_API_KEY in your environment or ~/.liate/.env`);
  }

  // 5. Connect T-Pillar MCP Tools
  const { mcpTransports, nativeTools, toolExecutors } = await connectPillarTools(
    config.T,
    config.E,
    agentName,
    config.A.version,
    cwd,
    log,
    onRequireApproval
  );

  let finalAnswer = '';
  try {
    const maxTurns = parseInt(config.E?.MAX_TURNS || '5', 10);
    const systemPrompt = (config.A.intent || 'You are an autonomous AI agent built on the Liate runtime.') + loadedSkillsContent;

    // 6. Execute Multi-Turn ReAct Loop
    finalAnswer = await executeReActLoop({
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
    });

    // 7. Persist I-Pillar Session Memory
    await savePillarMemory(memoryScope, pastMessages, userPrompt, finalAnswer, cwd, log);

  } finally {
    // 8. Cleanup MCP Transports
    for (const transport of mcpTransports) {
      try {
        await transport.close();
      } catch {}
    }
  }

  return finalAnswer;
}
