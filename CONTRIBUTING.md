# Contributing to Liate 🇮🇳

First off, **thank you** for taking the time to contribute! Liate is part of the **Agentantra Sovereign AI Initiative** — every contribution brings us closer to Bharat's AI independence.

---

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Branch Strategy](#branch-strategy)
- [Pull Request Process](#pull-request-process)
- [Code Style](#code-style)
- [Testing](#testing)
- [Commit Messages](#commit-messages)

---

## Code of Conduct

This project and everyone participating in it is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior to **contributors@tryliate.com**.

---

## How Can I Contribute?

### 🐛 Reporting Bugs

Before creating a bug report, please check existing [Issues](https://github.com/tryliate/liate/issues) to avoid duplicates.

When filing a bug report, include:
- Your OS, Bun version, and Node version
- Minimal reproduction steps
- Expected vs actual behavior
- Relevant logs (from `.liate/liate_logs.jsonl`)

### 💡 Suggesting Features

Open a [Feature Request](https://github.com/tryliate/liate/issues/new?template=feature_request.md) and describe:
- The problem you're solving
- How it fits the 5-Pillar (LIATE) architecture
- If it adds Indic/sovereign AI value, mention it!

### 🛠️ Contributing Code

1. Fork the repository
2. Create your feature branch (`git checkout -b feat/my-feature`)
3. Write tests for your changes
4. Ensure all tests pass (`bun test`)
5. Submit a pull request

---

## Development Setup

### Prerequisites
- [Bun](https://bun.sh) v1.3+ (required)
- Git

### Setup

```bash
# Clone your fork
git clone https://github.com/<your-username>/liate.git
cd liate

# Install dependencies
bun install

# Copy the example env file
cp .env.example .env
# Add your SARVAM_API_KEY (get one at https://sarvam.ai)

# Run the dev server
bun dev
```

### Running Tests

```bash
# Run all tests
bun test

# Run specific test file
bun test tests/pillars/token.test.ts

# Run with watch mode
bun test --watch
```

---

## Project Structure

```
src/
├── aum/            ← Core Agent Unified Manifest engine & ReAct loops
├── cli/            ← Liate CLI commands & project scaffolding
├── lapi/           ← LAPI/v1 Hono HTTP + WebSocket server & routes
├── om/             ← Operator Machinery (locks, MCP, stream optimizer)
├── oop/            ← 51 Sovereign OOP classes across 8 architectural layers
│   ├── Liate_Pillars/       (Model, Integration, Agent, Tools, Env...)
│   ├── Liate_Orchestration/ (Loop, Task, Queue, Cron, Workflow, Graph...)
│   ├── Liate_Security/      (Guard, Auth, Sandbox, Plugin, Error...)
│   ├── Liate_AI/            (Provider, Chat, Context, Stream...)
│   ├── Liate_Data/          (DB, Collection, Memory, Sessions, VectorStore...)
│   ├── Liate_BuiltIn/       (Voice, Doc, Code, View, IO...)
│   ├── Liate_MCP/           (Mcp, StreamableHttp, Key, Web...)
│   └── Liate_Core/          (Test, Eval, Prompt, Deploy, Logs...)
├── store/          ← Persistent state vaults (keys, sessions, mcps, skills)
└── index.ts        ← Main library export surface (liate factory & classes)

tests/
├── cli/            ← End-to-end CLI & wizard workflow tests
├── core/           ← Core runtime and utility tests
├── lapi/           ← LAPI/v1 HTTP, SSE, WebSocket & task tests
└── pillars/        ← Unit tests for each sovereign class & pillar

examples/           ← Real-world agent examples (voice, DPDP, Ollama, workflow...)
catalog/            ← Community & prebuilt agent templates
adk/                ← Multi-language ADK (Python, Go, Java, C#, Rust, PHP...)
```

---

## Branch Strategy

| Branch | Purpose |
|---|---|
| `main` | Stable, production-ready code. Protected. |
| `develop` | Integration branch for upcoming releases |
| `feat/<name>` | New features |
| `fix/<name>` | Bug fixes |
| `docs/<name>` | Documentation changes only |
| `test/<name>` | Test additions/fixes only |

**Always branch from `develop`**, not `main`.

---

## Pull Request Process

1. **Target the `develop` branch** — not `main`
2. Fill in the [PR template](.github/pull_request_template.md)
3. Link related Issues with `Closes #<issue>`
4. Ensure CI passes (all tests green)
5. Request review from at least one maintainer
6. Squash commits before merge (maintainer will do this)

### PR Checklist

- [ ] Tests added/updated for my changes
- [ ] `bun test` passes locally (all tests green)
- [ ] TypeScript compiles without errors (`bun run build`)
- [ ] No new `any` types introduced without justification
- [ ] JSDoc updated for new public APIs
- [ ] README updated if new features are user-facing

---

## Code Style

### TypeScript

- **Target**: ES2023, strict mode
- **Avoid `any`**: Use proper generics or `unknown` where type is uncertain
- **Prefer explicit return types** on all exported functions and methods
- **Use JSDoc** for all public API symbols

```typescript
// ✅ Good
export function calculateCost(params: CostParams): TokenCostResult {
  // ...
}

// ❌ Avoid
export function calculateCost(params: any): any {
  // ...
}
```

### Naming Conventions

- **Classes**: `PascalCase` — `LiateToken`, `LiateMcp`
- **Functions/methods**: `camelCase` — `calculateCost()`, `recordUsage()`
- **Constants**: `SCREAMING_SNAKE_CASE` — `MODEL_PRICING_REGISTRY`
- **Files**: `PascalCase.ts` for OOP classes, `camelCase.ts` for modules

### Pillar Naming

All new Liate classes must follow the `Liate*` prefix convention:
- `LiateMyFeature` (class)
- `LiateMyFeatureOptions` (interface)
- Export a short alias: `export const MyFeature = LiateMyFeature`

---

## Testing

We use **Bun's built-in test runner**. Test files go in `tests/` mirroring the component structure.

```typescript
import { describe, it, expect } from 'bun:test';

describe('LiateMyFeature', () => {
  it('does the thing', () => {
    expect(myFeature.doThing()).toBe('expected');
  });
});
```

**Coverage targets:**
- All new public methods must have at least one test
- Edge cases (empty input, nulls, budget exceeded) must be covered
- No mocking of LLM providers — use `LiateEval` mock agent pattern

---

## Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short description>

[optional body]
[optional footer]
```

**Types:**
- `feat` — New feature
- `fix` — Bug fix  
- `docs` — Documentation only
- `test` — Test additions/changes
- `refactor` — Code restructure without behavior change
- `perf` — Performance improvement
- `chore` — Build system, CI, dependency updates

**Scopes:** `core`, `oop`, `lapi`, `aum`, `cli`, `store`, `om`, `examples`, `docs`, `adk`

**Examples:**
```
feat(oop): add LiateToken.setExchangeRate() for configurable forex rates
fix(oop): replace Math.random() OAuth tokens with crypto.randomBytes
test(lapi): add comprehensive LAPI/v1 SSE streaming verification
docs(readme): add Multi-Agent Swatantra example to quickstart
```

---

## Questions?

- 💬 Join the discussion on [GitHub Discussions](https://github.com/tryliate/liate/discussions)
- 📧 Email: **contributors@tryliate.com**
- 🇮🇳 Built with ❤️ for Bharat's Sovereign AI Future
