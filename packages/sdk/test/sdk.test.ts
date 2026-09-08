import { describe, expect, it } from 'bun:test';
import { LiateAgent, LiateApp } from '../src/Liate_Pillars';
import { LiateChat, LiatePrompt } from '../src/Liate_AI';

describe('@liate/sdk core pillars', () => {
  it('should instantiate LiateApp and LiateAgent', () => {
    const app = new LiateApp({ name: 'test-app', version: '1.0.0' });
    expect(app.name).toBe('test-app');

    const agent = new LiateAgent('assistant', 'Support Agent');
    expect(agent.A.name).toBe('assistant');
    expect(agent.A.intent).toBe('Support Agent');
  });

  it('should instantiate LiateChat and LiatePrompt', () => {
    const prompt = new LiatePrompt('You are a {{role}}');
    expect(prompt.templateString).toBe('You are a {{role}}');
    expect(prompt.render({ role: 'sovereign agent' })).toBe('You are a sovereign agent');

    const chat = new LiateChat({ agent: new LiateAgent('chat-agent') });
    expect(chat.agent.A.name).toBe('chat-agent');
    expect(chat.messages).toHaveLength(0);
  });
});
