import requests
import os

BASE_URL = os.environ.get("TARGET_URL", "https://tryliate.com").rstrip("/")

def test_mcp_gateway() -> None:
    # 1. MCP Initialize
    init_payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": "2024-11-05",
            "clientInfo": { "name": "testsprite-probe", "version": "1.0.0" }
        }
    }
    res_init = requests.post(f"{BASE_URL}/lapi/v1/mcp", json=init_payload, timeout=30)
    assert res_init.status_code == 200, f"Expected 200 on MCP initialize, got {res_init.status_code}"
    data_init = res_init.json()
    assert "result" in data_init, "Missing JSON-RPC result"

    # 2. MCP Tools List
    tools_payload = {
        "jsonrpc": "2.0",
        "id": 2,
        "method": "tools/list"
    }
    res_tools = requests.post(f"{BASE_URL}/lapi/v1/mcp", json=tools_payload, timeout=30)
    assert res_tools.status_code == 200, f"Expected 200 on MCP tools/list, got {res_tools.status_code}"

test_mcp_gateway()
