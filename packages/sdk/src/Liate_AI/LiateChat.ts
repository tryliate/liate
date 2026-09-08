import { LiateAgent } from '../Liate_Pillars/LiateAgent';
import { LiateStream } from './LiateStream';
import { saveSession } from '@liate/store';

/**
 * [26] - LiateChat (Interactive Conversational State Machine & Message Tree Controller)
 * 
 * Manages multi-turn conversation history, live thought/token streaming, branching forks,
 * context window trimming, and persistence across agent restarts.
 */

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  thought?: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface ChatConfig {
  agent?: LiateAgent;
  sessionId?: string;
  systemPrompt?: string;
  autoPersist?: boolean;
  maxHistory?: number;
}

export class LiateChat {
  public agent: LiateAgent;
  public sessionId: string;
  public messages: ChatMessage[] = [];
  public autoPersist: boolean;
  public maxHistory: number;

  constructor(config: ChatConfig = {}) {
    this.agent = config.agent || new LiateAgent('chat-agent');
    this.sessionId = config.sessionId || `session-${Date.now()}`;
    this.autoPersist = config.autoPersist ?? true;
    this.maxHistory = config.maxHistory || 50;

    if (config.systemPrompt) {
      this.messages.push({
        id: `msg-sys-${Date.now()}`,
        role: 'system',
        content: config.systemPrompt,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Manually append a message to the chat history
   */
  public addMessage(role: MessageRole, content: string, metadata?: Record<string, any>): ChatMessage {
    const msg: ChatMessage = {
      id: `msg-${role[0]}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      role,
      content,
      timestamp: new Date().toISOString(),
      metadata
    };
    this.messages.push(msg);
    return msg;
  }

  /**
   * Get all messages in the conversation
   */
  public getMessages(): ChatMessage[] {
    return this.getHistory();
  }

  /**
   * Send a message and get an autonomous multi-turn reply with automatic history tracking
   */
  public async sendMessage(prompt: string): Promise<string> {

    const userMsg: ChatMessage = {
      id: `msg-u-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      role: 'user',
      content: prompt,
      timestamp: new Date().toISOString()
    };
    this.messages.push(userMsg);

    // Build context-aware prompt with previous turns
    const contextPrompt = this.buildContextPrompt(prompt);

    const result = await this.agent.run(contextPrompt);
    const rawResponse = typeof result === 'string' ? result : (result as any)?.response || JSON.stringify(result);

    // Extract thoughts if model outputs <think> tags
    let thought: string | undefined;
    const thinkMatch = rawResponse.match(/<think>([\s\S]*?)<\/think>/i);
    if (thinkMatch && thinkMatch[1]) {
      thought = thinkMatch[1].trim();
    }
    const cleanContent = rawResponse.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

    const assistantMsg: ChatMessage = {
      id: `msg-a-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      role: 'assistant',
      content: cleanContent || rawResponse,
      thought,
      timestamp: new Date().toISOString()
    };
    this.messages.push(assistantMsg);

    this.enforceHistoryLimit();

    if (this.autoPersist) {
      await this.persist();
    }

    return assistantMsg.content;
  }

  /**
   * Stream a message turn returning a live LiateStream instance
   */
  public async streamMessage(prompt: string): Promise<LiateStream> {
    const stream = new LiateStream();
    const userMsg: ChatMessage = {
      id: `msg-u-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      role: 'user',
      content: prompt,
      timestamp: new Date().toISOString()
    };
    this.messages.push(userMsg);

    const contextPrompt = this.buildContextPrompt(prompt);

    let accumulatedThought = '';
    let accumulatedText = '';

    this.agent.run(contextPrompt).then(async (res: any) => {
      const output = typeof res === 'string' ? res : res.response || JSON.stringify(res);
      const thinkMatch = output.match(/<think>([\s\S]*?)<\/think>/i);
      if (thinkMatch && thinkMatch[1]) {
        accumulatedThought = thinkMatch[1].trim();
        stream.emit('THOUGHT', accumulatedThought);
      }
      accumulatedText = output.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
      stream.emit('TOKEN', accumulatedText);
      stream.emit('RESULT', accumulatedText);
      stream.emit('DONE', accumulatedText);

      this.messages.push({
        id: `msg-a-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        role: 'assistant',
        content: accumulatedText,
        thought: accumulatedThought || undefined,
        timestamp: new Date().toISOString()
      });

      this.enforceHistoryLimit();
      if (this.autoPersist) await this.persist();
    }).catch((err: any) => {
      stream.emit('ERROR', err.message || String(err));
    });

    return stream;
  }

  /**
   * Fork the conversation at a specific message ID to explore alternative hypotheses
   */
  public fork(messageId?: string): LiateChat {
    const forked = new LiateChat({
      agent: this.agent,
      sessionId: `${this.sessionId}-fork-${Date.now().toString(36)}`,
      autoPersist: this.autoPersist,
      maxHistory: this.maxHistory
    });

    if (!messageId) {
      forked.messages = JSON.parse(JSON.stringify(this.messages));
    } else {
      const idx = this.messages.findIndex(m => m.id === messageId);
      if (idx !== -1) {
        forked.messages = JSON.parse(JSON.stringify(this.messages.slice(0, idx + 1)));
      } else {
        forked.messages = JSON.parse(JSON.stringify(this.messages));
      }
    }

    return forked;
  }

  /**
   * Get all messages in chronological order
   */
  public getHistory(): ChatMessage[] {
    return [...this.messages];
  }

  /**
   * Clear all conversation messages
   */
  public clear(): void {
    this.messages = [];
  }

  /**
   * Trim conversation to keep only the last N turns
   */
  public trim(maxTurns: number): void {
    if (this.messages.length > maxTurns) {
      const systemMessages = this.messages.filter(m => m.role === 'system');
      const recent = this.messages.filter(m => m.role !== 'system').slice(-maxTurns);
      this.messages = [...systemMessages, ...recent];
    }
  }

  /**
   * Export conversation to clean Markdown transcript
   */
  public toMarkdown(): string {
    const lines: string[] = [`# Conversation Transcript (${this.sessionId})\n`];
    for (const msg of this.messages) {
      const roleLabel = msg.role.toUpperCase();
      lines.push(`### [${roleLabel}] - ${msg.timestamp}`);
      if (msg.thought) {
        lines.push(`> 💭 **Thinking Process:**\n> ${msg.thought.replace(/\n/g, '\n> ')}\n`);
      }
      lines.push(`${msg.content}\n`);
    }
    return lines.join('\n');
  }

  /**
   * Export conversation in OpenAI-standard message objects array
   */
  public toOpenAI(): Array<{ role: string; content: string }> {
    return this.messages.map(m => ({
      role: m.role,
      content: m.content
    }));
  }

  private buildContextPrompt(newPrompt: string): string {
    if (this.messages.length <= 1) return newPrompt;

    const previousHistory = this.messages
      .slice(0, -1) // Exclude current user prompt
      .map(m => `[${m.role.toUpperCase()}]: ${m.content}`)
      .join('\n');

    return `Conversation History:\n${previousHistory}\n\n[USER]: ${newPrompt}`;
  }

  private enforceHistoryLimit(): void {
    if (this.messages.length > this.maxHistory) {
      this.trim(this.maxHistory);
    }
  }

  private async persist(): Promise<void> {
    try {
      await saveSession(this.sessionId, this.messages as any);
    } catch {}
  }
}

export const Chat = LiateChat;
