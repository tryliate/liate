import fs from 'fs/promises';

/**
 * [28] - LiatePrompt (Type-Safe Dynamic Prompt Template, Injection Defense & Section Builder)
 * 
 * Provides type-safe variable interpolation, modular section composition,
 * prompt injection defense, Indic multilingual directives, and JSON schema formatting.
 */

export interface PromptFewShot {
  input: string;
  expected?: string;
  output?: string;
  explanation?: string;
}

export interface PromptSection {
  title: string;
  content: string | string[];
}

export class LiatePrompt<TVars extends Record<string, any> = Record<string, any>> {
  public templateString?: string;
  public systemText?: string;
  public sections: PromptSection[] = [];
  public fewShots: PromptFewShot[] = [];
  public targetLanguage?: string;
  public schema?: Record<string, any>;

  constructor(template?: string) {
    this.templateString = template?.trim();
  }

  /**
   * Define the core system instructions
   */
  public system(instructions: string): this {
    this.systemText = instructions.trim();
    return this;
  }

  /**
   * Add a structured section (e.g. "Guidelines", "Constraints", "Knowledge")
   */
  public section(title: string, content: string | string[]): this {
    this.sections.push({ title, content });
    return this;
  }

  /**
   * Add one or more few-shot reference examples
   */
  public fewShot(examples: PromptFewShot | PromptFewShot[]): this {
    if (Array.isArray(examples)) {
      this.fewShots.push(...examples);
    } else {
      this.fewShots.push(examples);
    }
    return this;
  }

  /**
   * Enforce strict JSON output schema
   */
  public jsonSchema(schema: Record<string, any>): this {
    this.schema = schema;
    return this;
  }

  /**
   * Enforce output in a specific Indic language (Sarvam AI optimized)
   */
  public language(langCode: string): this {
    this.targetLanguage = langCode;
    return this;
  }

  /**
   * Sanitize untrusted user input against prompt injection and delimiter exploits
   */
  public static sanitize(input: string): string {
    if (!input || typeof input !== 'string') return '';
    return input
      .replace(/<system>[\s\S]*?<\/system>/gi, '')
      .replace(/\[system\][\s\S]*?\[\/system\]/gi, '')
      .replace(/ignore\s+all\s+(previous|prior)\s+instructions/gi, '[neutralized_prompt_injection]')
      .replace(/ignore\s+above\s+instructions/gi, '[neutralized_prompt_injection]')
      .trim();
  }

  /**
   * Compile and format the complete prompt with type-safe variables
   */
  public render(variables?: TVars): string {
    return this.format(variables);
  }

  public format(variables?: TVars): string {
    const parts: string[] = [];


    // 1. System text
    if (this.systemText) {
      parts.push(this.systemText);
      parts.push('');
    }

    // 2. Main template body with {{variable}} interpolation
    if (this.templateString) {
      let body = this.templateString;
      if (variables) {
        for (const [key, value] of Object.entries(variables)) {
          const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
          const strVal = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
          body = body.replace(regex, strVal);
        }
      }
      parts.push(body);
      parts.push('');
    }

    // 3. Structured sections
    for (const sec of this.sections) {
      parts.push(`## ${sec.title}:`);
      if (Array.isArray(sec.content)) {
        sec.content.forEach((item, idx) => parts.push(`${idx + 1}. ${item}`));
      } else {
        parts.push(sec.content);
      }
      parts.push('');
    }

    // 4. Few-shot examples
    if (this.fewShots.length > 0) {
      parts.push(`## Reference Examples:`);
      this.fewShots.forEach((ex, idx) => {
        parts.push(`### Example ${idx + 1}:`);
        parts.push(`**Input:** ${ex.input}`);
        if (ex.expected || ex.output) {
          parts.push(`**Expected Output:** ${ex.expected || ex.output}`);
        }
        if (ex.explanation) {
          parts.push(`**Explanation:** ${ex.explanation}`);
        }
        parts.push('');
      });
    }

    // 5. JSON Schema Output Constraint
    if (this.schema) {
      parts.push(`## Response Format:`);
      parts.push(`You must return your response ONLY as valid JSON matching this schema:`);
      parts.push('```json');
      parts.push(JSON.stringify(this.schema, null, 2));
      parts.push('```\n');
    }

    // 6. Indic Multilingual Directive
    if (this.targetLanguage) {
      parts.push(`## Language Constraint:`);
      parts.push(`Respond completely in language code: [${this.targetLanguage}]. Ensure proper Indic script formatting.`);
      parts.push('');
    }

    return parts.join('\n').trim();
  }

  /**
   * Load prompt template from a file (.prompt or .txt)
   */
  public static async fromFile<T extends Record<string, any> = Record<string, any>>(
    filePath: string
  ): Promise<LiatePrompt<T>> {
    const content = await fs.readFile(filePath, 'utf-8');
    return new LiatePrompt<T>(content);
  }
}

export const Prompt = LiatePrompt;
