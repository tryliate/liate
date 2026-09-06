import requests
import os

BASE_URL = os.environ.get("TARGET_URL", "https://tryliate.com").rstrip("/")
SARVAM_KEY = os.environ.get("SARVAM_API_KEY", "sk-test-dummy")

def test_agent_execution() -> None:
    payload = {
        "spec": {
            "L": "sarvam/sarvam-105b",
            "I": { "memory": "testsprite_session" },
            "A": {
                "name": "testsprite-runner",
                "intent": "You are a test verification agent."
            },
            "T": {},
            "E": {
                "SARVAM_API_KEY": SARVAM_KEY,
                "MAX_TURNS": 1
            }
        },
        "prompt": "Respond with 'Namaste Bharat'."
    }
    
    res = requests.post(f"{BASE_URL}/lapi/v1/run", json=payload, timeout=45)
    assert res.status_code in [200, 201], f"Expected 200 on /lapi/v1/run, got {res.status_code}"
    data = res.json()
    assert "response" in data or "output" in data or "result" in data, "Missing execution output"

test_agent_execution()
