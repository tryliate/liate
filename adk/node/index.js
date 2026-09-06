/**
 * Liate ADK for Node.js / JavaScript
 * 5-Line Declarative Sovereign Agent Builder
 */

class LiateAgent {
  constructor(config, options = {}) {
    this.config = config;
    this.endpoint = options.endpoint || process.env.LIATE_ENDPOINT || 'http://localhost:7071';
  }

  async run(prompt) {
    const res = await fetch(`${this.endpoint}/api/agent/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        spec: this.config,
        prompt,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`[Liate ADK Error ${res.status}]: ${err}`);
    }

    const data = await res.json();
    return data.response || data.output || data.text || JSON.stringify(data);
  }
}

function liate(config, options) {
  return new LiateAgent(config, options);
}

module.exports = { LiateAgent, liate, Agent: LiateAgent };
