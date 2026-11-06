import io
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from provision_vctk_references import provision, valid_wav

class FakeResponse(io.BytesIO):
    def geturl(self): return 'https://huggingface.co/model/resolve/main/sample.wav'

def sample():
    import wave
    b = io.BytesIO()
    with wave.open(b,'wb') as w:
        w.setnchannels(1);w.setsampwidth(2);w.setframerate(22050);w.writeframes(b'\x00\x00'*90)
    return b.getvalue()

class TestProvision(unittest.TestCase):
    def test_wav_rejects_corruption(self):
        self.assertFalse(valid_wav(b'not audio'))
        self.assertTrue(valid_wav(sample()))
    def test_downloads_two_private_candidates_with_provenance(self):
        with TemporaryDirectory() as d:
            seen=[]
            def fake_open(url,timeout):
                self.assertTrue(url.startswith('https://huggingface.co/'))
                seen.append(url)
                return FakeResponse(sample())
            entries=provision(d,open_url=fake_open)
            self.assertEqual(len(seen),2)
            self.assertEqual(set(entries),{'gentleman','matriarch'})
            self.assertTrue(Path(entries['matriarch']['path']).is_file())
            self.assertEqual(json.loads(Path(d,'reference-provenance.json').read_text())['gentleman']['license'],'CC-BY-4.0')
            entries2=provision(d,open_url=lambda *args,**kwargs: self.fail('should use cache'))
            self.assertEqual(entries,entries2)

if __name__=='__main__': unittest.main()
