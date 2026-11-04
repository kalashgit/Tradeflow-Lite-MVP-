#!/usr/bin/env python3
"""Private opt-in offline ASR. No network, raw audio files, transcript logging or writes."""
import base64, io, json, sys, time, wave
try:
 import importlib.metadata
 if importlib.metadata.version('faster-whisper') != '1.2.1':raise ValueError('Unpinned ASR runtime')
 import numpy as np
 from faster_whisper import WhisperModel
 request=json.loads(sys.stdin.buffer.readline(1500000))
 raw=base64.b64decode(request['wav'],validate=True)
 with wave.open(io.BytesIO(raw),'rb') as audio:
  if (audio.getnchannels(),audio.getsampwidth(),audio.getframerate())!=(1,2,16000):raise ValueError('Unsupported PCM')
  pcm=np.frombuffer(audio.readframes(audio.getnframes()),dtype='<i2').astype(np.float32)/32768
 if not 1600<=len(pcm)<=480000:raise ValueError('Unsupported audio duration')
 started=time.perf_counter()
 model=WhisperModel(request['model'],device='cpu',compute_type='int8',cpu_threads=2,num_workers=1,local_files_only=True)
 loaded=time.perf_counter()
 segments,info=model.transcribe(pcm,language='en',beam_size=3,condition_on_previous_text=False,vad_filter=False,temperature=0)
 kept=[s for s in segments if s.no_speech_prob<.6 and s.avg_logprob> -1.2]
 text=' '.join(s.text.strip() for s in kept).strip()
 print(json.dumps({'version':1,'text':text,'confidence':'requires_review' if any(s.avg_logprob<-.6 for s in kept) else 'model_transcript_unverified',
  'metrics':{'modelLoadMs':round((loaded-started)*1000),'recognitionMs':round((time.perf_counter()-loaded)*1000),'audioDurationMs':round(len(pcm)/16)}}))
except Exception:
 print(json.dumps({'version':1,'error':'Local speech recognition unavailable'}));sys.exit(1)
