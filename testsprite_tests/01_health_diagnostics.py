import requests
import os

BASE_URL = os.environ.get("TARGET_URL", "https://tryliate.com").rstrip("/")

def test_health_diagnostics() -> None:
    # 1. Health Probe
    res = requests.get(f"{BASE_URL}/health", timeout=30)
    assert res.status_code == 200, f"Expected 200 on /health, got {res.status_code}"
    
    # 2. Canonical LAPI/v1 Health
    res_lapi = requests.get(f"{BASE_URL}/lapi/v1/health", timeout=30)
    assert res_lapi.status_code == 200, f"Expected 200 on /lapi/v1/health, got {res_lapi.status_code}"
    data = res_lapi.json()
    assert data.get("name") == "liate" or "protocol" in data, "Invalid server metadata"
    
    # 3. LLM Catalog
    res_models = requests.get(f"{BASE_URL}/api/catalog/llm", timeout=30)
    assert res_models.status_code == 200, f"Expected 200 on /api/catalog/llm, got {res_models.status_code}"
    models = res_models.json()
    assert isinstance(models, list), "Models catalog must be a list"

test_health_diagnostics()
