"""Private, self-hosted Chatterbox TTS for TradeFlow. No audio/text retention.
Requires: pip install chatterbox-tts
Private environment: TF_CHATTERBOX_TOKEN, TF_CHATTERBOX_GENTLEMAN_REF,
TF_CHATTERBOX_MATRIARCH_REF. Reference WAVs must be legally licensed.
Default host is loopback; only expose through authorized TLS ingress.
"""
import hmac
import io
import json
import os
from pathlib import Path
import re
import threading
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MAX_TEXT = 2500
MAX_REQUEST = 6500
VOICE_IDS = frozenset(("gentleman", "matriarch"))
CONTROL_CHARACTERS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")


def speech_chunks(text, limit=300):
    """Split long text for stable synthesis without paraphrasing any content."""
    chunks = []
    remainder = text.strip()
    while remainder:
        if len(remainder) <= limit:
            chunks.append(remainder)
            break
        candidates = [remainder.rfind(p, 0, limit + 1) + len(p) for p in ('. ', '? ', '! ', '; ', ': ')]
        cut = max(candidates)
        if cut < limit // 3:
            cut = remainder.rfind(' ', 0, limit + 1)
        if cut < limit // 3:
            cut = limit
        chunks.append(remainder[:cut].strip())
        remainder = remainder[cut:].lstrip()
    return chunks


def valid_request(body):
    return (isinstance(body, dict) and body.get('profileId') in VOICE_IDS
            and isinstance(body.get('text'), str) and bool(body['text'].strip())
            and len(body['text']) <= MAX_TEXT
            and not CONTROL_CHARACTERS.search(body['text']))


class ChatterboxEngine:
    """Single locked inference worker; prompt recordings never enter the repository."""
    def __init__(self, reference_paths, device='cpu'):
        if set(reference_paths) != VOICE_IDS:
            raise ValueError('Both British reference recordings must be configured')
        for label, value in reference_paths.items():
            if not value or not Path(value).is_file():
                raise FileNotFoundError(f'Missing licensed {label} reference WAV')
        self.reference_paths = reference_paths
        self.lock = threading.Lock()
        self.device = device
        from chatterbox.tts import ChatterboxTTS
        self.model = ChatterboxTTS.from_pretrained(device=device)

    def synthesize(self, profile_id, text):
        import numpy as np
        import torch
        params = {
            'gentleman': {'exaggeration': 0.57, 'cfg_weight': 0.35},
            'matriarch': {'exaggeration': 0.59, 'cfg_weight': 0.35},
        }
        parts = []
        with self.lock, torch.inference_mode():
            for chunk in speech_chunks(text):
                audio = self.model.generate(
                    chunk, audio_prompt_path=self.reference_paths[profile_id],
                    **params[profile_id]
                )
                pcm = (audio.detach().float().cpu().reshape(-1).clamp(-1, 1).numpy() * 32767).astype(np.int16)
                parts.append(pcm.tobytes())
        out = io.BytesIO()
        with wave.open(out, 'wb') as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(self.model.sr)
            wav.writeframes(b''.join(parts))
        return out.getvalue()


def make_handler(engine, secret):
    if not isinstance(secret, str) or len(secret) < 16:
        raise ValueError('TF_CHATTERBOX_TOKEN must contain at least 16 characters')

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, format, *args):
            # No raw request logging (customer text, tokens or URLs).
            pass

        def respond(self, status, payload):
            data = json.dumps(payload).encode('utf-8')
            self.send_response(status)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def authorized(self):
            supplied = self.headers.get('X-TradeFlow-TTS-Token', '')
            return hmac.compare_digest(supplied.encode(), secret.encode())

        def do_GET(self):
            if not self.authorized():
                return self.respond(401, {'error': 'Unauthorized'})
            if self.path != '/health':
                return self.respond(404, {'error': 'Not found'})
            self.respond(200, {'engine': 'chatterbox', 'ready': bool(engine), 'voices': sorted(VOICE_IDS)})

        def do_POST(self):
            if not self.authorized():
                return self.respond(401, {'error': 'Unauthorized'})
            if self.path != '/v1/synthesize':
                return self.respond(404, {'error': 'Not found'})
            if not self.headers.get('Content-Type', '').lower().startswith('application/json'):
                return self.respond(415, {'error': 'JSON required'})
            try:
                count = int(self.headers.get('Content-Length', '0'))
            except ValueError:
                return self.respond(400, {'error': 'Invalid length'})
            if count < 2 or count > MAX_REQUEST:
                return self.respond(413, {'error': 'Invalid request size'})
            try:
                body = json.loads(self.rfile.read(count))
            except (ValueError, UnicodeError):
                return self.respond(400, {'error': 'Invalid JSON'})
            if not valid_request(body):
                return self.respond(400, {'error': 'Invalid speech request'})
            if engine is None:
                return self.respond(503, {'error': 'Model not ready'})
            try:
                payload = engine.synthesize(body['profileId'], body['text'])
            except Exception:
                return self.respond(503, {'error': 'Speech synthesis failed'})
            self.send_response(200)
            self.send_header('Content-Type', 'audio/wav')
            self.send_header('Cache-Control', 'no-store, private')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('Content-Length', str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

    return Handler


def main():
    secret = os.environ.get('TF_CHATTERBOX_TOKEN', '')
    if len(secret) < 16:
        raise SystemExit('Configure TF_CHATTERBOX_TOKEN (min. 16 characters)')
    reference_paths = {
        'gentleman': os.environ.get('TF_CHATTERBOX_GENTLEMAN_REF', ''),
        'matriarch': os.environ.get('TF_CHATTERBOX_MATRIARCH_REF', ''),
    }
    engine = ChatterboxEngine(reference_paths, device=os.environ.get('TF_CHATTERBOX_DEVICE', 'cpu'))
    host = os.environ.get('TF_CHATTERBOX_BIND', '127.0.0.1')
    port = int(os.environ.get('TF_CHATTERBOX_PORT', '8765'))
    print(f'Chatterbox ready on {host}:{port}; references remain provisional until approved', flush=True)
    ThreadingHTTPServer((host, port), make_handler(engine, secret)).serve_forever()


if __name__ == '__main__':
    main()
