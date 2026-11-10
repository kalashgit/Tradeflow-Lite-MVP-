"""Private Ollama inference for hypothetical mechanisms; no generated-code execution."""
import json
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
from .core import validate, MechanismError

class LocalQwenProposer:
    def __init__(self, model="qwen3:0.6b", endpoint="http://127.0.0.1:11434", transport=None):
        parsed = urlsplit(endpoint)
        if parsed.scheme != "http" or parsed.hostname not in ("localhost", "127.0.0.1", "::1") or parsed.username or parsed.password or parsed.path not in ("", "/") or parsed.query or parsed.fragment:
            raise ValueError("AION model endpoint must be loopback HTTP")
        if not isinstance(model, str) or not model or len(model) > 128:
            raise ValueError("invalid model id")
        self.model = model
        self.endpoint = endpoint.rstrip("/")
        self.transport = transport if transport is not None else self._call
        self.calls = 0

    def _call(self, request_body):
        req = Request(self.endpoint + "/api/chat", data=json.dumps(request_body).encode(),
                      headers={"Content-Type": "application/json"}, method="POST")
        with urlopen(req, timeout=90) as response:
            return json.load(response)

    def propose(self, *, variables, recent, feedback, previous):
        system = (
            "Infer a testable binary mechanism consistent with observations. "
            "Output only a JSON expression tree using op=var with name; op=not with arg; "
            "op=and/or/xor with args list (2-4 expressions); or op=threshold with args and integer k. "
            "Use only variable names provided. Do not output Python, functions, prose, or markdown. "
            "Do not pretend the rule is proven by one example."
        )
        query = {"variables": list(variables), "observations": recent, "prior": previous,
                 "observedCounterexamples": feedback[-3:]}
        payload = {
            "model": self.model, "stream": False, "think": False, "format": "json",
            "options": {"temperature": 0, "num_predict": 512},
            "messages": [{"role": "system", "content": system},
                         {"role": "user", "content": json.dumps(query)}]
        }
        self.calls += 1
        result = self.transport(payload)
        if result.get("done") is not True or result.get("done_reason", "stop") != "stop":
            return None
        output = result.get("message", {}).get("content")
        if not isinstance(output, str) or not 0 < len(output) <= 24000:
            return None
        try:
            return validate(json.loads(output), variables)
        except (MechanismError, ValueError, TypeError, RecursionError):
            return None
