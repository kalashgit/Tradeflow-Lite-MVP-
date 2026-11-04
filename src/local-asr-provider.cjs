'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const {checkRuntime}=require('./private-speech-runtime.cjs');
const HASHES=Object.freeze({'model.bin':'1a5afae06a4db91c975c9a9d78be5cc110ee4ea022ad57d55492e4550e936b2a','config.json':'14b1b421a90349bc551b881461426b561a874049cb9e4c4864f2ca384f6a7cc5','tokenizer.json':'929c5252409436dce1b38a75d1abbcb5e132d170d8e324e4e04ed915fa2d22df','vocabulary.txt':'ff77588746d3a2595d32ab5b69ffd7b95ce2441ac57533cb66fc3eb575a115cf'});
function validatePcm(raw){
 if(!Buffer.isBuffer(raw)||raw.length<3244||raw.length>960044||raw.toString('ascii',0,4)!=='RIFF'||raw.readUInt32LE(4)!==raw.length-8||raw.toString('ascii',8,16)!=='WAVEfmt '||raw.readUInt32LE(16)!==16||raw.readUInt16LE(20)!==1||raw.readUInt16LE(22)!==1||raw.readUInt32LE(24)!==16000||raw.readUInt32LE(28)!==32000||raw.readUInt16LE(32)!==2||raw.readUInt16LE(34)!==16||raw.toString('ascii',36,40)!=='data'||raw.readUInt32LE(40)!==raw.length-44||(raw.length-44)%2)throw Object.assign(Error('Expected bounded mono 16kHz PCM16 WAV'),{status:400});
 return raw;
}
function createLocalAsrProvider({python,model,timeoutMs=30000}={}){
 let validated=false,active=null,signature='';
 async function health(){
  if(!python||!model)return {ready:false,status:'disabled',rawAudioRetention:'none'};
  try{
   if(!path.isAbsolute(python)||!path.isAbsolute(model))throw Error();
   const states=await Promise.all(Object.keys(HASHES).map(async file=>{const stat=await fs.stat(path.join(model,file));return [file,stat.size,stat.mtimeMs,stat.ino]}));const nextSignature=JSON.stringify(states);if(nextSignature!==signature)validated=false;
   if(!validated){await fs.access(python);for(const [file,hash] of Object.entries(HASHES)){const bytes=await fs.readFile(path.join(model,file));if(crypto.createHash('sha256').update(bytes).digest('hex')!==hash)throw Error()}await checkRuntime(python,{'faster-whisper':'1.2.1'});signature=nextSignature;validated=true}
   return {ready:true,status:'preflight_verified',modelLoaded:false,provider:'faster-whisper-tiny.en',rawAudioRetention:'none',executionAuthority:false};
  }catch{return {ready:false,status:'model_missing_or_checksum_mismatch',rawAudioRetention:'none'}}
 }
 async function transcribe(raw,{signal}={}){
  validatePcm(raw);if(signal?.aborted)throw Object.assign(Error('Recognition cancelled'),{name:'AbortError'});
  if(!(await health()).ready)throw Object.assign(Error('Local speech recognition unavailable; use typed input'),{status:503});
  if(active)throw Object.assign(Error('Speech recognition busy'),{status:429});
  return new Promise((resolve,reject)=>{
   const child=spawn(python,[path.resolve(__dirname,'../automation/local-asr-worker.py')],{stdio:['pipe','pipe','ignore'],env:{...process.env,OMP_NUM_THREADS:'2',OPENBLAS_NUM_THREADS:'2'}});active=child;
   let chunks=[],size=0,done=false;
   const finish=(error,result)=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);if(active===child)active=null;child.kill('SIGKILL');error?reject(error):resolve(result)};
   const abort=()=>finish(Object.assign(Error('Recognition cancelled'),{name:'AbortError'}));
   const timer=setTimeout(()=>finish(Object.assign(Error('Speech recognition timed out'),{status:504})),timeoutMs);
   signal?.addEventListener('abort',abort,{once:true});
   child.on('error',()=>finish(Object.assign(Error('Speech runtime unavailable'),{status:503})));child.stdin.on('error',()=>{});
   child.stdout.on('data',chunk=>{size+=chunk.length;if(size>16000)return finish(Error('Recognition response too large'));chunks.push(chunk)});
   child.on('close',code=>{if(done)return;try{const result=JSON.parse(Buffer.concat(chunks));if(code||result.error||typeof result.text!=='string'||result.text.length>1200)throw Error();finish(null,{...result,executionAuthority:false})}catch{finish(Object.assign(Error('Speech recognition failed; use typed input'),{status:503}))}});
   child.stdin.end(JSON.stringify({model,wav:raw.toString('base64')})+'\n');if(signal?.aborted)abort();
  });
 }
 return {health,transcribe,close(){active?.kill('SIGKILL')}};
}
module.exports={createLocalAsrProvider,validatePcm,HASHES};
