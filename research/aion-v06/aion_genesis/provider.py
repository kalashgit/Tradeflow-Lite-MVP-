"""Small independent OpenAI-compatible inference adapter for Qwen/Ollama."""

from dataclasses import dataclass
import json
import os
from urllib import request
from urllib.error import HTTPError, URLError


@dataclass(frozen=True)
class InferenceConfig:
    base_url: str
    model: str
    api_key: str | None = None
    timeout_seconds: int = 30
    max_completion_tokens: int = 350

    def __post_init__(self):
        if not self.base_url.startswith(("http://", "https://")):
            raise ValueError("Inference base_url must be an HTTP(S) URL")
        if not self.model.strip():
            raise ValueError("Inference model must be set")
        if not 1 <= self.timeout_seconds <= 180:
            raise ValueError("Inference timeout must be 1–180 seconds")
        if not 32 <= self.max_completion_tokens <= 4096:
            raise ValueError("Inference completion token limit must be 32–4096")

    @classmethod
    def from_environment(cls):
        return cls(
            base_url=os.getenv("AION_BASE_URL", "http://localhost:11434/v1"),
            model=os.getenv("AION_MODEL", "qwen3:4b"),
            api_key=os.getenv("AION_API_KEY"),
            timeout_seconds=int(os.getenv("AION_TIMEOUT_SECONDS", "30")),
            max_completion_tokens=int(os.getenv("AION_MAX_COMPLETION_TOKENS", "350")),
        )


class CompatibleChatAdapter:
    def __init__(self, config: InferenceConfig):
        self.config = config

    def complete(self, messages: list[dict[str, str]]) -> str:
        endpoint = self.config.base_url.rstrip("/") + "/chat/completions"
        data = json.dumps({
            "model": self.config.model,
            "messages": messages,
            "stream": False,
            "temperature": 0,
            "max_tokens": self.config.max_completion_tokens,
        }).encode("utf-8")
        headers = {"Content-Type": "application/json"}
        if self.config.api_key:
            headers["Authorization"] = "Bearer " + self.config.api_key
        req = request.Request(endpoint, data=data, headers=headers, method="POST")
        try:
            with request.urlopen(req, timeout=self.config.timeout_seconds) as response:
                payload = json.loads(response.read(2_000_000))
        except (HTTPError, URLError, TimeoutError, ValueError) as exc:
            raise RuntimeError(f"Inference request failed: {type(exc).__name__}") from exc
        try:
            content = payload["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise RuntimeError("Inference endpoint did not return chat content") from exc
        if not isinstance(content, str) or not content.strip():
            raise RuntimeError("Inference endpoint returned empty or invalid chat content")
        return content
