'use strict';
// Explicitly configured loopback developer runtime, never a business-action authority.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const PINNED={kokoro:{model:'ae315a79b623f244700e4afb9246c46a26066782e049ba174bf3ba433970ee9c',voices:'bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d'},piper:{model:'6f52a751e2349abe7a76735eb09dc1875298c77ea2342ffd2fef79ff81b87f22'}};
const digest=text=>crypto.createHash('sha256').update(text).digest('hex');
function createLocalTtsProvider({config,python,timeoutMs=60000,spawnImpl=spawn}={}){
 let active=null,validated=false;
 async function health(){
  if(!config||!python)return {ready:false,status:'disabled',executionAuthority:false};
  try{
   if(!['kokoro','piper'].includes(config.provider)||!path.isAbsolute(python)||!['am_michael','af_heart'].includes(config.voice)&&config.provider==='kokoro')throw Error();
   if(!validated){
    await fs.access(python);
    for(const [field,expected] of Object.entries(PINNED[config.provider])){
     if(!path.isAbsolute(config[field]||'')||digest(await fs.readFile(config[field]))!==expected)throw Error();
    }
    if(config.provider==='piper'){
     if(!path.isAbsolute(config.config||''))throw Error();
     const metadata=JSON.parse(await fs.readFile(config.config,'utf8'));
     if(metadata.audio?.sample_rate!==22050)throw Error();
    }
    validated=true;
   }
   return {ready:true,status:'weights_verified',provider:config.provider,voice:config.voice||'ljspeech',modelSha256:PINNED[config.provider].model,executionAuthority:false};
  }catch{return {ready:false,status:'model_missing_or_checksum_mismatch',executionAuthority:false}}
 }
 async function synthesize(text,{signal}={}){
  if(typeof text!=='string'||!text.trim()||text.length>2500)throw Object.assign(Error('Invalid speech text'),{status:400});
  if(signal?.aborted)throw Object.assign(Error('Speech cancelled'),{name:'AbortError'});
  if(!(await health()).ready)throw Object.assign(Error('Local speech model unavailable'),{status:503});
  if(active)throw Object.assign(Error('Speech provider busy; retry after current request'),{status:429});
  return new Promise((resolve,reject)=>{
   const child=spawnImpl(python,[path.resolve(__dirname,'../automation/local-tts-worker.py')],{stdio:['pipe','pipe','ignore'],env:{...process.env,OMP_NUM_THREADS:'2',OPENBLAS_NUM_THREADS:'2'}});
   active=child;let size=0,chunks=[],done=false;
   const finish=(error,result)=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);if(active===child)active=null;child.kill('SIGKILL');error?reject(error):resolve(result)};
   const abort=()=>finish(Object.assign(Error('Speech cancelled'),{name:'AbortError'}));
   const timer=setTimeout(()=>finish(Object.assign(Error('Speech provider timed out'),{status:504})),timeoutMs);
   signal?.addEventListener('abort',abort,{once:true});
   child.on('error',()=>finish(Object.assign(Error('Speech runtime unavailable'),{status:503})));
   child.stdin.on('error',()=>{});
   child.stdout.on('data',chunk=>{size+=chunk.length;if(size>12000000)return finish(Error('Speech response too large'));chunks.push(chunk)});
   child.on('close',code=>{
    if(done)return;
    try{
     if(code!==0)throw Error();
     const result=JSON.parse(Buffer.concat(chunks).toString('utf8')),wav=Buffer.from(result.wav||'','base64');
     if(result.error||wav.length<46||wav.length>9000000||wav.toString('ascii',0,4)!=='RIFF'||wav.toString('ascii',8,12)!=='WAVE')throw Error();
     finish(null,{audio:wav,metrics:result.metrics,provider:config.provider,textSha256:digest(text)});
    }catch{finish(Object.assign(Error('Local speech synthesis failed'),{status:503}))}
   });
   child.stdin.end(JSON.stringify({config,text})+'\n');
   if(signal?.aborted)abort();
  });
 }
 return {version:1,health,synthesize,close(){active?.kill('SIGKILL')}};
}
// Tickets contain no business authority. Only server-produced completed answers get one.
function createSpeechTickets({now=Date.now,ttlMs=300000,max=64}={}){
 const entries=new Map();
 return {
  issue({text,threadId,turnId}){
   if(typeof text!=='string'||!text.trim()||text.length>2500||![threadId,turnId].every(x=>typeof x==='string'&&/^[\w-]{1,120}$/.test(x)))return null;
   for(const [key,value] of entries)if(value.expires<=now())entries.delete(key);
   while(entries.size>=max)entries.delete(entries.keys().next().value);
   const ticket=crypto.randomBytes(32).toString('base64url'),textSha256=digest(text);
   entries.set(ticket,{text,threadId,turnId,textSha256,expires:now()+ttlMs});
   return {version:1,ticket,threadId,turnId,textSha256,expiresAt:now()+ttlMs};
  },
  read({ticket,threadId,turnId,textSha256}){
   const value=entries.get(ticket);
   if(!value||value.expires<=now()||value.threadId!==threadId||value.turnId!==turnId||value.textSha256!==textSha256)return null;
   return value.text;
  },clear(){entries.clear()}
 };
}
module.exports={createLocalTtsProvider,createSpeechTickets,PINNED};
