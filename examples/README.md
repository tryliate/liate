# 🇮🇳 Liate Examples

Official runnable example agents and multi-agent workflows built with **Liate**.

## 🚀 Available Examples

| File | Description | Run Command |
|---|---|---|
| [`01-hello-agent.ts`](./01-hello-agent.ts) | 6-line Sovereign Agent Quickstart | `bun run examples/01-hello-agent.ts` |
| [`02-sarvam-voice-agent.ts`](./02-sarvam-voice-agent.ts) | Indic Voice STT/TTS with paise-level cost estimation | `bun run examples/02-sarvam-voice-agent.ts` |
| [`03-multi-tool-react.ts`](./03-multi-tool-react.ts) | Multi-tool ReAct agent with MCP tool integration | `bun run examples/03-multi-tool-react.ts` |
| [`04-workflow-pipeline.ts`](./04-workflow-pipeline.ts) | Sequential pipeline execution with `LiateWorkflow` & `LiateDB` | `bun run examples/04-workflow-pipeline.ts` |
| [`05-budget-guardrails.ts`](./05-budget-guardrails.ts) | INR budget guardrails & Sarvam rate card calculations | `bun run examples/05-budget-guardrails.ts` |
| [`06-dpdp-guard.ts`](./06-dpdp-guard.ts) | DPDP citizen PII redaction & compliance firewall | `bun run examples/06-dpdp-guard.ts` |

---

## 🏃 Running Examples

Execute any example agent locally using Bun:

```bash
bun run examples/<example-file>.ts
```

Or execute directly via the Liate CLI:

```bash
liate run examples/<example-file>.ts "Your prompt here"
```

