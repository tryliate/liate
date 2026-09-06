import requests
import os

BASE_URL = os.environ.get("TARGET_URL", "https://tryliate.com").rstrip("/")
SARVAM_KEY = os.environ.get("SARVAM_API_KEY", "sk-test-dummy")

def test_task_queue() -> None:
    # 1. Enqueue task
    payload = {
        "spec": {
            "L": "sarvam/sarvam-105b",
            "A": { "name": "queue-worker", "intent": "Task worker" },
            "E": { "SARVAM_API_KEY": SARVAM_KEY }
        },
        "prompt": "Process background batch."
    }
    res_post = requests.post(f"{BASE_URL}/lapi/v1/queue-worker/tasks", json=payload, timeout=30)
    assert res_post.status_code in [200, 202], f"Expected 200/202 on task queue, got {res_post.status_code}"
    
    # 2. List tasks
    res_list = requests.get(f"{BASE_URL}/lapi/v1/tasks", timeout=30)
    assert res_list.status_code == 200, f"Expected 200 on /lapi/v1/tasks, got {res_list.status_code}"

test_task_queue()
