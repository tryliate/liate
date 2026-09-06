import requests
import os

BASE_URL = os.environ.get("TARGET_URL", "https://tryliate.com").rstrip("/")

def test_skills_catalog() -> None:
    res = requests.get(f"{BASE_URL}/api/catalog/skills", timeout=30)
    assert res.status_code == 200, f"Expected 200 on /api/catalog/skills, got {res.status_code}"
    skills = res.json()
    assert isinstance(skills, list), "Skills catalog must be a list"

test_skills_catalog()
