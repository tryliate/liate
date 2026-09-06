import { appendLog } from '../../store';
import { AumStreamType, AumStreamCallback } from '../types';

export function createAumLogger(agentName: string, cwd: string, onStream?: AumStreamCallback) {
  return (type: AumStreamType, msg: string) => {
    if (onStream) onStream(type, msg);
    // Real-time trace recording in .liate/liate_logs.jsonl
    appendLog({ agent: agentName, type, content: msg }, cwd).catch(() => {});

    // Rich terminal logging for LAPI / AUM Engine
    const timestamp = new Date().toLocaleTimeString();
    switch (type) {
      case 'STATUS':
        console.log(`\x1b[90m[${timestamp}]\x1b[0m \x1b[36m[LAPI :: STATUS]\x1b[0m ${msg}`);
        break;
      case 'THOUGHT':
        console.log(`\x1b[90m[${timestamp}]\x1b[0m \x1b[35m[LAPI :: REACT]\x1b[0m ${msg}`);
        break;
      case 'TOOL_CALL':
        console.log(`\x1b[90m[${timestamp}]\x1b[0m \x1b[33m[LAPI :: TOOL CALL]\x1b[0m ${msg}`);
        break;
      case 'TOOL_RESULT':
        console.log(`\x1b[90m[${timestamp}]\x1b[0m \x1b[32m[LAPI :: TOOL RES]\x1b[0m ${msg}`);
        break;
      case 'ERROR':
        console.log(`\x1b[90m[${timestamp}]\x1b[0m \x1b[31m[LAPI :: ERROR]\x1b[0m ${msg}`);
        break;
      case 'RESULT':
        console.log(`\x1b[90m[${timestamp}]\x1b[0m \x1b[32;1m[LAPI :: FINAL ANSWER]\x1b[0m ${msg.substring(0, 120)}...`);
        break;
      default:
        console.log(`\x1b[90m[${timestamp}]\x1b[0m [${type}] ${msg}`);
    }
  };
}
