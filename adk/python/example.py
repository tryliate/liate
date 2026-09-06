import os
import sys

# Ensure UTF-8 output on Windows
sys.stdout.reconfigure(encoding='utf-8')

from liate import liate

# ⚡ 5-Line Sovereign Agent with REAL-TIME MCP Tool in Python
agent = liate(
    L="sarvam/sarvam-105b",
    I={"memory": "session_python_live"},
    A={"name": "Time Agent", "intent": "Fetch live real-time clock for any timezone"},
    T={
        "time": {
            "command": "uvx",
            "args": ["mcp-server-time"]
        }
    },
    E={"SARVAM_API_KEY": os.getenv("SARVAM_API_KEY", "")},
)

if __name__ == "__main__":
    print("🚀 Running REAL LIVE MCP Agent in Python...")
    response = agent.run("What is the exact live current time in Mumbai right now? Use your real-time tool.")
    print("\n--- LIVE REAL AGENT OUTPUT (PYTHON) ---")
    print(response)


