#!/usr/bin/env python3
"""Private, opt-in CPU TTS worker. One JSON request, one bounded WAV; no network."""
import base64, io, json, os, resource, sys, time, wave
os.environ.setdefault('OMP_NUM_THREADS', '2')
os.environ.setdefault('OPENBLAS_NUM_THREADS', '2')

def synthesize(config, text):
    import importlib.metadata
    expected={'kokoro-onnx':'0.6.1','onnxruntime':'1.31.1'} if config['provider']=='kokoro' else {'piper-tts':'1.8.0'}
    if any(importlib.metadata.version(name)!=version for name,version in expected.items()):
        raise ValueError('Unpinned speech runtime')
    started = time.perf_counter()
    if config['provider'] == 'kokoro':
        import numpy as np
        import onnxruntime as ort
        from kokoro_onnx import Kokoro
        options = ort.SessionOptions()
        options.intra_op_num_threads = 2
        options.inter_op_num_threads = 1
        session = ort.InferenceSession(config['model'], sess_options=options, providers=['CPUExecutionProvider'])
        engine = Kokoro.from_session(session, config['voices'])
        loaded = time.perf_counter()
        audio, rate = engine.create(text, voice=config['voice'], speed=1, lang='en-us')
        pcm = (np.clip(audio, -1, 1) * 32767).astype('<i2').tobytes()
    elif config['provider'] == 'piper':
        from piper import PiperVoice
        engine = PiperVoice.load(config['model'], config_path=config['config'], use_cuda=False)
        loaded = time.perf_counter()
        output = io.BytesIO()
        with wave.open(output, 'wb') as target:
            engine.synthesize_wav(text, target)
        output.seek(0)
        with wave.open(output, 'rb') as source:
            rate, pcm = source.getframerate(), source.readframes(source.getnframes())
    else:
        raise ValueError('Unsupported local speech provider')
    if not pcm or len(pcm) > 24000 * 2 * 180:
        raise ValueError('Audio outside bounded duration')
    output = io.BytesIO()
    with wave.open(output, 'wb') as target:
        target.setnchannels(1)
        target.setsampwidth(2)
        target.setframerate(rate)
        target.writeframes(pcm)
    return output.getvalue(), {'modelLoadMs': round((loaded-started)*1000),
        'synthesisMs': round((time.perf_counter()-loaded)*1000),
        'durationMs': round(len(pcm)/2/rate*1000), 'sampleRate': rate,
        'peakRssKiB': resource.getrusage(resource.RUSAGE_SELF).ru_maxrss}

if __name__ == '__main__':
    try:
        request = json.loads(sys.stdin.buffer.readline(24000))
        text = request['text']
        if not isinstance(text, str) or not 1 <= len(text) <= 2500:
            raise ValueError('Invalid speech length')
        audio, metrics = synthesize(request['config'], text)
        print(json.dumps({'version': 1, 'wav': base64.b64encode(audio).decode(), 'metrics': metrics}))
    except Exception:
        # Provider errors must not leak paths, transcript, tokens or stack traces to browsers.
        print(json.dumps({'version': 1, 'error': 'Local speech synthesis unavailable'}))
        sys.exit(1)
