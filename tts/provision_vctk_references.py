"""Provision candidate British VCTK reference clips for private development only.

VCTK original CSTR VCTK contributors, licensed CC BY 4.0.
Attribution: Veaux, Yamagishi & MacDonald (2017), CSTR VCTK Corpus.
Do not ship a commercial cloned voice without assessing personality rights and consent.
"""
import hashlib
import json
import os
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import urlopen

SOURCES = {
    'gentleman': ('voices/VCTK_British_English_Males', 'VCTK_p227.wav', 'English male, age 38, Cumbria'),
    'matriarch': ('voices/VCTK_British_English_Females', 'VCTK_p225.wav', 'English female, age 23, Southern England'),
}
ATTRIBUTION = 'CSTR VCTK Corpus; Veaux, Yamagishi & MacDonald (2017); CC BY 4.0; https://datashare.ed.ac.uk/handle/10283/2950'
MAX_BYTES = 2 * 1024 * 1024


def valid_wav(data):
    return isinstance(data, bytes) and 44 <= len(data) <= MAX_BYTES and data[:4] == b'RIFF' and data[8:12] == b'WAVE'


def provision(destination='.local-tts', open_url=urlopen):
    root = Path(destination)
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(root, 0o700)
    entries = {}
    for profile, (repo, filename, description) in SOURCES.items():
        url = f'https://huggingface.co/{repo}/resolve/main/samples/{filename}'
        path = root / f'{profile}-vctk.wav'
        if path.is_file():
            data = path.read_bytes()
            if not valid_wav(data):
                raise ValueError(f'Existing {profile} recording is not a valid WAV; refusing overwrite')
        else:
            with open_url(url, timeout=60) as response:
                final = urlparse(response.geturl())
                if final.scheme != 'https' or not (final.hostname == 'huggingface.co' or final.hostname.endswith('.huggingface.co') or final.hostname.endswith('.hf.co')):
                    raise ValueError('Reference file redirected to an untrusted host')
                data = response.read(MAX_BYTES + 1)
            if not valid_wav(data):
                raise ValueError(f'Invalid or oversized VCTK reference audio for {profile}')
            path.write_bytes(data)
            os.chmod(path, 0o600)
        entries[profile] = dict(path=str(path.resolve()), source=url, description=description, sha256=hashlib.sha256(data).hexdigest(), bytes=len(data), license='CC-BY-4.0', status='nonproduction_candidate')
    (root / 'VCTK_ATTRIBUTION.txt').write_text(ATTRIBUTION + '\n', encoding='utf-8')
    (root / 'reference-provenance.json').write_text(json.dumps(entries, indent=2) + '\n', encoding='utf-8')
    return entries


if __name__ == '__main__':
    for name, item in provision().items():
        print(name, item['path'], item['sha256'])
