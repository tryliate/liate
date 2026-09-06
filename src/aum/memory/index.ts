import { loadSession, saveSession } from '../../store';
import { LlmMessage } from '../llm';
import { AumStreamType } from '../types';

export async function loadPillarMemory(
  memoryConfig: string | undefined,
  cwd: string,
  log: (type: AumStreamType, msg: string) => void
): Promise<{ memoryScope: string | null; pastMessages: LlmMessage[] }> {
  if (!memoryConfig) {
    return { memoryScope: null, pastMessages: [] };
  }

  const memoryScope = memoryConfig.trim();
  let pastMessages: LlmMessage[] = [];

  try {
    pastMessages = (await loadSession(memoryScope, cwd)) as LlmMessage[];
    if (pastMessages.length > 0) {
      log('STATUS', `\x1b[1m[I-Pillar]\x1b[0m Memory Scope: \x1b[36m"${memoryScope}"\x1b[0m (Loaded ${pastMessages.length} previous message(s))`);
    } else {
      log('STATUS', `\x1b[1m[I-Pillar]\x1b[0m Memory Scope: \x1b[36m"${memoryScope}"\x1b[0m (Initialized new session)`);
    }
  } catch (err: any) {
    log('STATUS', `\x1b[33m[I-Pillar]\x1b[0m Memory notice: ${err.message}`);
  }

  return { memoryScope, pastMessages };
}

export async function savePillarMemory(
  memoryScope: string | null,
  pastMessages: LlmMessage[],
  userPrompt: string,
  finalAnswer: string,
  cwd: string,
  log: (type: AumStreamType, msg: string) => void
): Promise<void> {
  if (!memoryScope || !finalAnswer) return;

  try {
    const historyToSave: LlmMessage[] = [
      ...pastMessages,
      { role: 'user', content: userPrompt },
      { role: 'assistant', content: finalAnswer }
    ];
    await saveSession(memoryScope, historyToSave, cwd);
    log('STATUS', `\x1b[1m[I-Pillar]\x1b[0m Persisted session memory: \x1b[32m${historyToSave.length} message(s) saved\x1b[0m to liate_sessions/${memoryScope}.json`);
  } catch (err: any) {
    log('ERROR', `Failed to persist session memory: ${err.message}`);
  }
}
