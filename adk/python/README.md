# 🇮🇳 Liate Python ADK

> **Sovereign AI Agent Client & Multi-Language ADK for Python**

Build and deploy autonomous AI agents in 5 lines of Python code using the standard 5-Pillar `L-I-A-T-E` architecture.

---

## 📦 Installation

```bash
pip install liate
```

---

## ⚡ Quickstart: 5-Line Sovereign Agent

```python
from liate import liate, LiateModel, LiateAgent, LiateIntegration, LiateTools, LiateEnv

# 1. Define Sovereign Agent with the 5-Pillars
app = liate(
    L=LiateModel("sarvam/sarvam-105b"),
    I=LiateIntegration(memory="user_session_1"),
    A=LiateAgent(
        name="bharat-copilot",
        intent="You are a helpful sovereign business intelligence assistant."
    ),
    T=LiateTools(["web_search", "weather_tool"]),
    E=LiateEnv(MAX_TURNS=5)
)

# 2. Run locally against Liate engine or Sovereign Cloud
result = app.run("Analyze the growth of Indian AI ecosystem in 2026")
print(result)
```

---

## 🌟 Features

* **Zero Dependencies**: Lightweight standard-library only implementation.
* **Sarvam AI & OmniRoute**: Native support for India-first sovereign models & 340+ multi-provider routing.
* **MCP Protocol**: Built-in compatibility with Model Context Protocol tool servers.
* **100% Free Forever Locally**: Seamless connection to local Liate LAPI/v1 engine (`http://localhost:7071`) or cloud MicroVM slices.

---

## 📄 License

MIT © [Tryliate Team](https://tryliate.com)
