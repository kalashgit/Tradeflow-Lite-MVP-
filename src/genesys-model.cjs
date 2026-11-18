// Genesys intent interpreters. All model output is UNTRUSTED proposal text.
//  - ollamaInterpreter: a real local Qwen model via Ollama's loopback HTTP API,
//    with the model identity (name, digest, quantization) recorded per call.
//  - scriptedInterpreter: deterministic test double. NOT AI; never reported as model results.
'use strict';
const LOOPBACK=new Set(['127.0.0.1','localhost','[::1]']);
const MODELS=/^qwen3:(?:0[.]6b|1[.]7b|4b)$/;
function base(url){
 const u=new URL(url);
 if(u.protocol!=='http:'||!LOOPBACK.has(u.hostname)||u.username||u.password||u.search||u.hash)throw Error('Model endpoint must be HTTP loopback');
 return u.origin;
}
function ollamaInterpreter({baseUrl='http://127.0.0.1:11434',model='qwen3:0.6b',timeoutMs=120000,fetchImpl=globalThis.fetch}={}){
 if(!MODELS.test(model))throw Error('Unapproved research model');
 const origin=base(baseUrl);let identity=null;
 async function describe(){
  if(identity)return identity;
  const tags=await (await fetchImpl(origin+'/api/tags',{signal:AbortSignal.timeout(10000)})).json();
  const entry=(tags.models||[]).find(m=>m.name===model||m.model===model);
  if(!entry)throw Error('Model '+model+' is not installed on the local server');
  const version=await (await fetchImpl(origin+'/api/version',{signal:AbortSignal.timeout(10000)})).json().catch(()=>({}));
  identity={id:model,provider:'ollama',real:true,digest:entry.digest||null,size:entry.size||null,
   parameterSize:entry.details?.parameter_size||null,quantization:entry.details?.quantization_level||null,
   family:entry.details?.family||null,serverVersion:version.version||null,temperature:0,thinking:false};
  return identity;
 }
 return {async interpret(messages,{schema}={}){
  const model_=await describe(),started=Date.now();
  const response=await fetchImpl(origin+'/api/chat',{method:'POST',headers:{'content-type':'application/json'},
   signal:AbortSignal.timeout(timeoutMs),body:JSON.stringify({model,messages,stream:false,think:false,
    ...(schema?{format:schema}:{format:'json'}),options:{temperature:0,seed:7,num_predict:400}})});
  if(!response.ok)throw Error('Model HTTP '+response.status);
  const out=await response.json();
  if(out.done!==true)throw Error('Incomplete model response');
  return {text:String(out.message?.content||''),model:model_,latencyMs:Date.now()-started,
   usage:{promptTokens:out.prompt_eval_count??null,completionTokens:out.eval_count??null,doneReason:out.done_reason||null}};
 }};
}
function scriptedInterpreter(answer,{label='scripted-test-double'}={}){
 return {async interpret(messages){
  const text=typeof answer==='function'?answer(messages):answer;
  return {text:typeof text==='string'?text:JSON.stringify(text),model:{id:label,provider:'none',real:false},latencyMs:0,usage:null};
 }};
}
module.exports={ollamaInterpreter,scriptedInterpreter};
