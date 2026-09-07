# Changelog

All notable changes to **Liate** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] — 2026-08-26

### 🎉 Initial Release — India's Sovereign AI Agents Platform (Agentantra Mission)

This is the inaugural open-source release of **Liate** — India's **Sovereign AI Agents Platform**, built on Bun + Hono + TypeScript with a multi-language ADK (Python, Go, Java, Rust, C#, PHP, and more), as part of the **Agentantra Mission** — AI Agent freedom for Bharat.

### Added

#### Core Engine
- **`aum_engine`** — Full 5-Pillar (L-I-A-T-E) ReAct agent loop with multi-turn tool calling, session memory, and approval gates
- **`token_optimizer`** — AgentDiet system: schema minification, tool output sanitization, trajectory pruning (70-85% token reduction)
- **`lock.ts`** — `liate.lock` integrity verification for reproducible agent deployments
- **`models.ts`** — Multi-provider model registry with capability flags

#### The 12 Agent Pillars
- **`LiateAgent`** — Sovereign Agent Orchestrator & 5-Pillar integrator
- **`LiateModel`** — LLM selector & multi-provider router (`[L]`)
- **`LiateIntegration`** — Memory scope, session management, vector store (`[I]`)
- **`LiateTools`** — MCP & TypeScript tool registry (`[T]`)
- **`LiateEnv`** — Guardrails, API keys, approval gates (`[E]`)
- **`LiateMcp`** — Production-grade MCP Edge Gateway with OAuth 2.1, CORS, JSON-RPC 2.0
- **`LiateToken`** — INR-native cost tracking with official Sarvam AI 2026 rate cards, budget guards, and cost triggers
- **`LiateSkills`** — Procedural skill engine with skills.sh registry integration (1.2M+ skills)
- **`LiateEval`** — CI quality gate & benchmarking scorecard
- **`LiateAPI`** — Resilient auto-retrying webhook client
- **`LiateScratch`** — Sandboxed KV & disk working buffer
- **`LiateCron`** — Autonomous scheduled agent runner

#### LAPI/v1 Engine (40+ Routes)
- Full Hono-based HTTP + WebSocket engine
- Agent run, discovery, lifecycle, async task (202 pattern)
- Streamable HTTP MCP endpoints
- HITL (Human-in-the-Loop) queue
- Keys vault, skills library, catalog APIs
- Multi-turn streaming `/api/chat` with effort control

#### Multi-Provider LLM Engine
- **Sarvam AI** — First-class, OpenAI-compatible, India-first
- **Anthropic Claude** — Native API with streaming
- **Google Gemini** — Native API (Gemini 2.5 Flash etc.)
- **Groq** — OpenAI-compatible, fast inference
- **OpenAI** — o1/o3 reasoning effort support
- **DeepSeek** — OpenAI-compatible
- **Together AI** — Open model hosting
- **OmniRoute** — Local gateway (340+ providers)
- **Ollama** — Local offline models

#### Application Layer
- **`LiateVoice`** — Sovereign Indic voice engine: STT/TTS for 10+ Indic languages (Hindi, Tamil, Telugu, Marathi, Bengali, Kannada, Malayalam, Gujarati, Punjabi, Odia, Indian English)
- **`LiateDoc`** — Document AI: parse, chunk, extract tables
- **`LiateGuard`** — PII redaction & compliance
- **`LiateDB`** / **`LiateCrud`** — JSON document store + schema-driven CRUD
- **`LiateAuth`** — API key auth + session management
- **`LiateWorkflow`** / **`LiateGraph`** — Sequential + DAG workflow engines
- **`LiateQueue`** — Background job queue with retry
- **`LiateEvent`** — EventBus with replay
- **`LiateCode`** — Code analysis and patching
- **`LiateView`** — UI component rendering
- **`LiateIO`** — Dataset I/O (CSV/JSON/NDJSON)
- **`LiateSandbox`** — Code execution sandbox
- **`LiatePlugin`** — Plugin system with lifecycle hooks
- **`LiateStream`** — Streaming event system
- **`LiateSync`** — Delta sync transport
- **`LiateClient`** — Consumer SDK (Next.js/web compatible)

#### CLI (`liate`)
- `liate init` — Interactive 5-Pillar project wizard
- `liate run <file>` — Execute any `.liate.json` agent
- `liate serve` / `liate dev` — Start LAPI/v1 engine with hot-reload
- `liate deploy` — Deploy to Liate Cloud
- `liate key add/list/delete` — Manage API key vault
- `liate mcp add/list/delete` — Manage MCP server registry
- `liate skill add/list/delete` — Manage skills library
- `liate logs` — View structured JSONL agent traces
- Precompiled single binary via `bun build --compile`

#### Rate Cards (Sarvam AI, Official 2026)
- Sarvam 105B Chat: ₹29.28/1M input, ₹73.20/1M output
- Gemma-4 31B: ₹36.60/1M input, ₹91.50/1M output
- GLM 5.2: ₹128.10/1M input, ₹402.60/1M output
- TTS: ₹3.00/1K chars
- STT: ₹30.00/hr (₹45.00/hr with diarization)
- Doc AI: ₹0.50/page (digitisation), ₹1.00/page (extraction)

#### Tests (198 cases across 15 suites)
- `tests/core/token_optimizer.test.ts` — Token optimizer unit tests
- `tests/pillars/token.test.ts` — LiateToken comprehensive tests
- `tests/pillars/eval.test.ts` — LiateEval quality gate tests
- `tests/pillars/mcp.test.ts` — LiateMcp HTTP + security tests

#### OSS Hardening
- Cryptographically secure OAuth tokens via `crypto.randomBytes`
- Configurable USD/INR exchange rate (`LiateToken.setExchangeRate()`)
- Real tool precision calculation in `LiateEval`
- Proper ESM imports (removed `require()` anti-patterns)
- Comprehensive `.gitignore` (excludes binaries, secrets, runtime data)
- CI/CD pipeline (GitHub Actions, `bun test` on every PR)

### Dual-Engine Architecture
- **Local**: Bun + Hono (this repo)
- **Cloud**: Go + Fiber v3 + HashiCorp Raft (same `liate.json` manifest)

---

## Roadmap

### [1.1.0] — Planned
- [ ] WebSocket streaming for agent run endpoint
- [ ] `liate eval` CLI command for CI pipelines
- [ ] Native vector embedding via Sarvam embed-v1
- [ ] `LiateToken.fetchExchangeRate()` — live forex from RBI/ECB APIs
- [ ] Plugin marketplace integration

### [1.2.0] — Planned
- [ ] Multi-agent orchestration (`LiateSwarm`)
- [ ] Browser SDK / `liate-react` package
- [ ] `liate publish` — publish agents to registry
- [ ] gRPC transport for MCP engine

---

*Built with ❤️ by the [Tryliate Team](https://tryliate.com) — Agentantra Sovereign AI Initiative 🇮🇳*
