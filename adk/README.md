# ⚡ Liate ADK — Agent Development Kit

> **Universal Multi-Language SDK for Liate Platform & Sovereign AI Agents**  
> Build, test, and run sovereign AI agents in **5 lines of code** in ANY language.

---

## 🚀 Quick Navigation by Language

| Language | Folder | Quick Code Example |
| :--- | :--- | :--- |
| **Node.js / TypeScript** | [`node/`](./node) | `import { liate, LiateAgent } from 'liate'` |
| **Python** | [`python/`](./python) | `from liate import liate, LiateAgent` |
| **Go** | [`go/`](./go) | `agent := liate.NewAgent(...)` |
| **Java** | [`java/`](./java) | `LiateAgent agent = new LiateAgent(...)` |
| **C# / .NET** | [`csharp/`](./csharp) | `var agent = new LiateAgent(pillars);` |
| **PHP** | [`php/`](./php) | `$agent = new LiateAgent($spec);` |
| **Rust** | [`rust/`](./rust) | `let agent = LiateAgent::new(spec);` |
| **cURL / Shell** | [`curl/`](./curl) | `curl -X POST http://localhost:7071/lapi/v1/run` |

---

## ⚡ The LiateScript 5-Pillar Standard (`L, I, A, T, E`)

Every language in the Liate ADK implements the canonical **LiateScript** (`liate.json`) 5-Pillar standard:

- **`L` (LLM Engine)**: e.g. `sarvam/sarvam-105b`, `omniroute/auto`, `groq/llama-3.3-70b-versatile`, `anthropic/claude-3-7-sonnet`, `gemini/gemini-2.0-flash`
- **`I` (Identity & Memory)**: Session memory scope and persistence identifier (`memory: "session_1"`)
- **`A` (Agent & Intent)**: Agent name, version, core persona/intent, and procedural skills
- **`T` (Tools / MCP)**: Model Context Protocol tool servers (stdio, SSE, Streamable HTTP)
- **`E` (Environment & Budget)**: Secrets (`SARVAM_API_KEY`), budget constraints, and `MAX_TURNS`

---

## 🌟 How It Works

1. **Local Execution**: Runs directly against your local **Liate engine** (`http://localhost:7071`) for ₹0 free forever.
2. **OmniRoute Integration**: Zero-cost execution across 340+ models without requiring individual API keys via `omniroute/auto`.
3. **Cloud Execution**: Point `endpoint` to your dedicated **Liate MicroVM Slice** for 24/7 sovereign execution.
4. **Binary Compatible**: The exact same 5-pillar declaration is portable across Node, Python, Go, Java, C#, PHP, Rust, and cURL.
