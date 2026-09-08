export async function parseSSE(
  response: Response,
  onChunk: (chunk: string) => void,
  extractors: {
    text: (data: any) => string | undefined;
    toolCall?: (data: any) => { id?: string; name?: string; args?: string; index: number } | undefined;
  }
) {
  if (!response.body) return { toolCalls: [] };
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  const activeToolCalls: Record<number, { id: string; name: string; args: string }> = {};

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    
    let lineEnd = buffer.indexOf('\n');
    while (lineEnd !== -1) {
      const line = buffer.slice(0, lineEnd).trim();
      buffer = buffer.slice(lineEnd + 1);
      
      if (line.startsWith('data: ') && line !== 'data: [DONE]') {
        try {
          const data = JSON.parse(line.slice(6));

          
          const textChunk = extractors.text(data);
          if (textChunk) {
            onChunk(textChunk);
          }

          if (extractors.toolCall) {
            const tcDelta = extractors.toolCall(data);
            if (tcDelta) {
              const idx = tcDelta.index;
              if (!activeToolCalls[idx]) {
                activeToolCalls[idx] = { id: tcDelta.id || '', name: tcDelta.name || '', args: tcDelta.args || '' };
              } else {
                if (tcDelta.id) activeToolCalls[idx].id += tcDelta.id;
                if (tcDelta.name) activeToolCalls[idx].name += tcDelta.name;
                if (tcDelta.args) activeToolCalls[idx].args += tcDelta.args;
              }
            }
          }
        } catch (e) {
          // Ignore parse errors on partial chunks
        }
      }
      lineEnd = buffer.indexOf('\n');
    }
  }

  const toolCalls = Object.values(activeToolCalls).map(tc => {
    let parsedArgs = {};
    try { parsedArgs = JSON.parse(tc.args); } catch(e) {}
    return {
      id: tc.id,
      name: tc.name,
      args: parsedArgs
    };
  });

  return { toolCalls };
}
