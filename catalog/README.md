# 📚 Liate Sovereign Component Catalog & Registry

Official registry for sovereign agent building blocks: LLM providers, Model Context Protocol (MCP) servers, and community skills.

## 📂 Registry Structure

- **`prebuilt/llm.json`** — Verified local & cloud LLM providers (Sarvam AI, Ollama, OpenAI-compatible, etc.)
- **`prebuilt/mcps.json`** — Pre-configured, sovereign Model Context Protocol servers
- **`prebuilt/skills.json`** — Verified agent skill packages and capabilities
- **`community/mcps.json`** — Community-contributed MCP servers and tools

## 🚀 Usage

Discover and install components using the `liate` CLI:

```bash
# Search and install skills
liate skills search
liate skills install <skill-name>

# Search and configure MCP servers
liate mcp search
liate mcp add <mcp-name>
```
