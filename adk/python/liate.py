"""
Liate ADK for Python
Sovereign AI Agent Client & Builder (LAPI/v1)
5-Pillars: L-I-A-T-E Architecture
"""

import os
import json
import urllib.request
import urllib.error
from typing import Dict, List, Any, Optional, Union

class LiateModel:
    def __init__(self, model: str = "sarvam/sarvam-105b", fallback: Optional[str] = None, temperature: Optional[float] = None):
        self.model = model
        self.fallback = fallback
        self.temperature = temperature

    def to_json(self) -> str:
        return self.model

class LiateIntegration:
    def __init__(self, memory: Optional[str] = None, session: Optional[str] = None, database: Optional[str] = None, webhook: Optional[str] = None, **kwargs):
        self.memory = memory or session
        self.session = session or memory
        self.database = database
        self.webhook = webhook
        self.extra = kwargs

    def to_json(self) -> Dict[str, Any]:
        data = {}
        if self.memory:
            data["memory"] = self.memory
        if self.session:
            data["session"] = self.session
        if self.database:
            data["database"] = self.database
        if self.webhook:
            data["webhook"] = self.webhook
        data.update(self.extra)
        return data

class LiateTools:
    def __init__(self, tools: Optional[List[Any]] = None):
        self.tools = tools or []

    def add(self, tool: Any) -> "LiateTools":
        self.tools.append(tool)
        return self

    def to_json(self) -> List[str]:
        return [t if isinstance(t, str) else getattr(t, "name", str(t)) for t in self.tools]

class LiateEnv:
    def __init__(self, MAX_TURNS: int = 5, REASONING_EFFORT: str = "medium", TIMEOUT_MS: Optional[int] = None, **kwargs):
        self.MAX_TURNS = MAX_TURNS
        self.REASONING_EFFORT = REASONING_EFFORT
        self.TIMEOUT_MS = TIMEOUT_MS
        self.extra = kwargs

    def to_json(self) -> Dict[str, str]:
        data = {
            "MAX_TURNS": str(self.MAX_TURNS),
            "REASONING_EFFORT": self.REASONING_EFFORT
        }
        if self.TIMEOUT_MS is not None:
            data["TIMEOUT_MS"] = str(self.TIMEOUT_MS)
        for k, v in self.extra.items():
            data[k] = str(v)
        return data

class AgentHandle:
    def __init__(self, agent_id: str, client: "LiateClient"):
        self.agent_id = agent_id
        self.client = client

    def run(self, prompt: str, session: Optional[str] = None, stream: bool = False) -> str:
        url = f"{self.client.base_url.rstrip('/')}/lapi/v1/{self.agent_id}/run"
        payload = json.dumps({
            "prompt": prompt,
            "session": session,
            "stream": stream
        }).encode("utf-8")

        headers = {"Content-Type": "application/json"}
        if self.client.api_key:
            headers["Authorization"] = f"Bearer {self.client.api_key}"

        req = urllib.request.Request(url, data=payload, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                return data.get("response") or data.get("output") or data.get("result") or str(data)
        except urllib.error.HTTPError as e:
            err = e.read().decode("utf-8")
            raise RuntimeError(f"[Liate ADK Error {e.code}]: {err}")

    def get(self) -> Dict[str, Any]:
        url = f"{self.client.base_url.rstrip('/')}/lapi/v1/{self.agent_id}"
        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode("utf-8"))

class LiateClient:
    def __init__(self, base_url: Optional[str] = None, api_key: Optional[str] = None):
        self.base_url = base_url or os.getenv("LIATE_BASE_URL", os.getenv("LIATE_ENDPOINT", "http://localhost:7071"))
        self.api_key = api_key or os.getenv("LIATE_API_KEY")

    def agent(self, agent_id: str) -> AgentHandle:
        return AgentHandle(agent_id, self)

    def list_agents(self) -> List[Dict[str, Any]]:
        url = f"{self.base_url.rstrip('/')}/lapi/v1/agents"
        req = urllib.request.Request(url, method="GET")
        try:
            with urllib.request.urlopen(req) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception:
            return []

class LiateAgent:
    def __init__(
        self,
        L: Union[str, LiateModel] = "sarvam/sarvam-105b",
        I: Optional[Union[Dict[str, Any], LiateIntegration]] = None,
        A: Optional[Dict[str, Any]] = None,
        T: Optional[Union[List[Any], LiateTools]] = None,
        E: Optional[Union[Dict[str, Any], LiateEnv]] = None,
        endpoint: Optional[str] = None,
        api_key: Optional[str] = None,
    ):
        self.L = L if isinstance(L, LiateModel) else LiateModel(L)
        self.I = I if isinstance(I, LiateIntegration) else LiateIntegration(**(I or {}))
        self.A = A or {}
        self.T = T if isinstance(T, LiateTools) else LiateTools(T or [])
        self.E = E if isinstance(E, LiateEnv) else LiateEnv(**(E or {}))
        self.endpoint = endpoint or os.getenv("LIATE_ENDPOINT", "http://localhost:7071")
        self.api_key = api_key or os.getenv("LIATE_API_KEY")

    def run(self, prompt: str, session: Optional[str] = None) -> str:
        agent_name = self.A.get("name", "default")
        url = f"{self.endpoint.rstrip('/')}/lapi/v1/{agent_name}/run"
        spec = {
            "L": self.L.to_json(),
            "I": self.I.to_json(),
            "A": self.A,
            "T": self.T.to_json(),
            "E": self.E.to_json()
        }
        payload = json.dumps({
            "spec": spec,
            "prompt": prompt,
            "session": session or self.I.session
        }).encode("utf-8")

        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        req = urllib.request.Request(url, data=payload, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                return data.get("response") or data.get("output") or data.get("result") or str(data)
        except urllib.error.HTTPError as e:
            err = e.read().decode("utf-8")
            raise RuntimeError(f"[Liate ADK Error {e.code}]: {err}")

def liate(L: Union[str, LiateModel], I: Optional[Dict[str, Any]] = None, **kwargs) -> LiateAgent:
    return LiateAgent(L=L, I=I, **kwargs)

Agent = LiateAgent
