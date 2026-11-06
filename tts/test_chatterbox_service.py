import http.client
import io
import json
import threading
import unittest
import wave
from http.server import ThreadingHTTPServer
from chatterbox_service import speech_chunks, valid_request, make_handler

TOKEN = 'local-test-secret-with-adequate-length'


def dummy_wav():
    buf = io.BytesIO()
    with wave.open(buf, 'wb') as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(24000)
        wav.writeframes(b'\\x00\\x00' * 200)
    return buf.getvalue()


class FakeEngine:
    def __init__(self):
        self.calls = []

    def synthesize(self, profile_id, text):
        self.calls.append((profile_id, text))
        return dummy_wav()


class ChatterboxContractTests(unittest.TestCase):
    def test_chunks_preserve_text(self):
        original = 'A long sentence. ' * 60
        parts = speech_chunks(original, 120)
        self.assertGreater(len(parts), 1)
        self.assertTrue(all(len(x) <= 120 for x in parts))
        self.assertEqual(' '.join(parts), original.strip())

    def test_validation(self):
        self.assertTrue(valid_request({'profileId': 'gentleman', 'text': 'Three quotations are awaiting approval.'}))
        self.assertTrue(valid_request({'profileId': 'matriarch', 'text': 'Good evening.'}))
        for item in ({'profileId': 'ghost', 'text': 'hello'}, {'profileId': 'gentleman', 'text': ''},
                     {'profileId': 'gentleman', 'text': 'A' * 2501}, {'profileId': 'gentleman', 'text': 'hi\\x00'}):
            self.assertFalse(valid_request(item))

    def test_private_http_contract(self):
        engine = FakeEngine()
        server = ThreadingHTTPServer(('127.0.0.1', 0), make_handler(engine, TOKEN))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            def call(path, payload=None, token=TOKEN):
                connection = http.client.HTTPConnection('127.0.0.1', server.server_port, timeout=2)
                body = None if payload is None else json.dumps(payload)
                headers = {'Content-Type': 'application/json'}
                if token is not None:
                    headers['X-TradeFlow-TTS-Token'] = token
                connection.request('GET' if payload is None else 'POST', path, body=body, headers=headers)
                reply = connection.getresponse()
                result = (reply.status, reply.getheader('Content-Type'), reply.read())
                connection.close()
                return result

            self.assertEqual(call('/health', token='incorrect')[0], 401)
            self.assertEqual(call('/health')[0], 200)
            self.assertEqual(call('/v1/synthesize', {'profileId': 'matriarch', 'text': 'Hello'}, token='wrong')[0], 401)
            self.assertEqual(call('/v1/synthesize', {'profileId': 'invalid', 'text': 'Hello'})[0], 400)
            status, content_type, sound = call('/v1/synthesize', {'profileId': 'matriarch', 'text': 'Hello there.'})
            self.assertEqual((status, content_type), (200, 'audio/wav'))
            self.assertEqual(sound[:4], b'RIFF')
            self.assertEqual(engine.calls, [('matriarch', 'Hello there.')])
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)


if __name__ == '__main__':
    unittest.main()
