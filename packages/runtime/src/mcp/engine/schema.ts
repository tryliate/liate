import { z } from 'zod';

export function jsonSchemaToZod(schema: any): z.ZodType<any> {
  if (!schema) return z.object({}).catchall(z.any());
  if (schema.type === 'object' && schema.properties) {
    const shape: any = {};
    for (const key in schema.properties) {
      const prop = schema.properties[key];
      let zType: z.ZodTypeAny = z.any();
      if (prop.type === 'string') zType = z.string();
      else if (prop.type === 'number') zType = z.number();
      else if (prop.type === 'boolean') zType = z.boolean();
      else if (prop.type === 'array') zType = z.array(z.any());
      else if (prop.type === 'object') zType = z.record(z.string(), z.any());
      
      if (prop.description) zType = zType.describe(prop.description);

      if (schema.required && schema.required.includes(key)) {
        shape[key] = zType;
      } else {
        shape[key] = zType.optional();
      }
    }
    return z.object(shape).catchall(z.any());
  }
  return z.object({}).catchall(z.any());
}

export function sanitizeSchema(schema: any): any {
  if (Array.isArray(schema)) {
    return schema.map(sanitizeSchema);
  } else if (schema !== null && typeof schema === 'object') {
    const newSchema: any = {};
    for (const key in schema) {
      if (key !== '$schema' && key !== 'title' && key !== 'default') {
        newSchema[key] = sanitizeSchema(schema[key]);
      }
    }
    return newSchema;
  }
  return schema;
}

export function injectFallbackArgs(mcpArgs: any, t: any, userPrompt: string): any {
  // If the AI SDK passes a raw string, try to parse it as JSON, with a regex fallback
  if (typeof mcpArgs === 'string') {
    try {
      mcpArgs = JSON.parse(mcpArgs);
    } catch {
      const jsonMatch = mcpArgs.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try { mcpArgs = JSON.parse(jsonMatch[0]); } catch {}
      }
    }
  }

  // Safeguard against AI SDK provider bugs (e.g. Groq returning null args due to schema stripping)
  if (!mcpArgs || typeof mcpArgs !== 'object' || Object.keys(mcpArgs).length === 0) {
    const firstParam = Object.keys(t.inputSchema?.properties || {})[0];
    if (firstParam) {
      const isGenericParam = ['query', 'prompt', 'text', 'url', 'input', 'message'].includes(firstParam.toLowerCase());
      if (isGenericParam) {
        return { [firstParam]: userPrompt };
      }
    }
    return mcpArgs && typeof mcpArgs === 'object' ? mcpArgs : {};
  }
  return mcpArgs;
}
