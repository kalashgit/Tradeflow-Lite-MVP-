#!/usr/bin/env node
// Read-only, safe local diagnostics: no model downloads, starts or data access.
'use strict';
const os=require('node:os'),fs=require('node:fs'),path=require('node:path');
const health='http://127.0.0.1:8088/health';
function readableMemory(){
 const total=os.totalmem(),free=os.freemem();
 let cap=null;
 for(const name of ['/sys/fs/cgroup/memory.max','/sys/fs/cgroup/memory/memory.limit_in_bytes']){
  try{const raw=fs.readFileSync(name,'utf8').trim();if(raw!=='max'){const n=Number(raw);if(Number.isSafeInteger(n)&&n>0&&n<total*4)cap=n;break}}catch{}
 }
 return {hostTotalGiB:+(total/2**30).toFixed(2),hostFreeGiB:+(free/2**30).toFixed(2),cgroupCapGiB:cap?+(cap/2**30).toFixed(2):null};
}
function modelCandidates(){
 const home=os.homedir(),roots=[process.env.HF_HOME,process.env.LLAMA_CACHE,process.env.XDG_CACHE_HOME,path.join(home,'.cache','huggingface','hub'),path.join(home,'.cache','llama.cpp'),'/workspaces/llama.cpp/models'].filter(Boolean);
 const locations=[];
 for(const location of roots){try{const items=fs.readdirSync(location);locations.push({directory:location,exists:true,likelyQwenEntries:items.filter(x=>/qwen|gguf/i.test(x)).slice(0,10)});}catch{locations.push({directory:location,exists:false})}}
 return locations;
}
async function diagnose(){
 let healthStatus='not_listening',httpStatus=null;
 try{const response=await fetch(health,{signal:AbortSignal.timeout(2500)});httpStatus=response.status;const body=await response.text();healthStatus=response.ok?'ready':body.slice(0,120)}catch(e){healthStatus=e?.name==='TimeoutError'?'timeout':'not_listening'}
 const report={target:'localhost Qwen server',healthStatus,httpStatus,memory:readableMemory(),models:modelCandidates(),guidance:healthStatus==='ready'?'Model ready; you can run the real Qwen conversation test.':'Model not ready. Confirm downloaded GGUF weights, Codespace memory and server logs. Exit code 143 indicates SIGTERM, not proof of OOM.'};
 console.log(JSON.stringify(report,null,2));
 if(healthStatus!=='ready')process.exitCode=1;
}
if(require.main===module)diagnose().catch(e=>{console.error('Diagnostic unavailable:',e.message);process.exitCode=1});
module.exports={readableMemory,modelCandidates};
