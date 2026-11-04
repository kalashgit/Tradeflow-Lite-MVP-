#!/usr/bin/env python3
"""Real CPU model evaluation; private model paths/output supplied explicitly."""
import argparse, hashlib, json, os, pathlib, subprocess, sys, time
PACK = [
 'TradeFlow is ready. What would you like to review?',
 'The recorded labor is fifty two hours. The estimate is missing, so a budget overrun is not verified.',
 'Before invoicing, review the change order evidence and confirm approval. No invoice has been sent.',
 'Check the panel schedule, conduit route, and material list before returning to the job site.',
]

def main():
 p=argparse.ArgumentParser();p.add_argument('--cache',required=True);p.add_argument('--out',required=True);args=p.parse_args()
 cache=pathlib.Path(args.cache);out=pathlib.Path(args.out);out.mkdir(parents=True,exist_ok=True)
 configs=[dict(provider='kokoro',model=str(cache/'kokoro-v1.0.int8.onnx'),voices=str(cache/'voices-v1.0.bin'),voice='am_michael'),
          dict(provider='piper',model=str(cache/'piper-ljspeech.onnx'),config=str(cache/'piper-ljspeech.onnx.json'))]
 results=[]
 for config in configs:
  for i,text in enumerate(PACK):
   started=time.perf_counter()
   process=subprocess.run([sys.executable,str(pathlib.Path(__file__).parents[1]/'automation/local-tts-worker.py')],
     input=json.dumps({'config':config,'text':text})+'\n',text=True,capture_output=True,timeout=90)
   import base64
   result=json.loads(process.stdout)
   if process.returncode or result.get('error'):raise RuntimeError('Speech evaluation failed for '+config['provider'])
   audio=base64.b64decode(result['wav']);name=config['provider']+'-'+str(i+1)+'.wav';(out/name).write_bytes(audio)
   results.append(dict(provider=config['provider'],phrase=i+1,transcript=text,file=name,audioSha256=hashlib.sha256(audio).hexdigest(),
      processTotalMs=round((time.perf_counter()-started)*1000),**result['metrics']))
   print(config['provider'],i+1,result['metrics'],flush=True)
 (out/'benchmarks.json').write_text(json.dumps(dict(version=1,actualSynthesis=True,hardware='3 vCPU quota / 9.7 GiB RAM, Linux x86_64 CPU, two inference threads',
  measurement='Fresh worker per utterance. modelLoadMs includes imports and initialization; processTotalMs is full-WAV latency, not first audible browser latency. No streaming claim.',results=results),indent=2))
if __name__=='__main__':main()
