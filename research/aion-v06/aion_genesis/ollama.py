"""Local-only Ollama adapter for AION's bounded synthetic experiments.

The native Ollama API supports disabling Qwen's thinking mode and enforcing a
small JSON schema.  This is independent from TradeFlow's production services.
"""

import json
from urllib import request
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit


DECISION_SCHEMA = {
    "type": "object",
    "properties": {
        "supplier": {"type": "string", "enum": ["economy", "priority"]},
        "reserve_crew": {"type": "boolean"},
        "predicted_material_delay": {"type": "number", "minimum": 0, "maximum": 1},
        "predicted_crew_delay": {"type": "number", "minimum": 0, "maximum": 1},
        "hypothesis": {"type": "string", "maxLength": 320},
    },
    "required": ["supplier", "reserve_crew", "predicted_material_delay",
                 "predicted_crew_delay", "hypothesis"],
    "additionalProperties": False,
}


class LocalOllamaAdapter:
    """Fail-closed HTTP adapter; only loopback is permitted for this runner."""

    def __init__(self, model: str, base_url: str = "http://127.0.0.1:11434",
                 timeout_seconds: int = 90, max_completion_tokens: int = 350):
        parsed = urlsplit(base_url)
        if parsed.scheme != "http" or parsed.hostname not in ("localhost", "127.0.0.1"):
            raise ValueError("AION's unattended Ollama runner only permits local HTTP")
        if parsed.username or parsed.password or parsed.path not in ("", "/") or parsed.query:
            raise ValueError("Ollama base URL must be a bare local origin")
        if not model or len(model) > 100 or not 1 <= timeout_seconds <= 180:
            raise ValueError("Invalid model or timeout")
        if not 32 <= max_completion_tokens <= 4096:
            raise ValueError("Invalid completion token cap")
        self.model = model
        self.url = base_url.rstrip("/") + "/api/chat"
        self.timeout_seconds = timeout_seconds
        self.max_completion_tokens = max_completion_tokens

    def complete(self, messages: list[dict[str, str]]) -> str:
        preflight = messages[0]["content"].startswith("Reply exactly AION_OK")
        payload = {
            "model": self.model, "messages": messages, "stream": False,
            "think": False,
            "options": {"temperature": 0, "num_predict": self.max_completion_tokens},
        }
        if not preflight:
            payload["format"] = DECISION_SCHEMA
        req = request.Request(
            self.url, data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"}, method="POST",
        )
        try:
            with request.urlopen(req, timeout=self.timeout_seconds) as response:
                result = json.loads(response.read(2_000_000))
            content = result["message"]["content"]
        except (HTTPError, URLError, TimeoutError, ValueError, KeyError, TypeError) as exc:
            raise RuntimeError(f"Ollama inference unavailable: {type(exc).__name__}") from exc
        if not isinstance(content, str) or not content.strip():
            raise RuntimeError("Ollama returned no message content")
        return content
