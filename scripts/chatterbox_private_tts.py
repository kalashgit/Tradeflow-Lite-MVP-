#!/usr/bin/env python3
"""Private loopback-only Chatterbox speech adapter for TradeFlow development.

Install in an isolated Python environment: pip install chatterbox-tts
Set TF_GENTLEMAN_REFERENCE and TF_MATRIARCH_REFERENCE to licensed, consented
British-English WAV files. Start with: python3 scripts/chatterbox_private_tts.py
Do not expose this server publicly or use real customer data in development.
"""
import io
import json
import os
import threading
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HOST = "127.0.0.1"
PORT = int(os.environ.get("TF_TTS_PORT", "8766"))
MAX_BYTES = 12000
REFERENCES = {
    "gentleman": os.environ.get("TF_GENTLEMAN_REFERENCE"),
    "matriarch": os.environ.get("TF_MATRIARCH_REFERENCE"),
}
SETTINGS = {
    "gentleman": (0.48, 0.42),
    "matriarch": (0.53, 0.40),
}
_model = None
_model_lock = threading.Lock()

def make_wav(text, profile):
    import torch
    from chatterbox.tts import ChatterboxTTS
    global _model
    ref = REFERENCES.get(profile)
    if not ref or not os.path.isfile(ref):
        raise FileNotFoundError("approved_reference_audio_missing")
    with _model_lock:
        if _model is None:
            device = "cuda" if torch.cuda.is_available() else "cpu"
            _model = ChatterboxTTS.from_pretrained(device=device)
        exaggeration, cfg_weight = SETTINGS[profile]
        audio = _model.generate(
            text, audio_prompt_path=ref,
            exaggeration=exaggeration, cfg_weight=cfg_weight,
        )
        samples = audio.detach().cpu().float().flatten().clamp(-1, 1)
        pcm = (samples * 32767).to(torch.int16).numpy().tobytes()
        rate = int(_model.sr)
    out = io.BytesIO()
    with wave.open(out, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(rate)
        wav.writeframes(pcm)
    return out.getvalue()

class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        # Never log user speech, synthesized text, or audio.
        pass

    def reply(self, code, payload):
        data = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path != "/health":
            return self.reply(404, {"error": "not_found"})
        ready = {key: bool(path and os.path.isfile(path)) for key, path in REFERENCES.items()}
        self.reply(200, {"engine": "chatterbox", "reference_ready": ready})

    def do_POST(self):
        if self.path != "/synthesize":
            return self.reply(404, {"error": "not_found"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            return self.reply(400, {"error": "invalid_length"})
        if length <= 0 or length > MAX_BYTES:
            return self.reply(413, {"error": "invalid_request_size"})
        try:
            payload = json.loads(self.rfile.read(length))
        except (ValueError, UnicodeDecodeError):
            return self.reply(400, {"error": "invalid_json"})
        if not isinstance(payload, dict):
            return self.reply(400, {"error": "invalid_payload"})
        profile, text = payload.get("profile"), payload.get("text")
        if profile not in SETTINGS or not isinstance(text, str) or not text.strip() or len(text) > 2500:
            return self.reply(400, {"error": "invalid_profile_or_text"})
        if not REFERENCES.get(profile) or not os.path.isfile(REFERENCES[profile]):
            return self.reply(503, {"error": "approved_reference_audio_missing"})
        try:
            audio = make_wav(text, profile)
        except Exception:
            return self.reply(503, {"error": "tts_generation_failed"})
        self.send_response(200)
        self.send_header("Content-Type", "audio/wav")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(audio)))
        self.end_headers()
        self.wfile.write(audio)

if __name__ == "__main__":
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
